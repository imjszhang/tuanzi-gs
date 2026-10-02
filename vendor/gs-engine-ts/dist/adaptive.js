export class InvalidAdaptation extends Error {
    diagnostics;
    name = 'InvalidAdaptation';
    constructor(message, diagnostics) {
        super(message);
        this.diagnostics = diagnostics;
    }
}
export class AdaptiveStale extends Error {
    name = 'AdaptiveStale';
}
function canonical(x) { if (x === undefined)
    return 'null'; if (x === null || typeof x !== 'object')
    return JSON.stringify(x); if (Array.isArray(x))
    return `[${x.map(canonical).join(',')}]`; return `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`; }
export function frameSignature(f) { return canonical({ kind: f.kind, question: f.question, context: f.context, options: f.options.map(o => ({ id: o.id, description: o.description, value: o.value })) }); }
export class AdaptiveGS {
    ports;
    limits;
    busy = false;
    accounting = { generations: 0, formatRepairs: 0, invalidOutputs: 0, validBatches: 0, revisionAttempts: 0, committed: 0 };
    account() { this.ports.event({ type: 'adaptation_accounting', data: { ...this.accounting, maxFormatRepairs: this.limits.maxFormatRepairs, maxRevisions: this.limits.maxRevisions, scope: 'this-resolver; root call/time budget remains shared' } }); }
    constructor(ports, limits = {}) {
        this.ports = ports;
        this.limits = { maxDepth: 2, maxRevisions: 3, maxGenerations: 8, maxFormatRepairs: 2, ioTimeoutMs: 120000, gTimeoutMs: limits.ioTimeoutMs ?? 120000, ...limits };
        for (const [k, v] of Object.entries(this.limits))
            if (!Number.isSafeInteger(v) || v < (['maxFormatRepairs', 'maxDepth'].includes(k) ? 0 : 1) || v > ((k === 'ioTimeoutMs' || k === 'gTimeoutMs') ? 3600000 : 32))
                throw Error(`Invalid adaptive limit ${k}`);
    }
    async resolve(frame, signal, initialCause) {
        if (this.busy)
            throw Error('adaptive_concurrent_resolve');
        this.busy = true;
        const budget = { generated: 0 };
        try {
            return await this.loop(structuredClone(frame), 0, signal, budget, initialCause);
        }
        finally {
            this.busy = false;
        }
    }
    async io(revision, signal, fn, timeoutMs = this.limits.ioTimeoutMs) {
        this.ports.check(revision, signal);
        const local = new AbortController();
        const combined = AbortSignal.any([signal, local.signal]);
        let timer;
        let abort = () => { };
        const stopped = new Promise((_, reject) => { abort = () => reject(combined.reason ?? Error('aborted')); combined.addEventListener('abort', abort, { once: true }); timer = setTimeout(() => local.abort(Error('adaptive_io_timeout')), timeoutMs); });
        try {
            const result = await Promise.race([Promise.resolve().then(() => fn(combined)), stopped]);
            this.ports.check(revision, combined);
            return result;
        }
        finally {
            if (timer)
                clearTimeout(timer);
            combined.removeEventListener('abort', abort);
        }
    }
    async loop(start, depth, signal, budget, firstCause, branch) {
        let frame = start, cause = firstCause, lastAnswer = null;
        const seen = new Set([frameSignature(frame)]), subtasks = new Set(), history = [];
        const revisionLimit = Math.min(this.limits.maxRevisions, branch?.maxRevisions ?? this.limits.maxRevisions);
        const generationLimit = branch?.generationLimit ?? this.limits.maxGenerations;
        const remember = (entry) => { history.push(structuredClone(entry)); };
        const evidence = () => ({ lastAnswer: structuredClone(lastAnswer), attempts: structuredClone(history.slice(-4)) });
        for (let attempt = 0; attempt <= revisionLimit; attempt++) {
            this.ports.check(frame.revision, signal);
            if (!cause && frame.options.length) {
                this.ports.event({ type: 's_requested', data: { depth, frame } });
                lastAnswer = await this.io(frame.revision, signal, s => this.ports.select(frame, depth, s));
                this.ports.event({ type: 's_answered', data: { depth, frame, answer: lastAnswer } });
                if (lastAnswer.choice !== null) {
                    if (!frame.options.some(o => o.id === lastAnswer.choice))
                        throw Error('selector_unoffered_choice');
                    return { kind: 'selected', frame, choice: lastAnswer.choice, answer: lastAnswer, evidence: evidence() };
                }
                cause = 'selector_abstained';
            }
            cause ??= 'candidate_gap';
            const answer = lastAnswer;
            this.ports.event({ type: 'adaptation_needed', data: { depth, cause, attempt, answer, mode: 'same-layer-first/v054' } });
            if (attempt >= revisionLimit)
                return { kind: 'blocked', reason: 'adaptation_budget_exhausted', frame, evidence: evidence() };
            if (budget.generated >= this.limits.maxGenerations)
                return { kind: 'blocked', reason: 'adaptation_generation_budget_exhausted', frame, evidence: evidence() };
            if (budget.generated >= generationLimit)
                return { kind: 'blocked', reason: 'subproblem_generation_budget_exhausted', frame, evidence: evidence() };
            const request = { schema: 'gs/adaptation-request/v1', depth, cause, frame, answer, previous: structuredClone(history.slice(-4)), evidence: this.ports.evidence() };
            if (new TextEncoder().encode(JSON.stringify(request)).byteLength > 220000)
                return { kind: 'blocked', reason: 'adaptation_input_budget_exhausted', frame, evidence: evidence() };
            budget.generated++;
            this.accounting.generations++;
            this.account();
            this.ports.event({ type: 'g_requested', data: request });
            let patches = [];
            let raw;
            let invalid;
            try {
                raw = await this.io(frame.revision, signal, s => this.ports.generate(request, s), this.limits.gTimeoutMs);
                this.ports.event({ type: 'g_proposed', data: { depth, output: raw } });
                patches = this.ports.parse(raw, frame);
            }
            catch (e) {
                if (!(e instanceof InvalidAdaptation))
                    throw e;
                invalid = e;
            }
            // Syntax/shape errors are not strategy revisions. Repair the last output, not the world.
            const initialMarker = raw && typeof raw === 'object' ? raw.invalidProposal : null;
            const preserveFrom = initialMarker && typeof initialMarker.content === 'string' ? initialMarker.content : structuredClone(raw ?? null);
            let repairs = 0;
            while (invalid) {
                this.accounting.invalidOutputs++;
                this.account();
                const diagnostics = invalid.diagnostics ?? { schema: 'gs/output-validation/v1', issues: [{ path: '', code: 'invalid_output', message: invalid.message }], scope: 'structure-only-not-strategy' };
                this.ports.event({ type: 'adaptation_rejected', data: { depth, category: 'output-format', reason: invalid.message, diagnostics, formatRepairs: repairs } });
                if (repairs >= this.limits.maxFormatRepairs || !this.ports.repairOutput)
                    return { kind: 'blocked', reason: 'output_format_repair_exhausted', frame, evidence: evidence() };
                if (budget.generated >= this.limits.maxGenerations)
                    return { kind: 'blocked', reason: 'adaptation_generation_budget_exhausted', frame, evidence: evidence() };
                if (budget.generated >= generationLimit)
                    return { kind: 'blocked', reason: 'subproblem_generation_budget_exhausted', frame, evidence: evidence() };
                const marker = raw && typeof raw === 'object' ? raw.invalidProposal : null;
                const repair = { schema: 'gs/output-repair-request/v1', depth, cause: 'output_format_invalid', frame: { kind: frame.kind, revision: frame.revision }, attempt: repairs + 1, originalCause: cause,
                    preserveFrom, previousOutput: marker && typeof marker.content === 'string' ? marker.content : structuredClone(raw ?? null), diagnostics };
                if (new TextEncoder().encode(JSON.stringify(repair)).byteLength > 220000)
                    return { kind: 'blocked', reason: 'adaptation_input_budget_exhausted', frame, evidence: evidence() };
                repairs++;
                budget.generated++;
                this.accounting.generations++;
                this.accounting.formatRepairs++;
                this.account();
                this.ports.event({ type: 'g_requested', data: repair });
                invalid = undefined;
                try {
                    raw = await this.io(frame.revision, signal, s => this.ports.repairOutput(repair, s), this.limits.gTimeoutMs);
                    this.ports.event({ type: 'g_proposed', data: { depth, mode: 'output-repair', output: raw } });
                    patches = this.ports.parse(raw, frame);
                }
                catch (e) {
                    if (!(e instanceof InvalidAdaptation))
                        throw e;
                    invalid = e;
                }
            }
            this.accounting.validBatches++;
            this.accounting.revisionAttempts++;
            this.account();
            // Never silently select the first of several revisions or force a meta approval.
            if (patches.length !== 1) {
                remember({ reason: 'one_decision_update_required', count: patches.length });
                cause = 'invalid_proposal_cardinality';
                continue;
            }
            const patch = patches[0];
            let task = null;
            try {
                task = this.ports.subproblem?.(frame, patch, depth) ?? null;
            }
            catch (e) {
                if (!(e instanceof InvalidAdaptation))
                    throw e;
                remember({ reason: e.message, diagnostics: e.diagnostics ?? null, proposal: patch.value });
                cause = 'invalid_subproblem';
                continue;
            }
            if (task) {
                const key = canonical({ parent: frameSignature(frame), question: task.frame.question, context: task.frame.context, expectedResult: task.expectedResult });
                const before = budget.generated;
                let result;
                if (task.frame.kind !== 'analysis' || task.frame.revision !== frame.revision)
                    throw Error('subproblem_changed_authority');
                if (depth >= this.limits.maxDepth) {
                    result = { kind: 'blocked', reason: 'subproblem_depth_exhausted', frame: task.frame };
                }
                else if (subtasks.has(key)) {
                    result = { kind: 'blocked', reason: 'duplicate_subproblem_no_change', frame: task.frame };
                }
                else {
                    subtasks.add(key);
                    this.ports.event({ type: 'subproblem_enter', data: { depth: depth + 1, parentDepth: depth, task: task.frame, expectedResult: task.expectedResult, readOnly: true } });
                    result = await this.loop(task.frame, depth + 1, signal, budget, 'subproblem_initial_review', { generationLimit: Math.min(generationLimit, budget.generated + task.maxGenerations), maxRevisions: Math.min(revisionLimit, task.maxRevisions) });
                }
                this.ports.check(frame.revision, signal);
                const report = { schema: 'gs/subproblem-result/v054', status: result.kind === 'selected' ? 'answered' : 'unresolved',
                    question: task.frame.question, expectedResult: task.expectedResult,
                    reason: result.kind === 'blocked' ? result.reason : null,
                    selected: result.kind === 'selected' ? result.frame.options.find(o => o.id === result.choice) ?? null : null,
                    answer: result.kind === 'selected' ? result.answer : result.evidence?.lastAnswer ?? null, attempts: result.evidence?.attempts ?? [],
                    frame: result.frame, generations: budget.generated - before, readOnly: true,
                    epistemicStatus: 'model-judgment-not-world-fact', worldRevision: frame.revision };
                this.ports.event({ type: 'subproblem_return', data: { depth: depth + 1, parentDepth: depth, result: report } });
                remember({ cause, proposal: patch.value, subproblem: report, originalQuestion: frame.question, originalAnswer: answer });
                // Global exhaustion, unlike a bounded child failure, cannot be bypassed.
                if (budget.generated >= this.limits.maxGenerations)
                    return { kind: 'blocked', reason: 'adaptation_generation_budget_exhausted', frame, evidence: evidence() };
                cause = result.kind === 'selected' ? 'subproblem_completed' : 'subproblem_unresolved';
                this.ports.event({ type: 'same_layer_resumed', data: { depth, cause, remainingRevisions: revisionLimit - attempt - 1 } });
                continue;
            }
            let next;
            try {
                this.ports.check(frame.revision, signal);
                next = this.ports.apply(frame, patch, depth);
            }
            catch (e) {
                if (!(e instanceof InvalidAdaptation))
                    throw e;
                remember({ reason: e.message, diagnostics: e.diagnostics ?? null, proposal: patch.value, previousAnswer: answer });
                this.ports.event({ type: 'adaptation_rejected', data: { depth, category: 'decision-conditions', reason: e.message, diagnostics: e.diagnostics ?? null } });
                cause = 'inconsistent_decision_conditions';
                continue;
            }
            if (next.revision !== frame.revision || next.kind !== frame.kind)
                throw Error('adaptation_changed_authority');
            const signature = frameSignature(next);
            if (seen.has(signature)) {
                remember({ reason: 'duplicate_decision_no_change', proposal: patch.value, previousAnswer: answer });
                this.ports.event({ type: 'adaptation_rejected', data: { depth, reason: 'duplicate_decision_no_change' } });
                cause = 'duplicate_decision_no_change';
                continue;
            }
            this.ports.check(frame.revision, signal);
            seen.add(signature);
            remember({ cause, previousQuestion: frame.question, previousAnswer: answer, applied: patch.value, commitScope: 'decision-interface-only' });
            this.accounting.committed++;
            this.account();
            this.ports.event({ type: 'adaptation_committed', data: { depth, before: frame, after: next, patch: patch.value, mode: 'same-layer-first/v054', status: 'provisional-not-proven', worldAction: false } });
            frame = next;
            cause = undefined;
            lastAnswer = null;
        }
        return { kind: 'blocked', reason: 'adaptation_budget_exhausted', frame, evidence: evidence() };
    }
}

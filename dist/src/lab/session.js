import { retryTransport, transportInfo } from './retry.js';
import { AutonomousSession } from '../adaptive/session.js';
import { explorationBackend, contextOnlyGenerator } from '../adaptive/local.js';
import { createExperimentSession, missionAssessment } from '../decision/experiment.js';
import { ruleBackend } from '../decision/pipeline.js';
import { GameSession } from '../runtime/session.js';
import { SkillSession } from '../skills/runtime.js';
import { ExperienceTable } from '../skills/experience.js';
import { ReactiveCatalogue } from '../skills/catalogue.js';
import { SkillBook } from '../planning/book.js';
function storageSeed(seed) { const data = new Map(); if (seed.catalogue)
    data.set('tuanzi.gs.reactive.v3', JSON.stringify(seed.catalogue)); if (seed.experience)
    data.set('tuanzi.gs.experience.v3', JSON.stringify(seed.experience)); if (seed.book)
    data.set('tuanzi-gs.skills.v2', JSON.stringify(seed.book)); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } }; }
export function createHosted(config, initial, notify, ledger, signal, providers, seed = {}) {
    if (config.kind === 'game' && config.controller !== 'adaptive' && (config.backend !== 'rule' || config.generator !== 'local'))
        throw Error('LEGACY_ASSISTANCE_FORBIDDEN');
    const raw = config.backend === 'rule' ? (config.controller === 'adaptive' && config.kind === 'game' ? explorationBackend(config.delayMs) : ruleBackend(config.kind === 'judgment' ? missionAssessment : undefined, config.delayMs)) : providers.backend(config.backend);
    let retryState = null;
    let logicalSequence = 0;
    let currentWorld = () => String(initial.revision);
    const retryPolicy = { maxRetries: config.jevMaxRetries ?? 2, baseMs: config.jevRetryBaseMs ?? 500, maxMs: config.jevRetryMaxMs ?? 5000, attemptTimeoutMs: config.jevAttemptTimeoutMs ?? 8000 };
    const decorate = (host) => { currentWorld = () => String(host.world.snapshot().revision); const inspect = host.inspect.bind(host); host.inspect = () => ({ ...inspect(), transportRetry: retryState }); return host; };
    const backend = { id: raw.id, kind: raw.kind, ask: async (input, s) => {
            const active = AbortSignal.any([signal, s]);
            active.throwIfAborted();
            const n = Object.keys(input.questions).length;
            const expected = currentWorld(), logicalRequestId = `s-${++logicalSequence}`, frozen = structuredClone(input), retry = config.backend === 'jev';
            const check = () => { active.throwIfAborted(); if (currentWorld() !== expected)
                throw Error('stale_judgment_snapshot: transport snapshot changed'); };
            const emitRetry = (value) => { retryState = value; notify({ runId: 'hosted', seq: 0, cycle: 0, at: Date.now(), type: 's_retry', data: value }); };
            const wireStart = ledger.rows.length;
            const totals = () => { const rows = ledger.rows.slice(wireStart).filter(r => r.logicalRequestId === logicalRequestId); return { requests: rows.length, externalRequests: rows.filter(r => r.kind === 'external-request-attempt').length, questions: rows.reduce((n, r) => n + r.questions, 0) }; };
            const metadata = { schema: 'gs/s-retry/v1', logicalRequestId, worldRevision: expected, maxAttempts: retry ? retryPolicy.maxRetries + 1 : 1 };
            const attempt = async (attempt, attemptSignal) => {
                check();
                if (ledger.requests >= config.maxRequests)
                    throw Error('lab_request_budget_exhausted');
                if (ledger.questions + n > config.maxQuestions)
                    throw Error('lab_question_budget_exhausted');
                ledger.requests++;
                ledger.questions += n;
                const external = raw.kind !== 'rule' && raw.kind !== 'mock';
                if (external)
                    ledger.externalRequests++;
                const row = { source: raw.id, kind: external ? 'external-request-attempt' : 'local-backend-call', questions: n, latencyMs: 0, status: 'pending', usage: null, ...(retry ? { logicalRequestId, attempt, maxAttempts: metadata.maxAttempts, worldRevision: expected } : {}) };
                ledger.rows.push(row);
                const at = performance.now();
                if (retry)
                    emitRetry({ ...metadata, state: 'attempting', attempt });
                notify({ runId: 'hosted', seq: 0, cycle: 0, at: Date.now(), type: 'lab_request_started', data: { index: ledger.rows.length, source: raw.id, role: 'S', questions: n, ...(retry ? { logicalRequestId, attempt } : {}) } });
                // Race here too: a transport ignoring cancellation cannot leave a pending ledger row.
                let rejectAbort = () => { };
                const abort = () => rejectAbort(attemptSignal.reason);
                try {
                    const result = await Promise.race([raw.ask(structuredClone(frozen), attemptSignal), new Promise((_, reject) => { rejectAbort = reject; attemptSignal.addEventListener('abort', abort, { once: true }); if (attemptSignal.aborted)
                            abort(); })]);
                    attemptSignal.throwIfAborted();
                    check();
                    if (config.controller === 'adaptive')
                        notify({ runId: 'hosted', seq: 0, cycle: 0, at: Date.now(), type: 's_transport', data: { input: frozen, result, source: raw.id, ...(retry ? { logicalRequestId, attempt } : {}) } });
                    row.status = 'returned';
                    row.usage = result.usage ?? null;
                    if (result.model)
                        row.model = result.model;
                    return result;
                }
                catch (e) {
                    row.status = active.aborted ? 'aborted' : 'failed';
                    row.error = String(e).slice(0, 600);
                    Object.assign(row, transportInfo(e));
                    if (e && typeof e === 'object') {
                        if ('usage' in e)
                            row.usage = e.usage;
                        if ('transport' in e)
                            row.transport = structuredClone(e.transport);
                        if ('validation' in e)
                            row.validation = structuredClone(e.validation);
                    }
                    throw e;
                }
                finally {
                    attemptSignal.removeEventListener('abort', abort);
                    row.latencyMs = performance.now() - at;
                    notify({ runId: 'hosted', seq: 0, cycle: 0, at: Date.now(), type: 'lab_request_finished', data: { index: ledger.rows.indexOf(row) + 1, ...row } });
                }
            };
            if (!retry)
                return attempt(1, active);
            try {
                const result = await retryTransport({ policy: retryPolicy, signal: active, check, run: attempt, onRetry: ({ attempt: previous, nextAttempt, delayMs, error }) => emitRetry({ ...metadata, state: 'waiting', attempt: previous, delayMs, nextAttemptAt: Date.now() + delayMs, reason: `Retry ${nextAttempt}/${metadata.maxAttempts}`, ...transportInfo(error) }) });
                emitRetry({ ...metadata, state: 'recovered', attempt: retryState?.attempt ?? 1 });
                return { ...result, transportAttempts: totals() };
            }
            catch (e) {
                emitRetry({ ...metadata, state: active.aborted ? 'aborted' : 'failed', attempt: retryState?.attempt ?? 1, reason: String(e).slice(0, 600), ...transportInfo(e) });
                if (e && typeof e === 'object')
                    Object.assign(e, { transportAttempts: totals() });
                throw e;
            }
        } };
    if (config.kind === 'game' && config.controller === 'adaptive') {
        if (seed.book || seed.catalogue || seed.experience)
            throw Error('reference_memory_forbidden_in_autonomous_run');
        const local = contextOnlyGenerator();
        const source = providers?.adaptSource ?? { id: 'configured-G/v05', kind: 'llm' };
        const g = { id: config.generator === 'llm' ? source.id : local.id, kind: config.generator === 'llm' ? source.kind : 'local', propose: async (input, s) => {
                const active = AbortSignal.any([s, signal]);
                active.throwIfAborted();
                if (ledger.requests >= config.maxRequests)
                    throw Error('lab_request_budget_exhausted');
                ledger.requests++;
                const remote = config.generator === 'llm', external = remote && source.kind === 'llm';
                if (external)
                    ledger.externalRequests++;
                const row = { source: remote ? source.id : local.id, kind: external ? 'external-request-attempt' : remote ? 'mock-generator-call' : 'local-generator-call', questions: 0, purpose: input.schema === 'gs/output-repair-request/v1' ? 'output-repair' : input.cause === 'initial_environment_review' ? 'initialization' : input.frame.kind === 'analysis' ? 'subproblem' : 'adaptation', latencyMs: 0, status: 'pending', usage: null };
                ledger.rows.push(row);
                const at = performance.now();
                const requestIndex = ledger.rows.length, streamId = `g-${requestIndex}`;
                let closed = false, ended = false, emitted = false;
                const onProgress = (e) => {
                    if (closed)
                        return;
                    if (active.aborted && !(e.kind === 'status' && e.status === 'aborted'))
                        return;
                    if (e.kind === 'status' && ['complete', 'invalid', 'failed', 'aborted', 'unavailable'].includes(e.status ?? ''))
                        ended = true;
                    if (e.kind === 'delta')
                        emitted = true;
                    notify({ runId: 'hosted', seq: 0, cycle: 0, at: Date.now(), type: 'g_stream', data: { ...e, schema: 'gs/g-stream/v1', streamId, requestIndex, depth: input.depth, frameKind: input.frame.kind, cause: input.cause, ...(input.schema === 'gs/output-repair-request/v1' ? { originalCause: input.originalCause } : {}), purpose: row.purpose, revision: input.frame.revision, source: row.source, displayOnly: true } });
                };
                notify({ runId: 'hosted', seq: 0, cycle: 0, at: Date.now(), type: 'lab_request_started', data: { index: requestIndex, source: row.source, role: 'G', purpose: row.purpose, questions: 0 } });
                onProgress({ kind: 'status', status: 'queued', mode: remote ? 'unknown' : 'local' });
                const onAbort = () => { if (!ended)
                    onProgress({ kind: 'status', status: 'aborted', reason: String(active.reason ?? 'cancelled').slice(0, 600) }); closed = true; };
                active.addEventListener('abort', onAbort, { once: true });
                try {
                    const out = remote ? await providers.adapt(input, active, onProgress) : await local.propose(input, active);
                    active.throwIfAborted();
                    row.status = 'returned';
                    row.usage = out.usage ?? null;
                    if (!ended) {
                        if (remote && !emitted) {
                            onProgress({ kind: 'status', status: 'receiving', mode: 'buffered' });
                            onProgress({ kind: 'delta', channel: 'content', text: JSON.stringify(out.output).slice(0, 60000) });
                        }
                        onProgress({ kind: 'status', status: remote ? 'complete' : 'unavailable', usage: row.usage });
                    }
                    if ('transport' in out)
                        notify({ runId: 'hosted', seq: 0, cycle: 0, at: Date.now(), type: 'provider_transport', data: out.transport });
                    return out;
                }
                catch (e) {
                    row.status = active.aborted ? 'aborted' : 'failed';
                    row.error = String(e).slice(0, 600);
                    if (e && typeof e === 'object' && 'usage' in e)
                        row.usage = e.usage;
                    if (!ended)
                        onProgress({ kind: 'status', status: row.status, reason: row.error, usage: row.usage });
                    throw e;
                }
                finally {
                    closed = true;
                    active.removeEventListener('abort', onAbort);
                    row.latencyMs = performance.now() - at;
                    notify({ runId: 'hosted', seq: 0, cycle: 0, at: Date.now(), type: 'lab_request_finished', data: { index: requestIndex, ...row } });
                }
            } };
        const s = new AutonomousSession(initial, { backend, generator: g, strategy: config.strategy, orderSeed: config.orderSeed, signal, experience: config.experience, ...(seed.adaptive ? { memory: seed.adaptive } : {}), maxActions: config.maxActions, maxSteps: config.maxSteps, maxGCalls: config.maxGCalls, maxDepth: config.maxDepth, maxRevisions: config.maxRevisions, maxFormatRepairs: config.maxFormatRepairs, deadlineMs: config.deadlineMs }, notify);
        return decorate({ world: s.world, step: () => s.step(), cancel: () => s.cancel(), edit: (t, p) => s.edit(t, p), get finished() { return s.finished; }, get lastResult() { return s.lastResult; }, inspect: () => s.inspect(), export: () => s.export(), memory: () => ({ adaptive: s.memory() }) });
    }
    if (config.kind === 'judgment') {
        const s = createExperimentSession(config.task, { strategy: config.strategy, backend, orderSeed: config.orderSeed, maskResources: config.maskResources, delayMs: config.delayMs, deadlineMs: config.deadlineMs, maxRequests: config.maxRequests, maxQuestions: config.maxQuestions, signal, initialWorld: initial, onEngineEvent: notify });
        return decorate({ world: s.world, step: () => s.step(), cancel: () => s.cancel(), edit: (t, p) => s.edit(t, p), get finished() { return s.finished; }, get lastResult() { return s.lastResult; },
            inspect() { const r = s.result(); return { lastDecision: r.packets.at(-1) ?? null, activeSkill: null, lastSkillResult: r.runs.at(-1) ?? null }; }, export: () => s.result(), memory: () => ({}) });
    }
    if (config.controller !== 'hierarchy') {
        const book = new SkillBook(storageSeed(seed));
        const s = new GameSession(initial, config.controller === 'program' ? 'program' : 'rules-full', notify, '', undefined, { book, maxSearchExpanded: config.maxSearchNodes });
        return decorate({ world: s.world, step: () => s.step(), cancel: () => s.cancel(), edit: (t, p) => s.edit(t, p), get finished() { return s.finished; }, get lastResult() { return s.lastResult; }, inspect: () => ({ lastDecision: null, activeSkill: s.engine.currentPolicy.body, lastSkillResult: null }), export: () => s.export(), memory: () => ({ book: book.export() }) });
    }
    const store = storageSeed(seed), catalogue = new ReactiveCatalogue(store), experience = new ExperienceTable(config.experience, store);
    const mode = 'reactive';
    const s = new SkillSession(initial, mode, notify, { orderSeed: config.orderSeed, catalogue, experience, decision: { strategy: config.strategy, backend, timeoutMs: Math.min(25000, config.deadlineMs), maxRequests: config.maxRequests, maxQuestions: config.maxQuestions },
        limits: { actions: config.maxActions, cycles: config.maxSteps * 2, searchNodes: config.maxSearchNodes, providerCalls: config.maxRequests, durationMs: config.deadlineMs } });
    return decorate({ world: s.world, step: () => s.step(), cancel: () => s.cancel(), edit: (t, p) => s.edit(t, p), get finished() { return s.finished; }, get lastResult() { return s.lastResult; },
        inspect: () => ({ lastDecision: s.decisions.at(-1) ?? null, activeSkill: s.active ? { runId: s.active.runId, spec: s.active.spec, binding: s.active.call.binding, phase: s.active.domain.frame.phase } : null, lastSkillResult: s.summaries.at(-1) ?? null, diagnostics: s.diagnostics() }), export: () => s.export(), memory: () => ({ catalogue: catalogue.export(), experience: experience.export() }) });
}

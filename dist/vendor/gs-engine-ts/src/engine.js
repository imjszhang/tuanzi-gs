import { ProposalRejected, RepairBlocked } from "./rejection.js";
import { immutable, parseProposal, text, validateJudgment } from "./support.js";
/** One instance = one serial run. Core has no model SDK, game, UI or persistence dependency.
 * Paused/faulted runs do NOT automatically resume: unknown effects require reconciliation.
 * This is a reference single-process runtime, not a durable workflow service. */
export class GSEngine {
    options;
    goal;
    limits;
    policy;
    lifetime = new AbortController();
    startedAt = performance.now();
    inFlight = false;
    seq = 0;
    noProgress = 0;
    terminal;
    recent = [];
    counts = { cycles: 0, actions: 0, modelCalls: 0, repairs: 0 };
    constructor(options) {
        text(options.runId, "runId");
        for (const [key, n] of Object.entries(options.limits)) {
            if (!Number.isSafeInteger(n) || n <= 0)
                throw new Error(`invalid limit: ${key}`);
        }
        if (!Number.isSafeInteger(options.initialPolicy.version) || options.initialPolicy.version < 0) {
            throw new Error("invalid initial policy version");
        }
        this.options = { ...options };
        this.goal = immutable(options.goal);
        this.limits = immutable(options.limits);
        this.policy = immutable({ ...options.initialPolicy, body: options.domain.parsePolicy(options.initialPolicy.body) });
    }
    get counters() { return { ...this.counts }; }
    get currentPolicy() { return immutable(this.policy); }
    get history() { return immutable(this.recent); }
    cancel() { this.lifetime.abort(new Error("run cancelled")); }
    /** Driver calls step on readiness events; it must not use overlapping setInterval calls. */
    async step(signal) {
        if (this.inFlight)
            throw new Error("concurrent_step: one run may have only one in-flight decision");
        if (this.terminal)
            return this.terminal;
        this.inFlight = true;
        const active = signal ? AbortSignal.any([this.lifetime.signal, signal]) : this.lifetime.signal;
        try {
            this.checkTime(active);
            if (this.counts.cycles >= this.limits.maxCycles)
                return this.finish("stopped", "cycle_budget_exhausted");
            this.options.account?.cycle?.();
            this.counts.cycles++;
            const snapshot = await this.observe(active);
            const ctx = this.context(snapshot);
            this.emit("observed", { snapshot, policyVersion: this.policy.version });
            const complete = this.options.domain.completion(snapshot, this.goal);
            if (complete !== "running")
                return this.done(complete);
            const policyErrors = this.options.domain.validatePolicy(this.policy.body, ctx);
            if (policyErrors.length)
                throw new Error(`active policy rejected: ${policyErrors.join("; ")}`);
            const diagnosis = this.options.domain.assess?.(ctx);
            if (diagnosis) {
                this.emit("health_alert", diagnosis);
                if (diagnosis.kind === "pause")
                    return this.finish("paused", diagnosis.reason);
                return await this.repair(ctx, diagnosis.reason, active);
            }
            if (this.noProgress >= this.limits.noProgressWindow)
                return await this.repair(ctx, "no_progress", active);
            const proposed = immutable(this.options.domain.enumerate(ctx));
            const ids = new Set();
            const candidates = [];
            const rejected = [];
            for (const c of proposed) {
                text(c.id, "candidate.id");
                text(c.description, "candidate.description");
                text(c.capability, "candidate.capability");
                if (ids.has(c.id))
                    throw new Error("duplicate candidate id");
                ids.add(c.id);
                const gate = this.options.domain.gate(ctx, c);
                if (gate.kind === "allow")
                    candidates.push(c);
                else
                    rejected.push({ id: c.id, ...gate });
            }
            this.emit("candidates", { snapshotRevision: snapshot.revision, policyVersion: this.policy.version,
                accepted: candidates, rejected });
            if (!candidates.length) {
                // A permission problem is not sent to the model as an invitation to bypass it.
                if (rejected.length)
                    return this.finish("paused", "all_candidates_require_authorization_or_are_denied");
                return await this.repair(ctx, "no_candidates", active);
            }
            const offered = immutable(candidates);
            const ruled = this.options.rule?.(ctx, offered);
            let candidateId;
            if (ruled !== undefined) {
                candidateId = ruled;
                this.emit("rule_selected", { candidateId });
            }
            else {
                this.reserveModelCall();
                this.emit("selector_requested", { snapshotRevision: snapshot.revision, policyVersion: this.policy.version });
                const started = performance.now();
                const answer = await this.io("selector", active, s => this.options.selector.evaluate(ctx, offered, s));
                this.checkTime(active);
                validateJudgment(answer.output, offered);
                this.emit("selector_answered", { answer, latencyMs: performance.now() - started,
                    snapshotRevision: snapshot.revision, policyVersion: this.policy.version });
                // Abstention/repair is also a decision: discard it if its evidence expired in flight.
                const judgedAgainst = await this.observe(active);
                if (judgedAgainst.revision !== snapshot.revision || this.policy.version !== ctx.policy.version)
                    return this.stale("before_arbitration");
                const decision = this.options.arbiter.decide(ctx, offered, answer.output);
                this.emit("decision", decision);
                if (decision.kind === "repair")
                    return await this.repair(ctx, decision.reason, active);
                if (decision.kind === "pause")
                    return this.finish("paused", decision.reason);
                if (decision.kind === "stop")
                    return this.finish("stopped", decision.reason);
                candidateId = decision.candidateId;
            }
            const candidate = offered.find(c => c.id === candidateId);
            if (!candidate)
                throw new Error("selected candidate is not in the offered set");
            return await this.execute(ctx, candidate, active);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "unknown runtime failure";
            return this.finish("fault", message);
        }
        finally {
            this.inFlight = false;
        }
    }
    context(snapshot) {
        return immutable({ goal: this.goal, snapshot, policy: this.policy, recent: this.recent });
    }
    checkTime(signal) {
        signal.throwIfAborted();
        if (performance.now() - this.startedAt >= this.limits.maxDurationMs)
            throw new Error("run_deadline_exceeded");
    }
    reserveModelCall() {
        if (this.counts.modelCalls >= this.limits.maxModelCalls)
            throw new Error("model_call_budget_exhausted");
        // Reserve BEFORE awaiting, including calls that fail or time out.
        this.options.account?.model?.();
        this.counts.modelCalls++;
    }
    async observe(signal) {
        const snapshot = await this.io("observe", signal, s => this.options.domain.observe(s));
        text(snapshot.revision, "snapshot.revision");
        return immutable(snapshot);
    }
    async repair(ctx, reason, signal) {
        let feedback;
        const measured = this.options.domain.repairContext?.(ctx);
        const executionContext = measured === undefined ? ctx : immutable({ ...ctx, executionFeedback: measured });
        const attempts = this.limits.maxProposalAttempts ?? 1;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            this.checkTime(signal);
            const before = await this.observe(signal);
            if (before.revision !== ctx.snapshot.revision)
                return this.stale("before_repair");
            if (this.counts.repairs >= this.limits.maxRepairs)
                return this.finish("stopped", "repair_budget_exhausted");
            this.reserveModelCall();
            this.counts.repairs++;
            const requestContext = immutable({ ...executionContext, ...(feedback === undefined ? {} : { repairFeedback: feedback }) });
            this.emit("repair_requested", { reason, attempt, feedback: feedback ?? null, executionFeedback: measured ?? null,
                policyVersion: ctx.policy.version, snapshotRevision: before.revision });
            const started = performance.now();
            let proposal;
            try {
                const answer = await this.io("planner", signal, s => this.options.planner.propose(requestContext, reason, s));
                this.checkTime(signal);
                this.emit("repair_proposed", { answer, attempt, latencyMs: performance.now() - started });
                const size = JSON.stringify(answer.output)?.length;
                if (size === undefined || size > 65536)
                    throw new ProposalRejected({ reason: "invalid_or_oversized_proposal" });
                try {
                    proposal = parseProposal(answer.output, body => this.options.domain.parsePolicy(body));
                }
                catch (e) {
                    throw new ProposalRejected({ reason: String(e).slice(0, 600), stage: "schema" });
                }
                if (proposal.baseVersion !== this.policy.version || proposal.baseVersion !== ctx.policy.version)
                    return this.stale("policy_version_mismatch");
                if (proposal.basedOnRevision !== ctx.snapshot.revision)
                    return this.stale("proposal_revision_mismatch");
                const after = await this.observe(signal);
                if (after.revision !== ctx.snapshot.revision)
                    return this.stale("world_changed_during_repair");
                const errors = [...this.options.domain.validatePolicy(proposal.body, this.context(after)),
                    ...(this.options.domain.validateProposal?.(proposal.body, this.context(after)) ?? [])];
                if (errors.length)
                    throw new ProposalRejected({ reason: "policy_rejected", errors: errors.map(x => x.slice(0, 600)), stage: "validation" });
            }
            catch (e) {
                if (e instanceof RepairBlocked) {
                    this.emit("repair_blocked", { reason: e.reason, evidence: e.evidence, usage: e.usage ?? null, attempt });
                    return this.finish("paused", e.reason);
                }
                if (!(e instanceof ProposalRejected))
                    throw e; // network, cancellation and unknown effects are NOT retryable here
                const detail = { attempt, rejection: e.feedback,
                    remaining: { modelCalls: this.limits.maxModelCalls - this.counts.modelCalls,
                        repairs: this.limits.maxRepairs - this.counts.repairs, actions: this.limits.maxActions - this.counts.actions } };
                feedback = immutable(detail);
                this.emit("proposal_rejected", { feedback, usage: e.usage ?? null, latencyMs: performance.now() - started });
                if (attempt === attempts)
                    return this.finish("fault", "proposal_validation_exhausted");
                continue;
            }
            if (JSON.stringify(proposal.body) === JSON.stringify(this.policy.body))
                return this.finish("paused", "planner_proposed_no_change");
            this.checkTime(signal);
            const previous = this.policy;
            this.policy = immutable({ id: previous.id, version: previous.version + 1, body: proposal.body });
            this.noProgress = 0;
            this.emit("policy_committed", { previous, next: this.policy, explanation: proposal.explanation });
            return { kind: "policy_updated", version: this.policy.version };
        }
        return this.finish("fault", "proposal_validation_exhausted");
    }
    async execute(ctx, candidate, signal) {
        const fresh = await this.observe(signal);
        if (fresh.revision !== ctx.snapshot.revision || this.policy.version !== ctx.policy.version) {
            return this.stale("before_execute");
        }
        const gate = this.options.domain.gate(this.context(fresh), candidate);
        if (gate.kind !== "allow")
            return this.finish("paused", `execution_gate:${gate.reason}`);
        if (this.counts.actions >= this.limits.maxActions)
            return this.finish("stopped", "action_budget_exhausted");
        this.checkTime(signal);
        this.options.account?.action?.(candidate);
        this.counts.actions++;
        const request = { candidate, expectedRevision: fresh.revision, policyVersion: this.policy.version,
            idempotencyKey: `${this.options.runId}:${this.counts.cycles}:action` };
        this.emit("action_intent", request);
        let receipt;
        try {
            receipt = await this.io("execute", signal, s => this.options.domain.execute(request, s));
        }
        catch {
            // A timeout or abort is NOT evidence that a remote side effect did not happen.
            return this.finish("paused", `execution_outcome_unknown:${request.idempotencyKey}`);
        }
        this.emit("action_receipt", { request, receipt });
        if (receipt.status === "stale")
            return this.stale("executor_rejected_stale_snapshot");
        if (receipt.status === "unknown")
            return this.finish("paused", `execution_outcome_unknown:${request.idempotencyKey}`);
        let after;
        try {
            after = await this.observe(signal);
        }
        catch {
            return this.finish("paused", `post_execution_verification_unavailable:${request.idempotencyKey}`);
        }
        const feedback = immutable(this.options.domain.feedback(fresh, candidate, receipt, after, this.goal));
        const transition = immutable({ cycle: this.counts.cycles, policyVersion: this.policy.version,
            before: fresh, candidate, receipt, after, feedback });
        this.recent.push(transition);
        this.recent = this.recent.slice(-this.limits.historySize);
        this.noProgress = feedback.progress ? 0 : this.noProgress + 1;
        this.emit("transition", transition);
        const route = this.options.domain.afterTransition?.(this.context(after), transition);
        if (route) {
            this.emit("post_transition_route", route);
            return this.finish(route.kind === "pause" ? "paused" : "stopped", route.reason);
        }
        const completion = this.options.domain.completion(after, this.goal);
        if (completion !== "running")
            return this.done(completion);
        return { kind: "executed", actionId: candidate.id, feedback };
    }
    stale(reason) {
        this.emit("stale_result_discarded", { reason });
        return { kind: "stale" };
    }
    done(outcome) {
        this.terminal = { kind: "done", outcome };
        this.emit("run_finished", this.terminal);
        return this.terminal;
    }
    finish(kind, reason) {
        this.terminal = { kind, reason };
        this.emit("run_finished", this.terminal);
        return this.terminal;
    }
    emit(type, data) {
        const event = { runId: this.options.runId, seq: ++this.seq,
            cycle: this.counts.cycles, at: Date.now(), type, data: immutable(data) };
        this.options.journal.append(event);
    }
    /** Cooperative cancellation + bounded wait. An uncooperative remote effect can still finish;
     * that's why execution timeout pauses the entire run instead of issuing another action. */
    async io(label, parent, work) {
        this.checkTime(parent);
        const remaining = this.limits.maxDurationMs - (performance.now() - this.startedAt);
        const controller = new AbortController();
        const combined = AbortSignal.any([parent, controller.signal]);
        let timer;
        let onAbort;
        const interruption = new Promise((_resolve, reject) => {
            onAbort = () => reject(combined.reason ?? new Error(`${label}:aborted`));
            combined.addEventListener("abort", onAbort, { once: true });
            timer = setTimeout(() => controller.abort(new Error(`${label}:timeout`)), Math.max(1, Math.min(remaining, this.limits.ioTimeoutMs)));
        });
        try {
            combined.throwIfAborted();
            return await Promise.race([work(combined), interruption]);
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
            if (onAbort)
                combined.removeEventListener("abort", onAbort);
        }
    }
}

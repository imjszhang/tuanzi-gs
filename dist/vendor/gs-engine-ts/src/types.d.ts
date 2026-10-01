/** Wire data only: no closures, executable code, Maps, or class instances. */
export type Json = null | boolean | number | string | readonly Json[] | {
    readonly [key: string]: Json;
};
export interface Goal {
    readonly id: string;
    readonly description: string;
    /** A developer-owned verifier, never a model-authored success condition. */
    readonly verifierId: string;
}
export interface Snapshot<S extends Json> {
    /** Authoritative environment version, not a client-side timestamp. */
    readonly revision: string;
    readonly observedAt: number;
    readonly state: S;
}
export interface Policy<P extends Json> {
    readonly id: string;
    readonly version: number;
    readonly body: P;
}
export type Intent = "hold" | "engage" | "reposition" | "disengage" | "special";
export interface Candidate<A extends Json> {
    readonly id: string;
    readonly description: string;
    readonly capability: string;
    readonly action: A;
    /** Descriptive only. It grants no privileges. */
    readonly intent?: Intent;
}
export type Gate = {
    readonly kind: "allow";
} | {
    readonly kind: "deny" | "approval";
    readonly reason: string;
};
export type Completion = "running" | "succeeded" | "failed";
export interface Receipt {
    readonly status: "applied" | "failed" | "stale" | "unknown";
    readonly detail: string;
}
export interface Feedback {
    readonly actionSucceeded: boolean;
    /** Domain-defined milestone/progress, not necessarily immediate positive reward. */
    readonly progress: boolean;
    readonly metrics: Readonly<Record<string, number>>;
    readonly facts: readonly string[];
}
export interface Transition<S extends Json, A extends Json> {
    readonly cycle: number;
    readonly policyVersion: number;
    readonly before: Snapshot<S>;
    readonly candidate: Candidate<A>;
    readonly receipt: Receipt;
    readonly after: Snapshot<S>;
    readonly feedback: Feedback;
}
export interface Context<S extends Json, A extends Json, P extends Json> {
    readonly goal: Goal;
    readonly snapshot: Snapshot<S>;
    readonly policy: Policy<P>;
    readonly recent: readonly Transition<S, A>[];
    /** Validator-owned feedback from the immediately preceding rejected proposal. */
    readonly repairFeedback?: Json;
    /** Run-local measured execution evidence, distinct from same-call proposal rejection. */
    readonly executionFeedback?: Json;
}
export interface ExecuteRequest<A extends Json> {
    readonly candidate: Candidate<A>;
    readonly expectedRevision: string;
    readonly policyVersion: number;
    readonly idempotencyKey: string;
}
export interface Domain<S extends Json, A extends Json, P extends Json> {
    observe(signal: AbortSignal): Promise<Snapshot<S>>;
    /** Optional domain health diagnosis; invoked before selection. No model permission override. */
    assess?(context: Context<S, A, P>): {
        kind: "repair" | "pause";
        reason: string;
        evidence: Json;
    } | null;
    /** Optional measured failure envelope supplied anew at each repair boundary. */
    repairContext?(context: Context<S, A, P>): Json | undefined;
    /** Trusted domain control decision AFTER recording a transition; never an action override. */
    afterTransition?(context: Context<S, A, P>, transition: Transition<S, A>): {
        kind: "pause" | "stop";
        reason: string;
        evidence: Json;
    } | null;
    /** Cheap G: bind developer-owned capabilities to the current environment. */
    enumerate(context: Context<S, A, P>): readonly Candidate<A>[];
    /** Authoritative hard checks. Never replaced by model confidence. */
    gate(context: Context<S, A, P>, candidate: Candidate<A>): Gate;
    /** Must enforce expectedRevision + authorization atomically with mutation when possible.
     * On non-transactional external systems, revalidate targets and return unknown on ambiguity.
     * Repeated idempotencyKey must not repeat a side effect. */
    execute(request: ExecuteRequest<A>, signal: AbortSignal): Promise<Receipt>;
    completion(snapshot: Snapshot<S>, goal: Goal): Completion;
    feedback(before: Snapshot<S>, candidate: Candidate<A>, receipt: Receipt, after: Snapshot<S>, goal: Goal): Feedback;
    /** Runtime JSON parsing; a TS assertion is NOT sufficient. */
    parsePolicy(raw: unknown): P;
    /** Expensive incoming-proposal verification, not re-run against a later active snapshot. */
    validateProposal?(next: P, context: Context<S, A, P>): readonly string[];
    /** Check allowed features, skills, bounds, and capability invariants. */
    validatePolicy(next: P, context: Context<S, A, P>): readonly string[];
}
export interface Usage {
    readonly provider: string;
    readonly model: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    /** Actual known cost only. Absence is unknown, not zero. */
    readonly costMicrousd?: number;
}
export interface ModelResult<T> {
    readonly output: T;
    readonly usage?: Usage;
}
export interface Judgment {
    readonly choice: string | null;
    readonly confidence: number;
    /** Relative option probabilities, excluding abstention. */
    readonly probabilities: Readonly<Record<string, number>>;
    readonly abstainProbability: number;
    /** Separate semantic suitability judgment per action, NOT measured success probability. */
    readonly suitability: Readonly<Record<string, number>>;
}
export interface Selector<S extends Json, A extends Json, P extends Json> {
    /** This reference budget assumes ONE provider request; no hidden retries. */
    evaluate(context: Context<S, A, P>, candidates: readonly Candidate<A>[], signal: AbortSignal): Promise<ModelResult<Judgment>>;
}
export type Decision = {
    readonly kind: "execute";
    readonly candidateId: string;
} | {
    readonly kind: "repair";
    readonly reason: string;
} | {
    readonly kind: "pause";
    readonly reason: string;
} | {
    readonly kind: "stop";
    readonly reason: string;
};
export interface Arbiter<S extends Json, A extends Json, P extends Json> {
    decide(context: Context<S, A, P>, candidates: readonly Candidate<A>[], judgment: Judgment): Decision;
}
export interface PolicyProposal<P extends Json> {
    readonly baseVersion: number;
    readonly basedOnRevision: string;
    readonly body: P;
    readonly explanation: string;
}
export interface Planner<S extends Json, A extends Json, P extends Json> {
    /** Return untrusted JSON, not executable JavaScript. ONE provider request. */
    propose(context: Context<S, A, P>, reason: string, signal: AbortSignal): Promise<ModelResult<unknown>>;
}
export interface Limits {
    readonly maxCycles: number;
    readonly maxActions: number;
    readonly maxModelCalls: number;
    readonly maxRepairs: number;
    readonly maxDurationMs: number;
    readonly ioTimeoutMs: number;
    readonly noProgressWindow: number;
    readonly historySize: number;
    /** Defaults to one for backwards compatibility. Every attempt consumes root limits. */
    readonly maxProposalAttempts?: number;
}
export interface Counters {
    cycles: number;
    actions: number;
    modelCalls: number;
    repairs: number;
}
export interface EngineEvent {
    readonly runId: string;
    readonly seq: number;
    readonly cycle: number;
    readonly at: number;
    readonly type: string;
    readonly data: unknown;
}
export interface Journal {
    /** For production, make action-intent persistence durable BEFORE dispatch. */
    append(event: EngineEvent): void;
}
export type StepResult = {
    readonly kind: "executed";
    readonly actionId: string;
    readonly feedback: Feedback;
} | {
    readonly kind: "policy_updated";
    readonly version: number;
} | {
    readonly kind: "stale";
} | {
    readonly kind: "done";
    readonly outcome: "succeeded" | "failed";
} | {
    readonly kind: "paused" | "stopped" | "fault";
    readonly reason: string;
};

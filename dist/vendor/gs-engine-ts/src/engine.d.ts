import type { Arbiter, Candidate, Context, Counters, Domain, Goal, Journal, Json, Limits, Planner, Policy, Selector, StepResult, Transition } from "./types.js";
export interface EngineOptions<S extends Json, A extends Json, P extends Json> {
    readonly runId: string;
    readonly goal: Goal;
    readonly initialPolicy: Policy<P>;
    readonly domain: Domain<S, A, P>;
    readonly selector: Selector<S, A, P>;
    readonly planner: Planner<S, A, P>;
    readonly arbiter: Arbiter<S, A, P>;
    readonly journal: Journal;
    readonly limits: Limits;
    /** Optional shared-root charges. Scheduling a skill is not a physical action. */
    readonly account?: {
        cycle?(): void;
        model?(): void;
        action?(candidate: Candidate<A>): void;
    };
    /** Only developer-owned, provably applicable rules. No automatic 'one option = safe'. */
    readonly rule?: (context: Context<S, A, P>, candidates: readonly Candidate<A>[]) => string | undefined;
}
/** One instance = one serial run. Core has no model SDK, game, UI or persistence dependency.
 * Paused/faulted runs do NOT automatically resume: unknown effects require reconciliation.
 * This is a reference single-process runtime, not a durable workflow service. */
export declare class GSEngine<S extends Json, A extends Json, P extends Json> {
    private readonly options;
    private readonly goal;
    private readonly limits;
    private policy;
    private readonly lifetime;
    private readonly startedAt;
    private inFlight;
    private seq;
    private noProgress;
    private terminal;
    private recent;
    private readonly counts;
    constructor(options: EngineOptions<S, A, P>);
    get counters(): Readonly<Counters>;
    get currentPolicy(): Policy<P>;
    get history(): readonly Transition<S, A>[];
    cancel(): void;
    /** Driver calls step on readiness events; it must not use overlapping setInterval calls. */
    step(signal?: AbortSignal): Promise<StepResult>;
    private context;
    private checkTime;
    private reserveModelCall;
    private observe;
    private repair;
    private execute;
    private stale;
    private done;
    private finish;
    private emit;
    /** Cooperative cancellation + bounded wait. An uncooperative remote effect can still finish;
     * that's why execution timeout pauses the entire run instead of issuing another action. */
    private io;
}

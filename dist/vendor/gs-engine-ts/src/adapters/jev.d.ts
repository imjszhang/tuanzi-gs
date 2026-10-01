import type { Candidate, Context, Json, Judgment, ModelResult, Selector } from "../types.js";
export interface JevOptions<S extends Json, A extends Json, P extends Json> {
    readonly apiKey: string;
    readonly model: string;
    /** Redact secrets and reduce state here. Never include API keys or hidden permissions. */
    readonly encode: (ctx: Context<S, A, P>, candidates: readonly Candidate<A>[]) => Json;
    readonly fetch?: typeof fetch;
}
/** Direct official HTTP protocol, no SDK dependency. One request, zero hidden retries.
 * Choice and per-candidate Noul questions are independent within a request.
 * We NEVER ask 'is the action selected by another question suitable?' in the same batch. */
export declare class JevSelector<S extends Json, A extends Json, P extends Json> implements Selector<S, A, P> {
    private readonly options;
    constructor(options: JevOptions<S, A, P>);
    evaluate(ctx: Context<S, A, P>, candidates: readonly Candidate<A>[], signal: AbortSignal): Promise<ModelResult<Judgment>>;
}

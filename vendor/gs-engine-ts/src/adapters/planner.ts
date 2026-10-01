import type { Context, Json, ModelResult, Planner } from "../types.js";

/** Provider-independent seam. Implement this callback with your chosen LLM's JSON API.
 * Actual generation must use available capabilities and current world rules from encode().
 * This reference does not pretend a mock response is a live LLM integration. */
export class JsonPlanner<S extends Json, A extends Json, P extends Json> implements Planner<S, A, P> {
  constructor(
    private readonly complete: (input: Json, signal: AbortSignal) => Promise<ModelResult<unknown>>,
    private readonly encode: (context: Context<S, A, P>, reason: string) => Json
  ) {}
  propose(context: Context<S, A, P>, reason: string, signal: AbortSignal): Promise<ModelResult<unknown>> {
    return this.complete(this.encode(context, reason), signal);
  }
}

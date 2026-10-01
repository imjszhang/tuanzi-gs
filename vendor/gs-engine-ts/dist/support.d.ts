import type { Arbiter, Candidate, EngineEvent, Judgment, Journal, Json, PolicyProposal } from "./types.js";
export declare function record(raw: unknown, label: string): Record<string, unknown>;
export declare function text(raw: unknown, label: string): string;
export declare function finite(raw: unknown, label: string): number;
export declare function probability(raw: unknown, label: string): number;
export declare function immutable<T>(input: T): T;
export declare function parseProposal<P extends Json>(raw: unknown, parse: (body: unknown) => P): PolicyProposal<P>;
export declare function validateJudgment<A extends Json>(j: Judgment, candidates: readonly Candidate<A>[]): void;
/** Example policy only. Caller must calibrate suitabilityFloor on their own task.
 * Deliberately does NOT reject equivalent good actions just because Choice entropy is high. */
export declare function suitabilityArbiter<S extends Json, A extends Json, P extends Json>(suitabilityFloor: number): Arbiter<S, A, P>;
export declare class MemoryJournal implements Journal {
    readonly events: EngineEvent[];
    append(event: EngineEvent): void;
}

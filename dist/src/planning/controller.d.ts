import type { Judgment, ModelResult, Planner, Selector } from '../../vendor/gs-engine-ts/src/types.js';
import type { GameAction, GameState, GamePolicy, GameContext, GameCandidate } from '../game/types.js';
import type { SearchReport } from './search.js';
import { SkillBook } from './book.js';
export type LabEvent = {
    type: string;
    data: unknown;
};
export type PlanningStats = {
    searchRuns: number;
    expanded: number;
    generated: number;
    searchMs: number;
    shadowChecks: number;
    skillHits: number;
    providerG: number;
    providerS: number;
    source: string;
    searches: SearchReport[];
};
export declare const emptyStats: () => PlanningStats;
export declare function deterministicJudgment(cs: readonly GameCandidate[], selected: string | null): Judgment;
/** Same primitive candidate set in every new-mode baseline. Complete=true is an explicit
 * authored-rule oracle, including the legacy lureSite helper. Never used by program search. */
export declare class ProgramSelector implements Selector<GameState, GameAction, GamePolicy> {
    private readonly completeRules;
    constructor(completeRules?: boolean);
    evaluate(ctx: GameContext, cs: readonly GameCandidate[], signal: AbortSignal): Promise<ModelResult<Judgment>>;
}
export declare class ProgramPlanner implements Planner<GameState, GameAction, GamePolicy> {
    readonly book: SkillBook;
    readonly stats: PlanningStats;
    private readonly emit;
    private readonly generateRemote?;
    private readonly maxExpandedTotal;
    constructor(book: SkillBook, stats: PlanningStats, emit?: (e: LabEvent) => void, generateRemote?: ((ctx: GameContext, reason: string, signal: AbortSignal) => Promise<ModelResult<unknown>>) | undefined, maxExpandedTotal?: number);
    propose(ctx: GameContext, reason: string, signal: AbortSignal): Promise<ModelResult<unknown>>;
}

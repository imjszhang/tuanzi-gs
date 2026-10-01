import type { Selector, Planner, Arbiter, Judgment, ModelResult } from '../../vendor/gs-engine-ts/src/types.js';
import type { GameState, GameAction, GamePolicy, GameContext, GameCandidate } from '../game/types.js';
/** Deliberately NOT an AI model. These scores are authored rules for offline demonstrations. */
export declare function heuristicScore(ctx: GameContext, c: GameCandidate): number;
export declare class HeuristicSelector implements Selector<GameState, GameAction, GamePolicy> {
    evaluate(ctx: GameContext, cs: readonly GameCandidate[], signal: AbortSignal): Promise<ModelResult<Judgment>>;
}
export declare class TemplatePlanner implements Planner<GameState, GameAction, GamePolicy> {
    private readonly adaptive;
    constructor(adaptive?: boolean);
    propose(ctx: GameContext, _reason: string, signal: AbortSignal): Promise<ModelResult<unknown>>;
}
export declare class GameArbiter implements Arbiter<GameState, GameAction, GamePolicy> {
    decide(ctx: GameContext, cs: readonly GameCandidate[], j: Judgment): {
        kind: "repair";
        reason: string;
        candidateId?: never;
    } | {
        kind: "stop";
        reason: string;
        candidateId?: never;
    } | {
        kind: "execute";
        candidateId: string;
        reason?: never;
    };
}
export type RunMode = 'adaptive' | 'fixed' | 'jev-template' | 'live' | 'program' | 'rules-full' | 'program-jev' | 'program-live' | 'reactive' | 'reactive-off' | 'reactive-record' | 'reactive-jev' | 'reactive-live';
export declare const isRemoteMode: (mode: RunMode) => boolean;
export declare const isProgramMode: (mode: RunMode) => boolean;
export declare const MODE_LABELS: Record<RunMode, string>;
export declare class RemoteSelector implements Selector<GameState, GameAction, GamePolicy> {
    private readonly token;
    constructor(token: string);
    evaluate(ctx: GameContext, candidates: readonly GameCandidate[], signal: AbortSignal): Promise<ModelResult<Judgment>>;
}
export declare class RemotePlanner implements Planner<GameState, GameAction, GamePolicy> {
    private readonly token;
    private readonly endpoint;
    constructor(token: string, endpoint?: string);
    propose(ctx: GameContext, reason: string, signal: AbortSignal): Promise<ModelResult<unknown>>;
}

import type { GameState } from '../game/types.js';
import type { Stage, Program } from './spec.js';
export declare function scopeExpired(stage: Stage, s: GameState): boolean;
export declare function conditionIssues(p: Program, index: number, s: GameState, start: GameState): {
    path: string;
    code: string;
    message: string;
    actual?: unknown;
}[];
export declare function assertConditions(p: Program, index: number, s: GameState, start: GameState): void;

import type { BoundedProgram } from '../../vendor/gs-engine-ts/src/program.js';
import type { GameAction, GameState } from '../game/types.js';
export declare const RULESET = "tuanzi-physics-1";
export type GameProgram = BoundedProgram<GameAction>;
export declare function digest(text: string): string;
export declare function exactWorldKey(s: GameState): string;
export declare function stateFingerprint(s: GameState): string;
export declare function actionKey(a: GameAction): string;
export declare function parseAction(raw: unknown): GameAction;
export declare function parseProgram(raw: unknown): GameProgram;
export type Verification = {
    ok: boolean;
    reason: string;
    steps: number;
    final: GameState;
    actions: GameAction[];
};
/** Independent exact roll-out of a proposal. No search heuristic participates here. */
export declare function verifyProgram(initial: GameState, raw: unknown, requireGoal?: boolean): Verification;
export declare function compileActions(initial: GameState, raw: unknown, title?: string): GameProgram;

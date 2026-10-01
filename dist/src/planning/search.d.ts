/** Bounded deterministic beam search over primitives. No lureSite(), strategy modes,
 * skill templates, or provider calls. Heuristics are authored, not learned. */
import type { GameAction, GameState } from '../game/types.js';
export declare function legalPrimitives(s: GameState): GameAction[];
/** Fast immutable fork for shadow simulation. Terrain, walls, and berries are read-only;
 * applyAction replaces berries/lures arrays and only mutates cloned guards. */
export declare function simulate(s: GameState, a: GameAction): GameState;
export declare function physicalKey(s: GameState, includeEnergy?: boolean): string;
export type SearchReport = {
    expanded: number;
    generated: number;
    depth: number;
    beamWidth: number;
    elapsedMs: number;
    status: 'solved' | 'budget' | 'exhausted';
    solutions: number;
    heuristic: 'task' | 'explore';
    maxExpanded: number;
};
export type SearchResult = {
    actions: GameAction[];
    report: SearchReport;
    final: GameState | null;
};
export declare function searchProgram(initial: GameState, signal: AbortSignal, options?: {
    width?: number;
    maxExpanded?: number;
    maxDepth?: number;
    heuristic?: 'task' | 'explore';
    reverse?: boolean;
    onProgress?: (report: SearchReport) => void;
}): Promise<SearchResult>;

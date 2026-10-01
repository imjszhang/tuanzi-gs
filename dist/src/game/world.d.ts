import type { GameState, Point, ScenarioId, EditTool, GameAction } from './types.js';
export declare const DIRECTIONS: readonly Point[];
export declare function inside(s: GameState, p: Point): boolean;
export declare function walkable(s: GameState, p: Point): boolean;
export declare function dangerous(s: GameState, p: Point): boolean;
/** Deterministic BFS, no model calls. The start may be threatened after an edit. */
export declare function path(s: GameState, start: Point, goal: Point, safe?: boolean): Point[] | null;
export declare function reachableBerries(s: GameState): {
    berry: GameState['berries'][number];
    route: Point[];
}[];
/** A drop location is calculated from known physics, not a hidden skill. */
export declare function lureSite(s: GameState): {
    drop: Point;
    stand: Point;
    route: Point[];
} | null;
export declare function createWorld(scenario?: ScenarioId): GameState;
export declare class GameWorld {
    private value;
    constructor(initial?: GameState);
    snapshot(): GameState;
    /** Only the domain executor calls transact. JS synchronous mutation is atomic here. */
    transact(expectedRevision: string, apply: (s: GameState) => void): boolean;
    edit(tool: EditTool, p: Point): {
        ok: boolean;
        message: string;
    };
}
/** One action = one world tick. Animation is deliberately not part of the simulation. */
export declare function applyAction(s: GameState, a: GameAction): void;

import type { BoundedProgram } from '../../vendor/gs-engine-ts/src/program.js';
import type { Context, Candidate, Policy } from '../../vendor/gs-engine-ts/src/types.js';
export type Point = {
    x: number;
    y: number;
};
export type Berry = Point & {
    id: string;
};
export type Guard = Point & {
    id: string;
    anchor: Point;
    eating: number;
};
export type Lure = Point & {
    id: string;
    ttl: number;
};
export type Tile = 'grass' | 'water' | 'rock';
export type GameState = {
    width: number;
    height: number;
    revision: number;
    turn: number;
    maxTurns: number;
    terrain: Tile[];
    walls: Point[];
    berries: Berry[];
    guards: Guard[];
    lures: Lure[];
    home: Point;
    player: Point;
    energy: number;
    maxEnergy: number;
    bag: number;
    capacity: number;
    delivered: number;
    target: number;
    scenario: string;
    attacks: number;
    baitUsed: number;
    eaten: number;
    lastFact: string;
};
export type GameAction = {
    kind: 'move';
    x: number;
    y: number;
    objective: 'berry' | 'home' | 'lure' | 'safe';
    targetId: string;
    distance: number;
} | {
    kind: 'pickup';
    berryId: string;
} | {
    kind: 'eat';
} | {
    kind: 'deposit';
    amount: number;
} | {
    kind: 'drop';
    x: number;
    y: number;
} | {
    kind: 'wait';
};
export type GamePolicy = {
    mode: 'forage' | 'lure' | 'return' | 'program';
    program?: BoundedProgram<GameAction>;
    subgoal: string;
    enabled: string[];
    reserveEnergy: number;
};
export type GameContext = Context<GameState, GameAction, GamePolicy>;
export type GameCandidate = Candidate<GameAction>;
export type ScenarioId = 'meadow' | 'guarded' | 'detour' | 'remix';
export type EditTool = 'inspect' | 'berry' | 'wall' | 'guard' | 'erase';
export declare const CAPABILITIES: readonly ["move", "pickup", "eat", "deposit", "drop", "wait"];
export declare const INITIAL_POLICY: Policy<GamePolicy>;
export declare const GOAL: {
    id: string;
    description: string;
    verifierId: string;
};
export declare const clone: <T>(x: T) => T;
export declare const same: (a: Point, b: Point) => boolean;
export declare const dist: (a: Point, b: Point) => number;
export declare const key: (p: Point) => string;

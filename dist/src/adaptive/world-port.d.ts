/** Information boundary for the autonomous lane.
 * No reference policy, BFS, tactical placement, rollout, milestone score or benchmark trace.
 * The only imported world capabilities are authoritative snapshot/edit/transact and physics.
 */
import type { GameState, GameAction, Point } from '../game/types.js';
import type { Group, Predicate, Stage } from './spec.js';
export declare const PUBLIC_RULES: Readonly<Record<string, string>>;
export declare function publicWorld(s: GameState): {
    width: number;
    height: number;
    revision: number;
    turn: number;
    maxTurns: number;
    terrain: import("../game/types.js").Tile[];
    walls: {
        x: number;
        y: number;
    }[];
    berries: {
        id: string;
        x: number;
        y: number;
    }[];
    guards: {
        id: string;
        x: number;
        y: number;
        anchor: {
            x: number;
            y: number;
        };
        eating: number;
    }[];
    lures: {
        id: string;
        x: number;
        y: number;
        ttl: number;
    }[];
    home: {
        x: number;
        y: number;
    };
    player: {
        x: number;
        y: number;
    };
    energy: number;
    maxEnergy: number;
    bag: number;
    capacity: number;
    delivered: number;
    target: number;
    attacks: number;
    baitUsed: number;
    eaten: number;
};
export declare function actionId(a: GameAction): string;
export declare function actionWire(a: GameAction): Record<string, string | number>;
export declare function legalActions(s: GameState): GameAction[];
export declare function describe(a: GameAction): string;
export declare function observe(s: GameState, groups: Group[], history: unknown[]): Record<string, unknown>;
export declare function testPredicate(p: Predicate, current: GameState, start: GameState): boolean;
export declare function stageComplete(stage: Stage, s: GameState, start: GameState): boolean;
export declare function measured(before: GameState, a: GameAction, after: GameState): {
    source: string;
    action: Record<string, string | number>;
    before: {
        revision: number;
        turn: number;
        player: Point;
        energy: number;
        bag: number;
        delivered: number;
    };
    after: {
        revision: number;
        turn: number;
        player: Point;
        energy: number;
        bag: number;
        delivered: number;
    };
    delta: {
        energy: number;
        bag: number;
        delivered: number;
        attacks: number;
        baitUsed: number;
        eaten: number;
    };
    worldChanges: {
        guardPositions: {
            id: string;
            x: number;
            y: number;
            eating: number;
        }[];
        lures: {
            x: number;
            y: number;
            id: string;
            ttl: number;
        }[];
    };
};
export declare function actionFacts(s: GameState, a: GameAction, target: Point | null): {
    provenance: string;
    legalNow: boolean;
    actionCostEnergy: number;
    bagEffect: number;
    target: {
        point: Point;
        metric: string;
        before: number;
        after: number;
    } | null;
};

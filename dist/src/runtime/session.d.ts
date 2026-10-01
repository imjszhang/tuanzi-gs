import { GSEngine } from '../../vendor/gs-engine-ts/src/engine.js';
import type { EngineEvent, Policy, StepResult, Selector } from '../../vendor/gs-engine-ts/src/types.js';
import { TuanziDomain } from '../game/domain.js';
import { GameWorld } from '../game/world.js';
import type { GameState, GameAction, GamePolicy, EditTool, Point } from '../game/types.js';
import type { RunMode } from './controllers.js';
import type { Planner } from '../../vendor/gs-engine-ts/src/types.js';
import { SkillBook } from '../planning/book.js';
export type SessionOptions = {
    book?: SkillBook;
    maxSearchExpanded?: number;
    planner?: Planner<GameState, GameAction, GamePolicy>;
    selector?: Selector<GameState, GameAction, GamePolicy>;
};
export declare class GameSession {
    readonly world: GameWorld;
    readonly domain: TuanziDomain;
    readonly engine: GSEngine<GameState, GameAction, GamePolicy>;
    readonly events: EngineEvent[];
    readonly interventions: {
        at: number;
        tool: EditTool;
        point: Point;
        after: GameState;
        message: string;
    }[];
    readonly initial: GameState;
    readonly initialPolicy: Policy<GamePolicy>;
    readonly mode: RunMode;
    readonly book: SkillBook;
    readonly planning: import("../planning/controller.js").PlanningStats;
    private activeTrial;
    private accounted;
    private seq;
    private notify;
    lastResult: StepResult | undefined;
    constructor(initial: GameState, mode?: RunMode, onEvent?: (event: EngineEvent) => void, token?: string, policy?: Policy<GamePolicy>, options?: SessionOptions);
    step(): Promise<StepResult>;
    private addEvent;
    get finished(): boolean;
    cancel(): void;
    edit(tool: EditTool, p: Point): {
        ok: boolean;
        message: string;
    };
    export(): {
        format: string;
        createdAt: string;
        mode: RunMode;
        note: string;
        initialWorld: GameState;
        initialPolicy: Policy<GamePolicy>;
        finalWorld: GameState;
        policy: Policy<GamePolicy>;
        counters: Readonly<import("../../vendor/gs-engine-ts/src/types.js").Counters>;
        planning: import("../planning/controller.js").PlanningStats;
        usage: unknown[];
        rejectedUsage: unknown[];
        result: StepResult | null;
        events: EngineEvent[];
        interventions: {
            at: number;
            tool: EditTool;
            point: Point;
            after: GameState;
            message: string;
        }[];
    };
}
export type ComparisonResult = {
    mode: RunMode;
    label: string;
    outcome: string;
    turns: number;
    delivered: number;
    energy: number;
    repairs: number;
    selects: number;
    externalCalls: number;
    trace: ReturnType<GameSession['export']>;
};
export declare function runSessionToEnd(session: GameSession): Promise<GameSession>;
/** Retained for v0.1 regression only. The UI uses comparePrograms() below. */
export declare function compareOffline(initial: GameState): Promise<ComparisonResult[]>;
/** New modes expose identical primitive IDs and permissions; ONLY controller/planning differs.
 * Warm reuse is explicitly trained by the cold row. Never label it an independent sample. */
export declare function comparePrograms(initial: GameState): Promise<ComparisonResult[]>;

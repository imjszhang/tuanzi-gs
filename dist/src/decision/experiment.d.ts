/** Small frozen fixtures in the SAME GameWorld, evaluated by immutable task contracts.
 * Reference BFS is evaluation-only. It is never included in a selector packet. */
import type { EngineEvent, StepResult } from '../../vendor/gs-engine-ts/src/types.js';
import { GSEngine } from '../../vendor/gs-engine-ts/src/engine.js';
import type { JudgmentBackend, ScheduleReport } from '../../vendor/gs-engine-ts/src/judgment.js';
import type { DecisionPacket } from '../../vendor/gs-engine-ts/src/decision.js';
import { GameWorld } from '../game/world.js';
import type { GameState, GameAction, EditTool, Point } from '../game/types.js';
import type { Strategy, Assessment } from './pipeline.js';
export type TaskId = 'fast' | 'reserve' | 'energy' | 'chain';
export type TaskContract = {
    schema: 'gs/task-contract/v1';
    id: TaskId;
    version: 1;
    title: string;
    description: string;
    delivery: number;
    reserve: number;
    energy: number;
    maxActions: number;
};
export declare const TASKS: Record<TaskId, TaskContract>;
export type ObservationAction = {
    kind: 'observe';
    field: 'resources';
};
export type ExperimentAction = GameAction | ObservationAction;
export type ExperimentOptions = {
    strategy: Strategy;
    backend?: JudgmentBackend;
    orderSeed?: number;
    maskResources?: boolean;
    delayMs?: number;
    deadlineMs?: number;
    perturb?: boolean;
    maxRequests?: number;
    maxObservations?: number;
    signal?: AbortSignal;
    initialWorld?: GameState;
    onEngineEvent?: (event: EngineEvent) => void;
    maxQuestions?: number;
};
export type MissionFacts = {
    current: {
        energy: number | null;
        bag: number | null;
        delivered: number | null;
    };
    projected: {
        energy: number | null;
        bag: number | null;
        delivered: number | null;
    };
    actionKind: string;
    amount: number;
    homeSteps: number | null;
    afterHomeSteps: number | null;
    berrySteps: number | null;
    afterBerrySteps: number | null;
    reachableBerries: number;
    priorVisits: number;
    capacity: number;
    unknownResources: boolean;
    source: 'known-physics-observation/v1';
};
export declare function createFixture(id: TaskId): GameState;
export declare function taskSuccess(s: GameState, t: TaskContract): boolean;
/** Authored comparison policy, separate from the exhaustive reference verifier. */
export declare function missionAssessment(p: DecisionPacket, id: string): Assessment;
export type ExperimentResult = {
    schema: 'gs/experiment/v04';
    task: TaskContract;
    strategy: Strategy;
    backend: string;
    backendKind: string;
    status: string;
    reason: string | null;
    initial: GameState;
    final: GameState;
    actions: number;
    observations: number;
    requests: number;
    externalRequests: number;
    questions: number;
    simulationChecks: number;
    elapsedMs: number;
    syntheticDelayMs: number;
    deadlineMs: number;
    packets: DecisionPacket[];
    runs: ScheduleReport[];
    events: EngineEvent[];
    frames: GameState[];
    perturbations: number;
    realModels: 'NOT_RUN' | 'REQUESTED';
    oracle: null | OracleResult;
};
export type OracleResult = {
    status: 'OPTIMAL' | 'EXHAUSTED' | 'INFEASIBLE_WITHIN_HORIZON';
    steps: number | null;
    expanded: number;
    maxNodes: number;
    label: string;
};
/** Unit-cost BFS over actual simulator states. Bound exhaustion is NOT an optimality claim. */
export declare function solveReference(initial: GameState, t: TaskContract, maxNodes?: number): OracleResult;
/** Incremental form used by both the original batch runner and the shared-session service.
 * Construct just before first use: its wall-clock deadline includes subsequent pauses. */
export declare function createExperimentSession(id: TaskId, options: ExperimentOptions, onEvent?: (result: Partial<ExperimentResult>) => void): {
    world: GameWorld;
    engine: GSEngine<GameState, ExperimentAction, {
        fixed: true;
    }>;
    readonly finished: boolean;
    readonly lastResult: StepResult | undefined;
    step(): Promise<StepResult>;
    cancel(): void;
    edit(tool: EditTool, p: Point): {
        ok: boolean;
        message: string;
    };
    result: () => ExperimentResult;
    export: () => ExperimentResult;
};
export declare function runExperiment(id: TaskId, options: ExperimentOptions, onEvent?: (result: Partial<ExperimentResult>) => void): Promise<ExperimentResult>;

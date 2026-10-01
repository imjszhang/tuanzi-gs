import { GameWorld } from '../game/world.js';
import type { GameState } from '../game/types.js';
import type { ProviderFactory, MemorySeed, RequestLedger } from './session.js';
import type { LabConfig, Actor, LabView, LabEvent, RunStatus, CommandResult, Intervention } from './types.js';
export type Checkpoint = {
    id: string;
    label: string;
    at: string;
    world: GameState;
    memory: MemorySeed;
    sourceRunId: string;
    sourceSeq: number;
    decisionSteps: number;
    note: string;
};
export declare class LabRun {
    private readonly providers?;
    readonly runId: string;
    readonly createdAt: string;
    readonly events: LabEvent[];
    readonly checkpoints: Map<string, Checkpoint>;
    readonly initial: GameState;
    readonly config: LabConfig;
    readonly lineage: unknown;
    readonly ledger: RequestLedger;
    private holder;
    private preWorld;
    private abort;
    private listeners;
    private commands;
    private timer;
    private deadlineTimer;
    private desired;
    private seq;
    private pendingStop;
    private eventBudget;
    private seed;
    private script;
    private editLog;
    owner: Actor;
    controlVersion: number;
    status: RunStatus;
    reason: string | null;
    busy: boolean;
    startedAt: string | null;
    endedAt: string | null;
    private startedClock;
    engineWorkMs: number;
    decisionSteps: number;
    constructor(config: LabConfig, owner: Actor, providers?: ProviderFactory | undefined, initial?: GameState, seed?: MemorySeed, lineage?: unknown);
    get terminal(): boolean;
    get world(): GameWorld;
    private emit;
    subscribe(fn: (e: LabEvent) => void): () => boolean;
    private onEngine;
    view(): LabView;
    private publish;
    private clearTimer;
    private initialize;
    private requestStop;
    private end;
    private applyScheduled;
    private enqueue;
    private quantum;
    command(raw: unknown): Promise<CommandResult>;
    getCheckpoint(checkpointId: string): Checkpoint;
    export(): {
        schema: string;
        version: string;
        state: LabView;
        initial: GameState;
        config: LabConfig;
        lineage: unknown;
        controls: LabEvent[];
        events: LabEvent[];
        checkpoints: Checkpoint[];
        script: {
            spec: Intervention;
            origin: string;
            applied: boolean;
        }[];
        ledger: RequestLedger;
        trace: {} | null;
        evaluation: {
            live: string;
            hasInterventions: boolean;
            interactiveControl: boolean;
            deadlineIncludesOperatorPauses: boolean;
            note: string;
        };
    };
    shutdown(): void;
}
export declare class ExperimentManager {
    readonly providers?: ProviderFactory | undefined;
    readonly maxRuns: number;
    readonly runs: Map<string, LabRun>;
    private createRequests;
    private forks;
    constructor(providers?: ProviderFactory | undefined, maxRuns?: number);
    capabilities(): {
        schema: string;
        version: string;
        kinds: string[];
        tasks: Record<import("../decision/experiment.js").TaskId, import("../decision/experiment.js").TaskContract>;
        scenarios: string[];
        controllers: string[];
        strategies: string[];
        backends: {
            rule: {
                ready: boolean;
            };
            jev: {
                ready: boolean;
            };
            llm: {
                ready: boolean;
            };
        };
        commands: string[];
        limits: {
            maxRuns: number;
            maxRequests: number;
            maxQuestions: number;
            maxActions: number;
            maxSteps: number;
            maxSearchNodes: number;
            deadlineMs: number;
            maxGCalls: number;
            maxDepth: number;
            maxRevisions: number;
            maxFormatRepairs: number;
            jevMaxRetries: number;
            jevRetryBaseMs: number;
            jevRetryMaxMs: number;
            jevAttemptTimeoutMs: number;
        };
        defaults: LabConfig;
        informationPolicy: {
            adaptive: string;
            referenceControllers: string[];
            referenceMode: string;
            allowSolverFeedback: boolean;
            allowOptimizedBinding: boolean;
            allowLegacyMemory: boolean;
        };
        transportRetry: {
            provider: string;
            extraAttempts: number;
            semanticNoneRetried: boolean;
            perAttemptLedger: boolean;
            worldActionsRetried: boolean;
            event: string;
        };
        generationStream: {
            event: string;
            schema: string;
            channels: string[];
            previewOnly: boolean;
            partialExecution: boolean;
            history: string;
        };
        semantics: {
            depth: string;
            candidateScope: string;
            initialization: string;
            pause: string;
            cancel: string;
            fork: string;
            clock: string;
            recovery: string;
            auth: string;
            persistence: string;
        };
    };
    get(runId: string): LabRun;
    create(raw: unknown): Promise<LabView>;
    private insert;
    fork(parentId: string, raw: unknown): Promise<LabView>;
    close(): void;
}

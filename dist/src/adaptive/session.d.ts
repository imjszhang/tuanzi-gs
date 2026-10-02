import type { AdaptationRequest, OutputRepairRequest } from '../../vendor/gs-engine-ts/src/adaptive.js';
import type { EngineEvent, StepResult, ModelResult } from '../../vendor/gs-engine-ts/src/types.js';
import type { JudgmentBackend } from '../../vendor/gs-engine-ts/src/judgment.js';
import { GameWorld } from '../game/world.js';
import type { GameState, EditTool, Point } from '../game/types.js';
import { measured } from './world-port.js';
import type { Program } from './spec.js';
import type { Strategy } from './judgment.js';
export type AdaptiveGenerator = {
    id: string;
    kind: 'local' | 'llm' | 'mock';
    propose(input: AdaptationRequest | OutputRepairRequest, signal: AbortSignal): Promise<ModelResult<unknown>>;
};
export type AdaptiveMemory = {
    schema: 'gs/self-memory/v05';
    informationPolicy: 'no-reference/v05';
    records: SelfRecord[];
};
export type SelfRecord = {
    program: Program;
    source: 'llm' | 'local' | 'mock';
    worldEvidence: string;
    status: 'trial' | 'local-completed' | 'root-succeeded' | 'failed' | 'interrupted';
    actualActions: number;
    deliveredDelta: number;
    attacks: number;
};
export declare const INITIAL_REVIEW_CAUSE = "initial_environment_review";
export type InitializationState = {
    policy: 'g-before-action/v054';
    status: 'pending' | 'reviewing' | 'ready' | 'failed' | 'skipped-terminal';
    reviewCount: number;
    reviewedRevision: string | null;
    policyVersion: number | null;
    reason: string | null;
};
export type AdaptiveOptions = {
    backend: JudgmentBackend;
    generator: AdaptiveGenerator;
    strategy: Strategy;
    orderSeed: number;
    signal?: AbortSignal;
    experience?: 'off' | 'record' | 'use';
    memory?: AdaptiveMemory;
    maxActions?: number;
    maxSteps?: number;
    maxGCalls?: number;
    gTimeoutMs?: number;
    maxDepth?: number;
    maxRevisions?: number;
    maxFormatRepairs?: number;
    noProgressWindow?: number;
    deadlineMs?: number;
};
export declare class AutonomousSession {
    private readonly options;
    private readonly notify;
    readonly world: GameWorld;
    readonly runId: string;
    readonly initial: GameState;
    readonly events: EngineEvent[];
    readonly decisions: unknown[];
    readonly history: ReturnType<typeof measured>[];
    readonly audit: {
        role: 'G' | 'S';
        depth: number;
        input: unknown;
        output?: unknown;
        error?: string;
        source: string;
        elapsedMs: number;
    }[];
    readonly records: SelfRecord[];
    private program;
    private stageIndex;
    private stageStart;
    private programStart;
    private policyVersion;
    private formatRepairs;
    private invalidOutputs;
    private validBatches;
    private revisionAttempts;
    private committedRevisions;
    private latestValidation;
    private cumulativeBefore;
    private seq;
    private cycles;
    private gCalls;
    private sCalls;
    private metaCalls;
    private abort;
    private started;
    private busy;
    private issue;
    private activeDepth;
    private phase;
    private previousIssue;
    private activeRecord;
    private readonly subproblemResults;
    private interventions;
    private stopReason;
    private initialization;
    finished: boolean;
    lastResult: StepResult | undefined;
    lastDecision: unknown;
    constructor(initial: GameState, options: AdaptiveOptions, notify?: (e: EngineEvent) => void);
    private emit;
    private check;
    private get stage();
    private recent;
    private actionFrame;
    private evidence;
    private parse;
    private previewProgram;
    private apply;
    private subproblem;
    private event;
    private makeResolver;
    private invokeG;
    private finish;
    cancel(): void;
    edit(tool: EditTool, p: Point): {
        ok: boolean;
        message: string;
    };
    step(): Promise<StepResult>;
    inspect(): {
        lastDecision: unknown;
        activeSkill: {
            runId: string;
            spec: {
                title: string;
                phases: {
                    rule: string;
                }[];
                source: "mock" | "llm" | "local";
            };
            phase: number;
            binding: {};
            adaptive: boolean;
            depth: number;
            mode: string;
        } | null;
        lastSkillResult: SelfRecord | null;
        diagnostics: {
            schema: string;
            controlMode: string;
            candidatePolicy: string;
            subproblems: unknown[];
            phase: string;
            initialization: {
                policy: "g-before-action/v054";
                status: "pending" | "reviewing" | "ready" | "failed" | "skipped-terminal";
                reviewCount: number;
                reviewedRevision: string | null;
                policyVersion: number | null;
                reason: string | null;
            };
            depth: number;
            policyVersion: number;
            sCalls: number;
            gCalls: number;
            metaCalls: number;
            latestIssue: unknown;
            reason: string | null;
            program: Program;
            actualActions: number;
            adaptations: unknown[];
            outputAccounting: {
                formatRepairs: number;
                invalidOutputs: number;
                validBatches: number;
                revisionAttempts: number;
                committedRevisions: number;
                actualActionTrials: number;
            };
            latestValidation: unknown;
            budgets: {
                gTimeoutMs: number;
                gUsed: number;
                gLimit: number;
                depthLimit: number;
                maxFormatRepairs: number;
                maxRevisions: number;
            };
            informationPolicy: string;
            assistance: {
                exampleSolution: boolean;
                referenceController: boolean;
                referenceRollouts: number;
                optimizedTargetBinding: boolean;
                pathPlanner: boolean;
            };
            provenance: {
                generator: string;
                selector: string;
                source: "mock" | "llm" | "local";
            };
            note: string;
        };
    };
    diagnostics(): {
        schema: string;
        controlMode: string;
        candidatePolicy: string;
        subproblems: unknown[];
        phase: string;
        initialization: {
            policy: "g-before-action/v054";
            status: "pending" | "reviewing" | "ready" | "failed" | "skipped-terminal";
            reviewCount: number;
            reviewedRevision: string | null;
            policyVersion: number | null;
            reason: string | null;
        };
        depth: number;
        policyVersion: number;
        sCalls: number;
        gCalls: number;
        metaCalls: number;
        latestIssue: unknown;
        reason: string | null;
        program: Program;
        actualActions: number;
        adaptations: unknown[];
        outputAccounting: {
            formatRepairs: number;
            invalidOutputs: number;
            validBatches: number;
            revisionAttempts: number;
            committedRevisions: number;
            actualActionTrials: number;
        };
        latestValidation: unknown;
        budgets: {
            gTimeoutMs: number;
            gUsed: number;
            gLimit: number;
            depthLimit: number;
            maxFormatRepairs: number;
            maxRevisions: number;
        };
        informationPolicy: string;
        assistance: {
            exampleSolution: boolean;
            referenceController: boolean;
            referenceRollouts: number;
            optimizedTargetBinding: boolean;
            pathPlanner: boolean;
        };
        provenance: {
            generator: string;
            selector: string;
            source: "mock" | "llm" | "local";
        };
        note: string;
    };
    memory(): AdaptiveMemory;
    export(): {
        format: string;
        informationPolicy: string;
        initialWorld: GameState;
        finalWorld: GameState;
        result: StepResult | null;
        decisionAudit: unknown[];
        history: {
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
        }[];
        program: Program;
        diagnostics: {
            schema: string;
            controlMode: string;
            candidatePolicy: string;
            subproblems: unknown[];
            phase: string;
            initialization: {
                policy: "g-before-action/v054";
                status: "pending" | "reviewing" | "ready" | "failed" | "skipped-terminal";
                reviewCount: number;
                reviewedRevision: string | null;
                policyVersion: number | null;
                reason: string | null;
            };
            depth: number;
            policyVersion: number;
            sCalls: number;
            gCalls: number;
            metaCalls: number;
            latestIssue: unknown;
            reason: string | null;
            program: Program;
            actualActions: number;
            adaptations: unknown[];
            outputAccounting: {
                formatRepairs: number;
                invalidOutputs: number;
                validBatches: number;
                revisionAttempts: number;
                committedRevisions: number;
                actualActionTrials: number;
            };
            latestValidation: unknown;
            budgets: {
                gTimeoutMs: number;
                gUsed: number;
                gLimit: number;
                depthLimit: number;
                maxFormatRepairs: number;
                maxRevisions: number;
            };
            informationPolicy: string;
            assistance: {
                exampleSolution: boolean;
                referenceController: boolean;
                referenceRollouts: number;
                optimizedTargetBinding: boolean;
                pathPlanner: boolean;
            };
            provenance: {
                generator: string;
                selector: string;
                source: "mock" | "llm" | "local";
            };
            note: string;
        };
        selfMemory: AdaptiveMemory;
        requests: {
            role: "G" | "S";
            depth: number;
            input: unknown;
            output?: unknown;
            error?: string;
            source: string;
            elapsedMs: number;
        }[];
        events: EngineEvent[];
        notes: {
            referenceResultRead: boolean;
            realModelPerformance: string;
            interventions: number;
        };
    };
}

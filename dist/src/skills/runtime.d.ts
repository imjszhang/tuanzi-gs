import type { JudgmentBackend, ScheduleReport } from '../../vendor/gs-engine-ts/src/judgment.js';
import type { Strategy } from '../decision/pipeline.js';
import type { DecisionPacket, DecisionAudit, DecisionSource } from '../../vendor/gs-engine-ts/src/decision.js';
import { GSEngine } from '../../vendor/gs-engine-ts/src/engine.js';
import { RootBudget, ExecutionLease } from '../../vendor/gs-engine-ts/src/resources.js';
import type { Json, Domain, Context, Snapshot, Candidate, ExecuteRequest, Receipt, Feedback, Policy, EngineEvent, StepResult, Judgment, ModelResult } from '../../vendor/gs-engine-ts/src/types.js';
import { GameWorld } from '../game/world.js';
import { TuanziDomain } from '../game/domain.js';
import type { GameState, GameAction, GamePolicy, EditTool, Point } from '../game/types.js';
import { SkillBook } from '../planning/book.js';
import type { SkillSpec, Binding, FeatureId, Weights } from './spec.js';
import type { Frame } from './behavior.js';
import { RecoveryJournal } from './recovery.js';
import type { ExecutionFailure } from './recovery.js';
import { ExperienceTable } from './experience.js';
import type { ExperienceMode, Outcome } from './experience.js';
import { ReactiveCatalogue } from './catalogue.js';
import type { GameSession } from '../runtime/session.js';
export type SkillPolicy = {
    spec: SkillSpec;
    binding: Binding;
};
export type RootPolicy = {
    skills: SkillSpec[];
    features: FeatureId[];
    weights: Weights;
};
export type SkillCall = {
    kind: 'callSkill';
    skillId: string;
    version: number;
    binding: Binding;
};
export type RootCandidate = Candidate<SkillCall>;
export type ProviderRequest = {
    level: 'parent' | 'child';
    goal: string;
    projection: Json;
    packet?: DecisionPacket;
    spec?: SkillSpec;
    binding?: Binding;
    candidates: {
        id: string;
        description: string;
        action: Json;
        facts?: Json;
        evidence?: Json;
    }[];
};
export type ReactiveProviders = {
    identity?: string;
    source?: DecisionSource;
    select?: (input: ProviderRequest, signal: AbortSignal) => Promise<ModelResult<Judgment>>;
    generate?: (input: {
        state: GameState;
        binding: Binding;
        feedback?: Json;
        executionFeedback?: Json;
    }, signal: AbortSignal) => Promise<ModelResult<unknown>>;
};
export type SkillSummary = {
    runId: string;
    parentRunId: string;
    skillId: string;
    version: number;
    source: string;
    binding: Binding;
    selectorIdentity: string;
    questionVersion: string;
    factsVersion: string;
    validationScope: 'actual-controller-run';
    status: 'success' | 'failed' | 'interrupted' | 'external_change' | 'decision_blocked';
    reason: string;
    localSucceeded: boolean;
    rootSucceeded: boolean;
    start: GameState;
    final: GameState;
    outcome: Outcome;
    phases: number;
    modelUse: 'offline' | 'provider';
    experienceUsed: boolean;
};
declare class SkillDomain implements Domain<GameState, GameAction, SkillPolicy> {
    readonly host: SkillSession;
    readonly spec: SkillSpec;
    readonly binding: Binding;
    readonly runId: string;
    readonly frame: Frame;
    readonly physical: TuanziDomain;
    private lastPhase;
    private rankings;
    constructor(host: SkillSession, spec: SkillSpec, binding: Binding, runId: string);
    observe(signal: AbortSignal): Promise<Snapshot<GameState>>;
    enumerate(ctx: Context<GameState, GameAction, SkillPolicy>): {
        id: string;
        description: string;
        capability: string;
        action: GameAction;
        intent: "hold" | "engage" | "reposition";
    }[];
    decisionPacket(ctx: Context<GameState, GameAction, SkillPolicy>, cs: readonly Candidate<GameAction>[]): DecisionPacket;
    selected(cs: readonly Candidate<GameAction>[]): string | null;
    gate(ctx: Context<GameState, GameAction, SkillPolicy>, c: Candidate<GameAction>): {
        kind: "deny";
        reason: string;
    } | {
        kind: "allow";
        reason?: never;
    };
    execute(req: ExecuteRequest<GameAction>, signal: AbortSignal): Promise<Receipt>;
    completion(s: Snapshot<GameState>): "running" | "succeeded" | "failed";
    feedback(b: Snapshot<GameState>, c: Candidate<GameAction>, r: Receipt, a: Snapshot<GameState>): Feedback;
    parsePolicy(raw: unknown): SkillPolicy;
    validatePolicy(p: SkillPolicy): string[];
}
type Active = {
    call: SkillCall;
    spec: SkillSpec;
    engine: GSEngine<GameState, GameAction, SkillPolicy>;
    domain: SkillDomain;
    runId: string;
    start: GameState;
    interventionCount: number;
    resources: ReturnType<RootBudget['snapshot']>['used'];
    key: string;
    decisionStart: number;
};
export type SkillSessionOptions = {
    catalogue?: ReactiveCatalogue;
    experience?: ExperienceTable;
    experienceMode?: ExperienceMode;
    decision?: {
        strategy: Strategy;
        backend: JudgmentBackend;
        timeoutMs?: number;
        maxRequests?: number;
        maxQuestions?: number;
    };
    orderSeed?: number;
    providers?: ReactiveProviders;
    initialSkills?: SkillSpec[];
    limits?: Partial<ConstructorParameters<typeof RootBudget>[0]>;
    afterChildStep?: (session: SkillSession) => void;
};
/** Parent and child are BOTH real GSEngine instances. The parent executes one child
 * quantum per scheduling action; deterministic resume does not reselect the active skill. */
export declare class SkillSession {
    private readonly onEvent?;
    readonly options: SkillSessionOptions;
    readonly world: GameWorld;
    readonly domain: TuanziDomain;
    readonly rootEngine: GSEngine<GameState, SkillCall, RootPolicy>;
    readonly budget: RootBudget;
    readonly lease: ExecutionLease;
    readonly catalogue: ReactiveCatalogue;
    readonly experience: ExperienceTable;
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
    readonly book: SkillBook;
    readonly planning: import("../planning/controller.js").PlanningStats;
    readonly recovery: RecoveryJournal;
    pendingHalt: {
        reason: string;
        evidence: Json;
    } | null;
    quantumProgress: {
        physicalActionApplied: boolean;
        localGoalProgress: boolean;
        localSucceeded: boolean;
        informationNovel: boolean;
    };
    readonly summaries: SkillSummary[];
    active: Active | null;
    lastResult: StepResult | undefined;
    readonly runId: string;
    private seq;
    private childSeq;
    private busy;
    private terminated;
    private denied;
    private rootRank;
    private rootFacts;
    private cancelled;
    readonly mode: 'reactive' | 'reactive-off' | 'reactive-record' | 'reactive-jev' | 'reactive-live';
    readonly decisions: DecisionAudit[];
    readonly judgmentRuns: ScheduleReport[];
    readonly providerReports: {
        attempt: number;
        level: string;
        usage: unknown;
        latencyMs: number;
        status: 'returned' | 'rejected-or-failed';
        error?: string;
    }[];
    private measured;
    constructor(initial: GameState, mode?: SkillSession['mode'], onEvent?: ((e: EngineEvent) => void) | undefined, options?: SkillSessionOptions);
    get engine(): {
        currentPolicy: Policy<GamePolicy>;
        counters: GSEngine<GameState, SkillCall, RootPolicy>['counters'];
    };
    emit(type: string, data: unknown): void;
    chargeSearch(n: number): void;
    accessBinding(s: GameState): Binding;
    private parentRoute;
    controllerKey(): string;
    denialKey(s: GameState, c: SkillCall): string;
    assertNovel(spec: SkillSpec, s: GameState, binding: Binding): void;
    diagnostics(): {
        schema: string;
        contextVersion: string;
        policyVersion: number;
        latestFailure: ExecutionFailure | null;
        failureCount: number;
        pendingHalt: {
            reason: string;
            evidence: Json;
        } | null;
        budgets: {
            used: {
                cycles: number;
                actions: number;
                providerCalls: number;
                searchNodes: number;
                skillCalls: number;
            };
            limits: {
                cycles: number;
                actions: number;
                providerCalls: number;
                searchNodes: number;
                skillCalls: number;
                durationMs: number;
            };
            elapsedMs: number;
            repairs: {
                used: number;
                limit: number;
            };
        };
        semanticScope: string;
    };
    offers(s: GameState, p: RootPolicy): RootCandidate[];
    orderSeed(s: GameState): number;
    parentPacket(s: GameState, p: RootPolicy, cs: readonly RootCandidate[], version: number): DecisionPacket;
    private decide;
    private decideTasks;
    runChildQuantum(call: SkillCall, signal: AbortSignal): Promise<Receipt>;
    private finishChild;
    step(): Promise<StepResult>;
    get finished(): boolean;
    cancel(): void;
    edit(tool: EditTool, p: Point): {
        ok: boolean;
        message: string;
    };
    export(): ReturnType<GameSession['export']> & {
        decisionAudit: {
            schema: 'gs/decision-audit/v1';
            records: DecisionAudit[];
            orderSeed: number;
            referenceValidation: 'authored-controller-only';
            judgmentRuns: ScheduleReport[];
        };
        hierarchy: {
            summaries: SkillSummary[];
            active: unknown;
            catalogue: ReturnType<ReactiveCatalogue['export']>;
            experience: ReturnType<ExperienceTable['export']>;
            budget: ReturnType<RootBudget['snapshot']>;
            providers: unknown[];
            recovery: ReturnType<SkillSession['diagnostics']>;
            failures: ExecutionFailure[];
        };
    };
}
export {};

/** v0.4: bounded dependency-aware judgment scheduling, not an unrestricted workflow VM. */
import type { Json, Usage } from './types.js';
export type Question = {
    type: 'choice';
    instructions: Json;
    criteria: Record<string, Json>;
} | {
    type: 'noul';
    instructions: Json;
    criteria?: Json;
} | {
    type: 'score';
    instructions: Json;
    criteria: Json[];
};
export type TypedAnswer = {
    type: 'choice';
    choice: string;
    probabilities: Record<string, number>;
    confidence: number;
} | {
    type: 'noul';
    noul: number;
} | {
    type: 'score';
    score: number;
    probabilities?: Record<string, number>;
    confidence?: number;
};
export type DecisionTask = {
    id: string;
    dependsOn: string[];
    question: Question;
    bindFrom?: {
        kind: 'choice-from-noul';
        threshold: number;
        none: string;
        optionTasks: Record<string, string>;
    };
};
export type DecisionGraph = {
    schema: 'gs/decision-graph/v1';
    id: string;
    snapshotKey: string;
    goalVersion: string;
    questionVersion: string;
    evidence: Json;
    tasks: DecisionTask[];
};
export type BatchInput = {
    state: Json;
    questions: Record<string, Question>;
};
export type TransportAttempts = {
    requests: number;
    externalRequests: number;
    questions: number;
};
export type BatchAnswer = {
    transportAttempts?: TransportAttempts;
    answers: Record<string, TypedAnswer>;
    usage?: Usage;
    model?: string;
};
export type JudgmentBackend = {
    id: string;
    kind: 'rule' | 'mock' | 'jev' | 'llm';
    ask(input: BatchInput, signal: AbortSignal): Promise<BatchAnswer>;
};
export type BatchAudit = {
    transportAttempts?: TransportAttempts;
    index: number;
    taskIds: string[];
    dependencies: string[];
    questionCount: number;
    inputKey: string;
    requestStartedMs: number;
    latencyMs: number;
    status: 'returned' | 'invalid' | 'failed' | 'timeout';
    backend: string;
    external: boolean;
    usage: Usage | null;
    error?: string;
};
export type ScheduleReport = {
    transportAttempts?: TransportAttempts;
    questionStrategy?: 'direct' | 'batch' | 'serial' | 'dependent';
    dispatchStrategy?: 'batch' | 'serial';
    schema: 'gs/judgment-run/v1';
    graphId: string;
    snapshotKey: string;
    goalVersion: string;
    questionVersion: string;
    strategy: 'batch' | 'serial';
    answers: Record<string, TypedAnswer>;
    batches: BatchAudit[];
    status: 'complete' | 'failed';
    reason: string | null;
    elapsedMs: number;
    questions: number;
    requestAttempts: number;
    externalRequests: number;
    dependencyWaves: number;
};
export type ScheduleOptions = {
    strategy?: 'batch' | 'serial';
    maxRequests: number;
    maxQuestions: number;
    timeoutMs: number;
    currentKey: () => string;
    signal: AbortSignal;
    charge?: (n: {
        externalRequests: number;
        questions: number;
    }) => void;
    onBatch?: (audit: BatchAudit) => void;
};
export declare class JudgmentError extends Error {
    readonly report: ScheduleReport;
    constructor(message: string, report: ScheduleReport);
}
export declare function validateQuestion(q: Question): void;
export declare function validateGraph(g: DecisionGraph): void;
export declare function validateAnswer(q: Question, a: unknown): TypedAnswer;
/** Only ready nodes with the SAME dependency context share a provider call. No hidden fan-out calls. */
export declare function runDecisionGraph(graph: DecisionGraph, backend: JudgmentBackend, options: ScheduleOptions): Promise<ScheduleReport>;

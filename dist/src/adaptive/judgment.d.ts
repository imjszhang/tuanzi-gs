import type { AdaptiveFrame, AdaptiveAnswer } from '../../vendor/gs-engine-ts/src/adaptive.js';
import type { JudgmentBackend, DecisionGraph, ScheduleReport } from '../../vendor/gs-engine-ts/src/judgment.js';
export type Strategy = 'direct' | 'batch' | 'serial' | 'dependent';
export declare function compileAdaptive(frame: AdaptiveFrame, strategy: Strategy): DecisionGraph;
export declare function judge(frame: AdaptiveFrame, strategy: Strategy, backend: JudgmentBackend, signal: AbortSignal, check: () => string, timeoutMs: number, onBatch: (b: unknown) => void): Promise<{
    answer: AdaptiveAnswer;
    report: ScheduleReport;
    graph: DecisionGraph;
}>;

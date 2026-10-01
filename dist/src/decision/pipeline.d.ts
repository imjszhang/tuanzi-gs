import type { Judgment } from '../../vendor/gs-engine-ts/src/types.js';
import type { DecisionPacket } from '../../vendor/gs-engine-ts/src/decision.js';
import type { DecisionGraph, JudgmentBackend, ScheduleReport, ScheduleOptions } from '../../vendor/gs-engine-ts/src/judgment.js';
export type Strategy = 'direct' | 'batch' | 'serial' | 'dependent';
export type Assessment = {
    fit: boolean;
    priority: number;
};
export type Assessor = (packet: DecisionPacket, candidateId: string) => Assessment;
export declare const questionVersionFor: (p: DecisionPacket, s: Strategy) => string;
export declare function compileDecision(p: DecisionPacket, strategy: Strategy): DecisionGraph;
export declare function defaultAssessment(p: DecisionPacket, id: string): Assessment;
/** Explicit rule baseline operating on the same packet, never on an oracle answer or private world. */
export declare function ruleBackend(assess?: Assessor, delayMs?: number): JudgmentBackend;
export declare function interpret(p: DecisionPacket, strategy: Strategy, r: ScheduleReport): Judgment;
export declare function evaluatePacket(p: DecisionPacket, strategy: Strategy, backend: JudgmentBackend, options: Omit<ScheduleOptions, 'strategy'>): Promise<{
    judgment: Judgment;
    report: ScheduleReport;
    graph: DecisionGraph;
}>;

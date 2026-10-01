import { GROUPS, KINDS, outputContract } from './schema.js';
export { GROUPS, KINDS, outputContract };
export type Group = typeof GROUPS[number];
export type Kind = typeof KINDS[number];
export type Predicate = {
    kind: 'at';
    x: number;
    y: number;
} | {
    kind: 'delta';
    field: 'bag' | 'delivered' | 'eaten' | 'baitUsed' | 'turn';
    atLeast: number;
} | {
    kind: 'value';
    field: 'bag' | 'delivered' | 'energy' | 'lureCount' | 'guardEating';
    op: 'gte' | 'lte' | 'eq';
    value: number;
};
export type Stage = {
    name: string;
    question: string;
    hypothesis: string;
    groups: Group[];
    ruleIds: string[];
    kinds: Kind[];
    target: {
        x: number;
        y: number;
    } | null;
    candidateIds: string[] | null;
    candidateScope?: {
        mode: 'stage';
    } | {
        mode: 'snapshot';
        revision: string;
    };
    until: Predicate[];
    maxActions: number;
};
export type Program = {
    schema: 'gs/decision-program/v1';
    title: string;
    stages: Stage[];
};
export type ProgramPatch = {
    kind: 'program';
    program: Program;
};
export type StagePatch = {
    kind: 'stage-update';
    expectedPolicyVersion: number;
    stageIndex: number;
    changes: Partial<Stage>;
};
export type MetaPatch = {
    kind: 'reframe';
    question: string;
    hypothesis: string;
    ruleIds: string[];
    includeBroaderObservation: boolean;
    candidateIds: string[] | null;
};
export type SubproblemPatch = {
    kind: 'subproblem';
    task: {
        question: string;
        hypothesis: string;
        expectedResult: string;
        groups: Group[];
        ruleIds: string[];
        maxRevisions: number;
        maxGenerations: number;
    };
};
export type AnalysisPatch = {
    kind: 'analysis';
    question: string;
    hypothesis: string;
    groups: Group[];
    ruleIds: string[];
    candidates: {
        id: string;
        description: string;
        claim: string;
    }[];
};
export type Patch = ProgramPatch | StagePatch | MetaPatch | SubproblemPatch | AnalysisPatch;
export declare function object(x: unknown, label: string): Record<string, unknown>;
export declare function predicate(raw: unknown): Predicate;
export declare function parseProgram(raw: unknown, ruleIds: readonly string[]): Program;
export declare function parsePatches(raw: unknown, kind: 'action' | 'analysis' | 'reframe', ruleIds: readonly string[]): Patch[];
/** Backwards-compatible documentation export. Runtime requests use frame-specific outputContract(). */
export declare const OUTPUT_SPEC: {
    schema: string;
    frameKind: "action" | "analysis" | "reframe";
    instructions: string;
    jsonSchema: import("./schema.js").Schema;
    semantics: {
        recursion: string;
        candidates: string;
        analysis: string;
        validation: string;
        stages: string;
        delta: string;
        value: string;
        stageUpdate: string;
        observations: string;
        uncertainty: string;
    };
};
/** Advisory checks based only on declared primitives, not natural-language or task solutions.
 * Warnings go to the S / audit and audit. They never rewrite/approve a strategy.
 */
export declare function programWarnings(p: Program): {
    path: string;
    code: string;
    message: string;
}[];

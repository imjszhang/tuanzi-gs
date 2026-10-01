/** Neutral, versioned decision packets. Hashes identify evidence, not cryptographic trust. */
import type { Json } from './types.js';
export declare const FACTS_VERSION = "gs/decision-facts/v1";
export declare const QUESTION_VERSION = "gs/select/v031";
export type DecisionSource = 'deterministic-resume' | 'deterministic-single' | 'authored-rule' | 'jev' | 'configured-model' | 'test-provider';
export type FactCandidate = {
    id: string;
    description: string;
    action: Json;
    facts: Json;
    evidence?: Json;
};
export type DecisionPacket = {
    schema: 'gs/decision-packet/v1';
    id: string;
    level: 'parent' | 'child';
    goal: string;
    snapshotRevision: string;
    policyVersion: number;
    factsVersion: string;
    questionVersion: string;
    scope: {
        name: string;
        note: string;
    };
    taskContext?: Json;
    projection: Json;
    preferences: Json;
    candidates: FactCandidate[];
    orderSeed: number;
};
export type DecisionAudit = {
    packet: DecisionPacket;
    source: DecisionSource;
    selectorIdentity: string;
    choice: string | null;
    status: 'selected' | 'abstained' | 'error';
    latencyMs: number;
    externalRequests: number;
    questions: number;
    judgment?: import('./types.js').Judgment;
    error?: string;
};
export declare function stableJson(value: unknown): string;
export declare function evidenceKey(value: unknown): string;
/** Canonical IDs first, then seeded Fisher-Yates: never use the heuristic rank as input order. */
export declare function neutralOrder<T extends {
    id: string;
}>(items: readonly T[], seed: number): T[];
export declare function validatePacket(p: DecisionPacket): void;

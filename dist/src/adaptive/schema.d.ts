/** v0.5.2: one structural definition drives runtime validation AND the G contract.
 * This module implements only the JSON-Schema keywords it emits. It is not a general
 * JSON-Schema engine, a planner, or a checker of task/strategy correctness.
 */
export declare const GROUPS: readonly ["self", "nearby", "map", "objects", "history"];
export declare const KINDS: readonly ["move", "pickup", "eat", "deposit", "drop", "wait"];
export declare const DELTA_FIELDS: readonly ["bag", "delivered", "eaten", "baitUsed", "turn"];
export declare const VALUE_FIELDS: readonly ["bag", "delivered", "energy", "lureCount", "guardEating"];
export declare const CONTRACT_VERSION = "gs/adaptation-output-contract/v3";
export type Schema = {
    type?: 'object' | 'array' | 'string' | 'integer' | 'boolean' | 'null';
    properties?: Record<string, Schema>;
    required?: string[];
    additionalProperties?: boolean;
    items?: Schema;
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    minProperties?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    minimum?: number;
    maximum?: number;
    const?: unknown;
    enum?: readonly unknown[];
    anyOf?: Schema[];
    description?: string;
};
export type ValidationIssue = {
    path: string;
    code: string;
    message: string;
    expected?: unknown;
    actual?: unknown;
};
export type ValidationDiagnostics = {
    schema: 'gs/output-validation/v1';
    valid: boolean;
    issues: ValidationIssue[];
    truncated: boolean;
    scope: 'structure-only-not-strategy';
    contractVersion: typeof CONTRACT_VERSION;
};
export declare const POINT_SCHEMA: Schema;
export declare const PREDICATE_SCHEMA: Schema;
export declare function stageProperties(ruleIds: readonly string[]): Record<string, Schema>;
export declare function stageSchema(ruleIds: readonly string[]): Schema;
export declare function programSchema(ruleIds: readonly string[]): Schema;
export declare function subproblemSchema(ruleIds: readonly string[]): Schema;
export declare function analysisSchema(ruleIds: readonly string[]): Schema;
export declare function patchesSchema(kind: 'action' | 'analysis' | 'reframe', ruleIds: readonly string[]): Schema;
export declare function validateSchema(value: unknown, schema: Schema, startPath?: string): ValidationDiagnostics;
export declare function outputContract(kind: 'action' | 'analysis' | 'reframe', ruleIds: readonly string[]): {
    schema: string;
    frameKind: "action" | "analysis" | "reframe";
    instructions: string;
    jsonSchema: Schema;
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

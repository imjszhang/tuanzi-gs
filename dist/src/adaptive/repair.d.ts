import type { ValidationDiagnostics, ValidationIssue } from './schema.js';
export declare function repairIntegrity(original: unknown, repaired: unknown, ruleIds: readonly string[]): {
    checked: boolean;
    reason: string;
    issues: ValidationIssue[];
};
export declare function integrityDiagnostics(issues: ValidationIssue[]): ValidationDiagnostics;

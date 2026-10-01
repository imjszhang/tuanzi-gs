import type { ExecutionEvidence } from './evidence.js';
/** LocalStorage evidence is diagnostic, never an authorization or performance certificate. */
export declare function parseExecutions(raw: unknown): ExecutionEvidence[];

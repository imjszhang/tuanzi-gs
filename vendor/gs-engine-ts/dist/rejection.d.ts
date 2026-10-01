import type { Json, Usage } from './types.js';
/** A rejected proposal is recoverable data, never an execution permission. */
export declare class ProposalRejected extends Error {
    readonly feedback: Json;
    readonly usage?: Usage | undefined;
    constructor(feedback: Json, usage?: Usage | undefined);
}
/** A diagnosed lack of new repair evidence is NOT a retryable schema error. */
export declare class RepairBlocked extends Error {
    readonly reason: string;
    readonly evidence: Json;
    readonly usage?: Usage | undefined;
    constructor(reason: string, evidence: Json, usage?: Usage | undefined);
}

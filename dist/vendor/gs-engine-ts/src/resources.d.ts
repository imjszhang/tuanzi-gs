/** Single-process root accounting. Child runs reference this object, never clone it. */
export type Resource = 'actions' | 'cycles' | 'providerCalls' | 'searchNodes' | 'skillCalls';
export type ResourceLimits = Record<Resource, number> & {
    durationMs: number;
};
export declare class RootBudget {
    readonly limits: ResourceLimits;
    private used;
    private started;
    constructor(limits: ResourceLimits);
    check(signal?: AbortSignal): void;
    reserve(resource: Resource, n?: number, signal?: AbortSignal): void;
    snapshot(): {
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
    };
}
/** At most one primitive executor owns the world. Calling a child delegates this lease. */
export declare class ExecutionLease {
    private owner;
    acquire(id: string, depth: number): void;
    assert(id: string): void;
    release(id: string): void;
    get activeOwner(): string | null;
}

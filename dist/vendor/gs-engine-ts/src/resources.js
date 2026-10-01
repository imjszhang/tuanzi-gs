export class RootBudget {
    limits;
    used = { actions: 0, cycles: 0, providerCalls: 0, searchNodes: 0, skillCalls: 0 };
    started = performance.now();
    constructor(limits) {
        this.limits = limits;
        for (const n of Object.values(limits))
            if (!Number.isSafeInteger(n) || n < 1)
                throw Error('invalid root resource limit');
    }
    check(signal) { signal?.throwIfAborted(); if (performance.now() - this.started >= this.limits.durationMs)
        throw Error('root_deadline_exceeded'); }
    reserve(resource, n = 1, signal) { this.check(signal); if (!Number.isSafeInteger(n) || n < 0)
        throw Error('invalid resource charge'); if (this.used[resource] + n > this.limits[resource])
        throw Error(`root_budget:${resource}`); this.used[resource] += n; }
    snapshot() { return { used: { ...this.used }, limits: { ...this.limits }, elapsedMs: performance.now() - this.started }; }
}
/** At most one primitive executor owns the world. Calling a child delegates this lease. */
export class ExecutionLease {
    owner = null;
    acquire(id, depth) { if (depth !== 1)
        throw Error('maximum_skill_depth:1'); if (this.owner !== null)
        throw Error('execution_lease_busy'); this.owner = id; }
    assert(id) { if (this.owner !== id)
        throw Error('execution_lease_not_owned'); }
    release(id) { this.assert(id); this.owner = null; }
    get activeOwner() { return this.owner; }
}

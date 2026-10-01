/** Single-process root accounting. Child runs reference this object, never clone it. */
export type Resource = 'actions'|'cycles'|'providerCalls'|'searchNodes'|'skillCalls';
export type ResourceLimits = Record<Resource,number> & {durationMs:number};
export class RootBudget {
  private used:Record<Resource,number>={actions:0,cycles:0,providerCalls:0,searchNodes:0,skillCalls:0};
  private started=performance.now();
  constructor(readonly limits:ResourceLimits){for(const n of Object.values(limits))if(!Number.isSafeInteger(n)||n<1)throw Error('invalid root resource limit');}
  check(signal?:AbortSignal){signal?.throwIfAborted();if(performance.now()-this.started>=this.limits.durationMs)throw Error('root_deadline_exceeded');}
  reserve(resource:Resource,n=1,signal?:AbortSignal){this.check(signal);if(!Number.isSafeInteger(n)||n<0)throw Error('invalid resource charge');if(this.used[resource]+n>this.limits[resource])throw Error(`root_budget:${resource}`);this.used[resource]+=n;}
  snapshot(){return {used:{...this.used},limits:{...this.limits},elapsedMs:performance.now()-this.started};}
}
/** At most one primitive executor owns the world. Calling a child delegates this lease. */
export class ExecutionLease {
  private owner:string|null=null;
  acquire(id:string,depth:number){if(depth!==1)throw Error('maximum_skill_depth:1');if(this.owner!==null)throw Error('execution_lease_busy');this.owner=id;}
  assert(id:string){if(this.owner!==id)throw Error('execution_lease_not_owned');}
  release(id:string){this.assert(id);this.owner=null;}
  get activeOwner(){return this.owner;}
}

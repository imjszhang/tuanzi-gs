import type { Json, Usage } from './types.js';
/** A rejected proposal is recoverable data, never an execution permission. */
export class ProposalRejected extends Error {
  constructor(readonly feedback: Json, readonly usage?: Usage) {
    super('proposal_validation_rejected'); this.name = 'ProposalRejected';
  }
}

/** A diagnosed lack of new repair evidence is NOT a retryable schema error. */
export class RepairBlocked extends Error {
  constructor(readonly reason: string, readonly evidence: Json, readonly usage?: Usage) {
    super(reason); this.name = 'RepairBlocked';
  }
}

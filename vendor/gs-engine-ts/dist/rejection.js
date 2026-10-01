/** A rejected proposal is recoverable data, never an execution permission. */
export class ProposalRejected extends Error {
    feedback;
    usage;
    constructor(feedback, usage) {
        super('proposal_validation_rejected');
        this.feedback = feedback;
        this.usage = usage;
        this.name = 'ProposalRejected';
    }
}
/** A diagnosed lack of new repair evidence is NOT a retryable schema error. */
export class RepairBlocked extends Error {
    reason;
    evidence;
    usage;
    constructor(reason, evidence, usage) {
        super(reason);
        this.reason = reason;
        this.evidence = evidence;
        this.usage = usage;
        this.name = 'RepairBlocked';
    }
}

import { exactWorldKey, actionKey, stateFingerprint } from './programs.js';
import { simulate } from './search.js';
export class TrialEvidence {
    policyVersion;
    runId;
    initial;
    program;
    actual = [];
    deviations = [];
    receipts = true;
    constructor(initial, program, policyVersion, runId) {
        this.policyVersion = policyVersion;
        this.runId = runId;
        this.initial = structuredClone(initial);
        this.program = structuredClone(program);
    }
    observe(t) {
        const i = this.actual.length, expected = this.program.steps[i];
        this.actual.push(actionKey(t.candidate.action));
        if (!expected || expected.expect !== stateFingerprint(t.before.state) || t.policyVersion !== this.policyVersion)
            this.deviations.push(`step:${i + 1}:basis_mismatch`);
        if (!expected || actionKey(expected.action) !== actionKey(t.candidate.action))
            this.deviations.push(`step:${i + 1}:action_mismatch`);
        if (t.receipt.status !== 'applied' || !t.feedback.actionSucceeded) {
            this.receipts = false;
            this.deviations.push(`step:${i + 1}:receipt_unconfirmed`);
        }
        if (expected && t.receipt.status === 'applied') {
            try {
                if (exactWorldKey(simulate(t.before.state, expected.action)) !== exactWorldKey(t.after.state))
                    this.deviations.push(`step:${i + 1}:result_mismatch`);
            }
            catch {
                this.deviations.push(`step:${i + 1}:simulation_failed`);
            }
        }
    }
    finish(final, goalSucceeded, externalChange, providerCalls, searchExpanded, interrupted = false) {
        const exactReplay = this.actual.length === this.program.steps.length && !this.deviations.length && this.receipts;
        const status = externalChange ? 'external_change' : interrupted ? 'interrupted' : this.deviations.length || !this.receipts ? 'deviated' : goalSucceeded ? (exactReplay ? 'success' : 'deviated') : 'failure';
        return { runId: this.runId, policyVersion: this.policyVersion, programId: this.program.id, initialKey: exactWorldKey(this.initial),
            exactReplay, goalSucceeded, receiptConfirmed: this.receipts, actualActions: [...this.actual], deviations: [...this.deviations], status,
            energyDelta: final.energy - this.initial.energy,
            outcome: { steps: final.turn - this.initial.turn, energy: final.energy, bag: final.bag, delivered: final.delivered, attacks: final.attacks - this.initial.attacks,
                providerCalls, searchExpanded, objectiveVersion: 'deliver-five-survive/v1' } };
    }
}
/** Explicit Pareto comparison; missing vectors are never treated as a free cost. */
export function dominates(a, b) {
    if (a.objectiveVersion !== b.objectiveVersion)
        return false;
    const pairs = [[b.steps, a.steps], [a.energy, b.energy], [a.bag, b.bag],
        [a.delivered, b.delivered], [b.attacks, a.attacks], [b.providerCalls, a.providerCalls], [b.searchExpanded, a.searchExpanded]];
    return pairs.every(([x, y]) => x >= y) && pairs.some(([x, y]) => x > y);
}

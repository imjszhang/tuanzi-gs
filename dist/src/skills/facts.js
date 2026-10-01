import { FACTS_VERSION, QUESTION_VERSION, evidenceKey, neutralOrder, validatePacket } from '../../vendor/gs-engine-ts/src/decision.js';
export function primitiveRule(f, w) {
    let progress = 0;
    if (f.kind === 'move' && f.targetBeforeSteps !== null && f.targetAfterSteps !== null)
        progress = (f.targetBeforeSteps - f.targetAfterSteps) * 5;
    if ((f.phase === 'gather' || f.phase === 'deliver') && f.kind === 'wait')
        progress = f.targetBeforeSteps === null ? 1 : -6;
    if (f.milestone)
        progress = 30;
    if (f.phase === 'wait-access')
        progress = f.kind === 'wait' ? 2 : 5;
    return w.progress * progress - w.cost + w.safety * f.guardDistanceAfter * .01 - f.priorVisits * 12;
}
export function experiencePreference(f, w) { const h = f.history; if (!h || h.n < 2)
    return 0; return w.experience * Math.min(1, h.n / 5) * ((h.successes / h.n - .5) * 8 - Math.min(20, h.meanSteps) * .05 - h.meanAttacks * 2); }
export function parentRule(f, w) {
    const enough = f.delivered + f.bag >= f.target, home = f.homeSteps ?? 999;
    let base = -1000;
    const reserve = !enough && f.remainingCount > 0 && f.guardCount > 0 && f.allRemainingGuarded;
    if (f.contract === 'energy-restored' && f.bag > 0 && f.energy <= Math.max(24, home + 3) && !(enough && f.energy > home + 3))
        base = 1000;
    if (f.contract === 'deposited' && f.amount === f.bag - (reserve ? 1 : 0) && (enough || f.bag >= f.capacity || (!f.reachableCount && f.bag > 1)))
        base = 900;
    if (f.contract === 'acquired-one' && !enough && f.bag < f.capacity)
        base = 500 - (f.targetSteps ?? 999) * w.cost;
    if (f.contract === 'access-open' && !enough && !f.reachableCount && f.guardCount > 0 && f.bag > 0)
        base = 400;
    return base + experiencePreference(f, w);
}
export function packet(input) {
    const p = { schema: 'gs/decision-packet/v1', id: '', factsVersion: FACTS_VERSION, questionVersion: QUESTION_VERSION, ...input, candidates: neutralOrder(input.candidates, input.orderSeed) };
    if (input.taskContext)
        p.questionVersion = 'gs/select/v042';
    p.id = evidenceKey({ ...p, id: undefined });
    validatePacket(p);
    return structuredClone(p);
}
/** Only the shared packet is available here. No world/simulator, private rank, or answer key. */
export function selectPacket(p) {
    const weights = p.preferences;
    const ranked = p.candidates.map(c => ({ id: c.id, score: p.level === 'parent' ? parentRule(c.facts, weights) : primitiveRule(c.facts, weights) })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return ranked[0] && (p.level === 'child' || ranked[0].score > 0) ? ranked[0].id : null;
}

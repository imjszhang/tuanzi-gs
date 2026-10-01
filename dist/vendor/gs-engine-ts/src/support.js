export function record(raw, label) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
        throw new Error(`${label}: expected object`);
    return raw;
}
export function text(raw, label) {
    if (typeof raw !== "string" || raw.length === 0)
        throw new Error(`${label}: expected nonempty string`);
    return raw;
}
export function finite(raw, label) {
    if (typeof raw !== "number" || !Number.isFinite(raw))
        throw new Error(`${label}: expected finite number`);
    return raw;
}
export function probability(raw, label) {
    const n = finite(raw, label);
    if (n < 0 || n > 1)
        throw new Error(`${label}: expected [0,1]`);
    return n;
}
export function immutable(input) {
    const clone = structuredClone(input);
    function freeze(v) {
        if (v && typeof v === "object" && !Object.isFrozen(v)) {
            for (const x of Object.values(v))
                freeze(x);
            Object.freeze(v);
        }
    }
    freeze(clone);
    return clone;
}
export function parseProposal(raw, parse) {
    const r = record(raw, "proposal");
    const keys = new Set(["baseVersion", "basedOnRevision", "body", "explanation"]);
    if (Object.keys(r).some(k => !keys.has(k)))
        throw new Error("proposal: unexpected field");
    const baseVersion = finite(r.baseVersion, "baseVersion");
    if (!Number.isSafeInteger(baseVersion) || baseVersion < 0)
        throw new Error("invalid baseVersion");
    const explanation = text(r.explanation, "explanation");
    if (explanation.length > 2000)
        throw new Error("explanation too long");
    return { baseVersion, basedOnRevision: text(r.basedOnRevision, "basedOnRevision"),
        body: parse(r.body), explanation };
}
export function validateJudgment(j, candidates) {
    const ids = new Set(candidates.map(c => c.id));
    if (j.choice !== null && !ids.has(j.choice))
        throw new Error("selector returned an unknown candidate");
    probability(j.confidence, "confidence");
    let total = probability(j.abstainProbability, "abstainProbability");
    for (const [id, value] of Object.entries(j.probabilities)) {
        if (!ids.has(id))
            throw new Error("probabilities contain unknown candidate");
        total += probability(value, "probability");
    }
    if (Math.abs(total - 1) > 0.01)
        throw new Error("probabilities do not sum to one");
    for (const c of candidates) {
        probability(j.probabilities[c.id], `probabilities.${c.id}`);
        probability(j.suitability[c.id], `suitability.${c.id}`);
    }
    for (const id of Object.keys(j.suitability))
        if (!ids.has(id))
            throw new Error("unknown suitability key");
}
/** Example policy only. Caller must calibrate suitabilityFloor on their own task.
 * Deliberately does NOT reject equivalent good actions just because Choice entropy is high. */
export function suitabilityArbiter(suitabilityFloor) {
    probability(suitabilityFloor, "suitabilityFloor");
    return {
        decide(_ctx, _candidates, j) {
            if (j.choice === null)
                return { kind: "repair", reason: "selector_abstained" };
            const fit = j.suitability[j.choice];
            if (fit === undefined || fit < suitabilityFloor)
                return { kind: "repair", reason: "no_acceptable_recommendation" };
            return { kind: "execute", candidateId: j.choice };
        }
    };
}
export class MemoryJournal {
    events = [];
    append(event) { this.events.push(immutable(event)); }
}

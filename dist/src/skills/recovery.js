/** Run-local recovery evidence. Canonical strings are equality keys; short hashes are labels only. */
import { stableJson, evidenceKey } from '../../vendor/gs-engine-ts/src/decision.js';
import { exactWorldKey } from '../planning/programs.js';
import { TASK_CONTEXT_VERSION } from './context.js';
export function canonicalSkill(s) {
    return stableJson({ schema: s.schema, parameters: s.parameters, initiation: s.initiation, success: s.success, maxSteps: s.maxSteps,
        capabilities: [...s.capabilities].sort(), features: [...s.features].sort(), weights: s.weights,
        phases: s.phases.map(p => ({ rule: p.rule, until: p.until, maxSteps: p.maxSteps })) });
}
/** Guards zero-action repeats with mere numeric changes; not a global equivalence claim. */
export function skillFamily(s) {
    return stableJson({ parameters: s.parameters, initiation: s.initiation, success: s.success,
        capabilities: [...s.capabilities].sort(), features: [...s.features].sort(), phases: s.phases.map(p => ({ rule: p.rule, until: p.until })) });
}
export function structureId(s) { return evidenceKey(canonicalSkill(s)); }
export function recoveryScope(s, b, controller) {
    return stableJson({ world: exactWorldKey(s), binding: { ...b, targetBerryIds: [...b.targetBerryIds].sort() }, controller, contextVersion: TASK_CONTEXT_VERSION });
}
export class RecoveryJournal {
    records = [];
    seen = new Set();
    record(input) {
        const novelty = stableJson({ scope: input.scope, structure: input.structure, kind: input.kind, phase: input.phase, reason: input.reason,
            context: input.decision?.packet.taskContext ?? null, candidates: input.decision?.packet.candidates ?? null });
        const row = { ...structuredClone(input), schema: 'gs/execution-failure/v1', id: evidenceKey(novelty), informationNovel: !this.seen.has(novelty) };
        this.seen.add(novelty);
        this.records.push(row);
        this.records = this.records.slice(-16);
        return structuredClone(row);
    }
    list() { return structuredClone(this.records); }
    latest() { return this.records.length ? structuredClone(this.records[this.records.length - 1]) : null; }
    repeated(spec, scope) {
        const structure = canonicalSkill(spec), family = skillFamily(spec);
        const found = [...this.records].reverse().find(r => r.scope === scope && ['execution_failed', 'structure_gap', 'decision_blocked'].includes(r.kind) &&
            (r.structure === structure || (r.outcome.steps === 0 && r.family === family)));
        return found ? structuredClone(found) : null;
    }
    /** Full most recent packet+answer and bounded prior summaries; never replace validation feedback. */
    feedback() {
        const last = this.latest();
        if (!last)
            return undefined;
        return { schema: 'gs/repair-evidence/v1', contextVersion: TASK_CONTEXT_VERSION, latest: last,
            previous: this.records.slice(-4, -1).map(r => ({ id: r.id, kind: r.kind, reason: r.reason, structureId: r.structureId, phase: r.phase, outcome: r.outcome })),
            instructions: 'Read measured execution feedback separately from proposal validation. None is a judgment block, not proof of physical impossibility. A new ID/title is not a new behavior. Root goal, authority and budgets remain fixed.' };
    }
}

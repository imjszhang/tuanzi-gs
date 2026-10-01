import { makeSkill, parseSkill, BASE_SKILLS } from './spec.js';
import { simulateSkill } from './behavior.js';
export class ReactiveCatalogue {
    storage;
    records = [];
    persistenceError = null;
    constructor(storage) {
        this.storage = storage;
        if (storage)
            try {
                const s = storage.getItem('tuanzi.gs.reactive.v3');
                if (s && s.length < 500000) {
                    const raw = JSON.parse(s);
                    for (const r of Array.isArray(raw.records) ? raw.records.slice(0, 40) : []) {
                        try {
                            const spec = parseSkill(r.spec);
                            if (![r.successes, r.failures, r.interruptions].every(n => Number.isSafeInteger(n) && n >= 0))
                                continue;
                            this.records.push({ spec, successes: r.successes, failures: r.failures, interruptions: r.interruptions, contexts: Array.isArray(r.contexts) ? r.contexts.filter((x) => typeof x === 'string').slice(-30) : [], source: spec.source, executions: Array.isArray(r.executions) ? r.executions.slice(-100) : [], status: r.successes > 0 ? 'measured' : 'trial' });
                        }
                        catch { }
                    }
                }
            }
            catch {
                this.persistenceError = '本地技能数据不可读；使用当前会话记录';
            }
    }
    list() { return structuredClone(this.records); }
    specs() { return [...BASE_SKILLS, ...this.records.filter(r => r.status === 'measured' || r.status === 'trial').map(r => r.spec)]; }
    trial(spec) { const old = this.records.find(r => r.spec.id === spec.id && r.spec.version === spec.version); if (old && JSON.stringify(old.spec) !== JSON.stringify(parseSkill(spec)))
        throw Error('skill_identity_collision'); if (!this.records.some(r => r.spec.id === spec.id && r.spec.version === spec.version))
        this.records.push({ spec: parseSkill(spec), successes: 0, failures: 0, interruptions: 0, contexts: [], source: spec.source, status: 'trial' }); this.save(); }
    result(spec, success, context, external = false, identity) { let r = this.records.find(r => r.spec.id === spec.id && r.spec.version === spec.version); if (!r)
        return; if (identity) {
        r.executions ??= [];
        r.executions.push({ identity: structuredClone(identity), success, external });
        r.executions = r.executions.slice(-100);
    } if (external) {
        r.interruptions++;
    }
    else if (success) {
        r.successes++;
        r.status = 'measured';
        if (!r.contexts.includes(context))
            r.contexts.push(context);
        r.contexts = r.contexts.slice(-30);
    }
    else {
        r.failures++;
    } this.save(); }
    clear() { this.records = []; this.save(); }
    export() { return { schema: 'gs/reactive-catalogue/v1', note: 'Reference simulation is authored-controller evidence only. Actual success is scoped by executions[].identity; aggregate successes are not transferable certification across models.', records: this.list() }; }
    save() { try {
        this.storage?.setItem('tuanzi.gs.reactive.v3', JSON.stringify(this.export()));
    }
    catch {
        this.persistenceError = '保存失败；本会话继续使用内存';
    } }
}
/** Finite grammar search composes registered rules. The primitive implementations and
 * grammar are authored. Successful composition is generated, not an authored whole plan. */
export async function synthesizeAccess(s, b, charge, signal, onAttempt = () => { }) {
    const atom = ['wait-access', 'place-resource'];
    const sequences = [...atom.map(x => [x]), ...atom.flatMap(a => atom.map(b => [a, b]))];
    for (const rules of sequences) {
        signal.throwIfAborted();
        charge(1);
        const spec = makeSkill('access-open', rules, 'grammar-search');
        const v = simulateSkill(spec, s, b, charge);
        onAttempt({ specId: spec.id, rules, success: v.success, steps: v.steps, reason: v.reason, checks: v.checks });
        if (v.success)
            return spec;
        await new Promise(r => setTimeout(r, 0));
    }
    throw Error('skill_grammar_budget_exhausted');
}

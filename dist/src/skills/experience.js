import { TASK_CONTEXT_VERSION } from './context.js';
import { reachableBerries, path, dangerous } from '../game/world.js';
const fields = ['steps', 'energyDelta', 'attacks', 'providerCalls', 'searchNodes'];
export function projectState(s, ids, stage) {
    const all = { resources: { energy: s.energy, bag: s.bag, delivered: s.delivered, target: s.target }, access: { reachable: reachableBerries(s).length, remaining: s.berries.length }, danger: { threatened: dangerous(s, s.player), guardEating: s.guards.some(g => g.eating > 0) }, distances: { home: path(s, s.player, s.home)?.length ?? null }, stage };
    return Object.fromEntries(ids.map(id => [id, all[id]]));
}
/** Relational bins + objective, encoder, skill AND utility versions. Not a causal Q value. */
export function experienceKey(s, spec, stage = 'entry') {
    return JSON.stringify(['gs/skill-feedback/v042', TASK_CONTEXT_VERSION, 'deliver-five/v1', 'relational/v1', 'utility/v1', spec.id, spec.version, JSON.stringify(spec.features), JSON.stringify(spec.weights), stage,
        s.energy < 25 ? 'low' : s.energy < 55 ? 'mid' : 'high', s.bag, Math.max(0, s.target - s.delivered),
        reachableBerries(s).length ? 'reachable' : 'blocked', s.guards.some(g => g.eating > 0) ? 'distracted' : 'awake', s.width, s.height]);
}
export class ExperienceTable {
    mode;
    storage;
    records = new Map();
    persistenceError = null;
    constructor(mode = 'use', storage) {
        this.mode = mode;
        this.storage = storage;
        if (!storage || mode === 'off')
            return;
        try {
            const raw = storage.getItem('tuanzi.gs.experience.v3');
            if (raw && raw.length < 1000000)
                this.load(JSON.parse(raw));
        }
        catch {
            this.persistenceError = '经验存储不可读；当前使用内存';
        }
    }
    load(raw) {
        if (!raw || typeof raw !== 'object' || raw.schema !== 'gs/experience/v1' || !Array.isArray(raw.records))
            throw Error('experience schema');
        for (const x of raw.records.slice(-500)) {
            if (typeof x.key !== 'string' || x.key.length > 4000 || !Number.isSafeInteger(x.n) || x.n < 1 || !Number.isSafeInteger(x.successes) || x.successes < 0 || x.successes > x.n)
                continue;
            if (!x.mean || !x.m2 || !fields.every(k => Number.isFinite(x.mean[k]) && Number.isFinite(x.m2[k]) && x.m2[k] >= 0))
                continue;
            const failures = Object.fromEntries(Object.entries(x.failures ?? {}).filter(([k, v]) => k.length < 300 && Number.isSafeInteger(v) && Number(v) >= 0));
            this.records.set(x.key, { key: x.key, n: x.n, successes: x.successes, mean: { ...x.mean }, m2: { ...x.m2 }, failures });
        }
    }
    save() { if (this.records.size > 500)
        this.records.delete(this.records.keys().next().value); try {
        this.storage?.setItem('tuanzi.gs.experience.v3', JSON.stringify(this.export()));
    }
    catch {
        this.persistenceError = '保存失败；经验只在本页有效';
    } }
    observe(key, o, failure = 'unknown') {
        if (this.mode === 'off')
            return;
        if (!fields.every(k => Number.isFinite(o[k])) || o.steps < 0 || o.attacks < 0 || o.providerCalls < 0 || o.searchNodes < 0)
            throw Error('invalid measured outcome');
        let r = this.records.get(key);
        if (!r) {
            const zero = { steps: 0, energyDelta: 0, attacks: 0, providerCalls: 0, searchNodes: 0 };
            r = { key, n: 0, successes: 0, mean: { ...zero }, m2: { ...zero }, failures: {} };
            this.records.set(key, r);
        }
        r.n++;
        if (o.success)
            r.successes++;
        else
            r.failures[failure] = (r.failures[failure] ?? 0) + 1;
        for (const k of fields) {
            const delta = o[k] - r.mean[k];
            r.mean[k] += delta / r.n;
            r.m2[k] += delta * (o[k] - r.mean[k]);
        }
        this.save();
    }
    preference(key, w) {
        if (this.mode !== 'use')
            return 0;
        const r = this.records.get(key);
        if (!r || r.n < 2)
            return 0;
        // Sparse histories are shrunk. Unseen actions have no fabricated positive/safe value.
        const shrink = Math.min(1, r.n / 5), successCentered = (r.successes / r.n) - 0.5;
        return w.experience * shrink * (successCentered * 8 - Math.min(20, r.mean.steps) * 0.05 - r.mean.attacks * 2);
    }
    list() { return structuredClone([...this.records.values()]); }
    clear() { this.records.clear(); this.save(); }
    export() { return { schema: 'gs/experience/v1', mode: this.mode, scope: 'Measured conditional averages; no causal or calibrated probability claim', records: this.list() }; }
}

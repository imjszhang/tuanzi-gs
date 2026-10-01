import { parseExecutions } from './evidence-storage.js';
import { dominates } from './evidence.js';
import { exactWorldKey, parseProgram, verifyProgram, RULESET } from './programs.js';
const STORAGE_KEY = 'tuanzi-gs.skills.v2';
/** Exact-condition program memory, NOT a general skill learner. Persisted data is untrusted;
 * a full deterministic check is repeated before every reuse. No record grants capabilities. */
export class SkillBook {
    storage;
    items = [];
    lookupChecks = 0;
    persistenceError = null;
    constructor(storage) {
        this.storage = storage;
        if (!storage)
            this.persistenceError = '当前环境不提供本地存储；技能仅在本次页面会话中保留，可导出保存。';
        if (storage) {
            try {
                const text = storage.getItem(STORAGE_KEY);
                if (text && text.length <= 2000000) {
                    const raw = JSON.parse(text);
                    if (raw?.format === 'gs-skill-book/v2' && Array.isArray(raw.items))
                        for (const x of raw.items.slice(0, 40)) {
                            try {
                                const p = parseProgram(x.program);
                                if (x.ruleset !== RULESET || typeof x.condition !== 'string' || x.condition.length > 25000 || typeof x.source !== 'string' || !['trial', 'verified', 'quarantined', 'retired'].includes(x.status) || ![x.successes, x.failures, x.uses, x.invalidations].every(n => Number.isSafeInteger(n) && n >= 0))
                                    continue;
                                this.items.push({ id: p.id, title: p.title, ruleset: RULESET, condition: x.condition, program: p, source: x.source.slice(0, 100), status: x.status, successes: x.successes, failures: x.failures, uses: x.uses, invalidations: x.invalidations, lastEvidence: String(x.lastEvidence ?? '').slice(0, 500), createdAt: String(x.createdAt ?? ''), updatedAt: String(x.updatedAt ?? ''), attempts: Number.isSafeInteger(x.attempts) ? Math.max(0, x.attempts) : 0, executions: parseExecutions(x.executions) });
                            }
                            catch { /* discard malformed records */ }
                        }
                }
            }
            catch {
                this.persistenceError = '本地技能记录不可用；当前使用内存存储。';
            }
        }
    }
    list() { return structuredClone(this.items); }
    export() { return { format: 'gs-skill-book/v2', scope: 'Exact initial physical state + ruleset + remaining budget only. No generalization claim.', items: this.list() }; }
    clear() {
        this.items = [];
        try {
            this.storage?.removeItem(STORAGE_KEY);
        }
        catch {
            this.persistenceError = '清除持久化失败；已清空本次会话记忆。';
        }
    }
    save() {
        try {
            this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.export()));
        }
        catch {
            this.persistenceError = '浏览器未允许持久化；技能只保留到当前页面关闭。';
        }
    }
    find(state) {
        this.lookupChecks = 0;
        const condition = exactWorldKey(state);
        const candidates = this.items.filter(x => x.status === 'verified' && x.successes > 0 && x.ruleset === RULESET && x.condition === condition).sort((a, b) => a.program.steps.length - b.program.steps.length);
        for (const x of candidates) {
            this.lookupChecks++;
            const p = { ...structuredClone(x.program), startTurn: state.turn };
            const check = verifyProgram(state, p);
            if (check.ok) {
                x.uses++;
                x.updatedAt = new Date().toISOString();
                this.save();
                return { ...structuredClone(x), program: p };
            }
            x.status = 'quarantined';
            x.lastEvidence = `复检失败：${check.reason}`;
            x.failures++;
            this.save();
        }
        return null;
    }
    trial(state, p, source) {
        const check = verifyProgram(state, p);
        if (!check.ok)
            throw new Error('Cannot trial unverified program');
        const condition = exactWorldKey(state);
        let x = this.items.find(x => x.id === p.id && x.condition === condition);
        if (!x) {
            const now = new Date().toISOString();
            x = { id: p.id, title: p.title, ruleset: RULESET, condition, program: structuredClone(p), source, status: 'trial', successes: 0, failures: 0, uses: 0, invalidations: 0, lastEvidence: '影子执行通过；尚未由真实游戏验收。', createdAt: now, updatedAt: now };
            this.items.push(x);
        }
        x.attempts = (x.attempts ?? 0) + 1;
        this.items = this.items.slice(-40);
        this.save();
    }
    complete(id, actualSucceeded, evidence, execution) {
        const x = this.items.find(x => x.id === id);
        if (!x)
            return false;
        x.updatedAt = new Date().toISOString();
        x.lastEvidence = evidence;
        if (execution) {
            x.executions = [...(x.executions ?? []), structuredClone(execution)].slice(-40);
            if (execution.status !== 'failure' && (!execution.exactReplay || execution.status === 'external_change' || execution.status === 'interrupted')) {
                x.invalidations++;
                this.save();
                return false;
            }
        }
        if (actualSucceeded) {
            x.successes++;
            x.status = 'verified';
            // Never equate fewer steps to better policy. Only compare measured, exact successful runs.
            if (execution)
                for (const other of this.items) {
                    const old = other.executions?.filter(e => e.status === 'success' && e.exactReplay);
                    if (other !== x && other.condition === x.condition && other.status === 'verified' && old?.length &&
                        old.every(e => dominates(execution.outcome, e.outcome)))
                        other.status = 'retired';
                }
        }
        else {
            x.failures++;
            x.status = 'quarantined';
        }
        this.save();
        return true;
    }
    invalidate(id, reason) {
        const x = this.items.find(x => x.id === id);
        if (x) {
            x.invalidations++;
            x.lastEvidence = reason;
            x.updatedAt = new Date().toISOString();
            this.save();
        }
    }
}

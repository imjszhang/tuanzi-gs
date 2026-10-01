import { parseBoundedProgram } from '../../vendor/gs-engine-ts/src/program.js';
import { legalPrimitives, simulate, physicalKey } from './search.js';
export const RULESET = 'tuanzi-physics-1';
// Diagnostic checksum, NOT an authorization token. Full primitive checks still run
// before shadow simulation AND again before real execution. The book also checks a full key.
export function digest(text) {
    let a = 2166136261, b = 2246822519;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        a = Math.imul(a ^ c, 16777619);
        b = Math.imul(b ^ c, 3266489917);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
export function exactWorldKey(s) {
    return JSON.stringify([RULESET, s.width, s.height, s.terrain, s.walls.map(p => [p.x, p.y]), s.home, s.capacity, s.target, s.maxEnergy, physicalKey(s), s.maxTurns - s.turn]);
}
export function stateFingerprint(s) { return `s-${digest(exactWorldKey(s))}`; }
export function actionKey(a) {
    switch (a.kind) {
        case 'move':
        case 'drop': return `${a.kind}:${a.x},${a.y}`;
        case 'pickup': return `pickup:${a.berryId}`;
        case 'deposit': return `deposit:${a.amount}`;
        default: return a.kind;
    }
}
export function parseAction(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('action: expected object');
    const r = raw;
    const keys = { move: ['kind', 'x', 'y', 'objective', 'targetId', 'distance'], drop: ['kind', 'x', 'y'], pickup: ['kind', 'berryId'], deposit: ['kind', 'amount'], eat: ['kind'], wait: ['kind'] };
    const allowed = keys[String(r.kind)];
    if (!allowed || Object.keys(r).some(k => !allowed.includes(k)))
        throw new Error('action: unauthorized primitive or field');
    if (r.kind === 'move' || r.kind === 'drop') {
        if (!Number.isSafeInteger(r.x) || !Number.isSafeInteger(r.y) || r.x < 0 || r.x > 16 || r.y < 0 || r.y > 10)
            throw new Error('action: coordinate out of bounds');
        if (r.kind === 'drop')
            return { kind: 'drop', x: r.x, y: r.y };
        // Descriptive labels carry no authority, and are canonically rewritten.
        return { kind: 'move', x: r.x, y: r.y, objective: 'safe', targetId: `cell:${r.x},${r.y}`, distance: 1 };
    }
    if (r.kind === 'pickup') {
        if (typeof r.berryId !== 'string' || !r.berryId || r.berryId.length > 100)
            throw new Error('action: invalid berry id');
        return { kind: 'pickup', berryId: r.berryId };
    }
    if (r.kind === 'deposit') {
        if (!Number.isSafeInteger(r.amount) || r.amount < 1 || r.amount > 3)
            throw new Error('action: invalid amount');
        return { kind: 'deposit', amount: r.amount };
    }
    return { kind: r.kind };
}
export function parseProgram(raw) { return parseBoundedProgram(raw, parseAction); }
/** Independent exact roll-out of a proposal. No search heuristic participates here. */
export function verifyProgram(initial, raw, requireGoal = true) {
    let s = structuredClone(initial);
    let program;
    try {
        program = parseProgram(raw);
    }
    catch (error) {
        return { ok: false, reason: String(error), steps: 0, final: s, actions: [] };
    }
    if (program.startTurn !== s.turn || program.steps.length > s.maxTurns - s.turn)
        return { ok: false, reason: 'program budget/start mismatch', steps: 0, final: s, actions: [] };
    const actions = [];
    for (const step of program.steps) {
        if (stateFingerprint(s) !== step.expect)
            return { ok: false, reason: 'shadow precondition mismatch', steps: actions.length, final: s, actions };
        const actual = legalPrimitives(s).find(a => actionKey(a) === actionKey(step.action));
        if (!actual)
            return { ok: false, reason: 'shadow illegal action', steps: actions.length, final: s, actions };
        s = simulate(s, actual);
        actions.push(actual);
        if (s.energy <= 0 || s.attacks > initial.attacks)
            return { ok: false, reason: 'shadow unsafe result', steps: actions.length, final: s, actions };
    }
    const ok = !requireGoal || (s.delivered >= s.target && s.energy > 0);
    return { ok, reason: ok ? 'verified_in_deterministic_simulator' : 'root_goal_not_reached', steps: actions.length, final: s, actions };
}
export function compileActions(initial, raw, title = '搜索得到的有限行动程序') {
    if (!Array.isArray(raw) || !raw.length || raw.length > Math.min(180, initial.maxTurns - initial.turn))
        throw new Error('program: finite non-empty action array required');
    let s = structuredClone(initial);
    const steps = [];
    for (const value of raw) {
        const a = parseAction(value);
        const legal = legalPrimitives(s).find(c => actionKey(c) === actionKey(a));
        if (!legal)
            throw new Error(`illegal action at step ${steps.length + 1}`);
        steps.push({ expect: stateFingerprint(s), action: legal });
        s = simulate(s, legal);
        if (s.energy <= 0 || s.attacks > initial.attacks)
            throw new Error('program simulation violates survival constraint');
    }
    const program = { schema: 'gs/program/v1', id: `p-${digest(JSON.stringify(steps))}`, title: title.slice(0, 180), startTurn: initial.turn, steps };
    const check = verifyProgram(initial, program);
    if (!check.ok)
        throw new Error(check.reason);
    return program;
}

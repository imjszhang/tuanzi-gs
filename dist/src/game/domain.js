import { inspectProgram } from '../../vendor/gs-engine-ts/src/program.js';
import { legalPrimitives, physicalKey } from '../planning/search.js';
import { actionKey, stateFingerprint, parseProgram, verifyProgram } from '../planning/programs.js';
import { CAPABILITIES, same, dist, clone } from './types.js';
import { walkable, dangerous, reachableBerries, path, lureSite, applyAction, DIRECTIONS } from './world.js';
export class TuanziDomain {
    world;
    receipts = new Map();
    policy;
    constructor(world) {
        this.world = world;
    }
    bindPolicy(policy) { this.policy = clone(policy); }
    async observe(signal) {
        signal.throwIfAborted();
        const state = this.world.snapshot();
        return { revision: String(state.revision), observedAt: Date.now(), state };
    }
    assess(ctx) {
        const s = ctx.snapshot.state, program = ctx.policy.body.program;
        if (program) {
            const current = inspectProgram(program, s.turn, stateFingerprint(s));
            if (current.kind === 'invalid')
                return { kind: 'repair', reason: current.reason, evidence: { programId: program.id, at: s.turn - program.startTurn } };
        }
        // A repeated physical situation is not progress merely because the chosen target changed.
        // Guard timers/lures/inventory/geometry are retained; only clocks and energy are ignored.
        let recent = ctx.recent.filter(t => t.policyVersion === ctx.policy.version).slice(-10);
        // An external edit breaks temporal continuity and resets this local diagnostic window.
        for (let i = recent.length - 1; i >= 0; i--) {
            const expected = i === recent.length - 1 ? ctx.snapshot.revision : recent[i + 1].before.revision;
            if (recent[i].after.revision !== expected) {
                recent = recent.slice(i + 1);
                break;
            }
        }
        const key = (w) => JSON.stringify([physicalKey(w, false), w.walls, w.terrain]);
        const current = key(s), states = recent.map(t => t.before.state), repeats = states.filter(w => key(w) === current).length + 1;
        if (recent.length >= 4 && repeats >= 3)
            return { kind: 'repair', reason: 'state_cycle_detected', evidence: { repeats, window: recent.length, energySpent: recent[0].before.state.energy - s.energy } };
        return null;
    }
    enumerate(ctx) {
        if (ctx.policy.body.mode === 'program')
            return legalPrimitives(ctx.snapshot.state).filter(a => ctx.policy.body.enabled.includes(a.kind)).map(action => ({
                id: actionKey(action), description: describeAction(action), capability: `game.${action.kind}`, action,
                intent: action.kind === 'wait' ? 'hold' : action.kind === 'move' ? 'reposition' : 'engage'
            }));
        const s = ctx.snapshot.state, p = ctx.policy.body;
        const cs = [];
        const add = (id, description, action, intent = 'engage') => {
            if (!p.enabled.includes(action.kind))
                return;
            cs.push({ id, description, capability: `game.${action.kind}`, action, intent });
        };
        if (s.bag > 0 && s.energy < s.maxEnergy - 16)
            add('eat', '吃一颗浆果，恢复能量', { kind: 'eat' });
        const reserveBait = s.delivered + s.bag < s.target && s.berries.length > 0 && s.berries.every(b => s.guards.some(g => dist(g.anchor, b) <= 2));
        const depositAmount = s.bag - (reserveBait ? 1 : 0);
        if (same(s.player, s.home) && depositAmount > 0)
            add('deposit', `向小窝交付 ${depositAmount} 颗浆果${reserveBait ? '，保留一颗诱饵' : ''}`, { kind: 'deposit', amount: depositAmount });
        if (s.bag < s.capacity) {
            const available = reachableBerries(s);
            for (const { berry, route } of available.slice(0, 5)) {
                if (!route.length)
                    add(`pickup:${berry.id}`, '拾取脚边的浆果', { kind: 'pickup', berryId: berry.id });
                else
                    add(`forage:${berry.id}`, `前往浆果 · 剩余 ${route.length} 步`, { kind: 'move', ...route[0], objective: 'berry', targetId: berry.id, distance: route.length }, 'reposition');
            }
        }
        if (s.bag > 0 && !same(s.player, s.home)) {
            const homePath = path(s, s.player, s.home);
            if (homePath?.length)
                add('go-home', `返回小窝 · 剩余 ${homePath.length} 步`, { kind: 'move', ...homePath[0], objective: 'home', targetId: 'home', distance: homePath.length }, 'disengage');
        }
        // A policy changes the available capability, not the game's physical rules.
        if (p.mode === 'lure' && p.enabled.includes('drop') && s.bag > 0 && s.delivered + s.bag < s.target && !reachableBerries(s).length) {
            const site = lureSite(s);
            if (site) {
                if (!site.route.length)
                    add('drop-lure', '放下浆果，把守卫引离果园', { kind: 'drop', ...site.drop }, 'special');
                else
                    add('approach-lure', `前往诱饵位置 · 剩余 ${site.route.length} 步`, { kind: 'move', ...site.route[0], objective: 'lure', targetId: 'lure-site', distance: site.route.length }, 'reposition');
            }
        }
        if (dangerous(s, s.player)) {
            for (const d of DIRECTIONS) {
                const next = { x: s.player.x + d.x, y: s.player.y + d.y };
                if (walkable(s, next) && !dangerous(s, next))
                    add(`retreat:${next.x},${next.y}`, '退到安全位置', { kind: 'move', ...next, objective: 'safe', targetId: 'safe', distance: 1 }, 'disengage');
            }
        }
        add('wait', '等待环境变化（消耗 1 点能量）', { kind: 'wait' }, 'hold');
        return cs;
    }
    gate(ctx, c) {
        const s = ctx.snapshot.state, a = c.action;
        const deny = (reason) => ({ kind: 'deny', reason });
        if (!ctx.policy.body.enabled.includes(a.kind) || c.capability !== `game.${a.kind}`)
            return deny('能力未启用');
        if (s.energy <= 0 || s.turn >= s.maxTurns)
            return deny('世界已经结束');
        switch (a.kind) {
            case 'move':
                if (dist(s.player, a) !== 1 || !walkable(s, a) || dangerous(s, a))
                    return deny('下一格不可安全到达');
                break;
            case 'pickup':
                if (s.bag >= s.capacity || !s.berries.some(b => b.id === a.berryId && same(b, s.player)) || dangerous(s, s.player))
                    return deny('无法拾取');
                break;
            case 'eat':
                if (s.bag < 1 || s.energy >= s.maxEnergy)
                    return deny('没有食物或无需进食');
                break;
            case 'deposit':
                if (!same(s.player, s.home) || !Number.isSafeInteger(a.amount) || a.amount < 1 || a.amount > s.bag)
                    return deny('交付条件不满足');
                break;
            case 'drop':
                if (s.bag < 1 || dist(s.player, a) !== 1 || !walkable(s, a) || dangerous(s, a) || same(s.home, a) || s.lures.some(l => same(l, a)))
                    return deny('不能在这里放下诱饵');
                break;
            case 'wait': break;
            default: return deny('未知动作');
        }
        return { kind: 'allow' };
    }
    async execute(req, signal) {
        signal.throwIfAborted();
        const previous = this.receipts.get(req.idempotencyKey);
        if (previous)
            return previous;
        const s = this.world.snapshot();
        if (String(s.revision) !== req.expectedRevision)
            return { status: 'stale', detail: '世界已被玩家或前一动作修改' };
        const policy = this.policy;
        if (!policy || policy.version !== req.policyVersion)
            return { status: 'stale', detail: '执行器策略版本不匹配' };
        const ctx = { goal: { id: 'game', description: 'collect', verifierId: 'fixed' }, snapshot: { state: s, revision: String(s.revision), observedAt: Date.now() }, policy, recent: [] };
        const gate = this.gate(ctx, req.candidate);
        if (gate.kind !== 'allow')
            return { status: 'failed', detail: gate.reason };
        const applied = this.world.transact(req.expectedRevision, w => applyAction(w, req.candidate.action));
        const receipt = applied ? { status: 'applied', detail: this.world.snapshot().lastFact } : { status: 'stale', detail: '提交时版本变化' };
        if (applied)
            this.receipts.set(req.idempotencyKey, receipt);
        return receipt;
    }
    completion(snapshot) {
        const s = snapshot.state;
        if (s.energy <= 0)
            return 'failed';
        if (s.delivered >= s.target)
            return 'succeeded';
        return s.turn >= s.maxTurns ? 'failed' : 'running';
    }
    feedback(before, candidate, receipt, after) {
        const a = candidate.action, b = before.state, s = after.state;
        // Movement counts as progress only when it reduces distance to its bound target.
        let moved = false;
        if (a.kind === 'move') {
            const target = a.objective === 'home' ? b.home : a.objective === 'berry' ? b.berries.find(x => x.id === a.targetId) : null;
            if (target) {
                const old = path(b, b.player, target), next = path(s, s.player, target);
                moved = old !== null && next !== null && next.length < old.length;
            }
            else
                moved = a.objective === 'lure' || (a.objective === 'safe' && !dangerous(s, s.player));
        }
        const progress = receipt.status === 'applied' && (moved || ['pickup', 'deposit', 'drop', 'eat'].includes(a.kind) ||
            (a.kind === 'wait' && (s.lures.length > 0 || s.guards.some(g => g.eating > 0))));
        return { actionSucceeded: receipt.status === 'applied', progress,
            metrics: { energyDelta: s.energy - b.energy, deliveredDelta: s.delivered - b.delivered, bagDelta: s.bag - b.bag, attacksDelta: s.attacks - b.attacks },
            facts: [s.lastFact] };
    }
    parsePolicy(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            throw new Error('策略必须是 JSON 对象');
        const r = raw;
        if (Object.keys(r).some(k => !['mode', 'subgoal', 'enabled', 'reserveEnergy', 'program'].includes(k)))
            throw new Error('策略含未授权字段');
        if (!['forage', 'lure', 'return', 'program'].includes(String(r.mode)))
            throw new Error('未知策略模式');
        if (typeof r.subgoal !== 'string' || !r.subgoal.trim() || r.subgoal.length > 240)
            throw new Error('子目标长度错误');
        if (!Array.isArray(r.enabled) || !r.enabled.length || r.enabled.some(x => typeof x !== 'string' || !CAPABILITIES.includes(x)) || new Set(r.enabled).size !== r.enabled.length)
            throw new Error('非法能力列表');
        if (typeof r.reserveEnergy !== 'number' || !Number.isSafeInteger(r.reserveEnergy) || r.reserveEnergy < 12 || r.reserveEnergy > 42)
            throw new Error('能量阈值越界');
        const body = { mode: r.mode, subgoal: r.subgoal, enabled: r.enabled, reserveEnergy: r.reserveEnergy };
        if (r.program !== undefined) {
            if (r.mode !== 'program')
                throw new Error('程序必须在 program 模式运行');
            body.program = parseProgram(r.program);
        }
        return body;
    }
    validateProposal(next, ctx) {
        if (!next.program)
            return [];
        const check = verifyProgram(ctx.snapshot.state, next.program);
        return check.ok ? [] : [check.reason];
    }
    validatePolicy(next, ctx) {
        const errors = [];
        for (const cap of ['move', 'eat', 'deposit', 'wait'])
            if (!next.enabled.includes(cap))
                errors.push(`必须保留 ${cap}`);
        if (next.mode === 'lure' && !next.enabled.includes('drop'))
            errors.push('诱饵策略必须启用 drop');
        if (next.program) {
            if (next.program.steps.some(step => !next.enabled.includes(step.action.kind)))
                errors.push('程序使用未启用能力');
        }
        return errors;
    }
}
export function describeAction(a) {
    switch (a.kind) {
        case 'move': return `移动到 (${a.x}, ${a.y})`;
        case 'drop': return `放下浆果 (${a.x}, ${a.y})`;
        case 'pickup': return `拾取 ${a.berryId}`;
        case 'eat': return '吃一颗浆果';
        case 'deposit': return `交付 ${a.amount} 颗浆果`;
        case 'wait': return '等待一个行动回合';
    }
}

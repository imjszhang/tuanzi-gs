import { dist, same } from '../game/types.js';
import { walkable, dangerous } from '../game/world.js';
export const PUBLIC_RULES = Object.freeze({
    'goal': 'Finish alive with delivered >= target. Only the external root verifier decides task completion; a subgoal is not root success.',
    'coordinates': 'Coordinates are integer grid cells. x increases east, y increases south. Movement is one orthogonal cell; rocks, water and placed walls are not walkable.',
    'energy': 'Each applied action advances one world turn and costs one energy. Eating is offered only below maxEnergy; it consumes one carried berry and restores 32 before that cost, capped at maxEnergy. Paused/thinking computation does not advance world turns.',
    'inventory': 'Pickup requires standing on the named berry and available bag capacity. Deposit requires standing at home and transfers the specified positive integer amount from bag to delivered.',
    'drop': 'Drop consumes one carried berry and creates a placed resource on a walkable, currently safe orthogonally adjacent cell, not the current cell or home and not an existing placed-resource cell. It has initial lifetime 36 turns. This is an action effect, not a recommended plan.',
    'guard': 'A guard that is not eating targets the nearest placed resource within Manhattan distance 9; otherwise it targets its anchor. It moves one path cell per applied action. Upon reaching the resource it removes it and sets eating=18. Eating counts down on subsequent actions.',
    'danger': 'Move/pickup may not target a cell within distance 2 of a non-eating guard, or the occupied cell of an eating guard. After a world action, an awake guard within distance 1 damages the player by 14. This is a game constraint, not an action ranking.',
    'wait': 'Wait advances physics and spends energy like any other world action. It is distinct from S abstention: none never changes the world.',
    'knowledge': 'G receives the allowed observed world and measured own history. S may receive a subset selected by G. Neither receives a solution, best action, reference rollout or optimized target. G reasoning is a hypothesis, not world truth.'
});
export function publicWorld(s) {
    return { width: s.width, height: s.height, revision: s.revision, turn: s.turn, maxTurns: s.maxTurns,
        terrain: [...s.terrain], walls: s.walls.map(({ x, y }) => ({ x, y })), berries: s.berries.map(({ id, x, y }) => ({ id, x, y })), guards: s.guards.map(({ id, x, y, anchor, eating }) => ({ id, x, y, anchor: { x: anchor.x, y: anchor.y }, eating })), lures: s.lures.map(({ id, x, y, ttl }) => ({ id, x, y, ttl })),
        home: { x: s.home.x, y: s.home.y }, player: { x: s.player.x, y: s.player.y }, energy: s.energy, maxEnergy: s.maxEnergy, bag: s.bag, capacity: s.capacity, delivered: s.delivered, target: s.target, attacks: s.attacks, baitUsed: s.baitUsed, eaten: s.eaten };
}
export function actionId(a) { switch (a.kind) {
    case 'move':
    case 'drop': return `${a.kind}:${a.x},${a.y}`;
    case 'pickup': return `pickup:${a.berryId}`;
    case 'deposit': return `deposit:${a.amount}`;
    default: return a.kind;
} }
export function actionWire(a) { switch (a.kind) {
    case 'move':
    case 'drop': return { kind: a.kind, x: a.x, y: a.y };
    case 'pickup': return { kind: a.kind, berryId: a.berryId };
    case 'deposit': return { kind: a.kind, amount: a.amount };
    default: return { kind: a.kind };
} }
export function legalActions(s) {
    if (s.energy <= 0 || s.turn >= s.maxTurns || s.delivered >= s.target)
        return [];
    const out = [];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const p = { x: s.player.x + dx, y: s.player.y + dy };
        if (walkable(s, p) && !dangerous(s, p))
            out.push({ kind: 'move', ...p, objective: 'safe', targetId: `cell:${p.x},${p.y}`, distance: 1 });
    }
    if (s.bag < s.capacity && !dangerous(s, s.player))
        for (const b of s.berries)
            if (same(s.player, b))
                out.push({ kind: 'pickup', berryId: b.id });
    if (s.bag > 0) {
        if (s.energy < s.maxEnergy)
            out.push({ kind: 'eat' });
        if (same(s.player, s.home))
            for (let n = 1; n <= s.bag; n++)
                out.push({ kind: 'deposit', amount: n });
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const p = { x: s.player.x + dx, y: s.player.y + dy };
            if (walkable(s, p) && !dangerous(s, p) && !same(p, s.home) && !s.lures.some(l => same(l, p)))
                out.push({ kind: 'drop', ...p });
        }
    }
    out.push({ kind: 'wait' });
    return out.sort((a, b) => actionId(a).localeCompare(actionId(b)));
}
export function describe(a) { const v = actionWire(a); return a.kind === 'move' ? `移动一格到 (${v.x},${v.y})` : a.kind === 'drop' ? `在 (${v.x},${v.y}) 放下一颗携带资源` : a.kind === 'pickup' ? `拾取当前位置的 ${v.berryId}` : a.kind === 'deposit' ? `交付 ${v.amount} 颗` : a.kind === 'eat' ? '食用一颗携带资源' : '等待一个物理回合'; }
export function observe(s, groups, history) {
    const p = publicWorld(s);
    const out = { worldRevision: s.revision, visibleGroups: [...groups], missingGroups: ['self', 'nearby', 'map', 'objects', 'history'].filter(g => !groups.includes(g)) };
    if (groups.includes('self'))
        out.self = { player: p.player, home: p.home, energy: p.energy, maxEnergy: p.maxEnergy, bag: p.bag, capacity: p.capacity, delivered: p.delivered, target: p.target, turn: p.turn };
    if (groups.includes('nearby'))
        out.nearby = { radius: 2, metric: 'Manhattan', berries: p.berries.filter(b => dist(b, s.player) <= 2), guards: p.guards.filter(g => dist(g, s.player) <= 2), lures: p.lures.filter(l => dist(l, s.player) <= 2), walls: p.walls.filter(w => dist(w, s.player) <= 2) };
    if (groups.includes('map'))
        out.map = { width: p.width, height: p.height, terrain: p.terrain, walls: p.walls };
    if (groups.includes('objects'))
        out.objects = { berries: p.berries, guards: p.guards, lures: p.lures };
    if (groups.includes('history'))
        out.ownHistory = structuredClone(history.slice(-12));
    return out;
}
export function testPredicate(p, current, start) { if (p.kind === 'at')
    return same(current.player, p); if (p.kind === 'delta')
    return current[p.field] - start[p.field] >= p.atLeast; const v = p.field === 'lureCount' ? current.lures.length : p.field === 'guardEating' ? Math.max(0, ...current.guards.map(g => g.eating)) : current[p.field]; return p.op === 'gte' ? v >= p.value : p.op === 'lte' ? v <= p.value : v === p.value; }
export function stageComplete(stage, s, start) { return stage.until.every(p => testPredicate(p, s, start)); }
export function measured(before, a, after) { return { source: 'actual-world-transition', action: actionWire(a), before: { revision: before.revision, turn: before.turn, player: before.player, energy: before.energy, bag: before.bag, delivered: before.delivered }, after: { revision: after.revision, turn: after.turn, player: after.player, energy: after.energy, bag: after.bag, delivered: after.delivered }, delta: { energy: after.energy - before.energy, bag: after.bag - before.bag, delivered: after.delivered - before.delivered, attacks: after.attacks - before.attacks, baitUsed: after.baitUsed - before.baitUsed, eaten: after.eaten - before.eaten }, worldChanges: { guardPositions: after.guards.map(g => ({ id: g.id, x: g.x, y: g.y, eating: g.eating })), lures: after.lures.map(l => ({ ...l })) } }; }
export function actionFacts(s, a, target) { const next = a.kind === 'move' ? { x: a.x, y: a.y } : s.player; return { provenance: 'public-current-state+primitive-definition; no future rollout', legalNow: true, actionCostEnergy: 1, bagEffect: a.kind === 'eat' || a.kind === 'drop' ? -1 : a.kind === 'pickup' ? 1 : a.kind === 'deposit' ? -a.amount : 0, target: target ? { point: target, metric: 'Manhattan geometric distance; NOT shortest path', before: dist(s.player, target), after: dist(next, target) } : null }; }

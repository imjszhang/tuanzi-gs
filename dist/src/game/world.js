import { clone, same, dist, key } from './types.js';
export const DIRECTIONS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
export function inside(s, p) {
    return Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < s.width && p.y < s.height;
}
export function walkable(s, p) {
    return inside(s, p) && s.terrain[p.y * s.width + p.x] === 'grass' && !s.walls.some(w => same(w, p));
}
export function dangerous(s, p) {
    return s.guards.some(g => dist(g, p) <= (g.eating > 0 ? 0 : 2));
}
/** Deterministic BFS, no model calls. The start may be threatened after an edit. */
export function path(s, start, goal, safe = true) {
    if (!walkable(s, goal) || (safe && dangerous(s, goal)))
        return null;
    if (same(start, goal))
        return [];
    const queue = [start];
    const prev = new Map([[key(start), null]]);
    for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        for (const d of DIRECTIONS) {
            const n = { x: p.x + d.x, y: p.y + d.y };
            if (!walkable(s, n) || prev.has(key(n)) || (safe && dangerous(s, n)))
                continue;
            prev.set(key(n), p);
            queue.push(n);
            if (same(n, goal)) {
                const result = [];
                let at = n;
                while (!same(at, start)) {
                    result.unshift(at);
                    at = prev.get(key(at));
                }
                return result;
            }
        }
    }
    return null;
}
export function reachableBerries(s) {
    return s.berries.map(berry => ({ berry, route: path(s, s.player, berry) }))
        .filter((x) => x.route !== null)
        .sort((a, b) => a.route.length - b.route.length || a.berry.id.localeCompare(b.berry.id));
}
/** A drop location is calculated from known physics, not a hidden skill. */
export function lureSite(s) {
    if (!s.guards.length || s.lures.length || s.guards.some(g => g.eating > 0))
        return null;
    const guard = s.guards.slice().sort((a, b) => dist(s.player, a) - dist(s.player, b))[0];
    let best;
    for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
            const drop = { x, y };
            const dg = dist(drop, guard);
            if (!walkable(s, drop) || dangerous(s, drop) || same(drop, s.home) || dg < 4 || dg > 7 || !path(s, guard, drop, false))
                continue;
            for (const d of DIRECTIONS) {
                const stand = { x: x + d.x, y: y + d.y };
                const route = path(s, s.player, stand);
                if (!route || same(stand, drop))
                    continue;
                const foodDistance = s.berries.length ? Math.min(...s.berries.map(b => dist(b, drop))) : 0;
                const score = foodDistance * 2 - route.length * 0.7 - dg * 0.15;
                if (!best || score > best.score)
                    best = { drop, stand, route, score };
            }
        }
    return best ? { drop: best.drop, stand: best.stand, route: best.route } : null;
}
export function createWorld(scenario = 'meadow') {
    if (scenario === 'remix') {
        const base = createWorld('guarded');
        const flip = (p) => ({ ...p, x: base.width - 1 - p.x });
        base.terrain = Array.from({ length: base.height }, (_, y) => base.terrain.slice(y * base.width, (y + 1) * base.width).reverse()).flat();
        base.home = flip(base.home);
        base.player = flip(base.player);
        base.walls = base.walls.map(flip);
        base.berries = base.berries.map(b => ({ ...b, ...flip(b) }));
        base.guards = base.guards.map(g => ({ ...g, ...flip(g), anchor: flip(g.anchor) }));
        base.scenario = 'remix';
        base.lastFact = '镜像布局：规则不变，坐标与道路改变。旧技能仅精确匹配，不能直接套用。';
        return base;
    }
    const width = 17, height = 11;
    const s = { width, height, revision: 1, turn: 0, maxTurns: 180, terrain: Array(width * height).fill('grass'),
        walls: [], berries: [], guards: [], lures: [], home: { x: 2, y: 8 }, player: { x: 3, y: 8 }, energy: 86, maxEnergy: 100,
        bag: 0, capacity: 3, delivered: 0, target: 5, scenario, attacks: 0, baitUsed: 0, eaten: 0,
        lastFact: '团子准备出发。暂停时，世界不会消耗能量。' };
    const water = [{ x: 7, y: 1 }, { x: 8, y: 1 }, { x: 7, y: 2 }, { x: 8, y: 2 }, { x: 9, y: 2 }, { x: 7, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 4 }];
    const rocks = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 15, y: 8 }, { x: 15, y: 9 }, { x: 14, y: 9 }, { x: 5, y: 4 }, { x: 5, y: 5 }, { x: 10, y: 8 }];
    for (const p of water)
        s.terrain[p.y * width + p.x] = 'water';
    for (const p of rocks)
        s.terrain[p.y * width + p.x] = 'rock';
    const grove = [{ x: 12, y: 3 }, { x: 13, y: 3 }, { x: 14, y: 3 }, { x: 12, y: 4 }, { x: 14, y: 4 }, { x: 12, y: 5 }, { x: 13, y: 5 }, { x: 14, y: 5 }];
    const safe = [{ x: 4, y: 7 }, { x: 4, y: 6 }, { x: 3, y: 4 }, { x: 2, y: 3 }, { x: 6, y: 7 }, { x: 7, y: 8 }, { x: 9, y: 6 }];
    const fruit = scenario === 'guarded' ? grove : [...safe, ...grove];
    s.berries = fruit.map((p, i) => ({ ...p, id: `berry-${i + 1}` }));
    s.guards = [{ id: 'guard-1', x: 13, y: 4, anchor: { x: 13, y: 4 }, eating: 0 }];
    if (scenario === 'guarded') {
        s.player = { x: 8, y: 7 };
        s.bag = 1;
        s.energy = 98;
        s.lastFact = '果园被守卫挡住，背包留有一颗浆果。可切换程序搜索或完整预置规则作对照。';
    }
    if (scenario === 'detour') {
        s.walls = [{ x: 4, y: 7 }, { x: 4, y: 8 }, { x: 4, y: 9 }, { x: 4, y: 6 }];
        s.berries = s.berries.filter(b => !s.walls.some(w => same(w, b)));
        s.lastFact = '原来的近路被挡住了。普通绕路由 BFS 处理，不需要策略修复。';
    }
    return s;
}
export class GameWorld {
    value;
    constructor(initial = createWorld()) { this.value = clone(initial); }
    snapshot() { return clone(this.value); }
    /** Only the domain executor calls transact. JS synchronous mutation is atomic here. */
    transact(expectedRevision, apply) {
        if (String(this.value.revision) !== expectedRevision)
            return false;
        apply(this.value);
        this.value.revision++;
        return true;
    }
    edit(tool, p) {
        const s = this.value;
        if (tool === 'inspect')
            return { ok: false, message: '选择一种干预工具，然后点击地图。' };
        if (!inside(s, p) || s.terrain[p.y * s.width + p.x] !== 'grass')
            return { ok: false, message: '湖水与天然岩石不可编辑。' };
        if (same(p, s.home) || same(p, s.player))
            return { ok: false, message: '小窝和团子所在格受到保护。' };
        const existingGuard = s.guards.find(g => same(g, p));
        if (tool === 'berry') {
            if (s.walls.some(w => same(w, p)) || existingGuard || s.berries.some(b => same(b, p)))
                return { ok: false, message: '这一格已经被占用。' };
            s.berries.push({ ...p, id: `edit-berry-${s.revision}` });
        }
        else if (tool === 'wall') {
            if (s.walls.some(w => same(w, p)) || existingGuard || s.berries.some(b => same(b, p)))
                return { ok: false, message: '请先用橡皮擦清空这一格。' };
            s.walls.push({ ...p });
        }
        else if (tool === 'guard') {
            if (s.walls.some(w => same(w, p)) || s.berries.some(b => same(b, p)) || dist(s.player, p) < 3)
                return { ok: false, message: '守卫需要一块离团子至少三格的空地。' };
            // Exactly one guard in v0.1; moving it clears distraction state.
            s.guards = [{ id: 'guard-1', ...p, anchor: { ...p }, eating: 0 }];
            s.lures = [];
        }
        else {
            const count = s.walls.length + s.berries.length + s.guards.length + s.lures.length;
            s.walls = s.walls.filter(x => !same(x, p));
            s.berries = s.berries.filter(x => !same(x, p));
            s.guards = s.guards.filter(x => !same(x, p));
            s.lures = s.lures.filter(x => !same(x, p));
            if (count === s.walls.length + s.berries.length + s.guards.length + s.lures.length)
                return { ok: false, message: '这里已经是空地。' };
        }
        s.revision++;
        s.lastFact = `玩家干预：${{ berry: '放置浆果', wall: '放置障碍', guard: '移动守卫', erase: '清空格子' }[tool]} (${p.x}, ${p.y})。`;
        return { ok: true, message: s.lastFact };
    }
}
/** One action = one world tick. Animation is deliberately not part of the simulation. */
export function applyAction(s, a) {
    const facts = [];
    switch (a.kind) {
        case 'move':
            s.player = { x: a.x, y: a.y };
            facts.push(`移动到 (${a.x}, ${a.y})`);
            break;
        case 'pickup':
            s.berries = s.berries.filter(b => b.id !== a.berryId);
            s.bag++;
            facts.push('拾取一颗浆果');
            break;
        case 'eat':
            s.bag--;
            s.energy = Math.min(s.maxEnergy, s.energy + 32);
            s.eaten++;
            facts.push('吃掉一颗浆果，恢复 32 点能量');
            break;
        case 'deposit':
            s.bag -= a.amount;
            s.delivered += a.amount;
            facts.push(`向小窝交付 ${a.amount} 颗浆果`);
            break;
        case 'drop':
            s.bag--;
            s.baitUsed++;
            s.lures.push({ x: a.x, y: a.y, id: `lure-${s.turn}`, ttl: 36 });
            facts.push('放下一颗浆果作为诱饵');
            break;
        case 'wait':
            facts.push('等待一个回合');
            break;
    }
    s.turn++;
    s.energy = Math.max(0, s.energy - 1);
    for (const guard of s.guards) {
        if (guard.eating > 0) {
            guard.eating--;
            continue;
        }
        const lure = s.lures.filter(l => dist(guard, l) <= 9).sort((a, b) => dist(guard, a) - dist(guard, b))[0];
        const target = lure ?? guard.anchor;
        const route = path(s, guard, target, false);
        if (route?.length) {
            guard.x = route[0].x;
            guard.y = route[0].y;
        }
        if (lure && same(guard, lure)) {
            guard.eating = 18;
            s.lures = s.lures.filter(l => l.id !== lure.id);
            facts.push('守卫被诱饵引开，开始进食');
        }
        if (guard.eating === 0 && dist(guard, s.player) <= 1) {
            s.energy = Math.max(0, s.energy - 14);
            s.attacks++;
            facts.push('守卫靠近，损失 14 点能量');
        }
    }
    s.lures = s.lures.map(l => ({ ...l, ttl: l.ttl - 1 })).filter(l => l.ttl > 0);
    s.lastFact = facts.join('；') + '。';
}

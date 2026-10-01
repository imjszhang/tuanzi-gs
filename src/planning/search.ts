/** Bounded deterministic beam search over primitives. No lureSite(), strategy modes,
 * skill templates, or provider calls. Heuristics are authored, not learned. */
import type { GameAction, GameState } from '../game/types.js';
import { dist, same } from '../game/types.js';
import { applyAction, dangerous, walkable, DIRECTIONS } from '../game/world.js';
export function legalPrimitives(s: GameState): GameAction[] {
    if (s.energy <= 0 || s.turn >= s.maxTurns || s.delivered >= s.target)
        return [];
    const out: GameAction[] = [];
    for (const d of DIRECTIONS) {
        const p = { x: s.player.x + d.x, y: s.player.y + d.y };
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
        for (const d of DIRECTIONS) {
            const p = { x: s.player.x + d.x, y: s.player.y + d.y };
            if (walkable(s, p) && !dangerous(s, p) && !same(p, s.home) && !s.lures.some(l => same(l, p)))
                out.push({ kind: 'drop', ...p });
        }
    }
    out.push({ kind: 'wait' });
    return out;
}
/** Fast immutable fork for shadow simulation. Terrain, walls, and berries are read-only;
 * applyAction replaces berries/lures arrays and only mutates cloned guards. */
export function simulate(s: GameState, a: GameAction): GameState {
    const next = { ...s, player: { ...s.player }, guards: s.guards.map(g => ({ ...g, anchor: { ...g.anchor } })), lures: s.lures.map(l => ({ ...l })) };
    applyAction(next, a);
    return next;
}
export function physicalKey(s: GameState, includeEnergy = true): string {
    return JSON.stringify([s.player.x, s.player.y, s.bag, s.delivered, includeEnergy ? s.energy : 0,
        s.berries.map(b => [b.id, b.x, b.y]), s.guards.map(g => [g.x, g.y, g.anchor.x, g.anchor.y, g.eating]), s.lures.map(l => [l.x, l.y, l.ttl])]);
}
export type SearchReport = {
    expanded: number;
    generated: number;
    depth: number;
    beamWidth: number;
    elapsedMs: number;
    status: 'solved' | 'budget' | 'exhausted';
    solutions: number;
    heuristic: 'task' | 'explore';
    maxExpanded: number;
};
export type SearchResult = {
    actions: GameAction[];
    report: SearchReport;
    final: GameState | null;
};
type Node = {
    s: GameState;
    parent: Node | null;
    a: GameAction | null;
    score: number;
    depth: number;
};
export async function searchProgram(initial: GameState, signal: AbortSignal, options: {
    width?: number;
    maxExpanded?: number;
    maxDepth?: number;
    heuristic?: 'task' | 'explore';
    reverse?: boolean;
    onProgress?: (report: SearchReport) => void;
} = {}): Promise<SearchResult> {
    const start = performance.now(), width = options.width ?? 80, maxExpanded = options.maxExpanded ?? 16000, maxDepth = Math.min(options.maxDepth ?? 150, initial.maxTurns - initial.turn);
    let expanded = 0, generated = 0, depth = 0;
    const solutions: Node[] = [];
    // Exact static shortest distances, computed once. Guard motion still uses actual physics.
    const n = initial.width * initial.height, adj = Array.from({ length: n }, (_, i) => DIRECTIONS.map(d => ({ x: i % initial.width + d.x, y: Math.floor(i / initial.width) + d.y })).filter(p => walkable(initial, p)).map(p => p.y * initial.width + p.x));
    const cache = new Map<number, Int16Array>();
    const distances = (from: number) => { let ds = cache.get(from); if (ds)
        return ds; ds = new Int16Array(n).fill(999); ds[from] = 0; const q = [from]; for (let at = 0; at < q.length; at++) {
        const p = q[at]!;
        for (const j of adj[p]!) {
            if (ds[j] === 999) {
                ds[j] = ds[p]! + 1;
                q.push(j);
            }
        }
    } cache.set(from, ds); return ds; };
    const homeIndex = initial.home.y * initial.width + initial.home.x;
    const score = (s: GameState) => {
        const at = s.player.y * s.width + s.player.x, ds = distances(at);
        const enough = s.delivered + s.bag >= s.target;
        const needHome = enough || s.bag >= s.capacity;
        let near = 999, safe = 0;
        for (const b of s.berries) {
            const d = ds[b.y * s.width + b.x]!;
            if (!dangerous(s, b)) {
                near = Math.min(near, d);
                safe++;
            }
        }
        const collected = initial.berries.length - s.berries.length;
        let v = options.heuristic === 'explore' ? s.delivered * 260 + collected * 180 + s.bag * 18 - s.attacks * 1000 + s.energy * 0.3 : s.delivered * 600 + collected * 12 + s.bag * 160 - s.attacks * 1000 + s.energy * 0.3;
        if (needHome)
            v -= ds[homeIndex]! * 8;
        else if (near < 999)
            v += 50 - Math.min(near, 40) * 8;
        else {
            const unguardedDistance = s.berries.length ? Math.min(...s.berries.map(b => ds[b.y * s.width + b.x]!)) : 999;
            v -= Math.min(unguardedDistance, 40) * 3;
        }
        if (safe > 0 && !enough)
            v += Math.min(safe, 4) * 12;
        if (s.delivered >= s.target)
            v += 10000;
        return v;
    };
    let beam: Node[] = [{ s: initial, parent: null, a: null, score: score(initial), depth: 0 }];
    const seen = new Map<string, number>();
    seen.set(physicalKey(initial, false), initial.energy);
    const report = (status: SearchReport['status']): SearchReport => ({ expanded, generated, depth, beamWidth: width, elapsedMs: performance.now() - start, status, solutions: solutions.length, heuristic: options.heuristic ?? 'task', maxExpanded });
    while (beam.length && depth < maxDepth && expanded < maxExpanded) {
        signal.throwIfAborted();
        depth++;
        const next: Node[] = [];
        for (const node of beam) {
            if (expanded >= maxExpanded)
                break;
            expanded++;
            const offered = legalPrimitives(node.s);
            if (options.reverse)
                offered.reverse();
            for (const a of offered) {
                const s = simulate(node.s, a);
                generated++;
                if (s.energy <= 0 || s.attacks > initial.attacks || s.delivered + s.bag + s.berries.length < s.target)
                    continue;
                const key = physicalKey(s, false);
                const best = seen.get(key);
                if (best !== undefined && best >= s.energy)
                    continue;
                seen.set(key, s.energy);
                const nn: Node = { s, parent: node, a, score: score(s), depth };
                if (s.delivered >= s.target) {
                    solutions.push(nn);
                    continue;
                }
                if (s.turn < s.maxTurns)
                    next.push(nn);
            }
        }
        if (solutions.length)
            break;
        next.sort((a, b) => b.score - a.score);
        beam = next.slice(0, width);
        if (depth % 4 === 0) {
            options.onProgress?.(report('budget'));
            await new Promise<void>(r => setTimeout(r, 0));
        }
    }
    signal.throwIfAborted();
    solutions.sort((a, b) => b.s.energy - a.s.energy || a.depth - b.depth);
    const best = solutions[0];
    const actions: GameAction[] = [];
    let node = best;
    while (node?.parent && node.a) {
        actions.unshift(node.a);
        node = node.parent;
    }
    return { actions, final: best?.s ?? null, report: report(best ? 'solved' : expanded >= maxExpanded || depth >= maxDepth ? 'budget' : 'exhausted') };
}

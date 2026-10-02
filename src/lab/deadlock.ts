/** Observer-only sufficient conditions for task impossibility.
 * This module is an external experiment referee, not part of G/S observation,
 * candidate generation, action admission, memory or feedback. It neither finds
 * a solution nor treats the absence of a proof as evidence of solvability.
 */
import type {GameState, Point} from '../game/types.js';
import {key, same} from '../game/types.js';
import {walkable, dangerous} from '../game/world.js';

export const DEADLOCK_POLICY = 'sound-static/v1';
export type DeadlockAssessment = {
  schema: 'gs/deadlock-referee/v1';
  policy: typeof DEADLOCK_POLICY;
  worldRevision: string;
  verdict: 'proven-deadlock' | 'not-proven';
  reason: string;
  proof?: {rule: string; facts: Record<string, unknown>};
  observerOnly: true;
};

/** A static component, never a route or a search through action trajectories.
 * Include the initial cell even if it is threatened: movement can escape a
 * threatened starting cell, while subsequent destination cells must be safe.
 */
function component(s: GameState, safe: boolean): Set<string> {
  const queue: Point[] = [{...s.player}];
  const seen = new Set<string>([key(s.player)]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]!;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const next = {x: p.x + dx, y: p.y + dy};
      const id = key(next);
      if (seen.has(id) || !walkable(s, next) || (safe && dangerous(s, next))) continue;
      seen.add(id);
      queue.push(next);
    }
  }
  return seen;
}

export function assessDeadlock(s: GameState, options: {pendingInterventions?: boolean} = {}): DeadlockAssessment {
  const base = {
    schema: 'gs/deadlock-referee/v1',
    policy: DEADLOCK_POLICY,
    worldRevision: String(s.revision),
    observerOnly: true
  } as const;
  const unknown = (reason: string): DeadlockAssessment => ({...base, verdict: 'not-proven', reason});
  const proven = (rule: string, facts: Record<string, unknown>): DeadlockAssessment =>
    ({...base, verdict: 'proven-deadlock', reason: rule, proof: {rule, facts}});

  // Ordinary completion and exhaustion remain the authoritative terminal result.
  if (s.delivered >= s.target || s.energy <= 0 || s.turn >= s.maxTurns) return unknown('already_terminal');
  // These proofs assume that only game primitives can change the future world.
  if (options.pendingInterventions) return unknown('pending_interventions');

  // Deposits only transfer existing inventory. Eating/drop consume resources;
  // placed lures cannot be picked up, and physics never creates new berries.
  const deliverableUpperBound = s.delivered + s.bag + s.berries.length;
  if (deliverableUpperBound < s.target) return proven('insufficient_total_resources', {
    delivered: s.delivered, bag: s.bag, remainingBerries: s.berries.length,
    target: s.target, deliverableUpperBound, luresRecoverable: false
  });

  // Ignore every guard and all costs. Even in this relaxation, immutable
  // terrain/walls can make the only deposit location unreachable.
  const terrainComponent = component(s, false);
  if (!terrainComponent.has(key(s.home))) return proven('home_disconnected', {
    player: {...s.player}, home: {...s.home}, reachableCellsIgnoringGuards: terrainComponent.size,
    delivered: s.delivered, target: s.target, guardsAndCostsIgnored: true
  });

  // With no carried berry and no lure, awake anchored guards never move.
  // If no berry can be picked up in the resulting safe component, neither
  // pickup nor drop/eat/deposit can ever become available. Only move/wait
  // remain, preserving that invariant until ordinary energy/turn exhaustion.
  if (s.bag === 0 && s.lures.length === 0 && s.guards.every(g => g.eating <= 0 && same(g, g.anchor))) {
    const safeComponent = component(s, true);
    const accessibleBerries = s.berries.filter(b => safeComponent.has(key(b)) && !dangerous(s, b)).length;
    if (accessibleBerries === 0) return proven('stationary_resource_lock', {
      bag: 0, lureCount: 0, guardCount: s.guards.length, allGuardsAwakeAtAnchors: true,
      reachableCellsWithSafeDestinations: safeComponent.size, accessibleBerries,
      remainingBerries: s.berries.length, delivered: s.delivered, target: s.target
    });
  }
  return unknown('no_static_proof');
}

/** Observer-only sufficient conditions for task impossibility.
 * This module is an external experiment referee, not part of G/S observation,
 * candidate generation, action admission, memory or feedback. It neither finds
 * a solution nor treats the absence of a proof as evidence of solvability.
 */
import type { GameState } from '../game/types.js';
export declare const DEADLOCK_POLICY = "sound-static/v1";
export type DeadlockAssessment = {
    schema: 'gs/deadlock-referee/v1';
    policy: typeof DEADLOCK_POLICY;
    worldRevision: string;
    verdict: 'proven-deadlock' | 'not-proven';
    reason: string;
    proof?: {
        rule: string;
        facts: Record<string, unknown>;
    };
    observerOnly: true;
};
export declare function assessDeadlock(s: GameState, options?: {
    pendingInterventions?: boolean;
}): DeadlockAssessment;

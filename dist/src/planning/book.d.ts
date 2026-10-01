import type { ExecutionEvidence } from './evidence.js';
import type { GameState } from '../game/types.js';
import type { GameProgram } from './programs.js';
export type SkillStatus = 'trial' | 'verified' | 'quarantined' | 'retired';
export type Skill = {
    id: string;
    title: string;
    ruleset: string;
    condition: string;
    program: GameProgram;
    source: string;
    status: SkillStatus;
    successes: number;
    failures: number;
    uses: number;
    invalidations: number;
    lastEvidence: string;
    createdAt: string;
    updatedAt: string;
    attempts?: number;
    executions?: ExecutionEvidence[];
};
export interface BookStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
/** Exact-condition program memory, NOT a general skill learner. Persisted data is untrusted;
 * a full deterministic check is repeated before every reuse. No record grants capabilities. */
export declare class SkillBook {
    private readonly storage?;
    private items;
    lookupChecks: number;
    persistenceError: string | null;
    constructor(storage?: BookStorage | undefined);
    list(): Skill[];
    export(): {
        format: string;
        scope: string;
        items: Skill[];
    };
    clear(): void;
    private save;
    find(state: GameState): Skill | null;
    trial(state: GameState, p: GameProgram, source: string): void;
    complete(id: string, actualSucceeded: boolean, evidence: string, execution?: ExecutionEvidence): boolean;
    invalidate(id: string, reason: string): void;
}

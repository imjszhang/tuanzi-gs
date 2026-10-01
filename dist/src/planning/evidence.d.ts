import type { Transition } from '../../vendor/gs-engine-ts/src/types.js';
import type { GameAction, GameState } from '../game/types.js';
import type { GameProgram } from './programs.js';
export type OutcomeVector = {
    steps: number;
    energy: number;
    bag: number;
    delivered: number;
    attacks: number;
    providerCalls: number;
    searchExpanded: number;
    objectiveVersion: string;
};
export type ExecutionEvidence = {
    runId: string;
    policyVersion: number;
    programId: string;
    initialKey: string;
    exactReplay: boolean;
    goalSucceeded: boolean;
    receiptConfirmed: boolean;
    actualActions: string[];
    deviations: string[];
    outcome: OutcomeVector;
    energyDelta: number;
    status: 'success' | 'failure' | 'interrupted' | 'external_change' | 'deviated';
};
export declare class TrialEvidence {
    readonly policyVersion: number;
    readonly runId: string;
    readonly initial: GameState;
    readonly program: GameProgram;
    private actual;
    private deviations;
    private receipts;
    constructor(initial: GameState, program: GameProgram, policyVersion: number, runId: string);
    observe(t: Transition<GameState, GameAction>): void;
    finish(final: GameState, goalSucceeded: boolean, externalChange: boolean, providerCalls: number, searchExpanded: number, interrupted?: boolean): ExecutionEvidence;
}
/** Explicit Pareto comparison; missing vectors are never treated as a free cost. */
export declare function dominates(a: OutcomeVector, b: OutcomeVector): boolean;

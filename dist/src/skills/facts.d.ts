import type { DecisionPacket, FactCandidate } from '../../vendor/gs-engine-ts/src/decision.js';
import type { Weights } from './spec.js';
export type PrimitiveFacts = {
    phase: string;
    kind: string;
    targetBeforeSteps: number | null;
    targetAfterSteps: number | null;
    milestone: boolean;
    threatened: boolean;
    energyAfter: number;
    attackDelta: number;
    guardDistanceAfter: number;
    priorVisits: number;
    source: 'deterministic-transition-and-path/v1';
};
export declare function primitiveRule(f: PrimitiveFacts, w: Weights): number;
export type RootFacts = {
    contract: string;
    energy: number;
    bag: number;
    capacity: number;
    delivered: number;
    target: number;
    homeSteps: number | null;
    targetSteps: number | null;
    reachableCount: number;
    remainingCount: number;
    guardCount: number;
    allRemainingGuarded: boolean;
    amount: number;
    history: {
        n: number;
        successes: number;
        meanSteps: number;
        meanAttacks: number;
    } | null;
    source: 'registered-world-facts/v1';
};
export declare function experiencePreference(f: RootFacts, w: Weights): number;
export declare function parentRule(f: RootFacts, w: Weights): number;
export declare function packet(input: Omit<DecisionPacket, 'schema' | 'id' | 'factsVersion' | 'questionVersion' | 'candidates'> & {
    candidates: FactCandidate[];
}): DecisionPacket;
/** Only the shared packet is available here. No world/simulator, private rank, or answer key. */
export declare function selectPacket(p: DecisionPacket): string | null;

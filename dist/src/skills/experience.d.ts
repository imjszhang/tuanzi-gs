import type { BookStorage } from '../planning/book.js';
import type { GameState } from '../game/types.js';
import type { SkillSpec, FeatureId, Weights } from './spec.js';
export type ExperienceMode = 'off' | 'record' | 'use';
export type Outcome = {
    success: boolean;
    steps: number;
    energyDelta: number;
    attacks: number;
    providerCalls: number;
    searchNodes: number;
};
export type RecordStats = {
    key: string;
    n: number;
    successes: number;
    mean: Record<keyof Omit<Outcome, 'success'>, number>;
    m2: Record<keyof Omit<Outcome, 'success'>, number>;
    failures: Record<string, number>;
};
export declare function projectState(s: GameState, ids: readonly FeatureId[], stage: string): {
    [k: string]: string | {
        energy: number;
        bag: number;
        delivered: number;
        target: number;
    } | {
        reachable: number;
        remaining: number;
    } | {
        threatened: boolean;
        guardEating: boolean;
    } | {
        home: number | null;
    };
};
/** Relational bins + objective, encoder, skill AND utility versions. Not a causal Q value. */
export declare function experienceKey(s: GameState, spec: SkillSpec, stage?: string): string;
export declare class ExperienceTable {
    readonly mode: ExperienceMode;
    private readonly storage?;
    private records;
    persistenceError: string | null;
    constructor(mode?: ExperienceMode, storage?: BookStorage | undefined);
    load(raw: unknown): void;
    private save;
    observe(key: string, o: Outcome, failure?: string): void;
    preference(key: string, w: Weights): number;
    list(): RecordStats[];
    clear(): void;
    export(): {
        schema: string;
        mode: ExperienceMode;
        scope: string;
        records: RecordStats[];
    };
}

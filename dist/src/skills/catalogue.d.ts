import type { GameState } from '../game/types.js';
import type { BookStorage } from '../planning/book.js';
import type { SkillSpec, Binding } from './spec.js';
import type { Charge } from './behavior.js';
export type ControllerEvidence = {
    selector: string;
    questionVersion: string;
    factsVersion: string;
    worldKey: string;
    scope: 'actual-controller-run';
};
export type SkillRecord = {
    spec: SkillSpec;
    successes: number;
    failures: number;
    interruptions: number;
    contexts: string[];
    source: string;
    executions?: {
        identity: ControllerEvidence;
        success: boolean;
        external: boolean;
    }[];
    status: 'trial' | 'measured' | 'quarantined';
};
export declare class ReactiveCatalogue {
    private readonly storage?;
    private records;
    persistenceError: string | null;
    constructor(storage?: BookStorage | undefined);
    list(): SkillRecord[];
    specs(): SkillSpec[];
    trial(spec: SkillSpec): void;
    result(spec: SkillSpec, success: boolean, context: string, external?: boolean, identity?: ControllerEvidence): void;
    clear(): void;
    export(): {
        schema: string;
        note: string;
        records: SkillRecord[];
    };
    private save;
}
/** Finite grammar search composes registered rules. The primitive implementations and
 * grammar are authored. Successful composition is generated, not an authored whole plan. */
export declare function synthesizeAccess(s: GameState, b: Binding, charge: Charge, signal: AbortSignal, onAttempt?: (data: unknown) => void): Promise<SkillSpec>;

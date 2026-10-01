import type { DecisionAudit } from '../../vendor/gs-engine-ts/src/decision.js';
import type { Json } from '../../vendor/gs-engine-ts/src/types.js';
import type { SkillSpec, Binding } from './spec.js';
import type { GameState } from '../game/types.js';
export type FailureKind = 'decision_blocked' | 'execution_failed' | 'structure_gap' | 'infrastructure' | 'external_change';
export declare function canonicalSkill(s: SkillSpec): string;
/** Guards zero-action repeats with mere numeric changes; not a global equivalence claim. */
export declare function skillFamily(s: SkillSpec): string;
export declare function structureId(s: SkillSpec): string;
export declare function recoveryScope(s: GameState, b: Binding, controller: string): string;
export type ExecutionFailure = {
    schema: 'gs/execution-failure/v1';
    id: string;
    kind: FailureKind;
    reason: string;
    runId: string;
    skillId: string;
    skillVersion: number;
    structureId: string;
    structure: string;
    family: string;
    scope: string;
    spec: SkillSpec;
    binding: Binding;
    phase: {
        index: number;
        rule: string;
    };
    world: {
        startRevision: string;
        revision: string;
        turn: number;
        key: string;
    };
    outcome: {
        steps: number;
        energyDelta: number;
        deliveredDelta: number;
        dispatchCompleted: boolean;
    };
    decision: DecisionAudit | null;
    controller: string;
    contextVersion: string;
    route: 'pause-and-inspect' | 'repair-skill' | 'reconcile-execution' | 'reobserve';
    informationNovel: boolean;
};
export declare class RecoveryJournal {
    private records;
    private seen;
    record(input: Omit<ExecutionFailure, 'schema' | 'id' | 'informationNovel'>): ExecutionFailure;
    list(): ExecutionFailure[];
    latest(): ExecutionFailure | null;
    repeated(spec: SkillSpec, scope: string): ExecutionFailure | null;
    /** Full most recent packet+answer and bounded prior summaries; never replace validation feedback. */
    feedback(): Json | undefined;
}

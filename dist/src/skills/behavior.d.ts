import type { PrimitiveFacts } from './facts.js';
/** Registered domain knowledge. These rules are authored; generated phase compositions
 * must never be advertised as discovery of the game's physics. No legacy lureSite call. */
import type { GameState, GameAction, Point } from '../game/types.js';
import type { SkillSpec, Binding } from './spec.js';
export type Charge = (n: number) => void;
export type Frame = {
    binding: Binding;
    initial: GameState;
    phase: number;
    phaseStart: number;
    acquired: number;
    placed: number;
    placement: {
        drop: Point;
        stand: Point;
    } | null;
    bindingChecks: number;
    simulationChecks: number;
    transitions: number;
    visits: Record<string, number>;
};
export declare function createFrame(s: GameState, b: Binding): Frame;
export declare function localSuccess(spec: SkillSpec, f: Frame, s: GameState): boolean;
export declare function accessOpen(s: GameState, b: Binding): boolean;
export declare function applicable(spec: SkillSpec, b: Binding, s: GameState): boolean;
export declare function advance(spec: SkillSpec, f: Frame, s: GameState): void;
/** Relational parameter binding uses a bounded, charged local simulation. It does not
 * synthesize a whole-task route. The chosen coordinate is a SkillRun variable, not SkillSpec. */
export declare function bindPlacement(s: GameState, f: Frame, charge: Charge): {
    drop: Point;
    stand: Point;
} | null;
export type SkillCandidate = {
    action: GameAction;
    score: number;
    progress: number;
    cost: number;
    reason: string;
    facts: PrimitiveFacts;
};
export declare function candidates(spec: SkillSpec, f: Frame, s: GameState, charge?: Charge): SkillCandidate[];
export declare function markApplied(f: Frame, a: GameAction): void;
export declare function failureReason(spec: SkillSpec, f: Frame, s: GameState): string | null;
export declare function simulateSkill(spec: SkillSpec, s: GameState, b: Binding, charge?: Charge): {
    success: boolean;
    final: GameState;
    steps: number;
    reason: string;
    checks: number;
    bindingChecks: number;
    validationScope: 'authored-reference-controller-only';
    controllerVersion: 'rules/v031';
    factsVersion: 'gs/decision-facts/v1';
};

import type { Domain, Snapshot, ExecuteRequest, Receipt, Feedback, Policy } from '../../vendor/gs-engine-ts/src/types.js';
import type { GameState, GameAction, GamePolicy, GameContext, GameCandidate } from './types.js';
import { GameWorld } from './world.js';
export declare class TuanziDomain implements Domain<GameState, GameAction, GamePolicy> {
    readonly world: GameWorld;
    private receipts;
    private policy;
    constructor(world: GameWorld);
    bindPolicy(policy: Policy<GamePolicy>): void;
    observe(signal: AbortSignal): Promise<Snapshot<GameState>>;
    assess(ctx: GameContext): {
        kind: "repair";
        reason: string;
        evidence: {
            programId: string;
            at: number;
            repeats?: never;
            window?: never;
            energySpent?: never;
        };
    } | {
        kind: "repair";
        reason: string;
        evidence: {
            repeats: number;
            window: number;
            energySpent: number;
            programId?: never;
            at?: never;
        };
    } | null;
    enumerate(ctx: GameContext): GameCandidate[];
    gate(ctx: GameContext, c: GameCandidate): {
        kind: "deny";
        reason: string;
    } | {
        kind: "allow";
    };
    execute(req: ExecuteRequest<GameAction>, signal: AbortSignal): Promise<Receipt>;
    completion(snapshot: Snapshot<GameState>): 'running' | 'succeeded' | 'failed';
    feedback(before: Snapshot<GameState>, candidate: GameCandidate, receipt: Receipt, after: Snapshot<GameState>): Feedback;
    parsePolicy(raw: unknown): GamePolicy;
    validateProposal(next: GamePolicy, ctx: GameContext): string[];
    validatePolicy(next: GamePolicy, ctx?: GameContext): string[];
}
export declare function describeAction(a: GameAction): string;

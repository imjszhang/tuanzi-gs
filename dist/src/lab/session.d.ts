import type { RetryState } from './retry.js';
import type { GenerationProgress } from './generation.js';
import type { AdaptiveGenerator, AdaptiveMemory } from '../adaptive/session.js';
import type { JudgmentBackend } from '../../vendor/gs-engine-ts/src/judgment.js';
import type { EngineEvent, StepResult } from '../../vendor/gs-engine-ts/src/types.js';
import { GameWorld } from '../game/world.js';
import type { GameState, Point, EditTool } from '../game/types.js';
import type { ReactiveProviders } from '../skills/runtime.js';
import { ExperienceTable } from '../skills/experience.js';
import { ReactiveCatalogue } from '../skills/catalogue.js';
import { SkillBook } from '../planning/book.js';
import type { LabConfig } from './types.js';
export type MemorySeed = {
    adaptive?: AdaptiveMemory;
    catalogue?: ReturnType<ReactiveCatalogue['export']>;
    experience?: ReturnType<ExperienceTable['export']>;
    book?: ReturnType<SkillBook['export']>;
};
export type ProviderFactory = {
    ready: (backend: 'jev' | 'llm') => boolean;
    backend: (backend: 'jev' | 'llm') => JudgmentBackend;
    adapt?: (input: Parameters<AdaptiveGenerator['propose']>[0], signal: AbortSignal, onProgress?: (event: GenerationProgress) => void) => ReturnType<AdaptiveGenerator['propose']>;
    adaptSource?: {
        id: string;
        kind: 'llm' | 'mock';
    };
    generate?: NonNullable<ReactiveProviders['generate']>;
};
export type RequestLedger = {
    requests: number;
    externalRequests: number;
    questions: number;
    rows: {
        source: string;
        kind: string;
        questions: number;
        latencyMs: number;
        status: string;
        purpose?: string;
        logicalRequestId?: string;
        attempt?: number;
        maxAttempts?: number;
        worldRevision?: string;
        failureKind?: string;
        providerStatus?: number;
        retryable?: boolean;
        model?: string;
        usage: unknown;
        error?: string;
    }[];
};
export interface HostedSession {
    world: GameWorld;
    step(): Promise<StepResult>;
    cancel(): void;
    edit(tool: EditTool, point: Point): {
        ok: boolean;
        message: string;
    };
    finished: boolean;
    lastResult: StepResult | undefined;
    inspect(): {
        lastDecision: unknown;
        activeSkill: unknown;
        lastSkillResult: unknown;
        diagnostics?: unknown;
        transportRetry?: RetryState | null;
    };
    export(): unknown;
    memory(): MemorySeed;
}
export declare function createHosted(config: LabConfig, initial: GameState, notify: (e: EngineEvent) => void, ledger: RequestLedger, signal: AbortSignal, providers?: ProviderFactory, seed?: MemorySeed): HostedSession;

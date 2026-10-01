/** Explicit offline protocol exercisers. Neither is a route solver or a proxy for Jev/LLM. */
import type { JudgmentBackend } from '../../vendor/gs-engine-ts/src/judgment.js';
import type { AdaptiveGenerator } from './session.js';
export declare function explorationBackend(delay?: number): JudgmentBackend;
export declare function contextOnlyGenerator(): AdaptiveGenerator;

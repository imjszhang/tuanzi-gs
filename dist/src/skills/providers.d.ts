import type { ReactiveProviders } from './runtime.js';
/** Explicit same-origin transport. No credentials in model state, no retry/fallback. */
export declare function remoteSkills(token: string, withGenerator: boolean): ReactiveProviders;

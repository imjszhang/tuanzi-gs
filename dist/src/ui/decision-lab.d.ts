import type { ExperimentResult } from '../decision/experiment.js';
import type { Strategy } from '../decision/pipeline.js';
export declare const STRATEGY_LABELS: Record<Strategy, string>;
export declare function mountDecisionLab(parent: HTMLElement, connection: () => {
    available: boolean;
    token: string;
    jevReady: boolean;
    llmReady: boolean;
}, pauseMain: () => void): {
    refresh: () => void;
    results: () => ExperimentResult[];
    runOffline: () => Promise<ExperimentResult[]>;
};

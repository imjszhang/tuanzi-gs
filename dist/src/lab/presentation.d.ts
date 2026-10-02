/** Pure, read-only presentation functions. Never choose actions or modify a LabView. */
import type { LabView, LabEvent, LabConfig, Command } from './types.js';
export declare const STATUS: Record<string, string>;
export declare const SCENARIOS: Record<string, string>;
export declare const TASKS: Record<string, {
    title: string;
    description: string;
}>;
export declare const STRATEGIES: Record<string, string>;
export declare const CONTRACTS: Record<string, string>;
export declare const PHASES: Record<string, string>;
export declare const terminal: (status: string) => boolean;
export declare const rec: (v: unknown) => Record<string, any>;
export declare const list: (v: unknown) => any[];
export declare const esc: (v: unknown) => string;
export declare const titleOf: (c: LabConfig) => string;
export declare const goalOf: (s: LabView) => string;
export declare function duration(ms: number): string;
export declare function actualSource(s: LabView): string;
export declare function sourceLabel(source: unknown): string;
export declare function refereeCopy(assessment: unknown): {
    title: string;
    body: string;
    tone: string;
} | null;
export declare function reasonText(reason: string | null): string;
export declare function statusCopy(s: LabView): {
    title: string;
    body: string;
    tone: string;
};
export declare function actionsFor(s: LabView, actorId: string, opts?: {
    replay?: boolean;
    imported?: boolean;
    connected?: boolean;
    pending?: boolean;
}): {
    own: boolean;
    done: boolean;
    quiet: boolean;
    enabled: Record<string, boolean>;
    visible: Command["action"][];
};
export type Flow = {
    skill: string;
    phase: string;
    immediate: string;
    detail: string;
};
export declare function flowOf(s: LabView): Flow;
export type KeyEvent = {
    seq: number;
    at: string;
    title: string;
    detail: string;
    tone: string;
    raw: LabEvent;
};
export declare function unwrap(e: LabEvent): {
    type: string;
    data: Record<string, any>;
};
export declare function keyEvents(events: LabEvent[], through?: number): KeyEvent[];
export declare function decisionsFrom(events: LabEvent[], s: LabView): Record<string, any>[];
export declare function replayStates(report: unknown): LabView[];
export declare function isView(raw: unknown): raw is LabView;

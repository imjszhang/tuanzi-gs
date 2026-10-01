/** Read-only generation preview protocol. Never imported by the autonomous decision loop. */
import type { LabEvent } from './types.js';
export type GenerationProgress = {
    kind: 'status' | 'delta';
    status?: string;
    channel?: 'reasoning' | 'content';
    text?: string;
    model?: string;
    mode?: string;
    reason?: string | null;
    firstTextMs?: number | null;
    usage?: unknown;
    finishReason?: string | null;
};
export type GenerationRecord = {
    purpose?: string;
    id: string;
    requestIndex: number;
    depth: number;
    source: string;
    frameKind: string;
    cause: string;
    revision: string;
    status: string;
    mode: string;
    model: string;
    reason: string | null;
    startedAt: string;
    updatedAt: string;
    firstTextMs: number | null;
    usage: unknown;
    reasoning: string;
    content: string;
    lastSeq: number;
    partial: boolean;
};
export declare const GENERATION_STATUS: Record<string, string>;
export declare const generationPurpose: (r: Pick<GenerationRecord, "cause" | "purpose">) => "格式纠错" | "开局环境研判" | "子问题研判" | "策略生成";
export declare const generationActive: (r: GenerationRecord) => boolean;
/** Uses the event prefix only: replay cannot see text produced after its selected state. */
export declare function generationHistory(events: readonly LabEvent[], through?: number): GenerationRecord[];

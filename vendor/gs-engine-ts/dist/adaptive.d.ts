/** Same-level adaptive G/S, v0.5.4.
 * A G-authored interface is provisionally installed, never an approved world action.
 * Recursion occurs ONLY through an explicit, read-only subproblem. Child results
 * return to the original G with provenance; local failure is not a root veto.
 * No environment solver, reward oracle, forced S choice or model-specific logic.
 */
export type AdaptiveOption = {
    id: string;
    description: string;
    value: unknown;
};
export type AdaptiveFrame = {
    kind: 'action' | 'analysis' | 'reframe';
    question: string;
    context: unknown;
    options: AdaptiveOption[];
    revision: string;
};
export type AdaptiveAnswer = {
    choice: string | null;
    detail: unknown;
};
export type AdaptivePatch = {
    id: string;
    description: string;
    value: unknown;
    warnings?: unknown[];
};
export type AdaptationRequest = {
    schema: 'gs/adaptation-request/v1';
    depth: number;
    cause: string;
    frame: AdaptiveFrame;
    answer: AdaptiveAnswer | null;
    previous: unknown[];
    evidence: unknown;
};
export type OutputRepairRequest = {
    schema: 'gs/output-repair-request/v1';
    depth: number;
    cause: 'output_format_invalid';
    frame: Pick<AdaptiveFrame, 'kind' | 'revision'>;
    attempt: number;
    originalCause: string;
    previousOutput: unknown;
    preserveFrom: unknown;
    diagnostics: unknown;
};
export type AdaptiveSubproblem = {
    frame: AdaptiveFrame;
    expectedResult: string;
    maxRevisions: number;
    maxGenerations: number;
};
export type AdaptiveEvent = {
    type: string;
    data: unknown;
};
export type AdaptiveResolution = ({
    kind: 'selected';
    frame: AdaptiveFrame;
    choice: string;
    answer: AdaptiveAnswer;
} | {
    kind: 'blocked';
    reason: string;
    frame: AdaptiveFrame;
}) & {
    evidence?: {
        lastAnswer: AdaptiveAnswer | null;
        attempts: unknown[];
    };
};
export interface AdaptivePorts {
    select(frame: AdaptiveFrame, depth: number, signal: AbortSignal): Promise<AdaptiveAnswer>;
    generate(request: AdaptationRequest, signal: AbortSignal): Promise<unknown>;
    repairOutput?(request: OutputRepairRequest, signal: AbortSignal): Promise<unknown>;
    parse(raw: unknown, frame: AdaptiveFrame): AdaptivePatch[];
    apply(frame: AdaptiveFrame, patch: AdaptivePatch, depth: number): AdaptiveFrame;
    /** Return a read-only child task ONLY for an explicit G-authored subproblem. */
    subproblem?(frame: AdaptiveFrame, patch: AdaptivePatch, depth: number): AdaptiveSubproblem | null;
    evidence(): unknown;
    check(revision: string, signal: AbortSignal): void;
    event(e: AdaptiveEvent): void;
}
export declare class InvalidAdaptation extends Error {
    readonly diagnostics?: unknown | undefined;
    name: string;
    constructor(message: string, diagnostics?: unknown | undefined);
}
export declare class AdaptiveStale extends Error {
    name: string;
}
export declare function frameSignature(f: AdaptiveFrame): string;
export declare class AdaptiveGS {
    private readonly ports;
    readonly limits: {
        maxDepth: number;
        maxRevisions: number;
        maxGenerations: number;
        maxFormatRepairs: number;
        ioTimeoutMs: number;
        gTimeoutMs: number;
    };
    private busy;
    readonly accounting: {
        generations: number;
        formatRepairs: number;
        invalidOutputs: number;
        validBatches: number;
        revisionAttempts: number;
        committed: number;
    };
    private account;
    constructor(ports: AdaptivePorts, limits?: Partial<AdaptiveGS['limits']>);
    resolve(frame: AdaptiveFrame, signal: AbortSignal, initialCause?: string): Promise<AdaptiveResolution>;
    private io;
    private loop;
}

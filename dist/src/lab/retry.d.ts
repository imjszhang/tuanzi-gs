/** Transport-only retry. Semantic answers (including none) never pass this path. */
export type RetryPolicy = {
    maxRetries: number;
    baseMs: number;
    maxMs: number;
    attemptTimeoutMs: number;
};
export declare const JEV_RETRY_DEFAULTS: RetryPolicy;
export type RetryState = {
    schema: 'gs/s-retry/v1';
    logicalRequestId: string;
    state: 'attempting' | 'waiting' | 'recovered' | 'failed' | 'aborted';
    attempt: number;
    maxAttempts: number;
    worldRevision: string;
    delayMs?: number;
    nextAttemptAt?: number;
    reason?: string;
    failureKind?: string;
    providerStatus?: number;
};
export declare function transportInfo(error: unknown): {
    retryable: boolean;
    failureKind: string;
    providerStatus?: number;
    retryAfterMs?: number;
};
export declare function abortableDelay(ms: number, signal: AbortSignal): Promise<void>;
export declare function retryTransport<T>(args: {
    policy: RetryPolicy;
    signal: AbortSignal;
    check: () => void;
    run: (attempt: number, s: AbortSignal) => Promise<T>;
    onRetry: (data: {
        attempt: number;
        nextAttempt: number;
        delayMs: number;
        error: unknown;
    }) => void;
    random?: () => number;
}): Promise<T>;

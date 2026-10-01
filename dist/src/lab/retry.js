export const JEV_RETRY_DEFAULTS = { maxRetries: 2, baseMs: 500, maxMs: 5000, attemptTimeoutMs: 8000 };
export function transportInfo(error) {
    const e = error;
    return { retryable: e?.retryable === true, failureKind: typeof e?.failureKind === 'string' ? e.failureKind : 'non_retryable', ...(Number.isInteger(e?.providerStatus) ? { providerStatus: e.providerStatus } : {}), ...(Number.isFinite(e?.retryAfterMs) && e.retryAfterMs >= 0 ? { retryAfterMs: e.retryAfterMs } : {}) };
}
export function abortableDelay(ms, signal) { signal.throwIfAborted(); return new Promise((resolve, reject) => { const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); }; const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms); signal.addEventListener('abort', abort, { once: true }); }); }
async function bounded(fn, signal, ms) {
    signal.throwIfAborted();
    const local = new AbortController(), joined = AbortSignal.any([signal, local.signal]);
    const timeout = Object.assign(Error('jev_attempt_timeout'), { retryable: true, failureKind: 'timeout' });
    const timer = setTimeout(() => local.abort(timeout), ms);
    let rejectAbort = () => { };
    const abort = () => rejectAbort(joined.reason);
    try {
        return await Promise.race([Promise.resolve().then(() => { joined.throwIfAborted(); return fn(joined); }), new Promise((_, reject) => { rejectAbort = reject; joined.addEventListener('abort', abort, { once: true }); if (joined.aborted)
                abort(); })]);
    }
    finally {
        clearTimeout(timer);
        joined.removeEventListener('abort', abort);
    }
}
export async function retryTransport(args) {
    const { policy: p, signal, check, run, onRetry } = args;
    for (let attempt = 1;; attempt++) {
        signal.throwIfAborted();
        check();
        try {
            const answer = await bounded(s => run(attempt, s), signal, p.attemptTimeoutMs);
            signal.throwIfAborted();
            check();
            return answer;
        }
        catch (error) {
            signal.throwIfAborted();
            check();
            const info = transportInfo(error);
            if (!info.retryable)
                throw error;
            if (attempt > p.maxRetries)
                throw Object.assign(Error(`jev_transport_retries_exhausted: ${info.failureKind}`), { ...info, retryable: false, attempts: attempt, cause: error });
            // Never retry earlier than Retry-After. An impractically long provider delay stops instead.
            if ((info.retryAfterMs ?? 0) > 60000)
                throw Object.assign(Error('jev_retry_after_exceeds_limit'), { ...info, retryable: false });
            const exponential = Math.min(p.maxMs, p.baseMs * 2 ** (attempt - 1));
            const jitter = Math.floor(exponential * (.5 + .5 * (args.random ?? Math.random)()));
            const delayMs = Math.max(jitter, info.retryAfterMs ?? 0);
            onRetry({ attempt, nextAttempt: attempt + 1, delayMs, error });
            await abortableDelay(delayMs, signal);
        }
    }
}

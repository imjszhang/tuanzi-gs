import type { JudgmentBackend } from '../../vendor/gs-engine-ts/src/judgment.js';
/** Credentials never enter this module or the decision packet. One call = one attempt. */
export declare function remoteJudgments(token: string, kind: 'jev' | 'llm'): JudgmentBackend;

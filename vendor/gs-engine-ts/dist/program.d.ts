import type { Json } from './types.js';
/** v1 deliberately only expresses a finite sequence of guarded choices. No JS, eval,
 * loops, child engines, or model-authored verifier. A new observation precedes each step. */
export type BoundedProgram<A extends Json> = {
    schema: 'gs/program/v1';
    id: string;
    title: string;
    startTurn: number;
    steps: {
        expect: string;
        action: A;
    }[];
};
export declare function parseBoundedProgram<A extends Json>(raw: unknown, parseAction: (x: unknown) => A, maxSteps?: number): BoundedProgram<A>;
export declare function inspectProgram<A extends Json>(program: BoundedProgram<A>, turn: number, observedKey: string): {
    kind: 'ready';
    index: number;
    action: A;
} | {
    kind: 'invalid';
    reason: string;
};

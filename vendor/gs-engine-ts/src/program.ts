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
export function parseBoundedProgram<A extends Json>(raw: unknown, parseAction: (x: unknown) => A, maxSteps = 180): BoundedProgram<A> {
    const obj = (x: unknown) => { if (!x || typeof x !== 'object' || Array.isArray(x))
        throw new Error('program: expected object'); return x as Record<string, unknown>; };
    const r = obj(raw);
    if (Object.keys(r).some(k => !['schema', 'id', 'title', 'startTurn', 'steps'].includes(k)))
        throw new Error('program: unauthorized field');
    if (r.schema !== 'gs/program/v1' || typeof r.id !== 'string' || r.id.length < 1 || r.id.length > 100 || typeof r.title !== 'string' || r.title.length < 1 || r.title.length > 180)
        throw new Error('program: invalid identity');
    if (!Number.isSafeInteger(r.startTurn) || (r.startTurn as number) < 0)
        throw new Error('program: invalid start');
    if (!Array.isArray(r.steps) || !r.steps.length || r.steps.length > maxSteps)
        throw new Error('program: bounded steps required');
    const steps = r.steps.map(value => { const step = obj(value); if (Object.keys(step).some(k => !['expect', 'action'].includes(k)) || typeof step.expect !== 'string' || !/^s-[0-9a-f]{16}$/.test(step.expect))
        throw new Error('program: invalid precondition'); return { expect: step.expect, action: parseAction(step.action) }; });
    return { schema: 'gs/program/v1', id: r.id, title: r.title, startTurn: r.startTurn as number, steps };
}
export function inspectProgram<A extends Json>(program: BoundedProgram<A>, turn: number, observedKey: string): {
    kind: 'ready';
    index: number;
    action: A;
} | {
    kind: 'invalid';
    reason: string;
} {
    const index = turn - program.startTurn;
    if (!Number.isSafeInteger(index) || index < 0 || index >= program.steps.length)
        return { kind: 'invalid', reason: 'program_exhausted_or_not_started' };
    const step = program.steps[index]!;
    return step.expect === observedKey ? { kind: 'ready', index, action: step.action } : { kind: 'invalid', reason: 'program_precondition_changed' };
}

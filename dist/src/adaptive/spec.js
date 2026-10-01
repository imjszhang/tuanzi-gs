/** G's structural language. Runtime and prompt share schema.ts; never a reference solver. */
import { InvalidAdaptation } from '../../vendor/gs-engine-ts/src/adaptive.js';
import { GROUPS, KINDS, PREDICATE_SCHEMA, programSchema, patchesSchema, validateSchema, outputContract } from './schema.js';
export { GROUPS, KINDS, outputContract };
export function object(x, label) { if (!x || typeof x !== 'object' || Array.isArray(x))
    throw new InvalidAdaptation(label + ': object required'); return x; }
function checked(raw, schema, path = '') {
    const d = validateSchema(raw, schema, path);
    if (!d.valid)
        throw new InvalidAdaptation(`${d.issues[0].message} at ${d.issues[0].path || '/'}`, d);
    return structuredClone(raw);
}
export function predicate(raw) { return checked(raw, PREDICATE_SCHEMA); }
export function parseProgram(raw, ruleIds) { return checked(raw, programSchema(ruleIds)); }
export function parsePatches(raw, kind, ruleIds) {
    if (JSON.stringify(raw)?.length > 60000)
        throw new InvalidAdaptation('proposal_output_too_large', { schema: 'gs/output-validation/v1', valid: false, issues: [{ path: '', code: 'maxLength', message: 'Output exceeds 60000 characters', expected: 60000 }], scope: 'structure-only-not-strategy' });
    return checked(raw, patchesSchema(kind, ruleIds)).proposals;
}
/** Backwards-compatible documentation export. Runtime requests use frame-specific outputContract(). */
export const OUTPUT_SPEC = outputContract('action', []);
/** Advisory checks based only on declared primitives, not natural-language or task solutions.
 * Warnings go to the S / audit and audit. They never rewrite/approve a strategy.
 */
export function programWarnings(p) {
    const out = [];
    p.stages.forEach((s, i) => {
        const path = `/program/stages/${i}`;
        for (const [j, c] of s.until.entries())
            if (c.kind === 'delta') {
                const needs = { delivered: 'deposit', baitUsed: 'drop', eaten: 'eat', bag: 'pickup' };
                const k = needs[c.field];
                if (k && !s.kinds.includes(k))
                    out.push({ path: path + `/until/${j}`, code: 'delta_without_capability', message: `This stage requires a positive ${c.field} delta but does not offer ${k}. No implicit loop or capability is inserted.` });
            }
        if (s.candidateIds?.length === 0)
            out.push({ path: path + '/candidateIds', code: 'empty_candidate_scope', message: 'This explicit subset has no actions; S can only abstain.' });
        for (const id of s.candidateIds ?? [])
            if (!s.kinds.includes(id.split(':')[0]))
                out.push({ path: path + '/candidateIds', code: 'candidate_kind_excluded', message: `${id} is excluded by this stage kinds.` });
    });
    return out;
}

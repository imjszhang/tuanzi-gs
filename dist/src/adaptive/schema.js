/** v0.5.2: one structural definition drives runtime validation AND the G contract.
 * This module implements only the JSON-Schema keywords it emits. It is not a general
 * JSON-Schema engine, a planner, or a checker of task/strategy correctness.
 */
export const GROUPS = ['self', 'nearby', 'map', 'objects', 'history'];
export const KINDS = ['move', 'pickup', 'eat', 'deposit', 'drop', 'wait'];
export const DELTA_FIELDS = ['bag', 'delivered', 'eaten', 'baitUsed', 'turn'];
export const VALUE_FIELDS = ['bag', 'delivered', 'energy', 'lureCount', 'guardEating'];
export const CONTRACT_VERSION = 'gs/adaptation-output-contract/v3';
const objectSchema = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const text = (max, description) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S', ...(description ? { description } : {}) });
const integer = (min, max) => ({ type: 'integer', minimum: min, maximum: max });
const list = (items, max, min = 0) => ({ type: 'array', items, minItems: min, maxItems: max, uniqueItems: true });
const literal = (value) => ({ const: value });
const nullable = (s) => ({ anyOf: [{ type: 'null' }, s] });
const nameList = (allowed, max = 40) => list({ type: 'string', minLength: 1, maxLength: 120, ...(allowed ? { enum: allowed } : { pattern: '^(?!__proto__$).+' }) }, max);
export const POINT_SCHEMA = objectSchema({ x: integer(0, 16), y: integer(0, 10) });
export const PREDICATE_SCHEMA = { anyOf: [
        objectSchema({ kind: literal('at'), x: integer(0, 16), y: integer(0, 10) }),
        objectSchema({ kind: literal('delta'), field: { type: 'string', enum: DELTA_FIELDS }, atLeast: integer(1, 180) }),
        objectSchema({ kind: literal('value'), field: { type: 'string', enum: VALUE_FIELDS }, op: { enum: ['gte', 'lte', 'eq'] }, value: integer(0, 180) })
    ], description: 'All until predicates must hold. delta compares current state with the beginning of THIS stage; value compares current absolute state. baitUsed is delta-only; do not silently substitute one meaning for another.' };
export function stageProperties(ruleIds) {
    return {
        name: text(100), question: text(1200, 'Local question for S, not an executed command.'), hypothesis: text(1500, 'Unverified G hypothesis, never an observed fact.'),
        groups: list({ enum: GROUPS }, 5), ruleIds: nameList(ruleIds, 20), kinds: list({ enum: KINDS }, 6, 1), target: nullable(POINT_SCHEMA), candidateIds: nullable(nameList()),
        candidateScope: { anyOf: [objectSchema({ mode: literal('stage') }), objectSchema({ mode: literal('snapshot'), revision: text(80) })] },
        until: { type: 'array', items: PREDICATE_SCHEMA, minItems: 1, maxItems: 4 }, maxActions: integer(1, 180)
    };
}
export function stageSchema(ruleIds) { const props = stageProperties(ruleIds); return objectSchema(props, Object.keys(props).filter(k => k !== 'candidateScope')); }
export function programSchema(ruleIds) { return objectSchema({ schema: literal('gs/decision-program/v1'), title: text(100), stages: { type: 'array', items: stageSchema(ruleIds), minItems: 1, maxItems: 8 } }); }
export function subproblemSchema(ruleIds) {
    return objectSchema({
        kind: literal('subproblem'), task: objectSchema({ question: text(1200), hypothesis: text(1500),
            expectedResult: text(800), groups: list({ enum: GROUPS }, 5), ruleIds: nameList(ruleIds, 20),
            maxRevisions: integer(1, 6), maxGenerations: integer(1, 8) })
    });
}
export function analysisSchema(ruleIds) {
    return objectSchema({
        kind: literal('analysis'), question: text(1200), hypothesis: text(1500), groups: list({ enum: GROUPS }, 5), ruleIds: nameList(ruleIds, 20),
        candidates: { type: 'array', minItems: 1, maxItems: 8, items: objectSchema({
                id: { type: 'string', minLength: 1, maxLength: 80, pattern: '^(?!none$|__proto__$)[a-zA-Z0-9_-]+$' }, description: text(300),
                claim: text(1500, 'Unverified candidate answer to the child question, not an action or permission.')
            }) }
    });
}
export function patchesSchema(kind, ruleIds) {
    const changes = { ...objectSchema(stageProperties(ruleIds), []), minProperties: 1 };
    const patch = kind === 'action' ? { anyOf: [
            objectSchema({ kind: literal('program'), program: programSchema(ruleIds) }),
            objectSchema({ kind: literal('stage-update'), expectedPolicyVersion: integer(1, 1000000), stageIndex: integer(0, 7), changes }),
            subproblemSchema(ruleIds)
        ] } : kind === 'analysis' ? { anyOf: [analysisSchema(ruleIds), subproblemSchema(ruleIds)] } :
        objectSchema({ kind: literal('reframe'), question: text(1200), hypothesis: text(1500), ruleIds: nameList(ruleIds, 20), includeBroaderObservation: { type: 'boolean' }, candidateIds: nullable(nameList()) });
    // One interface update; no automatic first-item picking or mandatory approval tier.
    return objectSchema({ proposals: { type: 'array', items: patch, minItems: 1, maxItems: 1 } });
}
const ptr = (s) => s.replaceAll('~', '~0').replaceAll('/', '~1');
const brief = (v) => { if (typeof v === 'string')
    return v.length > 160 ? v.slice(0, 160) + '…' : v; if (v === undefined)
    return 'missing'; if (v === null || typeof v !== 'object')
    return v; if (Array.isArray(v))
    return { type: 'array', length: v.length }; return { type: 'object', keys: Object.keys(v).slice(0, 20) }; };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function validateSchema(value, schema, startPath = '') {
    const issues = [];
    let truncated = false;
    const add = (path, code, message, expected, actual) => { if (issues.length >= 64) {
        truncated = true;
        return;
    } issues.push({ path, code, message, ...(expected !== undefined ? { expected } : {}), actual: brief(actual) }); };
    function walk(v, s, path, depth) {
        if (depth > 32) {
            add(path, 'depth_limit', 'Structural nesting limit exceeded', 32, depth);
            return;
        }
        if (issues.length >= 64) {
            truncated = true;
            return;
        }
        if (s.anyOf) {
            // Discriminate typed unions so the error points to the actual bad field, not every unrelated branch.
            const kind = v && typeof v === 'object' && !Array.isArray(v) ? v.kind : undefined;
            const branch = kind !== undefined ? s.anyOf.find(b => b.properties?.kind?.const === kind) : undefined;
            if (branch) {
                walk(v, branch, path, depth + 1);
                return;
            }
            if (s.anyOf.some(b => b.type === 'null') && v === null)
                return;
            const remaining = s.anyOf.filter(b => b.type !== 'null');
            if (remaining.length === 1) {
                walk(v, remaining[0], path, depth + 1);
                return;
            }
            const kinds = s.anyOf.map(b => b.properties?.kind?.const).filter(x => x !== undefined);
            if (kinds.length) {
                const allowed = [...new Set(s.anyOf.flatMap(b => Object.keys(b.properties ?? {})))];
                if (v && typeof v === 'object' && !Array.isArray(v))
                    for (const key of Object.keys(v))
                        if (!allowed.includes(key))
                            add(path + '/' + ptr(key), 'unsupported_field', `unsupported_field:${key}; patch objects go directly inside proposals`, allowed, v[key]);
                add(path + '/kind', kind === undefined ? 'required' : 'enum', 'Choose a supported discriminator, not a documentation label', kinds, kind);
                return;
            }
            if (s.anyOf.some(b => validateSchema(v, b).valid))
                return;
            add(path, 'anyOf', 'Value does not match any allowed structural alternative', s.anyOf.map(b => b.type), v);
            return;
        }
        if (s.const !== undefined && !equal(v, s.const)) {
            add(path, 'const', 'Must equal the declared constant', s.const, v);
            return;
        }
        if (s.enum && !s.enum.some(x => equal(v, x)))
            add(path, 'enum', 'Value is not in the allowed set', s.enum, v);
        if (s.type) {
            const good = s.type === 'null' ? v === null : s.type === 'array' ? Array.isArray(v) : s.type === 'object' ? !!v && typeof v === 'object' && !Array.isArray(v) : s.type === 'integer' ? Number.isSafeInteger(v) : typeof v === s.type;
            if (!good) {
                add(path, 'type', `Expected ${s.type}`, s.type, v);
                return;
            }
        }
        if (s.type === 'object') {
            const r = v, ps = s.properties ?? {}, ks = Object.keys(r);
            if (s.minProperties !== undefined && ks.length < s.minProperties)
                add(path, 'minProperties', 'Object must include at least one change', s.minProperties, v);
            for (const k of s.required ?? [])
                if (!Object.hasOwn(r, k))
                    add(path + '/' + ptr(k), 'required', 'Required field is missing', k, undefined);
            for (const k of ks) {
                if (!Object.hasOwn(ps, k)) {
                    if (s.additionalProperties === false)
                        add(path + '/' + ptr(k), 'unsupported_field', `unsupported_field:${k}; remove the unsupported wrapper/field, do not change task meaning`, Object.keys(ps), r[k]);
                }
                else
                    walk(r[k], ps[k], path + '/' + ptr(k), depth + 1);
            }
        }
        else if (s.type === 'array') {
            const a = v;
            if (s.minItems !== undefined && a.length < s.minItems)
                add(path, 'minItems', 'Too few items', s.minItems, a);
            if (s.maxItems !== undefined && a.length > s.maxItems)
                add(path, 'maxItems', 'Too many items', s.maxItems, a);
            if (s.uniqueItems && new Set(a.map(x => JSON.stringify(x))).size !== a.length)
                add(path, 'uniqueItems', 'Duplicate list values are not allowed', true, a);
            if (s.items)
                for (let i = 0; i < Math.min(a.length, 181); i++)
                    walk(a[i], s.items, path + '/' + i, depth + 1);
        }
        else if (s.type === 'string') {
            const t = v;
            if (s.minLength !== undefined && t.length < s.minLength)
                add(path, 'minLength', 'String is empty', s.minLength, t);
            if (s.maxLength !== undefined && t.length > s.maxLength)
                add(path, 'maxLength', 'String exceeds limit', s.maxLength, t);
            if (s.pattern && !new RegExp(s.pattern).test(t))
                add(path, 'pattern', 'Invalid or blank string', s.pattern, t);
        }
        else if (s.type === 'integer') {
            if (s.minimum !== undefined && Number(v) < s.minimum)
                add(path, 'minimum', 'Value below minimum', s.minimum, v);
            if (s.maximum !== undefined && Number(v) > s.maximum)
                add(path, 'maximum', 'Value above maximum', s.maximum, v);
        }
    }
    walk(value, schema, startPath, 0);
    return { schema: 'gs/output-validation/v1', valid: issues.length === 0, issues, truncated, scope: 'structure-only-not-strategy', contractVersion: CONTRACT_VERSION };
}
export function outputContract(kind, ruleIds) {
    return {
        schema: CONTRACT_VERSION, frameKind: kind,
        instructions: 'Return exactly one JSON object with a proposals ARRAY containing EXACTLY ONE patch. A program contains S action options; an analysis contains candidate answers. Do not submit competing interface updates for implicit approval. Each array item IS the patch object. Do NOT output envelope, actionFrame, Stage, or reframeFrame wrapper keys. These were documentation labels, not fields.',
        jsonSchema: patchesSchema(kind, ruleIds),
        semantics: {
            recursion: 'Only kind=subproblem enters a bounded read-only child G/S. Child G creates an analysis with candidates; child S chooses an answer, not permission to change the parent. Results including unresolved return to the original G. maxDepth prevents further nesting, not same-layer repairs. Do not automatically recurse on abstention.',
            candidates: 'candidateIds=null means the declared kinds are re-instantiated from current legal primitives at EVERY state. A non-null list without candidateScope keeps legacy fixed-stage semantics and is never silently widened. candidateScope.mode=stage is a persistent whitelist; mode=snapshot requires current revision and expires after any world change, triggering G before any next action. Targets are G-authored coordinates, not paths. Never copy one frame candidate IDs as an entire future route.',
            analysis: 'Child analysis candidates are hypotheses only. A selected answer returns with its actual S response and evidence; it does not modify the world or certify truth. Returned child failure is evidence for another bounded same-level attempt.',
            validation: 'Structure, permissions and explicit declaration consistency only; no strategy success oracle. An admitted patch is installed provisionally at the SAME layer; actual action is still selected by S.',
            stages: 'Stages execute in order. until is ALL-of, evaluated on actual state; it does not create implicit loops or extra actions. Only kinds offered by the current stage can be selected.',
            delta: 'Change since the START of the stage; positive atLeast. baitUsed/eaten are supported here only.',
            value: 'Absolute current value; guardEating is maximum remaining eating timer among guards in the authoritative current world, or zero (not only the S-visible subset).',
            stageUpdate: 'action frame can return kind=stage-update to alter only current stage fields. Use evidence.policyVersion and evidence.currentStage. Omitted fields, completed stages and spent stage budget remain unchanged. This is not an action or a stage-clock reset.',
            observations: 'request.frame is the exact limited information S saw. request.evidence.observedWorld is the broader information allowed for G. G may choose any registered groups for future S. S missingGroups is not a prohibition on G using its broader evidence.',
            uncertainty: 'Hypotheses are not facts; no task solution, target, reward rank, reference trajectory or tactical example is supplied.'
        }
    };
}

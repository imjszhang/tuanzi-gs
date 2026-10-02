export const TERMINAL = new Set(['succeeded', 'failed', 'blocked', 'cancelled', 'stopped', 'fault']);
export class LabError extends Error {
    code;
    status;
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'LabError';
    }
}
export const fail = (code, message = code, status = 400) => { throw new LabError(code, message, status); };
const obj = (x) => { if (!x || typeof x !== 'object' || Array.isArray(x))
    return fail('INVALID_OBJECT'); return x; };
function keys(x, allowed) { for (const k of Object.keys(x))
    if (!allowed.includes(k))
        fail('UNKNOWN_FIELD', `Unsupported field: ${k}`); }
export function parseActor(raw) { const a = obj(raw); keys(a, ['id', 'kind', 'label']); if (typeof a.id !== 'string' || !/^[-a-zA-Z0-9_.:]{1,80}$/.test(a.id) || !['human', 'agent'].includes(String(a.kind)) || typeof a.label !== 'string' || a.label.length > 100)
    return fail('INVALID_ACTOR'); return { id: a.id, kind: a.kind, label: a.label }; }
export function identifier(raw, label = 'id') { if (typeof raw !== 'string' || !/^[-a-zA-Z0-9_.:]{1,100}$/.test(raw))
    return fail('INVALID_ID', `Invalid ${label}`); return raw; }
function int(x, min, max, label) { if (!Number.isSafeInteger(x) || Number(x) < min || Number(x) > max)
    return fail('INVALID_NUMBER', `${label} must be integer ${min}..${max}`); return Number(x); }
function bool(x, label) { if (typeof x !== 'boolean')
    return fail('INVALID_BOOLEAN', label); return x; }
export function parseIntervention(raw) { const r = obj(raw); keys(r, ['afterAction', 'tool', 'point']); const p = obj(r.point); keys(p, ['x', 'y']); if (!['wall', 'berry', 'guard', 'erase'].includes(String(r.tool)))
    return fail('INVALID_TOOL'); return { afterAction: int(r.afterAction, 0, 180, 'afterAction'), tool: r.tool, point: { x: int(p.x, 0, 16, 'x'), y: int(p.y, 0, 10, 'y') } }; }
export function parseConfig(raw) {
    const r = obj(raw);
    const defaults = { kind: 'judgment', task: 'energy', scenario: 'guarded', controller: 'hierarchy', strategy: 'batch', backend: 'rule', generator: 'local', experience: 'use', orderSeed: 441, maskResources: false, delayMs: 0, allowLive: false, maxRequests: 512, maxQuestions: 8192, maxActions: 180, maxSteps: 400, maxSearchNodes: 150000, deadlineMs: 120000, interventions: [], maxGCalls: 12, gTimeoutMs: 600000, maxDepth: 2, maxRevisions: 3, maxFormatRepairs: 2, jevMaxRetries: 2, jevRetryBaseMs: 500, jevRetryMaxMs: 5000, jevAttemptTimeoutMs: 8000 };
    keys(r, Object.keys(defaults));
    const c = { ...defaults, ...r };
    if (r.kind === 'game' && r.controller === undefined)
        c.controller = 'adaptive';
    for (const [k, options] of Object.entries({ kind: ['judgment', 'game'], task: ['fast', 'reserve', 'energy', 'chain'], scenario: ['meadow', 'detour', 'guarded', 'remix'], controller: ['adaptive', 'hierarchy', 'program', 'rules'], strategy: ['direct', 'batch', 'serial', 'dependent'], backend: ['rule', 'jev', 'llm'], generator: ['local', 'llm'], experience: ['off', 'record', 'use'] }))
        if (!options.includes(String(c[k])))
            fail('INVALID_ENUM', k);
    for (const [k, min, max] of [['orderSeed', 0, 2147483647], ['delayMs', 0, 1000], ['maxRequests', 1, 512], ['maxQuestions', 1, 8192], ['maxActions', 1, 180], ['maxSteps', 1, 1000], ['maxSearchNodes', 1, 500000], ['deadlineMs', 1, 3600000], ['maxGCalls', 1, 256], ['gTimeoutMs', 100, 3600000], ['maxDepth', 0, 3], ['maxRevisions', 1, 6], ['maxFormatRepairs', 0, 4]])
        c[k] = int(c[k], min, max, k);
    for (const [k, min, max] of [['jevMaxRetries', 0, 5], ['jevRetryBaseMs', 0, 10000], ['jevRetryMaxMs', 0, 30000], ['jevAttemptTimeoutMs', 100, 25000]])
        c[k] = int(c[k], min, max, k);
    if (c.jevRetryMaxMs < c.jevRetryBaseMs)
        fail('INVALID_RETRY_POLICY', 'jevRetryMaxMs must be >= jevRetryBaseMs');
    c.maskResources = bool(c.maskResources, 'maskResources');
    c.allowLive = bool(c.allowLive, 'allowLive');
    if (!Array.isArray(c.interventions) || c.interventions.length > 32)
        fail('INVALID_INTERVENTIONS');
    c.interventions = c.interventions.map(parseIntervention).sort((a, b) => a.afterAction - b.afterAction);
    if (c.kind === 'game' && c.maskResources)
        fail('UNSUPPORTED_COMBINATION', 'maskResources belongs to judgment experiments');
    if (c.kind === 'judgment' && c.generator !== 'local')
        fail('UNSUPPORTED_COMBINATION', 'Judgment tasks have immutable goals; no skill generator');
    if (c.kind === 'game' && !['hierarchy', 'adaptive'].includes(c.controller) && (c.backend !== 'rule' || c.generator !== 'local' || c.delayMs !== 0))
        fail('UNSUPPORTED_COMBINATION', 'program/rules reference controllers are offline only');
    if (c.backend !== 'rule' && c.delayMs !== 0)
        fail('UNSUPPORTED_COMBINATION', 'Synthetic delay is only for the rule backend');
    if (c.backend !== 'rule' || c.generator === 'llm') {
        if (!c.allowLive)
            fail('LIVE_NOT_AUTHORIZED', 'Set allowLive=true explicitly');
        if (!Object.hasOwn(r, 'maxRequests'))
            fail('LIVE_BUDGET_REQUIRED', 'Specify maxRequests explicitly');
    }
    if (c.kind === 'game' && c.controller === 'hierarchy' && (c.backend !== 'rule' || c.generator !== 'local'))
        fail('LEGACY_ASSISTANCE_FORBIDDEN', 'Use controller=adaptive for model experiments; hierarchy is an offline reference with authored tactical assistance');
    return structuredClone(c);
}
export function parseCommand(raw) {
    const r = obj(raw);
    keys(r, ['commandId', 'expectedControlVersion', 'actor', 'action', 'tool', 'point', 'expectedWorldRevision', 'afterAction', 'label']);
    if (!['start', 'step', 'pause', 'cancel', 'takeover', 'intervene', 'schedule', 'checkpoint'].includes(String(r.action)))
        return fail('INVALID_COMMAND');
    const out = { commandId: identifier(r.commandId, 'commandId'), expectedControlVersion: int(r.expectedControlVersion, 0, 1000000, 'expectedControlVersion'), actor: parseActor(r.actor), action: r.action };
    if (out.action === 'intervene' || out.action === 'schedule') {
        const i = parseIntervention({ afterAction: r.afterAction ?? 0, tool: r.tool, point: r.point });
        out.tool = i.tool;
        out.point = i.point;
        if (out.action === 'schedule')
            out.afterAction = i.afterAction;
        if (out.action === 'intervene') {
            if (typeof r.expectedWorldRevision !== 'string')
                fail('WORLD_REVISION_REQUIRED');
            out.expectedWorldRevision = r.expectedWorldRevision;
        }
    }
    else if (r.tool !== undefined || r.point !== undefined || r.afterAction !== undefined || r.expectedWorldRevision !== undefined)
        fail('UNEXPECTED_ARGUMENT');
    if (r.label !== undefined) {
        if (typeof r.label !== 'string' || r.label.length > 120)
            fail('INVALID_LABEL');
        out.label = r.label;
    }
    return out;
}
export function stable(value) { if (value === null || typeof value !== 'object')
    return JSON.stringify(value); if (Array.isArray(value))
    return `[${value.map(stable).join(',')}]`; return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`; }

/** Declaration checks, not path finding or policy evaluation. Never mutates a plan. */
import { InvalidAdaptation } from '../../vendor/gs-engine-ts/src/adaptive.js';
import { legalActions, actionId } from './world-port.js';
export function scopeExpired(stage, s) {
    return stage.candidateIds !== null && stage.candidateScope?.mode === 'snapshot' && stage.candidateScope.revision !== String(s.revision);
}
export function conditionIssues(p, index, s, start) {
    const stage = p.stages[index];
    if (!stage)
        return [];
    const issues = [];
    const add = (field, code, message, actual) => issues.push({ path: `/program/stages/${index}/${field}`, code, message, ...(actual !== undefined ? { actual } : {}) });
    const fixed = stage.candidateIds !== null && stage.candidateScope?.mode !== 'snapshot';
    const ids = stage.candidateIds ?? [];
    if (stage.candidateScope?.mode === 'snapshot') {
        if (stage.candidateIds === null)
            add('candidateScope', 'snapshot_requires_explicit_ids', 'A snapshot scope must state its explicit candidate IDs; no silent default.');
        else if (scopeExpired(stage, s))
            add('candidateScope/revision', 'candidate_scope_expired', 'Snapshot-scoped options are not valid at the current world revision.', { declared: stage.candidateScope.revision, current: String(s.revision) });
        else {
            const legal = new Set(legalActions(s).map(actionId));
            for (const id of ids)
                if (!legal.has(id))
                    add('candidateIds', 'snapshot_candidate_not_legal', 'This ID is not a legal action in the declared snapshot.', id);
        }
    }
    const at = stage.until.filter(c => c.kind === 'at');
    if (new Set(at.map(c => `${c.x},${c.y}`)).size > 1)
        add('until', 'incompatible_positions', 'ALL-of position predicates require different cells simultaneously.');
    for (const [i, c] of stage.until.entries()) {
        if (c.kind === 'at' && (s.player.x !== c.x || s.player.y !== c.y)) {
            if (!stage.kinds.includes('move'))
                add(`until/${i}`, 'position_without_move', 'The unmet position condition requires move, which this stage excludes.');
            else if (fixed && !ids.includes(`move:${c.x},${c.y}`))
                add(`candidateIds`, 'fixed_scope_excludes_goal', 'The persistent move endpoint whitelist excludes the declared unmet destination. No route is supplied or inserted.', { goal: { x: c.x, y: c.y }, mode: 'fixed-stage' });
        }
        if (c.kind === 'delta') {
            const required = { bag: 'pickup', delivered: 'deposit', eaten: 'eat', baitUsed: 'drop', turn: null }[c.field];
            if (s[c.field] - start[c.field] < c.atLeast && required && !stage.kinds.includes(required))
                add(`until/${i}`, 'unmet_delta_without_capability', `Unmet positive ${c.field} delta requires ${required}, which this stage excludes.`);
        }
        if (c.kind === 'value' && ['bag', 'delivered'].includes(c.field)) {
            const current = c.field === 'bag' ? s.bag : s.delivered, requiresIncrease = (c.op === 'gte' || c.op === 'eq') && c.value > current;
            const kind = c.field === 'bag' ? 'pickup' : 'deposit';
            if (requiresIncrease && !stage.kinds.includes(kind))
                add(`until/${i}`, 'unmet_value_without_capability', `This unmet ${c.field} value requires ${kind}, which is absent.`);
        }
    }
    return issues;
}
export function assertConditions(p, index, s, start) {
    const issues = conditionIssues(p, index, s, start);
    if (issues.length)
        throw new InvalidAdaptation(issues[0].code, { schema: 'gs/decision-consistency/v054', valid: false, issues, scope: 'declaration-consistency-no-search', action: 'Return to G for substantive revision; never silently rewrite restrictions or targets.' });
}

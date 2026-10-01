import { evidenceKey } from '../../vendor/gs-engine-ts/src/decision.js';
import { runDecisionGraph, JudgmentError } from '../../vendor/gs-engine-ts/src/judgment.js';
import { parentRule, primitiveRule } from '../skills/facts.js';
export const questionVersionFor = (p, s) => `gs/judgments/${p.taskContext ? 'v042' : 'v04'}/${s}`;
const levels = ['Not useful', 'Low priority', 'Routine option', 'Makes current progress', 'High priority', 'Urgent', 'Necessary now'];
const criteria = (p) => Object.fromEntries([['none', 'No offered candidate is suitable; abstain rather than invent an action.'], ...p.candidates.map((c, i) => ['a' + i, { description: c.description, action: c.action, facts: c.facts }])]);
function question(p, id, kind) {
    const c = p.candidates.find(c => c.id === id);
    const instructions = { question: kind === 'fit' ? 'Is this candidate suitable to attempt under the CURRENT goal and declared decision preferences? Legal does not mean useful.' : 'How much priority does this candidate deserve under the CURRENT goal, available evidence and declared preferences?', candidateId: c.id, description: c.description, criterion: kind, goal: p.goal, ...(p.taskContext ? { taskContextRef: 'evidence.packet.taskContext', stepCriterion: 'Intermediate phase progress counts; this single action need not achieve the terminal goal.' } : {}), note: 'Judge from evidence.packet. Hard legality and actual outcome are verified outside this question. Do not infer hidden world facts.' };
    return kind === 'fit' ? { type: 'noul', instructions } : { type: 'score', instructions, criteria: levels };
}
export function compileDecision(p, strategy) {
    const tasks = [];
    if (strategy === 'direct')
        tasks.push({ id: 'choose', dependsOn: [], question: { type: 'choice', instructions: { question: 'Which candidate best fits the current goal and declared priorities? Choose none if no candidate is suitable.', criterion: 'choose', goal: p.goal, ...(p.taskContext ? { taskContextRef: 'evidence.packet.taskContext', stepCriterion: 'Choose a useful intermediate phase action, not only an action that immediately completes the final goal. Keep none if evidence is inadequate.' } : {}) }, criteria: criteria(p) } });
    else {
        for (const [i, c] of p.candidates.entries()) {
            tasks.push({ id: 'fit' + i, dependsOn: [], question: question(p, c.id, 'fit') });
            if (strategy !== 'dependent')
                tasks.push({ id: 'priority' + i, dependsOn: [], question: question(p, c.id, 'priority') });
        }
        if (strategy === 'dependent')
            tasks.push({ id: 'choose', dependsOn: p.candidates.map((_, i) => 'fit' + i), question: { type: 'choice', instructions: { question: 'Choose the best remaining candidate. Options are filtered by the previous suitability answers in dependencyAnswers. None remains available.', criterion: 'choose', goal: p.goal, ...(p.taskContext ? { taskContextRef: 'evidence.packet.taskContext', stepCriterion: 'Choose a useful intermediate phase action, not only an action that immediately completes the final goal. Keep none if evidence is inadequate.' } : {}) }, criteria: criteria(p) }, bindFrom: { kind: 'choice-from-noul', none: 'none', threshold: .5, optionTasks: Object.fromEntries(p.candidates.map((_, i) => ['a' + i, 'fit' + i])) } });
    }
    return { schema: 'gs/decision-graph/v1', id: evidenceKey([p.id, strategy]), snapshotKey: p.id, goalVersion: evidenceKey([p.goal, p.preferences]), questionVersion: questionVersionFor(p, strategy), evidence: { packet: p }, tasks };
}
export function defaultAssessment(p, id) {
    const c = p.candidates.find(c => c.id === id);
    const score = p.level === 'parent' ? parentRule(c.facts, p.preferences) : primitiveRule(c.facts, p.preferences);
    return { fit: p.level === 'child' || score > 0, priority: p.level === 'parent' ? Math.max(0, Math.min(6, score / 200)) : Math.max(0, Math.min(6, (score + 200) / 100)) };
}
function choiceAnswer(options, id) { return { type: 'choice', choice: id, confidence: 1, probabilities: Object.fromEntries(Object.keys(options).map(o => [o, o === id ? 1 : 0])) }; }
/** Explicit rule baseline operating on the same packet, never on an oracle answer or private world. */
export function ruleBackend(assess = defaultAssessment, delayMs = 0) {
    return { id: delayMs ? 'rule-with-synthetic-delay' : 'packet-rules/v04', kind: 'rule', async ask(input, signal) {
            signal.throwIfAborted();
            if (delayMs > 0)
                await new Promise((resolve, reject) => { const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delayMs); const abort = () => { clearTimeout(timer); reject(Error('cancelled')); }; signal.addEventListener('abort', abort, { once: true }); });
            signal.throwIfAborted();
            const p = input.state.evidence.packet, answers = {};
            for (const [id, q] of Object.entries(input.questions)) {
                const ins = q.instructions;
                if (q.type === 'noul')
                    answers[id] = { type: 'noul', noul: assess(p, ins.candidateId).fit ? 1 : 0 };
                else if (q.type === 'score')
                    answers[id] = { type: 'score', score: assess(p, ins.candidateId).priority };
                else {
                    const ranked = p.candidates.map((c, i) => ({ alias: 'a' + i, id: c.id, ...assess(p, c.id) })).filter(x => x.fit && Object.hasOwn(q.criteria, x.alias)).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
                    answers[id] = choiceAnswer(q.criteria, ranked[0]?.alias ?? 'none');
                }
            }
            return { answers, model: 'rule-reference-not-a-model' };
        } };
}
export function interpret(p, strategy, r) {
    let chosen = null;
    const suitability = {};
    if (strategy === 'direct' || strategy === 'dependent') {
        const a = r.answers.choose;
        if (a?.type !== 'choice')
            throw Error('missing_choice');
        if (a.choice !== 'none') {
            const i = Number(a.choice.slice(1));
            chosen = p.candidates[i]?.id ?? null;
        }
        p.candidates.forEach((c, i) => { const fit = r.answers['fit' + i]; suitability[c.id] = fit?.type === 'noul' ? fit.noul : (c.id === chosen ? 1 : 0); });
        const probs = {};
        p.candidates.forEach((c, i) => probs[c.id] = a.probabilities['a' + i] ?? 0);
        return { choice: chosen, confidence: a.confidence, probabilities: probs, suitability, abstainProbability: a.probabilities.none ?? 0 };
    }
    const ranked = p.candidates.map((c, i) => { const fit = r.answers['fit' + i], priority = r.answers['priority' + i]; if (fit?.type !== 'noul' || priority?.type !== 'score')
        throw Error('incomplete_dimensions'); suitability[c.id] = fit.noul; return { id: c.id, fit: fit.noul, priority: priority.score }; }).filter(c => c.fit >= .5).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    chosen = ranked[0]?.id ?? null;
    // Composite output is a deterministic routing result, NOT an aggregate calibrated probability.
    return { choice: chosen, confidence: 1, probabilities: Object.fromEntries(p.candidates.map(c => [c.id, c.id === chosen ? 1 : 0])), suitability, abstainProbability: chosen ? 0 : 1 };
}
export async function evaluatePacket(p, strategy, backend, options) {
    const graph = compileDecision(p, strategy), dispatchStrategy = strategy === 'serial' ? 'serial' : 'batch';
    try {
        const report = await runDecisionGraph(graph, backend, { ...options, strategy: dispatchStrategy });
        report.questionStrategy = strategy;
        report.dispatchStrategy = dispatchStrategy;
        return { judgment: interpret(p, strategy, report), report, graph };
    }
    catch (e) {
        if (e instanceof JudgmentError) {
            e.report.questionStrategy = strategy;
            e.report.dispatchStrategy = dispatchStrategy;
        }
        throw e;
    }
}

import { JudgmentError } from '../../vendor/gs-engine-ts/src/judgment.js';
import { evaluatePacket, questionVersionFor } from '../decision/pipeline.js';
import { packet, selectPacket, parentRule } from './facts.js';
import { evidenceKey, neutralOrder, FACTS_VERSION } from '../../vendor/gs-engine-ts/src/decision.js';
import { GSEngine } from '../../vendor/gs-engine-ts/src/engine.js';
import { RootBudget, ExecutionLease } from '../../vendor/gs-engine-ts/src/resources.js';
import { ProposalRejected, RepairBlocked } from '../../vendor/gs-engine-ts/src/rejection.js';
import { GameWorld, path, reachableBerries } from '../game/world.js';
import { TuanziDomain, describeAction } from '../game/domain.js';
import { GOAL, CAPABILITIES, INITIAL_POLICY, dist } from '../game/types.js';
import { emptyStats } from '../planning/controller.js';
import { SkillBook } from '../planning/book.js';
import { simulate, legalPrimitives } from '../planning/search.js';
import { actionKey, exactWorldKey } from '../planning/programs.js';
import { BASE_SKILLS, parseSkill, FEATURE_IDS, DEFAULT_WEIGHTS } from './spec.js';
import { createFrame, advance, applicable, localSuccess, candidates, markApplied, failureReason, simulateSkill } from './behavior.js';
import { skillTaskContext, localGoalText, TASK_CONTEXT_VERSION } from './context.js';
import { RecoveryJournal, canonicalSkill, skillFamily, structureId, recoveryScope } from './recovery.js';
import { ExperienceTable, experienceKey, projectState } from './experience.js';
import { ReactiveCatalogue, synthesizeAccess } from './catalogue.js';
const makeLimits = (actions = 180) => ({ maxCycles: 500, maxActions: actions, maxModelCalls: 500, maxRepairs: 3, maxDurationMs: 86400000, ioTimeoutMs: 30000, noProgressWindow: 100, historySize: 16, maxProposalAttempts: 3 });
function parseBinding(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw Error('binding object');
    const r = raw;
    if (Object.keys(r).some(k => !['targetId', 'targetBerryIds', 'amount'].includes(k)) || typeof r.targetId !== 'string' || r.targetId.length > 100 || !Array.isArray(r.targetBerryIds) || r.targetBerryIds.length > 187 || r.targetBerryIds.some(x => typeof x !== 'string' || x.length > 100) || !Number.isSafeInteger(r.amount) || Number(r.amount) < 0 || Number(r.amount) > 3)
        throw Error('binding schema');
    return { targetId: r.targetId, targetBerryIds: [...r.targetBerryIds], amount: Number(r.amount) };
}
function parseRoot(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw Error('root policy object');
    const r = raw;
    if (Object.keys(r).some(k => !['skills', 'features', 'weights'].includes(k)) || !Array.isArray(r.skills) || r.skills.length < 3 || r.skills.length > 12)
        throw Error('root policy whitelist');
    const skills = r.skills.map(parseSkill);
    if (new Set(skills.map(s => `${s.id}@${s.version}`)).size !== skills.length)
        throw Error('duplicate skill');
    if (BASE_SKILLS.some(b => !skills.some(s => JSON.stringify(s) === JSON.stringify(b))))
        throw Error('base skill contracts must remain unchanged');
    if (!Array.isArray(r.features) || !r.features.length || r.features.some(x => !FEATURE_IDS.includes(x)))
        throw Error('root features');
    if (!r.weights || typeof r.weights !== 'object' || Object.keys(r.weights).some(x => !['progress', 'cost', 'safety', 'experience'].includes(x)) || Object.values(r.weights).length !== 4 || Object.values(r.weights).some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 30))
        throw Error('root weights');
    return { skills, features: [...r.features], weights: { ...r.weights } };
}
function projectJson(s, ids, stage) { return projectState(s, ids, stage); }
class SkillDomain {
    host;
    spec;
    binding;
    runId;
    frame;
    physical;
    lastPhase = 0;
    rankings = [];
    constructor(host, spec, binding, runId) {
        this.host = host;
        this.spec = spec;
        this.binding = binding;
        this.runId = runId;
        this.frame = createFrame(host.world.snapshot(), binding);
        this.physical = new TuanziDomain(host.world);
        this.physical.bindPolicy({ id: 'physical-authority', version: 1, body: { mode: 'program', subgoal: 'registered local skill', enabled: [...CAPABILITIES], reserveEnergy: 24 } });
    }
    async observe(signal) {
        this.host.budget.check(signal);
        const snap = await this.physical.observe(signal);
        advance(this.spec, this.frame, snap.state);
        if (this.lastPhase !== this.frame.phase) {
            this.lastPhase = this.frame.phase;
            this.host.emit('skill_phase_changed', { runId: this.runId, phase: this.frame.phase, rule: this.spec.phases[this.frame.phase]?.rule ?? 'finished' });
        }
        return snap;
    }
    enumerate(ctx) {
        this.rankings = candidates(this.spec, this.frame, ctx.snapshot.state, n => this.host.chargeSearch(n));
        return neutralOrder(this.rankings.map(x => ({ id: actionKey(x.action), description: describeAction(x.action), capability: `game.${x.action.kind}`, action: x.action, intent: x.action.kind === 'wait' ? 'hold' : x.action.kind === 'move' ? 'reposition' : 'engage' })), this.host.orderSeed(ctx.snapshot.state));
    }
    decisionPacket(ctx, cs) {
        return packet({ level: 'child', goal: localGoalText(this.spec), taskContext: skillTaskContext(this.spec, this.frame, ctx.snapshot.state), snapshotRevision: ctx.snapshot.revision, policyVersion: ctx.policy.version, orderSeed: this.host.orderSeed(ctx.snapshot.state), scope: { name: 'registered-phase-candidates/v031', note: 'Phase contracts constrain candidates; one-step safety uses deterministic physics. This is not all possible actions.' }, projection: projectJson(ctx.snapshot.state, this.spec.features, this.spec.phases[this.frame.phase]?.rule ?? 'done'), preferences: this.spec.weights, candidates: cs.map(c => ({ id: c.id, description: c.description, action: c.action, facts: this.rankings.find(x => actionKey(x.action) === c.id).facts })) });
    }
    selected(cs) { return cs.find(c => actionKey(c.action) === actionKey(this.rankings[0].action))?.id ?? null; }
    gate(ctx, c) {
        if (!this.spec.capabilities.includes(c.action.kind) || !legalPrimitives(ctx.snapshot.state).some(a => actionKey(a) === actionKey(c.action)))
            return { kind: 'deny', reason: 'skill primitive not legal' };
        this.host.chargeSearch(1);
        const after = simulate(ctx.snapshot.state, c.action);
        if (after.attacks > ctx.snapshot.state.attacks || after.energy <= 0)
            return { kind: 'deny', reason: 'known one-step unsafe result' };
        return { kind: 'allow' };
    }
    async execute(req, signal) {
        this.host.budget.check(signal);
        this.host.lease.assert(this.runId);
        const before = this.host.world.snapshot();
        this.host.chargeSearch(1);
        const expected = simulate(before, req.candidate.action);
        const receipt = await this.physical.execute({ ...req, policyVersion: 1 }, signal);
        if (receipt.status === 'applied') {
            if (exactWorldKey(expected) !== exactWorldKey(this.host.world.snapshot()))
                return { status: 'unknown', detail: 'applied receipt disagrees with measured world effect' };
            markApplied(this.frame, req.candidate.action);
        }
        return receipt;
    }
    completion(s) { if (localSuccess(this.spec, this.frame, s.state))
        return 'succeeded'; return failureReason(this.spec, this.frame, s.state) ? 'failed' : 'running'; }
    feedback(b, c, r, a) { return this.physical.feedback(b, c, r, a); }
    parsePolicy(raw) { const r = raw; if (!r || typeof r !== 'object' || Object.keys(r).some(k => !['spec', 'binding'].includes(k)))
        throw Error('skill policy fields'); return { spec: parseSkill(r.spec), binding: parseBinding(r.binding) }; }
    validatePolicy(p) { return JSON.stringify(p.spec) !== JSON.stringify(this.spec) || JSON.stringify(p.binding) !== JSON.stringify(this.binding) ? ['active child contract is immutable'] : []; }
}
class RootDomain {
    host;
    receipts = new Map();
    constructor(host) {
        this.host = host;
    }
    repairContext() { return this.host.recovery.feedback(); }
    assess() { return this.host.pendingHalt ? { kind: 'pause', ...this.host.pendingHalt } : null; }
    afterTransition() { return this.host.pendingHalt ? { kind: 'pause', ...this.host.pendingHalt } : null; }
    async observe(signal) { this.host.budget.check(signal); const state = this.host.world.snapshot(); return { state, revision: String(state.revision), observedAt: Date.now() }; }
    enumerate(ctx) { return this.host.offers(ctx.snapshot.state, ctx.policy.body); }
    gate(ctx, c) {
        if (c.action.kind !== 'callSkill' || c.capability !== 'runtime.skill')
            return { kind: 'deny', reason: 'not an authorized skill call' };
        if (this.host.active)
            return JSON.stringify(c.action) === JSON.stringify(this.host.active.call) ? { kind: 'allow' } : { kind: 'deny', reason: 'child retains execution lease' };
        const s = ctx.policy.body.skills.find(s => s.id === c.action.skillId && s.version === c.action.version);
        return s && applicable(s, c.action.binding, ctx.snapshot.state) ? { kind: 'allow' } : { kind: 'deny', reason: 'skill unavailable or initiation failed' };
    }
    async execute(req, signal) {
        const identity = JSON.stringify(req), old = this.receipts.get(req.idempotencyKey);
        if (old) {
            if (old.request !== identity)
                return { status: 'failed', detail: 'idempotency key collision' };
            return structuredClone(old.receipt);
        }
        if (String(this.host.world.snapshot().revision) !== req.expectedRevision)
            return { status: 'stale', detail: 'world changed before skill dispatch' };
        const receipt = await this.host.runChildQuantum(req.candidate.action, signal);
        this.receipts.set(req.idempotencyKey, { request: identity, receipt });
        return receipt;
    }
    completion(s) { return this.host.domain.completion(s); }
    feedback(b, c, r, a) {
        const q = this.host.quantumProgress;
        return { actionSucceeded: q.physicalActionApplied || q.localSucceeded, progress: q.localGoalProgress || q.localSucceeded,
            metrics: { dispatchCompleted: r.status === 'applied' ? 1 : 0, physicalChanged: a.state.turn > b.state.turn ? 1 : 0,
                physicalProgress: q.physicalActionApplied && q.localGoalProgress ? 1 : 0, localGoalProgress: q.localGoalProgress ? 1 : 0,
                informationProgress: q.informationNovel ? 1 : 0, localSucceeded: q.localSucceeded ? 1 : 0,
                energyDelta: a.state.energy - b.state.energy, deliveredDelta: a.state.delivered - b.state.delivered }, facts: [r.detail] };
    }
    parsePolicy(raw) { return parseRoot(raw); }
    validatePolicy(p) { try {
        parseRoot(p);
        return [];
    }
    catch (e) {
        return [String(e)];
    } }
    validateProposal(p, ctx) {
        if (p.skills.some(s => ctx.policy.body.skills.some(old => old.id === s.id && old.version === s.version && JSON.stringify(old) !== JSON.stringify(s))))
            return ['same skill identity/version cannot be mutated'];
        const added = p.skills.filter(s => !ctx.policy.body.skills.some(x => x.id === s.id && x.version === s.version));
        for (const spec of added) {
            this.host.assertNovel(spec, ctx.snapshot.state, this.host.accessBinding(ctx.snapshot.state));
            if (spec.success !== 'access-open')
                return ['only bounded access compositions may be added'];
            const check = simulateSkill(spec, ctx.snapshot.state, this.host.accessBinding(ctx.snapshot.state), n => this.host.chargeSearch(n));
            this.host.planning.shadowChecks++;
            if (!check.success)
                return [check.reason];
        }
        return [];
    }
}
/** Parent and child are BOTH real GSEngine instances. The parent executes one child
 * quantum per scheduling action; deterministic resume does not reselect the active skill. */
export class SkillSession {
    onEvent;
    options;
    world;
    domain;
    rootEngine;
    budget;
    lease = new ExecutionLease();
    catalogue;
    experience;
    events = [];
    interventions = [];
    initial;
    initialPolicy = structuredClone(INITIAL_POLICY);
    book = new SkillBook();
    planning = emptyStats();
    recovery = new RecoveryJournal();
    pendingHalt = null;
    quantumProgress = { physicalActionApplied: false, localGoalProgress: false, localSucceeded: false, informationNovel: false };
    summaries = [];
    active = null;
    lastResult;
    runId;
    seq = 0;
    childSeq = 0;
    busy = false;
    terminated = false;
    denied = new Set();
    rootRank = new Map();
    rootFacts = new Map();
    cancelled = false;
    mode;
    decisions = [];
    judgmentRuns = [];
    providerReports = [];
    async measured(level, kind, signal, work) {
        this.budget.reserve('providerCalls', 1, signal);
        if (kind === 'S')
            this.planning.providerS++;
        else
            this.planning.providerG++;
        const attempt = this.budget.snapshot().used.providerCalls, start = performance.now();
        try {
            const answer = await work();
            this.providerReports.push({ attempt, level, status: 'returned', usage: answer.usage ?? null, latencyMs: performance.now() - start });
            return answer;
        }
        catch (e) {
            this.providerReports.push({ attempt, level, status: 'rejected-or-failed', usage: e instanceof ProposalRejected ? e.usage ?? null : null, latencyMs: performance.now() - start, error: String(e).slice(0, 300) });
            throw e;
        }
    }
    constructor(initial, mode = 'reactive', onEvent, options = {}) {
        this.onEvent = onEvent;
        this.options = options;
        this.initial = structuredClone(initial);
        this.world = new GameWorld(initial);
        this.domain = new TuanziDomain(this.world);
        this.mode = mode;
        this.runId = `root-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random()}`;
        this.budget = new RootBudget({ actions: 180, cycles: 1200, providerCalls: 240, searchNodes: 150000, skillCalls: 60, durationMs: 86400000, ...options.limits });
        this.catalogue = options.catalogue ?? new ReactiveCatalogue();
        this.experience = options.experience ?? new ExperienceTable(options.experienceMode ?? (mode === 'reactive-off' ? 'off' : mode === 'reactive-record' ? 'record' : 'use'));
        const extras = (options.initialSkills ?? this.catalogue.list().filter(r => r.status === 'measured' && r.spec.success === 'access-open').map(r => r.spec)).map(parseSkill);
        if (extras.some(s => s.success !== 'access-open'))
            throw Error('only registered access skills may extend root');
        const initialPolicy = { id: 'hierarchical-root', version: 1, body: { skills: [...BASE_SKILLS, ...extras], features: [...FEATURE_IDS], weights: { ...DEFAULT_WEIGHTS } } };
        const rootDomain = new RootDomain(this);
        this.rootEngine = new GSEngine({ runId: this.runId, goal: GOAL, initialPolicy, domain: rootDomain, limits: makeLimits(400),
            account: { cycle: () => this.budget.reserve('cycles') },
            rule: (ctx, cs) => { if (!this.active)
                return undefined; this.emit('decision_origin', { source: 'deterministic-resume', level: 'parent', candidateId: cs[0]?.id, snapshotRevision: ctx.snapshot.revision, externalRequests: 0 }); return cs[0]?.id; },
            selector: { evaluate: async (ctx, cs, signal) => {
                    const p = this.parentPacket(ctx.snapshot.state, ctx.policy.body, cs, ctx.policy.version);
                    return this.decide(p, ctx.snapshot.state, cs, signal);
                } },
            arbiter: { decide: (ctx, cs, j) => this.parentRoute(ctx, cs, j) },
            planner: { propose: async (ctx, _reason, signal) => {
                    const s = ctx.snapshot.state, binding = this.accessBinding(s);
                    if (!s.guards.length || !s.berries.length || !s.bag)
                        return { output: { baseVersion: ctx.policy.version, basedOnRevision: ctx.snapshot.revision, body: ctx.policy.body, explanation: '当前技能与已授权生成语法无法继续，交还控制权。' } };
                    let spec;
                    this.planning.searchRuns++;
                    const start = performance.now();
                    this.emit('skill_generation_started', { source: options.providers?.generate ? 'llm' : 'bounded-grammar', binding });
                    if (options.providers?.generate) {
                        const a = await this.measured('skill-generator', 'G', signal, () => options.providers.generate({ state: s, binding, ...(ctx.repairFeedback ? { feedback: ctx.repairFeedback } : {}), ...(ctx.executionFeedback ? { executionFeedback: ctx.executionFeedback } : {}) }, signal));
                        try {
                            spec = parseSkill(a.output);
                            if (spec.success !== 'access-open')
                                throw Error('generator may only add access skill');
                            spec.source = 'llm';
                        }
                        catch (e) {
                            throw new ProposalRejected({ stage: 'skill-schema', reason: String(e) }, a.usage);
                        }
                        this.assertNovel(spec, s, binding);
                        const check = simulateSkill(spec, s, binding, n => this.chargeSearch(n));
                        this.planning.shadowChecks++;
                        this.emit('skill_validation', { specId: spec.id, ...check, final: undefined, actualController: 'NOT_YET_RUN' });
                        if (!check.success)
                            throw new ProposalRejected({ stage: 'local-verification', reason: check.reason, steps: check.steps }, a.usage);
                    }
                    else
                        spec = await synthesizeAccess(s, binding, n => this.chargeSearch(n), signal, data => this.emit('skill_candidate_evaluated', data));
                    this.assertNovel(spec, s, binding);
                    this.planning.searchMs += performance.now() - start;
                    this.planning.source = options.providers?.generate ? 'llm' : 'grammar-search';
                    this.catalogue.trial(spec);
                    this.emit('skill_generated', { spec, status: 'trial', note: 'registered grammar/rules are authored; phase composition is generated', validationScope: 'authored-reference-controller-only', actualController: 'NOT_YET_RUN' });
                    return { output: { baseVersion: ctx.policy.version, basedOnRevision: ctx.snapshot.revision,
                            body: { ...ctx.policy.body, skills: [...ctx.policy.body.skills.filter(x => x.id !== spec.id), spec] }, explanation: '局部技能通过模拟；交付根目标不变，需实际执行验证。' } };
                } }, journal: { append: e => {
                    this.emit('parent_event', { event: e });
                    if (e.type === 'policy_committed')
                        this.emit('hierarchy_policy_committed', e.data);
                    if (['proposal_rejected', 'repair_blocked', 'repair_requested', 'post_transition_route'].includes(e.type))
                        this.emit(e.type, e.data);
                } } });
    }
    get engine() {
        return { currentPolicy: { id: 'hierarchy-display', version: this.rootEngine.currentPolicy.version, body: { mode: 'program',
                    subgoal: this.active ? `${this.active.spec.title} · 阶段 ${this.active.domain.frame.phase + 1} / ${this.active.spec.phases.length}` : '父 G/S：选择局部技能，根目标仍是五颗交付', enabled: [...CAPABILITIES], reserveEnergy: 24 } },
            counters: { ...this.rootEngine.counters, actions: this.budget.snapshot().used.actions, modelCalls: this.budget.snapshot().used.providerCalls } };
    }
    emit(type, data) { const event = { runId: this.runId, seq: ++this.seq, cycle: this.rootEngine?.counters.cycles ?? 0, at: Date.now(), type, data: structuredClone(data) }; this.events.push(event); this.onEvent?.(event); }
    chargeSearch(n) { this.budget.reserve('searchNodes', n); this.planning.expanded += n; }
    accessBinding(s) { const g = s.guards[0]; return { targetId: g?.id ?? '', targetBerryIds: s.berries.filter(b => !g || dist(g.anchor, b) <= 4).map(b => b.id), amount: 0 }; }
    parentRoute(ctx, cs, j) {
        if (j.choice && cs.some(c => c.id === j.choice) && (j.suitability[j.choice] ?? 0) >= .5)
            return { kind: 'execute', candidateId: j.choice };
        const s = ctx.snapshot.state;
        const generationCanHelp = !reachableBerries(s).length && s.guards.length > 0 && s.berries.length > 0 && s.bag > 0 &&
            !cs.some(c => ctx.policy.body.skills.find(x => x.id === c.action.skillId && x.version === c.action.version)?.success === 'access-open');
        if (generationCanHelp)
            return { kind: 'repair', reason: 'no_appropriate_skill' };
        const reason = 'decision_blocked:parent_no_suitable_skill';
        const audit = this.decisions.at(-1);
        const evidence = { kind: 'decision_blocked', level: 'parent', reason, worldRevision: String(s.revision), actualSteps: 0,
            decision: audit ?? null, contextVersion: TASK_CONTEXT_VERSION,
            nextAction: 'Inspect existing candidates and task evidence; no applicable missing contract has been identified. Do not regenerate the same access skill.' };
        this.pendingHalt = { reason, evidence };
        this.emit('decision_blocked', this.pendingHalt);
        return { kind: 'pause', reason };
    }
    controllerKey() { return `${this.options.decision?.backend.id ?? this.options.providers?.identity ?? 'rules/v031'}|${this.options.decision?.strategy ?? 'classic'}|gs/select/v042|${TASK_CONTEXT_VERSION}`; }
    denialKey(s, c) {
        const spec = this.rootEngine.currentPolicy.body.skills.find(x => x.id === c.skillId && x.version === c.version);
        return JSON.stringify([recoveryScope(s, c.binding, this.controllerKey()), spec ? canonicalSkill(spec) : c]);
    }
    assertNovel(spec, s, binding) {
        const prior = this.recovery.repeated(spec, recoveryScope(s, binding, this.controllerKey()));
        if (prior) {
            const evidence = { schema: 'gs/duplicate-repair/v1', priorFailureId: prior.id, priorSkillId: prior.skillId, proposedSkillId: spec.id,
                priorStructureId: prior.structureId, proposedStructureId: structureId(spec), sameStructure: prior.structure === canonicalSkill(spec),
                sameZeroStepFamily: prior.outcome.steps === 0 && prior.family === skillFamily(spec), snapshotRevision: String(s.revision),
                message: 'No new execution evidence or material behavior at this scope. Renaming is not recovery. Inspect the blocked judgment or start an explicit new experiment.' };
            this.pendingHalt = { reason: 'duplicate_repair_no_new_evidence', evidence };
            this.emit('duplicate_repair_blocked', evidence);
            throw new RepairBlocked(this.pendingHalt.reason, evidence);
        }
    }
    diagnostics() {
        return { schema: 'gs/recovery-diagnostics/v1', contextVersion: TASK_CONTEXT_VERSION,
            policyVersion: this.rootEngine.currentPolicy.version, latestFailure: this.recovery.latest(), failureCount: this.recovery.list().length,
            pendingHalt: this.pendingHalt, budgets: { repairs: { used: this.rootEngine.counters.repairs, limit: 3 }, ...this.budget.snapshot() },
            semanticScope: 'Abstention is a decision block, not evidence that the physical skill is impossible. No automatic fallback.' };
    }
    offers(s, p) {
        if (this.active)
            return [{ id: `continue:${this.active.runId}`, description: `继续子 G/S：${this.active.spec.title}`, capability: 'runtime.skill', action: this.active.call, intent: 'special' }];
        this.rootRank.clear();
        this.rootFacts.clear();
        const offers = [];
        const reachable = reachableBerries(s), home = path(s, s.player, s.home)?.length ?? null;
        const add = (spec, binding) => {
            if (!spec || !applicable(spec, binding, s))
                return;
            const call = { kind: 'callSkill', skillId: spec.id, version: spec.version, binding };
            if (this.denied.has(this.denialKey(s, call)) || this.recovery.repeated(spec, recoveryScope(s, binding, this.controllerKey()))) {
                this.emit('candidate_filtered', { reason: 'already-failed-structure-at-identical-evidence', action: call });
                return;
            }
            const id = `${spec.id}:${binding.targetId}:${binding.amount}`;
            const history = this.experience.mode === 'use' ? this.experience.list().find(r => r.key === experienceKey(s, spec)) : undefined;
            const facts = { contract: spec.success, energy: s.energy, bag: s.bag, capacity: s.capacity, delivered: s.delivered, target: s.target, homeSteps: home,
                targetSteps: spec.success === 'acquired-one' ? (reachable.find(x => x.berry.id === binding.targetId)?.route.length ?? null) : null,
                reachableCount: reachable.length, remainingCount: s.berries.length, guardCount: s.guards.length,
                allRemainingGuarded: s.berries.every(b => s.guards.some(g => dist(g.anchor, b) <= 2)), amount: binding.amount,
                history: history ? { n: history.n, successes: history.successes, meanSteps: history.mean.steps, meanAttacks: history.mean.attacks } : null, source: 'registered-world-facts/v1' };
            offers.push({ id, description: `${spec.title}${binding.targetId ? ' · ' + binding.targetId : ''} (${binding.amount})`, capability: 'runtime.skill', action: call, intent: 'special' });
            this.rootFacts.set(id, facts);
            this.rootRank.set(id, parentRule(facts, p.weights));
        };
        const get = (goal) => p.skills.find(x => x.success === goal);
        // Applicability, not preferred timing: all legal consumption/delivery choices stay visible.
        add(get('energy-restored'), { targetId: '', targetBerryIds: [], amount: 0 });
        for (let amount = 1; amount <= s.bag; amount++)
            add(get('deposited'), { targetId: 'home', targetBerryIds: [], amount });
        // Bounded candidate domain, disclosed and identically applied to both selectors.
        const targets = reachable.slice().sort((a, b) => a.berry.id.localeCompare(b.berry.id)).slice(0, 24);
        if (reachable.length > targets.length)
            this.emit('candidate_filtered', { reason: 'canonical-24-target-cap', excluded: reachable.length - targets.length });
        for (const x of targets)
            add(get('acquired-one'), { targetId: x.berry.id, targetBerryIds: [x.berry.id], amount: 1 });
        if (!reachable.length && s.guards.length) {
            const b = this.accessBinding(s);
            for (const spec of p.skills.filter(x => x.success === 'access-open'))
                add(spec, b);
        }
        const ordered = neutralOrder(offers, this.orderSeed(s));
        this.emit('parent_candidates', { candidates: ordered, ranking: Object.fromEntries(this.rootRank), scope: 'applicable-skills/v031', experienceMode: this.experience.mode });
        return ordered;
    }
    orderSeed(s) { return ((this.options.orderSeed ?? 731) + s.turn * 101) >>> 0; }
    parentPacket(s, p, cs, version) {
        return packet({ level: 'parent', goal: GOAL.description, snapshotRevision: String(s.revision), policyVersion: version, orderSeed: this.orderSeed(s), scope: { name: 'applicable-skills/v031', note: 'Registered skills and applicability; all consumption/delivery timings visible. Berry targets capped at 24 by stable ID, failed identical calls withheld. Not a globally complete action space.' }, projection: projectJson(s, p.features, 'skill-choice'), preferences: p.weights, candidates: cs.map(c => ({ id: c.id, description: c.description, action: c.action, facts: this.rootFacts.get(c.id), ...(this.rootFacts.get(c.id)?.history ? { evidence: this.rootFacts.get(c.id).history } : {}) })) });
    }
    async decide(p, _s, cs, signal, spec, binding) {
        if (this.options.decision && !(p.level === 'child' && cs.length === 1))
            return this.decideTasks(p, signal);
        const useProvider = !!this.options.providers?.select && (p.level === 'parent' || cs.length > 1);
        const source = useProvider ? (this.options.providers?.source ?? 'configured-model') : (cs.length === 1 && p.level === 'child' ? 'deterministic-single' : 'authored-rule');
        const start = performance.now();
        this.emit('decision_packet', p);
        try {
            const a = useProvider ? await this.measured(p.level, 'S', signal, () => this.options.providers.select({ level: p.level, goal: p.goal, projection: p.projection, packet: p, ...(spec ? { spec } : {}), ...(binding ? { binding } : {}), candidates: p.candidates }, signal)) : { output: judgment(cs, selectPacket(p)) };
            const audit = { packet: p, source, selectorIdentity: useProvider ? (a.usage?.model ?? this.options.providers?.identity ?? 'configured-provider-unreported') : 'authored-rules/v031', choice: a.output.choice, status: a.output.choice ? 'selected' : 'abstained', latencyMs: performance.now() - start, externalRequests: useProvider ? 1 : 0, questions: useProvider ? cs.length + 1 : 0, judgment: structuredClone(a.output) };
            this.decisions.push(audit);
            this.emit('decision_audit', audit);
            return a;
        }
        catch (e) {
            const audit = { packet: p, source, selectorIdentity: this.options.providers?.identity ?? 'configured-provider-unreported', choice: null, status: 'error', latencyMs: performance.now() - start, externalRequests: useProvider ? 1 : 0, questions: useProvider ? cs.length + 1 : 0, error: String(e).slice(0, 300) };
            this.decisions.push(audit);
            this.emit('decision_audit', audit);
            throw e;
        }
    }
    async decideTasks(p, signal) {
        const d = this.options.decision, start = performance.now();
        p = structuredClone(p);
        p.questionVersion = questionVersionFor(p, d.strategy);
        p.id = evidenceKey({ ...p, id: '' });
        let actualRequests = 0;
        let report;
        this.emit('decision_packet', p);
        try {
            const result = await evaluatePacket(p, d.strategy, d.backend, { signal, timeoutMs: d.timeoutMs ?? 20000, maxRequests: d.maxRequests ?? 96, maxQuestions: d.maxQuestions ?? 128,
                currentKey: () => String(this.world.snapshot().revision) === p.snapshotRevision ? p.id : 'changed',
                charge: n => { this.budget.check(signal); if (n.externalRequests) {
                    this.budget.reserve('providerCalls', n.externalRequests, signal);
                    this.planning.providerS += n.externalRequests;
                    actualRequests += n.externalRequests;
                } },
                onBatch: b => { this.emit('judgment_batch', { ...b, questionStrategy: d.strategy, dispatchStrategy: d.strategy === 'serial' ? 'serial' : 'batch' }); if (b.external)
                    this.providerReports.push({ attempt: this.budget.snapshot().used.providerCalls, level: p.level, status: b.status === 'returned' ? 'returned' : 'rejected-or-failed', usage: b.usage, latencyMs: b.latencyMs, ...(b.error ? { error: b.error } : {}) }); }
            });
            report = result.report;
            const source = d.backend.kind === 'rule' ? 'authored-rule' : d.backend.kind === 'mock' ? 'test-provider' : d.backend.kind === 'jev' ? 'jev' : 'configured-model';
            const a = { packet: p, source, selectorIdentity: [...new Set(report.batches.map(x => x.backend))].join('|') || d.backend.id, choice: result.judgment.choice, status: result.judgment.choice ? 'selected' : 'abstained', latencyMs: performance.now() - start, externalRequests: actualRequests, questions: report.questions, judgment: structuredClone(result.judgment) };
            this.decisions.push(a);
            this.emit('decision_audit', a);
            return { output: result.judgment };
        }
        catch (e) {
            if (e instanceof JudgmentError)
                report = e.report;
            const source = d.backend.kind === 'rule' ? 'authored-rule' : d.backend.kind === 'mock' ? 'test-provider' : d.backend.kind === 'jev' ? 'jev' : 'configured-model';
            const a = { packet: p, source, selectorIdentity: d.backend.id, choice: null, status: 'error', latencyMs: performance.now() - start, externalRequests: actualRequests, questions: report?.questions ?? 0, error: String(e).slice(0, 300) };
            this.decisions.push(a);
            this.emit('decision_audit', a);
            this.emit('judgment_failed', { reason: String(e), snapshotKey: p.id });
            throw e;
        }
        finally {
            if (report) {
                this.judgmentRuns.push(report);
                this.emit('judgment_run', report);
            }
        }
    }
    async runChildQuantum(call, signal) {
        this.budget.check(signal);
        this.quantumProgress = { physicalActionApplied: false, localGoalProgress: false, localSucceeded: false, informationNovel: false };
        if (this.active && JSON.stringify(call) !== JSON.stringify(this.active.call))
            return { status: 'failed', detail: 'another child retains execution lease' };
        if (!this.active) {
            const spec = this.rootEngine.currentPolicy.body.skills.find(s => s.id === call.skillId && s.version === call.version);
            if (!spec)
                return { status: 'failed', detail: 'skill not in current root policy' };
            this.budget.reserve('skillCalls', 1, signal);
            const runId = `${this.runId}/skill-${++this.childSeq}`;
            this.lease.acquire(runId, 1);
            const start = this.world.snapshot(), domain = new SkillDomain(this, spec, call.binding, runId), resources = this.budget.snapshot().used;
            const key = experienceKey(start, spec);
            const initialPolicy = { id: spec.id, version: spec.version, body: { spec, binding: call.binding } };
            const child = new GSEngine({ runId, goal: { id: spec.success, description: localGoalText(spec), verifierId: `registered:${spec.success}` }, initialPolicy, domain, limits: makeLimits(spec.maxSteps),
                account: { cycle: () => this.budget.reserve('cycles'), action: () => this.budget.reserve('actions') },
                selector: { evaluate: async (ctx, cs, activeSignal) => {
                        return this.decide(domain.decisionPacket(ctx, cs), ctx.snapshot.state, cs, activeSignal, spec, call.binding);
                    } }, arbiter: { decide: (_ctx, _cs, j) => j.choice ? { kind: 'execute', candidateId: j.choice } : { kind: 'pause', reason: 'decision_blocked:no_local_suitable_action' } },
                planner: { propose: async (ctx) => ({ output: { baseVersion: ctx.policy.version, basedOnRevision: ctx.snapshot.revision, body: ctx.policy.body, explanation: '局部技能无法继续，将失败证据交还父层；不扩充子预算。' } }) },
                journal: { append: e => { this.emit('child_event', { parentRunId: this.runId, skillRunId: runId, event: e }); if (['observed', 'candidates', 'selector_requested', 'selector_answered', 'decision', 'transition', 'stale_result_discarded'].includes(e.type))
                        this.emit(e.type, e.data); } }
            });
            this.active = { call: structuredClone(call), spec, engine: child, domain, runId, start, interventionCount: this.interventions.length, resources, key, decisionStart: this.decisions.length };
            if (spec.source !== 'authored' && this.catalogue.list().some(r => r.spec.id === spec.id && r.status === 'measured')) {
                this.planning.skillHits++;
                this.emit('reactive_skill_reused', { id: spec.id, version: spec.version, binding: call.binding, note: 'parameter rebind, not exact coordinate replay' });
            }
            this.emit('skill_started', { runId, parentRunId: this.runId, spec, binding: call.binding, depth: 1 });
        }
        const active = this.active;
        this.lease.assert(active.runId);
        const result = await active.engine.step(signal);
        if (result.kind === 'executed') {
            this.quantumProgress.physicalActionApplied = result.feedback.actionSucceeded;
            this.quantumProgress.localGoalProgress = result.feedback.progress;
        }
        this.options.afterChildStep?.(this);
        if (['done', 'paused', 'fault', 'stopped'].includes(result.kind)) {
            const success = result.kind === 'done' && result.outcome === 'succeeded';
            const infrastructural = result.kind === 'fault' || (result.kind === 'paused' && 'reason' in result && /unknown|timeout|cancel|provider/i.test(result.reason)) || (result.kind === 'stopped' && 'reason' in result && /root_budget|deadline/.test(result.reason));
            this.finishChild(success, result.kind === 'done' ? (success ? 'succeeded' : failureReason(active.spec, active.domain.frame, this.world.snapshot()) ?? 'local_goal_failed') : ('reason' in result ? result.reason : result.kind), infrastructural);
            if (infrastructural)
                return { status: 'unknown', detail: `child infrastructure stopped: ${'reason' in result ? result.reason : 'failure'}` };
            if (result.kind === 'paused' && 'reason' in result && result.reason.includes('unknown'))
                return { status: 'unknown', detail: 'child outcome unknown; root must pause' };
            if (this.cancelled)
                return { status: 'unknown', detail: 'cancelled while child executing; reconcile recorded state' };
            return { status: 'applied', detail: success ? 'local skill succeeded; return to parent' : 'local skill ended without success; return evidence to parent' };
        }
        return result.kind === 'stale' ? { status: 'stale', detail: 'child observation became stale' } : { status: 'applied', detail: 'one child G/S quantum executed; lease retained' };
    }
    finishChild(success, reason, interrupted = false) {
        const a = this.active;
        if (!a)
            return;
        const s = this.world.snapshot(), resources = this.budget.snapshot().used, external = this.interventions.length > a.interventionCount;
        const outcome = { success, steps: s.turn - a.start.turn, energyDelta: s.energy - a.start.energy, attacks: s.attacks - a.start.attacks,
            providerCalls: resources.providerCalls - a.resources.providerCalls, searchNodes: resources.searchNodes - a.resources.searchNodes };
        const decisionBlocked = reason.startsWith('decision_blocked:') || reason === 'no_local_suitable_action';
        const status = external ? 'external_change' : interrupted || this.cancelled ? 'interrupted' : decisionBlocked ? 'decision_blocked' : success ? 'success' : 'failed';
        const summary = { selectorIdentity: ([...new Set(this.decisions.slice(a.decisionStart).filter(x => x.packet.level === 'child').map(x => x.selectorIdentity))].join('|') || 'no-child-judgment'), questionVersion: ([...new Set(this.decisions.slice(a.decisionStart).filter(x => x.packet.level === 'child').map(x => x.packet.questionVersion))].join('|') || 'no-child-judgment'), factsVersion: FACTS_VERSION, validationScope: 'actual-controller-run', runId: a.runId, parentRunId: this.runId, skillId: a.spec.id, version: a.spec.version, source: a.spec.source, binding: a.call.binding,
            status, reason, localSucceeded: success, rootSucceeded: s.delivered >= s.target && s.energy > 0, start: a.start, final: s, outcome, phases: a.domain.frame.transitions,
            modelUse: this.options.providers?.select || (this.options.decision && !['rule', 'mock'].includes(this.options.decision.backend.kind)) ? 'provider' : 'offline', experienceUsed: this.experience.mode === 'use' };
        this.summaries.push(summary);
        if (!decisionBlocked)
            this.catalogue.result(a.spec, success, s.scenario, external || interrupted || this.cancelled, { selector: summary.selectorIdentity, questionVersion: summary.questionVersion, factsVersion: FACTS_VERSION, worldKey: exactWorldKey(a.start), scope: 'actual-controller-run' });
        if (!decisionBlocked && !external && !interrupted && !this.cancelled && !/root_budget|root_deadline|action_budget_exhausted|cycle_budget_exhausted|model_call_budget_exhausted/.test(reason) && !reason.includes('unknown') && !reason.includes('timeout'))
            this.experience.observe(a.key, outcome, reason);
        this.quantumProgress.localSucceeded = success;
        if (!success) {
            const audit = this.decisions.slice(a.decisionStart).filter(x => x.packet.level === 'child').at(-1) ?? null;
            const kind = external ? 'external_change' : interrupted || this.cancelled ? 'infrastructure' : decisionBlocked ? 'decision_blocked' : reason.includes('no_local') || reason.includes('phases_exhausted') ? 'structure_gap' : 'execution_failed';
            const failure = this.recovery.record({ kind, reason, runId: a.runId, skillId: a.spec.id, skillVersion: a.spec.version,
                structureId: structureId(a.spec), structure: canonicalSkill(a.spec), family: skillFamily(a.spec),
                scope: recoveryScope(s, a.call.binding, this.controllerKey()), spec: a.spec, binding: a.call.binding,
                phase: { index: a.domain.frame.phase, rule: a.spec.phases[a.domain.frame.phase]?.rule ?? 'done' },
                world: { startRevision: String(a.start.revision), revision: String(s.revision), turn: s.turn, key: exactWorldKey(s) },
                outcome: { steps: outcome.steps, energyDelta: outcome.energyDelta, deliveredDelta: s.delivered - a.start.delivered, dispatchCompleted: !interrupted },
                decision: audit, controller: this.controllerKey(), contextVersion: TASK_CONTEXT_VERSION,
                route: kind === 'decision_blocked' ? 'pause-and-inspect' : kind === 'infrastructure' ? 'reconcile-execution' : kind === 'external_change' ? 'reobserve' : 'repair-skill' });
            this.quantumProgress.informationNovel = failure.informationNovel;
            this.emit('execution_failure_recorded', failure);
            if (kind === 'decision_blocked') {
                this.pendingHalt = { reason, evidence: { failureId: failure.id, kind, skillId: a.spec.id, structureId: failure.structureId, phase: failure.phase,
                        actualSteps: outcome.steps, contextVersion: TASK_CONTEXT_VERSION, nextAction: 'Inspect the packet and abstention; fork an explicit trial after changing evidence or controller. No automatic skill regeneration.' } };
                this.emit('decision_blocked', this.pendingHalt);
            }
            if (!external && !interrupted && !this.cancelled)
                this.denied.add(this.denialKey(s, a.call));
        }
        this.lease.release(a.runId);
        this.active = null;
        this.emit('skill_summary', summary);
    }
    async step() {
        if (this.busy)
            throw Error('concurrent_session_step');
        if (this.finished)
            return this.lastResult;
        this.busy = true;
        try {
            this.lastResult = await this.rootEngine.step();
            if (['done', 'fault', 'paused', 'stopped'].includes(this.lastResult.kind)) {
                if (this.active)
                    this.finishChild(false, 'root_ended', true);
                this.terminated = true;
                this.emit('run_finished', this.lastResult);
            }
            return this.lastResult;
        }
        finally {
            this.busy = false;
        }
    }
    get finished() { return this.terminated; }
    cancel() { this.cancelled = true; this.rootEngine.cancel(); this.active?.engine.cancel(); if (!this.busy)
        this.finishChild(false, 'cancelled', true); }
    edit(tool, p) { const result = this.world.edit(tool, p); if (result.ok) {
        this.interventions.push({ at: Date.now(), tool, point: structuredClone(p), after: this.world.snapshot(), message: result.message });
        this.emit('external_intervention', { tool, point: p });
    } return result; }
    export() {
        return { format: 'tuanzi-gs-trace/v3', createdAt: new Date().toISOString(), mode: this.mode, note: 'One-level real GSEngine hierarchy; authored primitive rules + bounded grammar composition. Live performance only when explicitly configured.',
            initialWorld: this.initial, initialPolicy: this.initialPolicy, finalWorld: this.world.snapshot(), policy: this.engine.currentPolicy, counters: this.engine.counters, planning: structuredClone(this.planning), usage: this.providerReports.map(x => x.usage).filter(Boolean), rejectedUsage: this.events.filter(e => e.type === 'proposal_rejected').map(e => e.data.usage).filter(Boolean), result: this.lastResult ?? null, events: this.events, interventions: this.interventions,
            decisionAudit: { schema: 'gs/decision-audit/v1', records: structuredClone(this.decisions), orderSeed: this.options.orderSeed ?? 731, referenceValidation: 'authored-controller-only', judgmentRuns: structuredClone(this.judgmentRuns) }, hierarchy: { summaries: structuredClone(this.summaries), active: this.active ? { runId: this.active.runId, spec: this.active.spec, binding: this.active.call.binding, phase: this.active.domain.frame.phase } : null, catalogue: this.catalogue.export(), experience: this.experience.export(), budget: this.budget.snapshot(), providers: structuredClone(this.providerReports), recovery: this.diagnostics(), failures: this.recovery.list() } };
    }
}
function judgment(cs, id) {
    const probabilities = {}, suitability = {};
    for (const c of cs) {
        probabilities[c.id] = c.id === id ? 1 : 0;
        suitability[c.id] = c.id === id ? 1 : 0;
    }
    return { choice: id, confidence: 1, probabilities, suitability, abstainProbability: id ? 0 : 1 };
}

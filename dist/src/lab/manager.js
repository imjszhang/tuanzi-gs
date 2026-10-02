/** Shared, in-process experiment control. Transport and persistence live outside this module.
 * Pausing stops at a decision boundary; cancelling signals in-flight work and never replays it.
 */
import { createFixture, TASKS } from '../decision/experiment.js';
import { createWorld, GameWorld } from '../game/world.js';
import { createHosted } from './session.js';
import { assessDeadlock, DEADLOCK_POLICY } from './deadlock.js';
import { TERMINAL, LabError, fail, parseConfig, parseActor, parseCommand, identifier, stable } from './types.js';
const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
function equalRequest(map, key, signature, work) {
    const old = map.get(key);
    if (old) {
        if (old.signature !== signature)
            return Promise.reject(new LabError('IDEMPOTENCY_CONFLICT', 'Same id must have the same request', 409));
        return old.promise;
    }
    // Store before invoking work: re-entrant/retried operations cannot execute twice.
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    map.set(key, { signature, promise });
    try {
        work().then(resolve, reject);
    }
    catch (e) {
        reject(e);
    }
    return promise;
}
export class LabRun {
    providers;
    runId;
    createdAt = now();
    events = [];
    checkpoints = new Map();
    initial;
    config;
    lineage;
    ledger = { requests: 0, externalRequests: 0, questions: 0, rows: [] };
    holder;
    preWorld;
    abort = new AbortController();
    listeners = new Set();
    commands = new Map();
    timer;
    deadlineTimer;
    desired = false;
    seq = 0;
    pendingStop = null;
    eventBudget = false;
    seed;
    script = [];
    editLog = [];
    referee;
    owner;
    controlVersion = 0;
    status = 'ready';
    reason = null;
    busy = false;
    startedAt = null;
    endedAt = null;
    startedClock = 0;
    engineWorkMs = 0;
    decisionSteps = 0;
    constructor(config, owner, providers, initial, seed = {}, lineage = null) {
        this.providers = providers;
        this.runId = id('run');
        this.config = structuredClone(config);
        this.owner = structuredClone(owner);
        this.seed = structuredClone(seed);
        this.lineage = structuredClone(lineage);
        this.initial = structuredClone(initial ?? (config.kind === 'judgment' ? createFixture(config.task) : createWorld(config.scenario)));
        this.preWorld = new GameWorld(this.initial);
        this.script = config.interventions.map(spec => ({ spec: structuredClone(spec), origin: 'config', applied: false }));
        this.checkpoints.set('initial', { id: 'initial', label: 'Initial state', at: this.createdAt, world: structuredClone(this.initial), memory: structuredClone(seed), sourceRunId: this.runId, sourceSeq: 0, decisionSteps: 0, note: 'A fork is a NEW trial with fresh controller phases and budgets, not continuation.' });
        this.emit('run_created', { config: this.config, owner: this.owner, lineage, ...(this.usesReferee ? { deadlockPolicy: DEADLOCK_POLICY, observerOnly: true } : {}) });
        this.publish();
    }
    get terminal() { return TERMINAL.has(this.status); }
    get world() { return this.holder?.world ?? this.preWorld; }
    get usesReferee() { return this.config.kind === 'game' && this.config.controller === 'adaptive'; }
    get refereeFailed() { return this.referee?.verdict === 'proven-deadlock'; }
    emit(type, data) {
        if (this.events.length >= 30000 && !['state', 'run_ended', 'event_limit'].includes(type)) {
            this.eventBudget = true;
            return;
        }
        const e = { runId: this.runId, seq: ++this.seq, at: now(), type, data: structuredClone(data) };
        this.events.push(e);
        for (const fn of this.listeners)
            try {
                fn(structuredClone(e));
            }
            catch { /* observers cannot steer or fail the run */ }
    }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    onEngine = (e) => { this.emit('engine', { sourceRunId: e.runId, event: e }); if ((e.type === 's_retry' || this.config.controller === 'adaptive' && (['initialization_started', 'initialization_ready', 'initialization_failed', 'initialization_skipped', 'initialization_invalidated', 's_requested', 'g_requested', 'adaptation_accounting', 'adaptation_rejected', 'proposal_warnings', 'adaptation_committed', 'meta_enter', 'meta_return', 'subproblem_enter', 'subproblem_return', 'same_layer_resumed'].includes(e.type) || (e.type === 'g_stream' && e.data.kind === 'status' && ['queued', 'complete', 'invalid', 'aborted', 'failed', 'unavailable'].includes(e.data.status)))) && this.holder)
        this.publish(); };
    view() { const world = this.world.snapshot(), detail = this.holder?.inspect() ?? { lastDecision: null, activeSkill: null, lastSkillResult: null }; return structuredClone({ schema: 'gs/lab-state/v1', version: '0.5.6', runId: this.runId, viewerPath: `/lab?run=${this.runId}`, config: this.config, status: this.status, reason: this.reason, owner: this.owner, controlVersion: this.controlVersion, lastSeq: this.seq, busy: this.busy, createdAt: this.createdAt, startedAt: this.startedAt, endedAt: this.endedAt, elapsedMs: this.startedAt ? (this.endedAt ? Date.parse(this.endedAt) - Date.parse(this.startedAt) : Date.now() - Date.parse(this.startedAt)) : 0, engineWorkMs: this.engineWorkMs, world, worldRevision: String(world.revision), physicalActions: world.turn - this.initial.turn, decisionSteps: this.decisionSteps, requests: this.ledger.requests, externalRequests: this.ledger.externalRequests, questions: this.ledger.questions, ...detail, ...(this.referee ? { referee: this.referee } : {}), ...(this.refereeFailed ? { activeSkill: null } : {}), outcome: this.refereeFailed ? { kind: 'done', outcome: 'failed', reason: `deadlock_proven:${this.referee.reason}`, source: 'environment-referee' } : this.holder?.lastResult ?? null, interventions: this.editLog, lineage: this.lineage, readOnly: false }); }
    publish() { const state = this.view(); state.lastSeq = this.seq + 1; this.emit('state', state); }
    clearTimer() { if (this.timer !== undefined)
        clearTimeout(this.timer); this.timer = undefined; }
    initialize() {
        if (this.holder)
            return;
        this.startedAt = now();
        this.startedClock = performance.now();
        this.holder = createHosted(this.config, this.preWorld.snapshot(), this.onEngine, this.ledger, this.abort.signal, this.providers, this.seed);
        this.deadlineTimer = setTimeout(() => { if (this.terminal)
            return; this.requestStop('stopped', 'wall_clock_deadline'); }, this.config.deadlineMs);
        this.applyScheduled();
    }
    requestStop(status, reason) { this.desired = false; this.clearTimer(); this.pendingStop = { status, reason }; this.abort.abort(new Error(reason)); this.holder?.cancel(); if (this.busy) {
        this.status = 'cancelling';
        this.reason = reason;
        this.publish();
    }
    else
        this.end(status, reason); }
    end(status, reason) { if (this.endedAt)
        return; this.desired = false; this.clearTimer(); if (this.deadlineTimer !== undefined)
        clearTimeout(this.deadlineTimer); this.status = status; this.reason = reason; this.endedAt = now(); this.emit('run_ended', { status, reason, actualEngineResult: this.holder?.lastResult ?? null }); this.publish(); }
    applyScheduled() { const count = this.world.snapshot().turn - this.initial.turn; for (const item of this.script) {
        if (item.applied || item.spec.afterAction > count)
            continue;
        item.applied = true;
        const result = this.holder ? this.holder.edit(item.spec.tool, item.spec.point) : this.preWorld.edit(item.spec.tool, item.spec.point);
        const entry = { origin: item.origin, scheduledAfterAction: item.spec.afterAction, actualAfterAction: count, ...item.spec, result, at: now() };
        this.editLog.push(entry);
        this.emit('intervention', entry);
    } }
    /** Host-only terminal evidence. Never sent to the controller, its feedback or memory. */
    checkDeadlock() {
        if (!this.usesReferee || this.pendingStop || this.holder?.finished)
            return;
        const next = assessDeadlock(this.world.snapshot(), { pendingInterventions: this.script.some(item => !item.applied) });
        const changed = stable(next) !== stable(this.referee ?? null);
        this.referee = next;
        if (changed)
            this.emit('deadlock_referee', { assessment: next });
    }
    enqueue() { if (!this.desired || this.terminal || this.timer !== undefined || this.busy)
        return; this.timer = setTimeout(() => { this.timer = undefined; void this.quantum().catch(e => this.end('fault', String(e))); }, 0); }
    async quantum() {
        if (this.busy)
            return fail('RUN_BUSY', 'A decision is already in flight', 409);
        if (this.terminal)
            return;
        this.initialize();
        this.busy = true;
        this.status = this.desired ? 'running' : 'stepping';
        this.publish();
        const at = performance.now();
        try {
            this.checkDeadlock();
            if (this.refereeFailed)
                return;
            if (this.decisionSteps >= this.config.maxSteps || this.world.snapshot().turn - this.initial.turn >= this.config.maxActions) {
                this.holder.cancel();
                this.pendingStop = { status: 'stopped', reason: 'host_step_or_action_budget' };
                return;
            }
            this.decisionSteps++;
            await this.holder.step();
            if (!this.holder.finished && !this.pendingStop) {
                this.applyScheduled();
                this.checkDeadlock();
            }
        }
        catch (e) {
            this.pendingStop ??= { status: 'fault', reason: String(e).slice(0, 600) };
        }
        finally {
            this.engineWorkMs += performance.now() - at;
            this.busy = false;
            if (this.pendingStop)
                this.end(this.pendingStop.status, this.pendingStop.reason);
            else if (this.refereeFailed)
                this.end('failed', `deadlock_proven:${this.referee.reason}`);
            else if (this.holder.finished) {
                const result = this.holder.lastResult;
                this.end(result.kind === 'done' ? result.outcome : result.kind === 'paused' ? 'blocked' : result.kind === 'fault' ? 'fault' : 'stopped', 'reason' in result ? result.reason : null);
            }
            else if (this.eventBudget) {
                this.holder.cancel();
                this.end('stopped', 'event_budget_exhausted');
            }
            else {
                this.status = this.desired ? 'running' : 'paused';
                this.reason = null;
                this.publish();
                this.enqueue();
            }
        }
    }
    async command(raw) {
        const c = parseCommand(raw), signature = stable(c);
        const replayed = this.commands.has(c.commandId);
        if (this.commands.size >= 2000 && !replayed)
            fail('COMMAND_LIMIT', 'Create a new run', 429);
        const result = await equalRequest(this.commands, c.commandId, signature, async () => {
            if (c.expectedControlVersion !== this.controlVersion)
                fail('STALE_CONTROL', `Expected ${this.controlVersion}`, 409);
            if (c.action !== 'takeover' && c.actor.id !== this.owner.id)
                fail('NOT_CONTROLLER', 'Take control explicitly before writing', 409);
            if (this.terminal && c.action !== 'checkpoint')
                fail('RUN_TERMINAL', 'Terminal/blocked engine runs cannot be resumed; fork a new trial', 409);
            if (!['pause', 'cancel', 'takeover'].includes(c.action) && (this.busy || this.desired))
                fail('RUN_BUSY', 'Pause and wait for the current quantum first', 409);
            if (c.action === 'intervene' && c.expectedWorldRevision !== String(this.world.snapshot().revision))
                fail('STALE_WORLD', 'Re-read the state before editing', 409);
            if (c.action === 'schedule' && c.afterAction <= this.world.snapshot().turn - this.initial.turn)
                fail('INVALID_TRIGGER', 'Schedule after a future physical action');
            if (c.action === 'checkpoint' && this.checkpoints.size >= 64)
                fail('CHECKPOINT_LIMIT');
            if (c.action === 'schedule' && this.script.length >= 64)
                fail('INTERVENTION_LIMIT');
            this.controlVersion++;
            this.emit('command', { action: c.action, commandId: c.commandId, actor: c.actor, controlVersion: this.controlVersion });
            let checkpointId;
            switch (c.action) {
                case 'start':
                    this.desired = true;
                    this.status = 'running';
                    this.reason = null;
                    this.enqueue();
                    break;
                case 'step':
                    await this.quantum();
                    break;
                case 'pause':
                    this.desired = false;
                    this.clearTimer();
                    this.status = this.busy ? 'pausing' : 'paused';
                    this.reason = 'operator_pause_at_boundary';
                    break;
                case 'cancel':
                    this.requestStop('cancelled', 'operator_cancel');
                    break;
                case 'takeover': {
                    const old = this.owner;
                    this.owner = structuredClone(c.actor);
                    this.desired = false;
                    this.clearTimer();
                    this.status = this.busy ? 'pausing' : 'paused';
                    this.reason = 'controller_changed';
                    this.emit('control_transferred', { from: old, to: this.owner, semantics: 'current quantum may finish; next quantum requires new owner' });
                    break;
                }
                case 'intervene': {
                    const r = this.holder ? this.holder.edit(c.tool, c.point) : this.preWorld.edit(c.tool, c.point);
                    this.referee = undefined;
                    const entry = { origin: 'interactive', actor: c.actor, afterAction: this.world.snapshot().turn - this.initial.turn, tool: c.tool, point: c.point, result: r, at: now() };
                    this.editLog.push(entry);
                    this.emit('intervention', entry);
                    break;
                }
                case 'schedule':
                    this.script.push({ spec: { afterAction: c.afterAction, tool: c.tool, point: c.point }, origin: 'scheduled-after-create', applied: false });
                    this.referee = undefined;
                    this.emit('intervention_scheduled', { actor: c.actor, afterAction: c.afterAction, tool: c.tool, point: c.point });
                    break;
                case 'checkpoint': {
                    checkpointId = id('cp');
                    const cp = { id: checkpointId, label: c.label ?? 'Checkpoint', at: now(), world: this.world.snapshot(), memory: this.holder?.memory() ?? structuredClone(this.seed), sourceRunId: this.runId, sourceSeq: this.seq, decisionSteps: this.decisionSteps, note: 'Immutable snapshot; forks reset phases and counters, not a continuation.' };
                    this.checkpoints.set(checkpointId, cp);
                    this.emit('checkpoint_created', { id: checkpointId, label: cp.label });
                    break;
                }
            }
            this.publish();
            return { commandId: c.commandId, accepted: true, replayed: false, state: this.view(), ...(checkpointId ? { checkpointId } : {}) };
        });
        return structuredClone({ ...result, replayed });
    }
    getCheckpoint(checkpointId) { const cp = this.checkpoints.get(checkpointId); if (!cp)
        return fail('CHECKPOINT_NOT_FOUND', 'Unknown checkpoint', 404); return structuredClone(cp); }
    export() { return { schema: 'gs/lab-export/v1', version: '0.5.6', state: this.view(), initial: structuredClone(this.initial), config: structuredClone(this.config), lineage: structuredClone(this.lineage), controls: this.events.filter(e => e.type === 'command' || e.type === 'control_transferred'), events: structuredClone(this.events), checkpoints: [...this.checkpoints.values()].map(c => structuredClone(c)), script: structuredClone(this.script), ledger: structuredClone(this.ledger), trace: this.holder?.export() ?? null, evaluation: { live: this.config.backend !== 'rule' || this.config.generator === 'llm' ? 'REQUESTED' : 'NOT_RUN', hasInterventions: this.editLog.length > 0, interactiveControl: this.events.some(e => e.type === 'control_transferred') || this.editLog.some((x) => x.origin !== 'config'), deadlineIncludesOperatorPauses: true, ...(this.usesReferee ? { deadlockPolicy: DEADLOCK_POLICY, referee: structuredClone(this.referee ?? null) } : {}), note: 'Host clocks include pauses after first step. UI replay speed never delays execution. External Agent controls experiments, not action choices. Host referee verdicts do not modify raw controller results or self-memory.' } }; }
    shutdown() { if (!this.terminal)
        this.requestStop('cancelled', 'service_shutdown'); }
}
export class ExperimentManager {
    providers;
    maxRuns;
    runs = new Map();
    createRequests = new Map();
    forks = new Map();
    constructor(providers, maxRuns = 32) {
        this.providers = providers;
        this.maxRuns = maxRuns;
    }
    capabilities() { return { schema: 'gs/lab-capabilities/v1', version: '0.5.6', kinds: ['judgment', 'game'], tasks: TASKS, scenarios: ['meadow', 'detour', 'guarded', 'remix'], controllers: ['adaptive', 'hierarchy', 'program', 'rules'], strategies: ['direct', 'batch', 'serial', 'dependent'], backends: { rule: { ready: true }, jev: { ready: this.providers?.ready('jev') ?? false }, llm: { ready: this.providers?.ready('llm') ?? false } }, commands: ['start', 'step', 'pause', 'cancel', 'takeover', 'intervene', 'schedule', 'checkpoint'], limits: { maxRuns: this.maxRuns, maxRequests: 512, maxQuestions: 8192, maxActions: 180, maxSteps: 1000, maxSearchNodes: 500000, deadlineMs: 3600000, maxGCalls: 256, gTimeoutMs: 3600000, maxDepth: 3, maxRevisions: 6, maxFormatRepairs: 4, jevMaxRetries: 5, jevRetryBaseMs: 10000, jevRetryMaxMs: 30000, jevAttemptTimeoutMs: 25000 }, defaults: parseConfig({ kind: 'game' }), deadlockReferee: { policy: DEADLOCK_POLICY, scope: 'game/adaptive host boundaries', observerOnly: true, modelFeedback: false, complete: false, event: 'deadlock_referee' }, informationPolicy: { adaptive: 'no-reference/v05', referenceControllers: ['hierarchy', 'program', 'rules'], referenceMode: 'offline-only; may contain authored tactics', allowSolverFeedback: false, allowOptimizedBinding: false, allowLegacyMemory: false }, transportRetry: { provider: 'jev', extraAttempts: 2, semanticNoneRetried: false, perAttemptLedger: true, worldActionsRetried: false, event: 's_retry' }, generationStream: { event: 'g_stream', schema: 'gs/g-stream/v1', channels: ['reasoning', 'content'], previewOnly: true, partialExecution: false, history: 'shared event sequence; replay by prefix' }, semantics: { depth: 'v054: maxDepth limits explicit child nesting (0 disables children), not same-layer G updates; local child exhaustion returns evidence to its parent', candidateScope: 'null IDs: dynamic legal kinds; explicit IDs: persistent stage or revision-bound snapshot; never silent widening', initialization: 'adaptive new runs: G reviews the permitted starting environment before action-level S; create/read/reconnect make no calls; forks reinitialize; costs share root budgets', pause: 'between decision quanta; not a rollback', cancel: 'cooperative; unknown outcomes are not retried', fork: 'new trial, never transparent continuation', clock: 'wall clock starts at first step; includes operator pause', recovery: 'v05 autonomous: S abstention or measured stagnation invokes G; G reframes context/options; same-layer provisional installation; explicit read-only child problems return to parent under shared budgets; equivalent decision interfaces rejected', auth: 'one trusted local-user token; actor IDs are provenance/coordination, not separate security principals', persistence: 'live state in process; completed exports may be archived by host; no active crash recovery' } }; }
    get(runId) { const run = this.runs.get(identifier(runId, 'runId')); if (!run)
        return fail('RUN_NOT_FOUND', 'Run not in this service process', 404); return run; }
    async create(raw) { if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return fail('INVALID_OBJECT'); const r = raw; if (Object.keys(r).some(k => !['requestId', 'config', 'actor'].includes(k)))
        fail('UNKNOWN_FIELD'); const key = identifier(r.requestId, 'requestId'); const c = parseConfig(r.config), actor = parseActor(r.actor); return equalRequest(this.createRequests, key, stable({ c, actor }), async () => this.insert(c, actor).view()); }
    insert(c, actor, initial, seed, lineage) { if (this.runs.size >= this.maxRuns)
        fail('RUN_CAPACITY', 'Export then restart service; active runs are never silently evicted', 429); if (c.backend !== 'rule' && !this.providers?.ready(c.backend))
        fail('PROVIDER_NOT_CONFIGURED', `${c.backend} is not configured`, 503); if (c.generator === 'llm' && (!this.providers?.ready('llm') || !(c.controller === 'adaptive' ? this.providers.adapt : this.providers.generate)))
        fail('PROVIDER_NOT_CONFIGURED', 'Generator not configured', 503); const run = new LabRun(c, actor, this.providers, initial, seed, lineage); this.runs.set(run.runId, run); return run; }
    async fork(parentId, raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return fail('INVALID_OBJECT');
        const r = raw;
        if (Object.keys(r).some(k => !['requestId', 'actor', 'checkpointId', 'config', 'memory'].includes(k)))
            fail('UNKNOWN_FIELD');
        const key = identifier(r.requestId), actor = parseActor(r.actor), parent = this.get(parentId), cp = parent.getCheckpoint(identifier(r.checkpointId ?? 'initial'));
        const memory = r.memory ?? 'none';
        if (!['none', 'inherit'].includes(String(memory)))
            fail('INVALID_MEMORY');
        const overrides = r.config ?? {};
        if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))
            fail('INVALID_CONFIG');
        const c = parseConfig({ ...parent.config, ...overrides });
        if ((c.backend !== 'rule' || c.generator === 'llm') && (overrides.allowLive !== true || !Object.hasOwn(overrides, 'maxRequests')))
            fail('LIVE_FORK_AUTHORIZATION', 'Each live fork needs explicit allowLive and maxRequests');
        if (c.kind !== parent.config.kind || c.task !== parent.config.task || c.scenario !== parent.config.scenario)
            fail('FORK_TASK_IMMUTABLE', 'Create a new experiment to change kind/task/scenario');
        if (memory === 'inherit' && (c.controller === 'adaptive') !== (parent.config.controller === 'adaptive'))
            fail('MEMORY_LANE_MISMATCH', 'Reference and autonomous memories cannot cross lanes');
        return equalRequest(this.forks, key, stable({ parentId, ...r }), async () => this.insert(c, actor, cp.world, memory === 'inherit' ? cp.memory : {}, { parentRunId: parentId, checkpointId: cp.id, sourceSeq: cp.sourceSeq, memory, independentSample: false, historyInherited: memory === 'inherit', freshBudgets: true, resetControllerPhases: true }).view());
    }
    close() { for (const run of this.runs.values())
        run.shutdown(); }
}

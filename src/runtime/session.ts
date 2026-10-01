import { GSEngine } from '../../vendor/gs-engine-ts/src/engine.js';
import type { EngineEvent, Policy, StepResult, Selector } from '../../vendor/gs-engine-ts/src/types.js';
import { TuanziDomain } from '../game/domain.js';
import { GameWorld } from '../game/world.js';
import { GOAL, INITIAL_POLICY, CAPABILITIES, clone } from '../game/types.js';
import type { GameState, GameAction, GamePolicy, EditTool, Point } from '../game/types.js';
import { HeuristicSelector, TemplatePlanner, GameArbiter, RemoteSelector, RemotePlanner, isProgramMode, isRemoteMode } from './controllers.js';
import type { RunMode } from './controllers.js';
import { ProgramPlanner, ProgramSelector, emptyStats } from '../planning/controller.js';
import type { LabEvent } from '../planning/controller.js';
import { TrialEvidence } from '../planning/evidence.js';
import type { Transition, Planner } from '../../vendor/gs-engine-ts/src/types.js';
import { SkillBook } from '../planning/book.js';
export type SessionOptions = {
    book?: SkillBook;
    maxSearchExpanded?: number;
    planner?: Planner<GameState,GameAction,GamePolicy>;
    selector?: Selector<GameState, GameAction, GamePolicy>;
};
export class GameSession {
    readonly world: GameWorld;
    readonly domain: TuanziDomain;
    readonly engine: GSEngine<GameState, GameAction, GamePolicy>;
    readonly events: EngineEvent[] = [];
    readonly interventions: {
        at: number;
        tool: EditTool;
        point: Point;
        after: GameState;
        message: string;
    }[] = [];
    readonly initial: GameState;
    readonly initialPolicy: Policy<GamePolicy>;
    readonly mode: RunMode;
    readonly book: SkillBook;
    readonly planning = emptyStats();
    private activeTrial: {
        id: string;
        interventions: number;
        evidence: TrialEvidence;
    } | null = null;
    private accounted = false;
    private seq = 0;
    private notify: ((event: EngineEvent) => void) | undefined;
    lastResult: StepResult | undefined;
    constructor(initial: GameState, mode: RunMode = 'adaptive', onEvent?: (event: EngineEvent) => void, token = '', policy: Policy<GamePolicy> = INITIAL_POLICY, options: SessionOptions = {}) {
        this.notify = onEvent;
        this.initial = clone(initial);
        this.mode = mode;
        this.book = options.book ?? new SkillBook();
        const actual = isProgramMode(mode) && policy.body.mode !== 'program' ? { ...clone(policy), body: { mode: 'program' as const, subgoal: '优先复用日常动作；需要新办法时生成有限程序。', enabled: [...CAPABILITIES], reserveEnergy: 24 } } : clone(policy);
        this.initialPolicy = clone(actual);
        this.world = new GameWorld(initial);
        this.domain = new TuanziDomain(this.world);
        const runId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const record = (event: EngineEvent) => { const e = { ...event, seq: ++this.seq }; this.events.push(e); onEvent?.(e); };
        const lab = (e: LabEvent) => record({ runId, seq: 0, cycle: this.engine?.counters.cycles ?? 0, at: Date.now(), ...e });
        const selected = options.selector ?? (isRemoteMode(mode) ? new RemoteSelector(token) : isProgramMode(mode) ? new ProgramSelector(mode === 'rules-full') : new HeuristicSelector());
        const selector: Selector<GameState, GameAction, GamePolicy> = { evaluate: async (ctx, cs, signal) => {
                if (isRemoteMode(mode) && !options.selector)
                    this.planning.providerS++;
                return selected.evaluate(ctx, cs, signal);
            } };
        const remotePlanner = new RemotePlanner(token, mode === 'program-live' ? '/api/program' : '/api/plan');
        const planner = options.planner ?? (mode === 'rules-full' || mode === 'fixed' ? new TemplatePlanner(false) : isProgramMode(mode) ? new ProgramPlanner(this.book, this.planning, lab, mode === 'program-live' ? (ctx, reason, signal) => remotePlanner.propose(ctx, reason, signal) : undefined, options.maxSearchExpanded) : mode === 'live' ? {
            propose: async (...args: Parameters<RemotePlanner['propose']>) => { this.planning.providerG++; return remotePlanner.propose(...args); }
        } : new TemplatePlanner());
        this.engine = new GSEngine({ runId, goal: GOAL, initialPolicy: actual, domain: this.domain, selector, planner, arbiter: new GameArbiter(),
            journal: { append: event => {
                    if(event.type==='transition' && this.activeTrial) this.activeTrial.evidence.observe(event.data as Transition<GameState,GameAction>);
                    if (event.type === 'health_alert' && this.activeTrial) {
                        const evidence=this.activeTrial.evidence.finish(this.world.snapshot(),false,
                            this.interventions.length>this.activeTrial.interventions,this.planning.providerG+this.planning.providerS,this.planning.expanded,true);
                        this.book.complete(this.activeTrial.id,false,'程序依据失效，保留已观察的执行证据。',evidence);
                        lab({type:'execution_evidence',data:evidence});
                        lab({ type: 'skill_invalidated', data: { id: this.activeTrial.id, reason: (event.data as {
                                    reason: string;
                                }).reason } });
                        this.activeTrial = null;
                    }
                    if (event.type === 'policy_committed') {
                        const next = (event.data as {
                            next: Policy<GamePolicy>;
                        }).next;
                        this.domain.bindPolicy(next);
                        if (next.body.program) {
                            this.book.trial(this.world.snapshot(), next.body.program, this.planning.source);
                            this.activeTrial = { id: next.body.program.id, interventions: this.interventions.length, evidence:new TrialEvidence(this.world.snapshot(),next.body.program,next.version,runId) };
                        }
                    }
                    record(event);
                } }, limits: { maxCycles: 260, maxActions: 180, maxModelCalls: 260, maxRepairs: 5, maxDurationMs: 24 * 60 * 60 * 1000, ioTimeoutMs: 30000, noProgressWindow: 5, historySize: 16, maxProposalAttempts:3 }
        });
        this.domain.bindPolicy(this.engine.currentPolicy);
        // Restoring a mid-program snapshot does not certify the unobserved prefix as successful.
    }
    async step(): Promise<StepResult> {
        this.lastResult = await this.engine.step();
        if (this.finished && !this.accounted) {
            this.accounted = true;
            const active = this.activeTrial;
            if (active) {
                const s = this.world.snapshot(), success = this.lastResult.kind === 'done' && this.lastResult.outcome === 'succeeded';
                const evidence=active.evidence.finish(s,success,this.interventions.length>active.interventions,
                    this.planning.providerG+this.planning.providerS,this.planning.expanded,this.lastResult.kind!=='done');
                this.addEvent('execution_evidence',evidence);
                if(evidence.status==='success') {
                    const saved=this.book.complete(active.id,true,`实际环境验收成功且精确执行：交付 ${s.delivered}，能量 ${s.energy}。`,evidence);
                    this.addEvent(saved?'skill_promoted':'skill_record_removed',{id:active.id,scope:'exact-condition',delivered:s.delivered,energy:s.energy});
                } else {
                    this.book.complete(active.id,false,`任务结果与计划证据分别记账：${evidence.status}`,evidence);
                    this.addEvent('skill_evidence_rejected',{id:active.id,goalSucceeded:success,exactReplay:evidence.exactReplay,status:evidence.status});
                }
                this.activeTrial = null;
            }
        }
        return this.lastResult;
    }
    private addEvent(type: string, data: unknown) { const first = this.events[0]; const event = { runId: first?.runId ?? 'session', seq: ++this.seq, cycle: this.engine.counters.cycles, at: Date.now(), type, data }; this.events.push(event); this.notify?.(event); }
    get finished(): boolean { return !!this.lastResult && ['done', 'fault', 'paused', 'stopped'].includes(this.lastResult.kind); }
    cancel(): void { this.engine.cancel();
        if(this.activeTrial){const a=this.activeTrial;this.activeTrial=null;
          const evidence=a.evidence.finish(this.world.snapshot(),false,this.interventions.length>a.interventions,
            this.planning.providerG+this.planning.providerS,this.planning.expanded,true);
          this.book.complete(a.id,false,'用户取消；未晋升未完整观察的计划。',evidence);
          this.addEvent('execution_evidence',evidence);
        }
    }
    edit(tool: EditTool, p: Point) { const result = this.world.edit(tool, p); if (result.ok)
        this.interventions.push({ at: Date.now(), tool, point: clone(p), after: this.world.snapshot(), message: result.message }); return result; }
    export() {
        const usage = this.events.filter(e => e.type === 'selector_answered' || e.type === 'repair_proposed').map(e => (e.data as {
            answer?: {
                usage?: unknown;
            };
        }).answer?.usage).filter(Boolean);
        return { format: 'tuanzi-gs-trace/v2', createdAt: new Date().toISOString(), mode: this.mode,
            note: isRemoteMode(this.mode) ? 'Configured providers; no silent fallback. Counts include failed request attempts. Unknown costs remain unknown.' : 'Offline authored rules / bounded primitive search, not LLM performance.',
            initialWorld: this.initial, initialPolicy: this.initialPolicy, finalWorld: this.world.snapshot(), policy: this.engine.currentPolicy,
            counters: this.engine.counters, planning: clone(this.planning), usage, rejectedUsage:this.events.filter(e=>e.type==='proposal_rejected').map(e=>(e.data as {usage?:unknown}).usage).filter(Boolean), result: this.lastResult ?? null, events: this.events, interventions: this.interventions };
    }
}
export type ComparisonResult = {
    mode: RunMode;
    label: string;
    outcome: string;
    turns: number;
    delivered: number;
    energy: number;
    repairs: number;
    selects: number;
    externalCalls: number;
    trace: ReturnType<GameSession['export']>;
};
export async function runSessionToEnd(session: GameSession) { for (let i = 0; i < 260 && !session.finished; i++)
    await session.step(); return session; }
function row(session: GameSession, label: string): ComparisonResult {
    const s = session.world.snapshot(), last = session.lastResult;
    const outcome = last?.kind === 'done' ? (last.outcome === 'succeeded' ? '任务完成' : '生存失败') : last?.kind === 'paused' ? '策略耗尽' : last?.kind ?? '未结束';
    return { mode: session.mode, label, outcome, turns: s.turn, delivered: s.delivered, energy: s.energy, repairs: session.events.filter(e => e.type === 'policy_committed').length,
        selects: session.events.filter(e => e.type === 'selector_requested').length, externalCalls: session.planning.providerG + session.planning.providerS, trace: session.export() };
}
/** Retained for v0.1 regression only. The UI uses comparePrograms() below. */
export async function compareOffline(initial: GameState): Promise<ComparisonResult[]> {
    const rows: ComparisonResult[] = [];
    for (const mode of ['fixed', 'adaptive'] as const) {
        const s = await runSessionToEnd(new GameSession(clone(initial), mode));
        rows.push(row(s, mode === 'fixed' ? '固定规则策略' : '同一选择器 + 预置修复'));
    }
    return rows;
}
/** New modes expose identical primitive IDs and permissions; ONLY controller/planning differs.
 * Warm reuse is explicitly trained by the cold row. Never label it an independent sample. */
export async function comparePrograms(initial: GameState): Promise<ComparisonResult[]> {
    const rows: ComparisonResult[] = [];
    const old = await runSessionToEnd(new GameSession(clone(initial), 'adaptive'));
    rows.push(row(old, '旧版 · 预置模式切换'));
    const full = await runSessionToEnd(new GameSession(clone(initial), 'rules-full'));
    rows.push(row(full, '完整规则从开局启用'));
    const book = new SkillBook();
    const cold = await runSessionToEnd(new GameSession(clone(initial), 'program', undefined, '', INITIAL_POLICY, { book }));
    rows.push(row(cold, '新引擎 · 冷启动搜索'));
    const warm = await runSessionToEnd(new GameSession(clone(initial), 'program', undefined, '', INITIAL_POLICY, { book }));
    rows.push(row(warm, '新引擎 · 同局面技能复用'));
    return rows;
}

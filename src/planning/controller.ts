import { ProposalRejected } from '../../vendor/gs-engine-ts/src/rejection.js';
import type { Judgment, ModelResult, Planner, Selector } from '../../vendor/gs-engine-ts/src/types.js';
import { inspectProgram } from '../../vendor/gs-engine-ts/src/program.js';
import type { GameAction, GameState, GamePolicy, GameContext, GameCandidate } from '../game/types.js';
import { CAPABILITIES } from '../game/types.js';
import { TuanziDomain } from '../game/domain.js';
import { GameWorld } from '../game/world.js';
import { heuristicScore } from '../runtime/controllers.js';
import { legalPrimitives } from './search.js';
import { searchProgram } from './search.js';
import type { SearchReport } from './search.js';
import { compileActions, actionKey, stateFingerprint, verifyProgram } from './programs.js';
import { SkillBook } from './book.js';
export type LabEvent = {
    type: string;
    data: unknown;
};
export type PlanningStats = {
    searchRuns: number;
    expanded: number;
    generated: number;
    searchMs: number;
    shadowChecks: number;
    skillHits: number;
    providerG: number;
    providerS: number;
    source: string;
    searches: SearchReport[];
};
export const emptyStats = (): PlanningStats => ({ searchRuns: 0, expanded: 0, generated: 0, searchMs: 0, shadowChecks: 0, skillHits: 0, providerG: 0, providerS: 0, source: 'none', searches: [] });
const emitEmpty = (_event: LabEvent) => { };
export function deterministicJudgment(cs: readonly GameCandidate[], selected: string | null): Judgment {
    const probabilities: Record<string, number> = {}, suitability: Record<string, number> = {};
    for (const c of cs) {
        probabilities[c.id] = c.id === selected ? 1 : 0;
        suitability[c.id] = c.id === selected ? 1 : 0;
    }
    return { choice: selected, confidence: 1, probabilities, abstainProbability: selected === null ? 1 : 0, suitability };
}
/** Same primitive candidate set in every new-mode baseline. Complete=true is an explicit
 * authored-rule oracle, including the legacy lureSite helper. Never used by program search. */
export class ProgramSelector implements Selector<GameState, GameAction, GamePolicy> {
    constructor(private readonly completeRules = false) { }
    async evaluate(ctx: GameContext, cs: readonly GameCandidate[], signal: AbortSignal): Promise<ModelResult<Judgment>> {
        signal.throwIfAborted();
        const p = ctx.policy.body.program;
        if (p) {
            const step = inspectProgram(p, ctx.snapshot.state.turn, stateFingerprint(ctx.snapshot.state));
            const selected = step.kind === 'ready' ? cs.find(c => actionKey(c.action) === actionKey(step.action)) : undefined;
            return { output: deterministicJudgment(cs, selected?.id ?? null) };
        }
        const domain = new TuanziDomain(new GameWorld(ctx.snapshot.state));
        const body: GamePolicy = { mode: this.completeRules ? 'lure' : 'forage', subgoal: ctx.policy.body.subgoal, enabled: [...CAPABILITIES], reserveEnergy: ctx.policy.body.reserveEnergy };
        const ruleCtx = { ...ctx, policy: { ...ctx.policy, body } };
        const scored = domain.enumerate(ruleCtx).map(c => ({ c, score: heuristicScore(ruleCtx, c) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
        const selected = scored.map(x => cs.find(c => actionKey(c.action) === actionKey(x.c.action))).find(Boolean);
        return { output: deterministicJudgment(cs, selected?.id ?? null) };
    }
}
export class ProgramPlanner implements Planner<GameState, GameAction, GamePolicy> {
    constructor(readonly book: SkillBook, readonly stats: PlanningStats, private readonly emit: (e: LabEvent) => void = emitEmpty, private readonly generateRemote?: (ctx: GameContext, reason: string, signal: AbortSignal) => Promise<ModelResult<unknown>>, private readonly maxExpandedTotal = Number.POSITIVE_INFINITY) { }
    async propose(ctx: GameContext, reason: string, signal: AbortSignal): Promise<ModelResult<unknown>> {
        signal.throwIfAborted();
        const initial = ctx.snapshot.state;
        let program, usage;
        const saved = this.book.find(initial);
        this.stats.shadowChecks += this.book.lookupChecks;
        if (saved) {
            program = saved.program;
            this.stats.skillHits++;
            this.stats.source = 'memory';
            this.emit({ type: 'skill_reused', data: { id: saved.id, steps: program.steps.length, scope: 'exact-condition', previousSuccesses: saved.successes } });
        }
        else if (this.generateRemote) {
            this.stats.providerG++;
            this.stats.source = 'llm';
            this.emit({ type: 'program_generation_started', data: { source: 'llm' } });
            const answer = await this.generateRemote(ctx, reason, signal);
            usage = answer.usage;
            const raw = answer.output as {
                body?: {
                    program?: unknown;
                };
            };
            this.stats.shadowChecks++;
            const check = verifyProgram(initial, raw?.body?.program);
            if (!check.ok)
                throw new ProposalRejected({stage:'simulation',reason:check.reason,failedStep:check.steps+1,legalCandidates:legalPrimitives(check.final),remainingSteps:initial.maxTurns-initial.turn},answer.usage);
            this.stats.shadowChecks++;
            program = compileActions(initial, check.actions, 'LLM 提案 · 有限行动程序');
        }
        else {
            this.stats.searchRuns++;
            this.stats.source = 'bounded-search';
            this.emit({ type: 'program_generation_started', data: { source: 'bounded-search', reason } });
            // A fixed, declared portfolio; no scenario-specific selection or authored action sequence.
            const attempts: SearchReport[] = [];
            let actions: GameAction[] = [];
            for (const config of [{ heuristic: 'task' as const, width: 80 }, { heuristic: 'explore' as const, width: 80 }, { heuristic: 'explore' as const, width: 160 }]) {
                const remaining = this.maxExpandedTotal - this.stats.expanded;
                if (remaining <= 0) break;
                const result = await searchProgram(initial, signal, { ...config, maxExpanded: Math.min(16000, remaining), onProgress: report => this.emit({ type: 'search_progress', data: report }) });
                attempts.push(result.report);
                this.stats.expanded += result.report.expanded;
                this.stats.generated += result.report.generated;
                this.stats.searchMs += result.report.elapsedMs;
                this.stats.searches.push(result.report);
                if (result.actions.length) {
                    actions = result.actions;
                    break;
                }
            }
            if (!actions.length) {
                this.emit({ type: 'program_search_failed', data: { attempts, note: 'Bounded search failed; not a proof of impossibility.' } });
                return { output: { baseVersion: ctx.policy.version, basedOnRevision: ctx.snapshot.revision, body: ctx.policy.body, explanation: '搜索预算内未找到通过根目标验收的程序；不是世界无解的证明。' } };
            }
            this.stats.shadowChecks++;
            program = compileActions(initial, actions, '原语搜索 · 有限行动程序');
            this.emit({ type: 'program_synthesized', data: { id: program.id, steps: program.steps.length, attempts, source: 'bounded-search' } });
        }
        this.stats.shadowChecks++;
        const verification = verifyProgram(initial, program);
        if (!verification.ok)
            throw new Error(`program verification failed: ${verification.reason}`);
        this.emit({ type: 'program_verified', data: { id: program.id, steps: verification.steps, predictedEnergy: verification.final.energy, status: 'shadow_passed_not_yet_promoted', source: this.stats.source } });
        const body: GamePolicy = { mode: 'program', subgoal: '按验证过的有限程序推进交付；每一步重新观察，依据变化即停止旧程序。', enabled: [...CAPABILITIES], reserveEnergy: 24, program };
        const output = { baseVersion: ctx.policy.version, basedOnRevision: ctx.snapshot.revision, body, explanation: this.stats.source === 'memory' ? '精确条件命中已验证技能；重新模拟通过后试行。' : this.stats.source === 'llm' ? 'LLM 程序提案已通过模拟检查，等待实际任务结果。' : '有界搜索组合原语并通过模拟检查，等待实际任务结果。' };
        return usage ? { output, usage } : { output };
    }
}

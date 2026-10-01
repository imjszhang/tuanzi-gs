import { GOAL, same } from '../game/types.js';
import { path } from '../game/world.js';
export const TASK_CONTEXT_VERSION = 'gs/skill-task-context/v042';
export const LOCAL_GOALS = {
    'access-open': '让绑定的浆果区域出现安全采集机会：足够的目标浆果可达，且目标守卫已在进食或已不存在。此技能不负责完成全部交付。',
    'acquired-one': '实际拾取绑定的一颗浆果；向目标走近是允许的中间步骤。',
    'deposited': '返回小窝并实际交付绑定数量的浆果；向家移动是允许的中间步骤。',
    'energy-restored': '食用一颗现有浆果，实际能量高于技能起点；不能通过改目标宣告成功。'
};
export function localGoalText(spec) { return LOCAL_GOALS[spec.success]; }
export function skillTaskContext(spec, f, s) {
    const phase = spec.phases[f.phase];
    const target = phase?.rule === 'place-resource' ? f.placement?.stand :
        phase?.rule === 'gather' ? s.berries.find(b => b.id === f.binding.targetId) :
            phase?.rule === 'deliver' ? s.home : undefined;
    const targetRole = phase?.rule === 'place-resource' ? 'resource-placement-stand' : phase?.rule === 'gather' ? 'bound-berry' : phase?.rule === 'deliver' ? 'home' : null;
    const atTarget = target ? same(s.player, target) : null;
    const knownDistance = target ? (path(s, s.player, target)?.length ?? null) : null;
    const immediate = phase?.rule === 'place-resource'
        ? (!f.placement ? '尚无有效投放站位；不要把缺少绑定误作已能投放。' : atTarget ? '已到投放站位；判断允许的资源投放动作。' : '先安全接近已经绑定的投放站位。投放动作只在到达站位后出现；本步不需要立即打开采集区域。')
        : phase?.rule === 'gather' ? (atTarget ? '已到目标浆果，判断拾取动作。' : '安全接近绑定浆果；目标仍需在随后拾取。')
            : phase?.rule === 'deliver' ? (atTarget ? '已回到小窝，判断交付动作。' : '先安全返回小窝；本步移动不需要立即增加交付数量。')
                : phase?.rule === 'consume' ? '判断是否食用现有浆果来完成局部能量恢复。'
                    : phase?.rule === 'wait-access' ? '观察已放置资源产生的守卫位置和进食状态变化；可以等待，在受威胁时允许安全调整。'
                        : '当前阶段已结束，交还局部验收与调度。';
    return {
        schema: TASK_CONTEXT_VERSION, provenance: 'registered-contract+current-SkillRun-binding; not a rule-score or oracle answer',
        rootGoal: { id: GOAL.id, description: GOAL.description },
        localGoal: { id: spec.success, description: localGoalText(spec) },
        phase: { index: f.phase, total: spec.phases.length, rule: phase?.rule ?? 'done', until: phase?.until ?? 'local-success', maxSteps: phase?.maxSteps ?? 0, stepsUsed: s.turn - f.phaseStart },
        immediateObjective: { description: immediate, targetRole, target: target ? { x: target.x, y: target.y } : null, atTarget, pathSteps: knownDistance },
        stepCriterion: '选择推进当前阶段、满足给定安全与资源约束的合法候选。允许移动或等待等中间步骤；不要求一次动作完成局部或根目标。证据仍不足或没有合适动作时保留 none，不发明候选。',
        relations: { player: s.player, binding: f.binding, placement: f.placement,
            targetGuard: s.guards.find(g => g.id === f.binding.targetId) ?? null,
            resourcePlaced: f.placed > 0 || s.lures.length > 0,
            dropAvailableOnlyFromBoundStand: phase?.rule === 'place-resource' },
        remaining: { skillSteps: Math.max(0, spec.maxSteps - (s.turn - f.initial.turn)), phaseSteps: Math.max(0, (phase?.maxSteps ?? 0) - (s.turn - f.phaseStart)) },
        snapshotRevision: String(s.revision)
    };
}

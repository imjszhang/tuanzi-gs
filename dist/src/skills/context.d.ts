/** Registry-owned semantics. No model-authored verdict or recommended action is injected. */
import type { Json } from '../../vendor/gs-engine-ts/src/types.js';
import type { GameState } from '../game/types.js';
import type { SkillSpec } from './spec.js';
import type { Frame } from './behavior.js';
export declare const TASK_CONTEXT_VERSION = "gs/skill-task-context/v042";
export declare const LOCAL_GOALS: {
    readonly 'access-open': "让绑定的浆果区域出现安全采集机会：足够的目标浆果可达，且目标守卫已在进食或已不存在。此技能不负责完成全部交付。";
    readonly 'acquired-one': "实际拾取绑定的一颗浆果；向目标走近是允许的中间步骤。";
    readonly deposited: "返回小窝并实际交付绑定数量的浆果；向家移动是允许的中间步骤。";
    readonly 'energy-restored': "食用一颗现有浆果，实际能量高于技能起点；不能通过改目标宣告成功。";
};
export declare function localGoalText(spec: SkillSpec): "让绑定的浆果区域出现安全采集机会：足够的目标浆果可达，且目标守卫已在进食或已不存在。此技能不负责完成全部交付。" | "实际拾取绑定的一颗浆果；向目标走近是允许的中间步骤。" | "返回小窝并实际交付绑定数量的浆果；向家移动是允许的中间步骤。" | "食用一颗现有浆果，实际能量高于技能起点；不能通过改目标宣告成功。";
export declare function skillTaskContext(spec: SkillSpec, f: Frame, s: GameState): Json;

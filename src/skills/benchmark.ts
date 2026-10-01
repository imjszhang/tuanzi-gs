import {GameSession,runSessionToEnd} from '../runtime/session.js';
import type {ComparisonResult} from '../runtime/session.js';
import type {GameState} from '../game/types.js';
import {SkillSession} from './runtime.js';
import {ReactiveCatalogue} from './catalogue.js';
import {ExperienceTable} from './experience.js';
export async function finish(session:SkillSession){for(let i=0;i<400&&!session.finished;i++)await session.step();return session;}
function row(s:GameSession|SkillSession,label:string):ComparisonResult{const w=s.world.snapshot(),r=s.lastResult;return {mode:s.mode,label,outcome:r?.kind==='done'&&r.outcome==='succeeded'?'任务完成':r?.kind??'未完成',turns:w.turn,delivered:w.delivered,energy:w.energy,repairs:s.events.filter(e=>e.type==='policy_committed'||e.type==='hierarchy_policy_committed').length,selects:s.events.filter(e=>e.type==='selector_requested').length,externalCalls:s.planning.providerG+s.planning.providerS,trace:s.export()};}
/** Same initial world, tool authority and root goal, NOT identical candidate abstraction.
 * Warm row inherits measured skills/experience from cold, so is not independent. */
export async function compareHierarchy(initial:GameState):Promise<ComparisonResult[]>{
 const out:ComparisonResult[]=[];
 out.push(row(await runSessionToEnd(new GameSession(initial,'rules-full')),'完整规则从开局启用'));
 out.push(row(await runSessionToEnd(new GameSession(initial,'program')),'v0.2.1 · 完整序列搜索'));
 const catalogue=new ReactiveCatalogue(),experience=new ExperienceTable('use');
 out.push(row(await finish(new SkillSession(initial,'reactive',undefined,{catalogue,experience})),'v0.3 · 技能冷启动'));
 out.push(row(await finish(new SkillSession(initial,'reactive',undefined,{catalogue,experience})),'v0.3 · 技能重绑定复用'));
 return out;
}

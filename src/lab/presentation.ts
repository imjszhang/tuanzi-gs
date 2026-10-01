/** Pure, read-only presentation functions. Never choose actions or modify a LabView. */
import type {LabView, LabEvent, LabConfig, Command} from './types.js';
export const STATUS: Record<string, string> = {
 ready:'准备就绪', running:'运行中', stepping:'单步推进中', pausing:'正在等待决策边界', paused:'已暂停',
 cancelling:'正在取消', succeeded:'任务完成', failed:'任务失败', blocked:'决策受阻', cancelled:'已取消', stopped:'已停止', fault:'运行故障'
};
export const SCENARIOS:Record<string,string>={guarded:'守卫果园',meadow:'日常采集',detour:'近路被堵',remix:'镜像布局'};
export const TASKS:Record<string,{title:string;description:string}>={
 fast:{title:'尽快交付',description:'尽快完成第 5 颗浆果交付，并保持存活。'},
 reserve:{title:'交付并保留两颗',description:'完成第 5 颗交付时，背包至少保留 2 颗浆果。'},
 energy:{title:'为下一程补能',description:'完成第 5 颗交付时，能量至少为 35。'},
 chain:{title:'采集—返家—交付',description:'完成两颗额外交付，背包保留至少 1 颗，能量至少为 20。'}
};
export const STRATEGIES:Record<string,string>={direct:'直接选择',batch:'独立判断 · 合批',serial:'独立判断 · 逐题',dependent:'适用性 → 再选择'};
export const CONTRACTS:Record<string,string>={'access-open':'创造安全采集机会','acquired-one':'采集一颗浆果',deposited:'返回并交付','energy-restored':'补充能量'};
export const PHASES:Record<string,string>={'place-resource':'接近站位并放置资源','wait-access':'等待采集机会','gather':'获取目标浆果','consume':'食用浆果','acquire':'获取目标浆果','collect':'获取目标浆果','deliver':'返回并交付','restore':'补充能量','go-home':'返回小窝','eat':'食用浆果'};
export const terminal=(status:string)=>['succeeded','failed','blocked','cancelled','stopped','fault'].includes(status);
export const rec=(v:unknown):Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
export const list=(v:unknown):any[]=>Array.isArray(v)?v:[];
export const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const titleOf=(c:LabConfig)=>c.kind==='game'?(SCENARIOS[c.scenario]??c.scenario):(TASKS[c.task]?.title??c.task);
export const goalOf=(s:LabView)=>s.config.kind==='game'?`保持存活，把 ${s.world.target} 颗浆果带回小窝。`:(TASKS[s.config.task]?.description??'以注册任务契约验收。');
export function duration(ms:number){if(!Number.isFinite(ms))return '—';return ms<1000?`${Math.round(ms)} ms`:ms<60000?`${(ms/1000).toFixed(1)} 秒`:`${Math.floor(ms/60000)} 分 ${Math.floor(ms%60000/1000)} 秒`;}
export function actualSource(s:LabView){
 const d=rec(s.lastDecision),src=String(d.source??'');
 if(src==='mock'||src==='test-provider'||String(d.selectorIdentity??'').includes('test'))return '测试替身 · 不代表真实模型';
 if(s.externalRequests>0)return `${s.externalRequests} 次真实外部请求 · 含判断 / 生成`;
 if(s.config.backend!=='rule'||s.config.generator==='llm')return '已配置模型 · 尚无真实外部请求';
 return s.config.kind==='game'&&s.config.controller==='adaptive'?'离线动作轮换 / 上下文扩展夹具 · 非求解器':'程序化运行 · 无真实外部请求';
}
export function sourceLabel(source:unknown){return ({'authored-rule':'程序规则',rule:'程序规则',mock:'测试替身','test-provider':'测试替身','deterministic-single':'单候选确定性路径','deterministic-continue':'继续调度当前技能',jev:'Jev 判断','configured-model':'配置的模型','configured-provider':'配置的模型'} as Record<string,string>)[String(source)]??String(source??'来源未报告');}
export function reasonText(reason:string|null){
 if(!reason)return '';
 const known: [string,string][]=[
 ['decision_blocked:no_local_suitable_action','子层未选出适用动作'],['decision_blocked:parent_no_suitable_skill','父层未选出适用技能'],
 ['duplicate_repair_no_new_evidence','已停止重复修复：没有新的行为结构或证据'],['repair_budget_exhausted','技能修复预算已耗尽'],
 ['wall_clock_deadline','实验已达到整局时间上限'],['host_step_or_action_budget','实验已达到步骤或动作预算'],['no_local_suitable_action','局部选择器未选出动作'],
 ['operator_pause_at_boundary','操作员暂停了后续调度'],['controller_changed','控制权已转移，实验停在决策边界'],['operator_cancel','操作员已取消实验'],
 ['execution_outcome_unknown','动作结果尚未确认，需要核对执行证据'],['event_budget_exhausted','事件记录已达到本局上限'],['output_format_repair_exhausted','生成输出格式纠错额度耗尽，尚未形成可试行修订'],['adaptation_generation_budget_exhausted','本次 G 总调用上限已达到'],['adaptation_depth_exhausted','调整深度达到上限'],['adaptation_budget_exhausted','本次调整预算耗尽'],['root_g_budget_exhausted','整局 G 请求预算耗尽'],['duplicate_decision_no_change','调整没有改变实际判断条件']
 ];
 return known.find(([prefix])=>reason.includes(prefix))?.[1]??'运行已到达需要检查的边界';
}
export function statusCopy(s:LabView):{title:string;body:string;tone:string}{
 const diagnostic=rec(s.diagnostics);if(s.config.kind==='game'&&s.config.controller==='adaptive'&&!terminal(s.status)&&s.busy)return {title:diagnostic.phase==='initializing'?'G 正在了解初始环境':diagnostic.phase==='format-repairing'?'G 正在修正输出格式（不是策略重试）':diagnostic.phase==='investigating'?'正在处理只读子问题':diagnostic.phase==='adapting'?'G 正在调整 S 的判断条件':'S 正在进行局部判断',body:`当前层级 ${diagnostic.depth??0}；G 已调用 ${diagnostic.gCalls??0} 次。参考解不进入运行上下文。`,tone:'active'};
 const blocked=terminal(s.status)&&s.status!=='succeeded';
 if(s.status==='succeeded')return {title:'根任务已完成',body:`验收器确认本局成功。实际执行 ${s.physicalActions} 个物理动作，剩余能量 ${s.world.energy}。${s.interventions.length?'本局有环境干预，比较时需保留该条件。':'局部技能结果可在判断过程中逐项查证。'}`,tone:'success'};
 if(blocked)return {title:reasonText(s.reason)||STATUS[s.status]!,body:s.status==='blocked'?`本局已停止自动尝试，不能作为普通暂停继续。已执行 ${s.physicalActions} 个物理动作；查看最后一次判断，或从检查点创建新实验。`:s.status==='cancelled'?'已经发生的动作不会回滚。可以查看轨迹或创建新的对照实验。':'世界和结果保持在实际停止位置。请查看诊断中的原始原因和预算，再决定是否新建实验。',tone:s.status==='cancelled'?'neutral':'warning'};
 if(s.status==='paused')return {title:'实验已暂停',body:'尚未结束。拥有控制权的操作员可以继续或单步；人工暂停仍计入整局墙钟期限。',tone:'neutral'};
 if(s.status==='ready')return {title:'准备就绪，尚未开始',body:s.config.kind==='game'&&s.config.controller==='adaptive'?'开始或单步后，先由 G 研判当前环境并形成初始决策条件，再由 S 选择动作。创建或观看页面不会触发请求。':'配置已经固定。开始或单步之后才启动实验计时；观看页面不会触发模型请求。',tone:'neutral'};
 if(s.status==='pausing'||s.status==='cancelling')return {title:STATUS[s.status]!,body:'已在途的决策量子可能完成；程序不会擅自回滚动作或开始下一轮。',tone:'neutral'};
 return {title:STATUS[s.status]??s.status,body:'下面显示服务端的真实进度。关闭网页不会停止实验。',tone:'active'};
}
export function actionsFor(s:LabView,actorId:string,opts:{replay?:boolean;imported?:boolean;connected?:boolean;pending?:boolean}={}){
 const own=s.owner.id===actorId, done=terminal(s.status),quiet=!s.busy&&!['running','stepping','pausing','cancelling'].includes(s.status);
 const writable=!opts.replay&&!opts.imported&&opts.connected!==false&&!opts.pending;
 const enabled:Record<string,boolean>={start:writable&&own&&!done&&quiet,step:writable&&own&&!done&&quiet,pause:writable&&own&&!done&&!quiet,cancel:writable&&own&&!done,takeover:writable&&!own&&!done,checkpoint:writable&&own&&quiet,intervene:writable&&own&&!done&&quiet,schedule:writable&&own&&!done&&quiet};
 const visible=opts.imported||opts.replay?[]:done?[]:!own?['takeover']:quiet?['start','step']:['pause'];
 return {own,done,quiet,enabled,visible:visible as Command['action'][]};
}
export type Flow={skill:string;phase:string;immediate:string;detail:string};
export function flowOf(s:LabView):Flow{
 if(s.config.kind==='game'&&s.config.controller==='adaptive'){const d=rec(s.diagnostics),p=rec(d.program),active=rec(s.activeSkill),stage=list(p.stages)[Number(active.phase)||0];return {skill:String(p.title??'自主 G/S · 尚无策略'),phase:terminal(s.status)?reasonText(s.reason)||'任务结束':`${({ready:'待启动',initializing:'开局环境研判',selecting:'选择判断',adapting:'同层调整',investigating:'只读子问题','format-repairing':'输出格式纠错',acting:'执行动作',finished:'运行结束'} as Record<string,string>)[d.phase??'ready']??d.phase} · 子问题深度 ${d.depth??0}`,immediate:String(rec(d.initialization).status==='pending'?'等待启动：先由 G 研判初始环境，形成 S 的首轮决策条件。':rec(d.initialization).status==='reviewing'?'G 正在研判允许的初始环境，形成供 S 使用的首轮上下文与选项。':stage?.question??'先由 G 研判初始环境并建立决策条件；随后根据实际反馈持续调整。'),detail:'生成内容是待验证假设。当前 S 仍保留不执行选项，任务结果只由真实世界验收。'};}

 const active=rec(s.activeSkill),spec=rec(active.spec),latest=rec(s.lastDecision),packet=rec(latest.packet??latest),projection=rec(packet.projection);
 const task=rec(projection.taskContext??projection.context??packet.taskContext);
 if(Object.keys(spec).length){
  const phase=list(spec.phases)[Number(active.phase)||0];
  return {skill:String(spec.title??CONTRACTS[String(spec.success)]??'局部技能'),phase:phase?`${Number(active.phase)+1} / ${list(spec.phases).length} · ${PHASES[phase.rule]??phase.rule}`:'等待下一阶段',immediate:String(task.immediateTask??task.immediateGoal??rec(task.immediateObjective).description??'按当前阶段生成并检查可执行候选。'),detail:'局部目标完成后返回父层，不代表整局已经完成。'};
 }
 const failure=rec(rec(s.diagnostics).latestFailure),context=rec(failure.taskContext),last=rec(s.lastSkillResult);
 if(s.status==='blocked')return {skill:CONTRACTS[String(rec(failure.spec).success)]??String(last.skillId?'最近的局部技能':'当前技能判断'),phase:reasonText(s.reason),immediate:'查看该次候选、问题上下文与选择器返回结果。',detail:'系统没有改选第二名，也没有隐式切换到规则控制器。'};
 if(s.config.kind==='judgment')return {skill:'固定任务判断',phase:STRATEGIES[s.config.strategy]??s.config.strategy,immediate:terminal(s.status)?'本次实验已结束，可查看判断与结果。':'按同一份事实比较当前动作候选。',detail:'问题组织改变，根任务和动作权限不变。'};
 if(active.program||active.mode)return {skill:'程序 / 规则控制器',phase:active.subgoal??'执行既有策略',immediate:'具体策略与完整证据在判断过程内展开。',detail:'这是参考控制器，不冒充模型执行。'};
 return {skill:terminal(s.status)?'本次根任务已结束':'父层 · 选择局部技能',phase:'等待技能选择',immediate:s.status==='ready'?'开始后形成当前可调用的技能候选。':'上一个子任务已返回；父层根据新状态继续选择。',detail:s.status==='ready'?'尚未产生判断证据。':'局部结果在下方关键过程中保留。'};
}
export type KeyEvent={seq:number;at:string;title:string;detail:string;tone:string;raw:LabEvent};
export function unwrap(e:LabEvent):{type:string;data:Record<string,any>}{let t=e.type,d=rec(e.data);if(t==='engine'){const ev=rec(d.event);t=String(ev.type??'engine');d=rec(ev.data);}
 for(let i=0;i<4&&['parent_event','child_event'].includes(t);i++){const ev=rec(d.event);if(!ev.type)break;t=String(ev.type);d=rec(ev.data);}return {type:t,data:d};}
export function keyEvents(events:LabEvent[],through=Infinity):KeyEvent[]{
 const out:KeyEvent[]=[];const seen=new Set<string>();
 for(const e of events){if(e.seq>through)continue;const {type:t,data:d}=unwrap(e);let title='',detail='',tone='normal';
  if(t==='initialization_started'){title='开始开局环境研判';detail='先 G、后 S；使用当前允许观测，不读取参考解。';}
  else if(t==='initialization_ready'){title='初始决策条件已就绪';detail=d.policy==='g-before-action/v054'?'初始条件已装载为同层试行；实际动作仍由 S 选择，尚不代表成功。':'初始条件已按当时的运行协议提交；实际结果仍需执行验证。';}
  else if(t==='initialization_invalidated'){title='初始环境已变化，需要重新研判';detail='未应用过期判断，已消耗预算不重置。';tone='warning';}
  else if(t==='initialization_failed'){title='初始化未完成';detail=String(d.reason??'未获得可用初始决策条件');tone='warning';}
  else if(t==='initialization_skipped'){title='起点已是终局，跳过初始化';detail='独立根验收已确定结果，没有多余模型请求。';}
  else if(t==='g_requested'){title=d.schema==='gs/output-repair-request/v1'?'G 正在定点修正输出结构':d.cause==='initial_environment_review'?'G 开始研判初始环境':'G 开始调整判断条件';detail=`层级 ${d.depth??0} · ${d.cause??'处理实际反馈'} · 不使用参考解`; }
  else if(t==='adaptation_committed'){title='新的判断条件已应用';detail=d.mode==='same-layer-first/v054'?`层级 ${d.depth??0} · 同层试行，上下文 / 候选发生变化，尚不代表实际成功`:`层级 ${d.depth??0} · 历史修订提交，不代表实际成功`; }
  else if(t==='subproblem_enter'){title='展开明确的子问题';detail=`深度 ${d.depth??0} · ${rec(d.task).question??''} · 不操作世界`;}
  else if(t==='subproblem_return'){title=rec(d.result).status==='answered'?'子问题返回候选判断':'子问题未解决，返回原层';detail=`${rec(d.result).reason??rec(d.result).question??''} · 已用预算保留`;tone=rec(d.result).status==='answered'?'normal':'warning';}
  else if(t==='same_layer_resumed'){title='原层 G 继续调整';detail='携带子问题结果和失败证据；可改上下文，也可换办法。';}
  else if(t==='meta_enter'){title='展开上层 G/S';detail=`层级 ${d.depth??0} · 比较 ${d.candidates??0} 个调整候选`; }
  else if(t==='meta_return'){title='上层返回选择结果';detail=`层级 ${d.depth??0} · ${d.result??''}`; }
  else if(t==='proposal_warnings'){title='提案存在声明一致性提醒';detail='仅依声明字段检查，不是参考解评分；候选仍交给 S。';tone='warning';}
  else if(t==='adaptation_rejected'){title=d.category==='output-format'?'输出结构未通过（未消耗有效修订额度）':'调整未被接受';detail=String(d.reason??'结构或等价性检查');tone='warning';}
  else if(t==='feedback_review_required'){title='实际反馈触发重新审视';detail=String(d.kind??'待核查问题');tone='warning';}
  else if(t==='local_goal_completed'){title='生成的局部目标已达成';detail='来自实际状态检查，不等于根任务成功';}
  else if(t==='run_created'){title='实验已创建';detail='配置固定，尚未执行。';}
  else if(t==='control_transferred'){title='控制权转移';detail=`${rec(d.from).label??rec(d.from).id??'原控制者'} → ${rec(d.to).label??rec(d.to).id??'新控制者'}`;}
  else if(t==='command'){const a=String(d.action);if(!['start','pause','cancel','step'].includes(a))continue;title=({start:'开始连续运行',pause:'请求在决策边界暂停',cancel:'请求取消',step:'推进一次决策量子'} as Record<string,string>)[a]!;detail=String(rec(d.actor).label??rec(d.actor).id??'操作员');}
  else if(t==='skill_generation_started'){title='生成器开始提出技能';detail=d.source==='llm'?'来源：配置的 LLM':'来源：本地有限语法搜索';}
  else if(t==='skill_generated'){title='新技能进入试行';detail=`${rec(d.spec).title??'局部技能'}；模拟通过不等于实际成功。`;}
  else if(t==='skill_started'){title='父层调用局部技能';detail=String(rec(d.spec).title??rec(d.spec).id??'技能');}
  else if(t==='skill_summary'){title=d.localSucceeded?'局部目标已完成':'局部技能已返回';detail=`${d.rootSucceeded?'根任务也已完成':'根任务仍由独立验收器判断'} · ${rec(d.outcome).steps??0} 个物理动作${d.reason?' · '+d.reason:''}`;tone=d.localSucceeded?'success':'warning';}
  else if(t==='decision_audit'){title=d.status==='abstained'?'选择器返回「不执行」':d.status==='error'?'判断请求出现错误':'一次判断已返回';detail=`${sourceLabel(d.source)} · ${d.choice??d.error??'未选择候选'}`;tone=d.status==='selected'?'normal':'warning';}
  else if(t==='transition'&&rec(d.candidate).action?.kind!=='callSkill'&&rec(rec(d.candidate).action).kind){title='执行一个物理动作';detail=String(rec(d.candidate).description??rec(rec(d.candidate).action).kind);}
  else if(t==='intervention'){title=rec(d.result).ok?'环境干预已应用':'环境干预未生效';detail=`${d.tool??''} · ${rec(d.result).message??''}`;tone='warning';}
  else if(t==='intervention_scheduled'){title='已登记受控干预';detail='实际执行结果另行记录。';}
  else if(t==='checkpoint_created'){title='已保存检查点';detail=String(d.label??d.id??'');}
  else if(t==='proposal_rejected'){title='提案未通过验证';detail=String(rec(d.feedback).reason??rec(d.rejection).reason??d.reason??'展开原始记录查看具体原因');tone='warning';}
  else if(t==='run_ended'){title=STATUS[String(d.status)]??'本次实验结束';detail=reasonText(d.reason??null)||'根验收结果已记录。';tone=d.status==='succeeded'?'success':'warning';}
  if(!title)continue;const key=`${t}:${JSON.stringify(d)}`;if(seen.has(key))continue;seen.add(key);out.push({seq:e.seq,at:e.at,title,detail,tone,raw:e});
 }return out;
}
export function decisionsFrom(events:LabEvent[],s:LabView){const found:Record<string,any>[]=[];const seen=new Set<string>();
 for(const e of events){if(e.seq>s.lastSeq)continue;const {type,data}=unwrap(e);if(type==='decision_audit'){const key=String(rec(data.packet).id??JSON.stringify(data));if(!seen.has(key)){seen.add(key);found.push({...data,eventSeq:e.seq});}}}
 const d=rec(s.lastDecision);if(Object.keys(d).length){const p=rec(d.packet??d),key=String(p.id??JSON.stringify(d));if(!seen.has(key)){
   if(d.packet)found.push(d);
   else {
    const schedule=rec(s.lastSkillResult);let answer:Record<string,any>|undefined;
    if(schedule.snapshotKey===p.id){for(const e of events){if(e.seq>s.lastSeq)break;const u=unwrap(e);if(u.type==='selector_answered'&&rec(u.data.answer).output)answer=rec(rec(u.data.answer).output);}}
    const backend=String(rec(list(schedule.batches)[0]).backend??'');
    found.push({packet:d,status:answer?(answer.choice?'selected':'abstained'):'unreported',choice:answer?.choice,judgment:answer,latencyMs:schedule.elapsedMs,questions:schedule.questions,externalRequests:schedule.externalRequests,source:backend.includes('rule')?'authored-rule':backend.includes('MOCK')?'test-provider':schedule.externalRequests>0?'configured-model':'记录来源见原始请求',selectorIdentity:backend,schedule});
   }
  }}return found;
}
export function replayStates(report:unknown):LabView[]{const r=rec(report);const frames:LabView[]=[];for(const e of list(r.events)){if(e.type==='state'&&isView(e.data))frames.push(structuredClone(e.data));}
 if(!frames.length&&isView(r.state))frames.push(structuredClone(r.state));return frames.sort((a,b)=>a.lastSeq-b.lastSeq);}
export function isView(raw:unknown):raw is LabView{const r=rec(raw),w=rec(r.world),c=rec(r.config),o=rec(r.owner);return r.schema==='gs/lab-state/v1'&&typeof r.runId==='string'&&Number.isSafeInteger(r.lastSeq)&&r.lastSeq>=0&&typeof r.status==='string'&&['game','judgment'].includes(c.kind)&&typeof o.id==='string'&&w.width===17&&w.height===11&&Array.isArray(w.terrain)&&w.terrain.length===187&&['player','home'].every(k=>Number.isInteger(rec(w[k]).x)&&Number.isInteger(rec(w[k]).y))&&['walls','berries','guards','lures'].every(k=>Array.isArray(w[k])&&w[k].length<=187)&&Number.isFinite(w.energy)&&Number.isFinite(w.turn);}

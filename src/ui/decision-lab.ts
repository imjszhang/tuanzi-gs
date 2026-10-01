/** A transparent experimental clone; it never controls the main game's world. */
import {TASKS,runExperiment,solveReference,createFixture} from '../decision/experiment.js';
import type {TaskId,ExperimentResult} from '../decision/experiment.js';
import type {Strategy} from '../decision/pipeline.js';
import {remoteJudgments} from '../decision/providers.js';
import {escape,icon} from './icons.js';
import type {GameState} from '../game/types.js';
export const STRATEGY_LABELS:Record<Strategy,string>={direct:'直接 Choice',batch:'独立拆分 · 合批',serial:'独立拆分 · 逐题',dependent:'先判断适用性 → 再选'};
export function mountDecisionLab(parent:HTMLElement,connection:()=>{available:boolean;token:string;jevReady:boolean;llmReady:boolean},pauseMain:()=>void){
 const section=document.createElement('section');section.className='decision-lab';section.id='decision-lab';section.innerHTML=`
 <div class="lab-heading"><div><div class="eyebrow">JUDGMENT COMPOSITION LAB · v0.4</div><h2>同一份事实，四种判断方式。</h2><p>保持目标与权限不变，观察问题怎样组合、何时获取新证据，以及真实开销。</p></div><span class="tag" id="lab-status">离线实验就绪</span></div>
 <div class="lab-controls">
 <label>任务契约<select id="lab-task">${Object.entries(TASKS).map(([id,t])=>`<option value="${id}" ${id==='energy'?'selected':''}>${t.title}</option>`).join('')}</select></label>
 <label>判断组织<select id="lab-strategy">${Object.entries(STRATEGY_LABELS).map(([id,label])=>`<option value="${id}" ${id==='batch'?'selected':''}>${label}</option>`).join('')}</select></label>
 <label>判断器<select id="lab-backend"><option value="rule">共享事实规则（离线）</option><option value="jev" disabled>Jev（真实请求）</option><option value="llm" disabled>廉价 LLM（真实请求）</option></select></label>
 <label>每请求合成延迟<select id="lab-delay"><option value="0">0 ms · 不注入</option><option value="10">10 ms · 仅模拟</option><option value="20">20 ms · 仅模拟</option><option value="50">50 ms · 仅模拟</option></select></label>
 <label>整局决策截止<select id="lab-deadline"><option value="10000">10 秒</option><option value="1000">1 秒</option><option value="150">150 ms</option><option value="60000">60 秒 · 实网测试</option></select></label>
 </div>
 <div class="lab-options"><label><input type="checkbox" id="lab-mask">初始资源未观测 · 可选读取事实</label><label><input type="checkbox" id="lab-perturb">第 3 个动作后封路 · 仅采集链任务</label><span>统一上限：512 次请求 / 512 道问题</span></div>
 <div class="lab-buttons"><button class="btn primary" id="lab-run">${icon('play')}运行当前实验</button><button class="btn soft" id="lab-compare">${icon('compare')}四组离线对照</button><button class="btn" id="lab-cancel" disabled>取消</button><button class="btn ghost" id="lab-export" disabled>${icon('download')}导出证据</button></div>
 <div class="lab-body"><div class="lab-world"><div class="section-label"><strong>实验副本 · 局部地图</strong><span id="lab-frame-label">初始状态</span></div><div class="lab-grid" id="lab-map" role="img" aria-label="同一游戏物理规则的冻结实验副本"></div><div id="lab-resources" class="lab-resources"></div><p id="lab-contract"></p><input id="lab-replay" aria-label="实验实际执行回放" type="range" min="0" max="0" value="0"><p class="small muted">实际地图 x=1..6、y=7..9 的视窗；不改动上方世界。回放只读，不重发动作。</p></div>
 <div class="lab-evidence"><div class="lab-measures" id="lab-metrics"><div><b>—</b><span>尚未运行</span></div></div><div class="lab-flow" id="lab-flow">独立判断可合批；依赖前一步答案的判断，必须等待下一轮。</div><p id="lab-verdict" class="lab-verdict">最终结果由任务契约验收，不由判断器给自己评分。</p><p id="lab-reference" class="small muted">小规模静态参考求解器只用于评估，不向任何判断器提供答案。</p><details><summary>查看任务图与每批请求</summary><pre id="lab-json">{}</pre></details></div></div>
 <div id="lab-comparison" class="lab-comparison"></div><p class="lab-boundary">离线请求是规则函数调用，不是计费 API。合成延迟不是 Jev 实测。直接判断与拆分判断使用同一证据，但问题数量和组合算法不同；“合批 vs 逐题”才是同样问题的调度对照。所有地图为开发夹具，不是未见测试集。</p>`;
 parent.insertBefore(section,parent.querySelector('.journal-panel'));const el=<T extends HTMLElement=HTMLElement>(id:string)=>section.querySelector<T>('#'+id)!;
 let busy=false,abort:AbortController|null=null,results:ExperimentResult[]=[],shown:ExperimentResult|null=null;
 const val=(id:string)=>(el<HTMLSelectElement>(id)).value;
 const task=()=>val('lab-task') as TaskId;
 const yes=(id:string)=>el<HTMLInputElement>(id).checked;
 function renderWorld(s:GameState,index:number,known=true){el('lab-map').innerHTML=Array.from({length:18},(_,i)=>{const x=i%6+1,y=Math.floor(i/6)+7,on=(p:{x:number;y:number})=>p.x===x&&p.y===y;const player=on(s.player),home=on(s.home),berry=s.berries.some(on),wall=s.walls.some(on);return `<div class="lab-tile ${wall?'is-wall':''} ${home?'is-home':''}"><small>${x},${y}</small>${wall?icon('wall'):home?icon('home'):berry?icon('berry'):''}${player?'<span class="mini-tuanzi"><i></i><i></i></span>':''}</div>`;}).join('');el('lab-resources').textContent=known?`交付 ${s.delivered}/5 · 背包 ${s.bag}/3 · 能量 ${s.energy}`:'资源字段：未知（判断器需通过 observe 读取）';el('lab-frame-label').textContent=`实际动作 ${index}`;}
 function preview(){if(busy)return;shown=null;renderWorld(createFixture(task()),0,!yes('lab-mask'));el('lab-contract').textContent=TASKS[task()].description;el('lab-perturb').toggleAttribute('disabled',task()!=='chain');el<HTMLInputElement>('lab-replay').max='0';el<HTMLInputElement>('lab-replay').value='0';}
 function readiness(){if(busy)return;const c=connection();el<HTMLOptionElement>('lab-backend').querySelector<HTMLOptionElement>('option[value="jev"]')!.disabled=!c.available||!c.jevReady;el('lab-backend').querySelector<HTMLOptionElement>('option[value="llm"]')!.disabled=!c.available||!c.llmReady;const remote=val('lab-backend')!=='rule';el<HTMLSelectElement>('lab-delay').disabled=remote;if(remote)el<HTMLSelectElement>('lab-delay').value='0';}
 function setBusy(x:boolean){busy=x;for(const id of ['lab-task','lab-strategy','lab-backend','lab-delay','lab-deadline','lab-mask','lab-perturb','lab-run','lab-compare'])el<HTMLButtonElement>(id).disabled=x;el<HTMLButtonElement>('lab-cancel').disabled=!x;if(!x){readiness();el<HTMLButtonElement>('lab-perturb').disabled=task()!=='chain';}}
 function show(r:ExperimentResult){shown=r;renderWorld(r.final,r.actions);el('lab-contract').textContent=r.task.description;const range=el<HTMLInputElement>('lab-replay');range.max=String(r.frames.length-1);range.value=range.max;
  const metrics=[['物理动作',r.actions],['补充观察',r.observations],['请求尝试',r.requests],['问题总数',r.questions],['真实 API',r.externalRequests],['耗时 ms',Math.round(r.elapsedMs)]];el('lab-metrics').innerHTML=metrics.map(([n,v])=>`<div><b>${v}</b><span>${n}</span></div>`).join('');
  const last=r.runs.at(-1);el('lab-flow').textContent=last?`最后一次决策：${last.batches.map(b=>`[${b.questionCount} 题${b.dependencies.length?' · 读取前轮证据':''}]`).join(' → ')}；依赖波次 ${last.dependencyWaves}`:'请求尚未完成';
  el('lab-verdict').textContent=`${r.status==='succeeded'?'任务通过':'未通过 / 已停止'} · ${STRATEGY_LABELS[r.strategy]} · ${r.reason??r.task.description} · ${r.simulationChecks} 次在线单步模拟${r.syntheticDelayMs?` · 每请求合成等待 ${r.syntheticDelayMs} ms（非模型测速）`:''}`;
  el('lab-json').textContent=JSON.stringify({task:r.task,scope:'actual execution, no fabricated model thought',lastPacket:r.packets.at(-1),lastRun:last},null,2);
  el('lab-reference').textContent=r.oracle?.status==='OPTIMAL'?`独立静态 BFS：最少 ${r.oracle.steps} 个物理动作；本轮 ${r.actions}。仅此完整状态、固定目标、静态夹具适用。`:r.oracle?`参考求解状态 ${r.oracle.status}（展开 ${r.oracle.expanded}）；未声称得到最优解。`:'本轮含隐藏观察、扰动或使用复杂夹具；不把静态全知参考直接当成同等信息最优。';
 }
 function compareTable(){el('lab-comparison').innerHTML=results.length<2?'':`<div class="section-label"><strong>同一初始条件 · 同一验收 · 同一规则判断器</strong><span>不是模型胜负表</span></div><div class="lab-table-scroll"><table><thead><tr><th>组织方式</th><th>结果</th><th>物理步数</th><th>请求 / 问题</th><th>实际 API</th><th>耗时</th></tr></thead><tbody>${results.map((r,i)=>`<tr><td><button class="lab-row" data-result="${i}">${STRATEGY_LABELS[r.strategy]}</button></td><td>${r.status==='succeeded'?'通过':escape(r.status)}</td><td>${r.actions}</td><td>${r.requests} / ${r.questions}</td><td>${r.externalRequests}</td><td>${Math.round(r.elapsedMs)} ms</td></tr>`).join('')}</tbody></table></div>`;section.querySelectorAll<HTMLButtonElement>('[data-result]').forEach(b=>b.onclick=()=>show(results[Number(b.dataset.result)]!));}
 async function run(compare=false){if(busy)return;pauseMain();const id=task(),selected=val('lab-strategy') as Strategy,backendKind=val('lab-backend'),c=connection();if(!compare&&backendKind!=='rule'&&(!c.available||(backendKind==='jev'?!c.jevReady:!c.llmReady))){el('lab-status').textContent='真实判断器未配置；没有请求';return;}
  const masked=yes('lab-mask'),perturbed=yes('lab-perturb')&&id==='chain',delay=Number(val('lab-delay')),deadline=Number(val('lab-deadline'));abort=new AbortController();setBusy(true);results=[];el('lab-comparison').innerHTML='';el('lab-status').textContent=compare?'正在运行四组离线对照':'实验运行中';el<HTMLButtonElement>('lab-export').disabled=true;
  try{for(const strategy of compare?(['direct','batch','serial','dependent'] as Strategy[]):[selected]){if(abort.signal.aborted)break;await new Promise(r=>setTimeout(r,0));const remote=!compare&&backendKind!=='rule';
   const r=await runExperiment(id,{strategy,maskResources:masked,perturb:perturbed,delayMs:remote?0:delay,deadlineMs:deadline,signal:abort.signal,...(remote?{backend:remoteJudgments(c.token,backendKind as 'jev'|'llm')}:{})},update=>{if(update.final)renderWorld(update.final,update.final.turn-createFixture(id).turn,(update.packets?.at(-1)?.projection as any)?.observation?.resources!=='unknown');if(update.runs)el('lab-status').textContent=`${STRATEGY_LABELS[strategy]} · 已完成 ${update.runs.length} 次决策`;});
   if(id!=='chain'&&!masked&&!perturbed)r.oracle=solveReference(r.initial,r.task,5000);results.push(r);show(r);compareTable();}
   el('lab-status').textContent=abort.signal.aborted?'实验已取消':results.some(r=>r.externalRequests)?'实际请求已记录':'离线实验完成 · 0 外部请求';
  }catch(e){el('lab-status').textContent='实验停止';el('lab-verdict').textContent=String(e);}
  finally{setBusy(false);el<HTMLButtonElement>('lab-export').disabled=!results.length;abort=null;}
 }
 el('lab-run').onclick=()=>void run(false);el('lab-compare').onclick=()=>void run(true);el('lab-cancel').onclick=()=>abort?.abort(Error('user_cancelled'));
 el('lab-export').onclick=()=>{const blob=new Blob([JSON.stringify({schema:'gs/experiment-suite/v04',scope:'development fixtures; no model claims for offline rows',results},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='gs-judgment-experiments-v04.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 el('lab-task').onchange=preview;el('lab-mask').onchange=preview;el('lab-backend').onchange=readiness;
 el('lab-replay').oninput=()=>{if(shown){const i=Number(el<HTMLInputElement>('lab-replay').value);renderWorld(shown.frames[i]!,i,true);}};
 section.addEventListener('pointerenter',readiness);section.addEventListener('focusin',readiness);
 preview();readiness();return {refresh:readiness,results:()=>structuredClone(results),runOffline:async()=>{el<HTMLSelectElement>('lab-backend').value='rule';await run(true);return structuredClone(results);}};
}

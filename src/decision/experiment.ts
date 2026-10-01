/** Small frozen fixtures in the SAME GameWorld, evaluated by immutable task contracts.
 * Reference BFS is evaluation-only. It is never included in a selector packet. */
import type {Json,Candidate,Domain,Snapshot,Context,Receipt,ExecuteRequest,Feedback,Judgment,EngineEvent,StepResult} from '../../vendor/gs-engine-ts/src/types.js';
import {GSEngine} from '../../vendor/gs-engine-ts/src/engine.js';
import type {JudgmentBackend,ScheduleReport} from '../../vendor/gs-engine-ts/src/judgment.js';
import {JudgmentError} from '../../vendor/gs-engine-ts/src/judgment.js';
import type {DecisionPacket} from '../../vendor/gs-engine-ts/src/decision.js';
import {evidenceKey} from '../../vendor/gs-engine-ts/src/decision.js';
import {packet} from '../skills/facts.js';
import {GameWorld,createWorld,path,reachableBerries,applyAction} from '../game/world.js';
import {simulate,legalPrimitives,physicalKey} from '../planning/search.js';
import {actionKey,exactWorldKey} from '../planning/programs.js';
import type {GameState,GameAction,EditTool,Point} from '../game/types.js';
import {describeAction} from '../game/domain.js';
import {evaluatePacket,ruleBackend} from './pipeline.js';
import type {Strategy,Assessment} from './pipeline.js';
export type TaskId='fast'|'reserve'|'energy'|'chain';
export type TaskContract={schema:'gs/task-contract/v1';id:TaskId;version:1;title:string;description:string;delivery:number;reserve:number;energy:number;maxActions:number};
export const TASKS:Record<TaskId,TaskContract>={
 fast:{schema:'gs/task-contract/v1',id:'fast',version:1,title:'尽快交付',description:'尽快完成第五颗浆果交付并存活。多余背包资源无额外目标。',delivery:5,reserve:0,energy:1,maxActions:20},
 reserve:{schema:'gs/task-contract/v1',id:'reserve',version:1,title:'保留两颗',description:'完成第五颗交付时，背包还要保留至少两颗浆果。',delivery:5,reserve:2,energy:1,maxActions:20},
 energy:{schema:'gs/task-contract/v1',id:'energy',version:1,title:'为下一程补能',description:'完成第五颗交付时，能量至少 35。允许食用背包浆果。',delivery:5,reserve:0,energy:35,maxActions:20},
 chain:{schema:'gs/task-contract/v1',id:'chain',version:1,title:'采集—返家—交付',description:'完成两颗额外交付，并在背包保留一颗、能量至少 20。采集与交付次序由当前资源决定。',delivery:5,reserve:1,energy:20,maxActions:24}
};
export type ObservationAction={kind:'observe';field:'resources'};
export type ExperimentAction=GameAction|ObservationAction;
export type ExperimentOptions={strategy:Strategy;backend?:JudgmentBackend;orderSeed?:number;maskResources?:boolean;delayMs?:number;deadlineMs?:number;perturb?:boolean;maxRequests?:number;maxObservations?:number;signal?:AbortSignal;initialWorld?:GameState;onEngineEvent?:(event:EngineEvent)=>void;maxQuestions?:number};
export type MissionFacts={current:{energy:number|null;bag:number|null;delivered:number|null};projected:{energy:number|null;bag:number|null;delivered:number|null};
 actionKind:string;amount:number;homeSteps:number|null;afterHomeSteps:number|null;berrySteps:number|null;afterBerrySteps:number|null;reachableBerries:number;priorVisits:number;capacity:number;unknownResources:boolean;source:'known-physics-observation/v1'};
export function createFixture(id:TaskId):GameState{
 const s=createWorld('meadow');s.scenario='decision-'+id;s.home={x:2,y:8};s.player=id==='chain'?{x:5,y:8}:{x:2,y:8};s.energy=id==='chain'?44:10;s.bag=id==='chain'?0:3;s.delivered=id==='chain'?3:4;
 s.terrain=s.terrain.map((_t,i)=>{const x=i%s.width,y=Math.floor(i/s.width);return x>=1&&x<=6&&y>=7&&y<=9?'grass':'rock';});s.walls=[];s.guards=[];s.lures=[];
 s.berries=id==='chain'?[{id:'r-a',x:5,y:7},{id:'r-b',x:6,y:8},{id:'r-c',x:5,y:9},{id:'r-d',x:4,y:8}]:[];
 s.lastFact='评估快照：目标契约由评估器固定，不进入模型可修改配置。';return s;
}
export function taskSuccess(s:GameState,t:TaskContract){return s.delivered>=t.delivery&&s.bag>=t.reserve&&s.energy>=t.energy&&s.energy>0;}
function closest(s:GameState){return reachableBerries(s)[0]?.route.length??null;}
function snapshotKey(s:GameState){return JSON.stringify([physicalKey(s),s.walls]);}
function idFor(a:ExperimentAction){return a.kind==='observe'?'observe:resources':actionKey(a);}
/** Authored comparison policy, separate from the exhaustive reference verifier. */
export function missionAssessment(p:DecisionPacket,id:string):Assessment{
 const f=p.candidates.find(c=>c.id===id)!.facts as MissionFacts,t=(p.preferences as any).contract as TaskContract;
 if(f.unknownResources)return {fit:f.actionKind==='observe',priority:f.actionKind==='observe'?6:0};
 if(f.actionKind==='observe')return {fit:false,priority:0};
 const e=f.current.energy!,bag=f.current.bag!,del=f.current.delivered!,after=f.projected;
 const need=Math.max(0,t.delivery-del),total=need+t.reserve;
 // Completion with fixed constraints has first priority; preserving surplus reduces tie ambiguity.
 if(after.energy!>=t.energy&&after.bag!>=t.reserve&&after.delivered!>=t.delivery)return {fit:true,priority:5.9-Math.max(0,after.delivered!-t.delivery)*.02};
 let score=-100;
 if(f.actionKind==='eat'&&bag>0&&(e<t.energy+1||(e<12&&(bag>total||f.reachableBerries>0))))score=95;
 if(f.actionKind==='pickup'&&bag<Math.min(f.capacity,total))score=80;
 if(f.actionKind==='deposit'&&need>0){const desired=Math.min(need,Math.max(0,bag-t.reserve));if(f.amount===desired&&desired>0&&e>t.energy)score=85;}
 if(f.actionKind==='move'){
  if(bag>=Math.min(f.capacity,total)&&need>0&&f.homeSteps!==null&&f.afterHomeSteps!==null)score=30+(f.homeSteps-f.afterHomeSteps)*12;
  else if(bag<Math.min(f.capacity,total)&&f.berrySteps!==null&&f.afterBerrySteps!==null)score=30+(f.berrySteps-f.afterBerrySteps)*12;
  score-=f.priorVisits*8;
 }
 return {fit:score>0,priority:Math.max(0,Math.min(5.8,score/20+1))};
}
export type ExperimentResult={schema:'gs/experiment/v04';task:TaskContract;strategy:Strategy;backend:string;backendKind:string;
 status:string;reason:string|null;initial:GameState;final:GameState;actions:number;observations:number;requests:number;externalRequests:number;questions:number;simulationChecks:number;elapsedMs:number;
 syntheticDelayMs:number;deadlineMs:number;packets:DecisionPacket[];runs:ScheduleReport[];events:EngineEvent[];frames:GameState[];
 perturbations:number;realModels:'NOT_RUN'|'REQUESTED';oracle:null|OracleResult};
export type OracleResult={status:'OPTIMAL'|'EXHAUSTED'|'INFEASIBLE_WITHIN_HORIZON';steps:number|null;expanded:number;maxNodes:number;label:string};
/** Unit-cost BFS over actual simulator states. Bound exhaustion is NOT an optimality claim. */
export function solveReference(initial:GameState,t:TaskContract,maxNodes=50000):OracleResult{
 const q:{s:GameState;depth:number}[]=[{s:structuredClone(initial),depth:0}],seen=new Set([snapshotKey(initial)]);let at=0;
 while(at<q.length&&at<maxNodes){const {s,depth}=q[at++]!;if(taskSuccess(s,t))return {status:'OPTIMAL',steps:depth,expanded:at,maxNodes,label:'Full-state, static-world, unit physical action BFS; not available to agent.'};if(depth>=t.maxActions)continue;
  for(const a of legalPrimitives(s)){const n=simulate(s,a);if(n.energy<=0||n.attacks>initial.attacks)continue;const key=snapshotKey(n);if(seen.has(key))continue;if(q.length>=maxNodes*3)return {status:'EXHAUSTED',steps:null,expanded:at,maxNodes,label:'BFS queue budget exhausted; no optimal claim.'};seen.add(key);q.push({s:n,depth:depth+1});}
 }
 return {status:at>=maxNodes?'EXHAUSTED':'INFEASIBLE_WITHIN_HORIZON',steps:null,expanded:at,maxNodes,label:'No optimal answer claimed unless BFS returned OPTIMAL.'};
}
/** Incremental form used by both the original batch runner and the shared-session service.
 * Construct just before first use: its wall-clock deadline includes subsequent pauses. */
export function createExperimentSession(id:TaskId,options:ExperimentOptions,onEvent:(result:Partial<ExperimentResult>)=>void=()=>{}){
 if(!TASKS[id]||!['direct','batch','serial','dependent'].includes(options.strategy))throw Error('invalid experiment configuration');
 for(const [key,value]of Object.entries({deadlineMs:options.deadlineMs??10000,maxRequests:options.maxRequests??512}))if(!Number.isSafeInteger(value)||value<1||value>120000)throw Error('invalid '+key);
 if(options.delayMs!==undefined&&(!Number.isSafeInteger(options.delayMs)||options.delayMs<0||options.delayMs>1000))throw Error('invalid synthetic delay');
 const t=structuredClone(TASKS[id]),initial=structuredClone(options.initialWorld??createFixture(id)),world=new GameWorld(initial),packets:DecisionPacket[]=[],runs:ScheduleReport[]=[],events:EngineEvent[]=[],frames=[initial];
 const backend=options.backend??ruleBackend(missionAssessment,options.delayMs??0),lifetime=new AbortController(),signal=options.signal?AbortSignal.any([lifetime.signal,options.signal]):lifetime.signal;
 const started=performance.now(),deadline=options.deadlineMs??10000;let known=!options.maskResources,obsVersion=0,observations=0,actions=0,requests=0,questions=0,externalRequests=0,perturbations=0,simulationChecks=0;
 const log=(e:EngineEvent)=>{events.push(e);options.onEngineEvent?.(e);};
 const project=(s:GameState,a:GameAction)=>{simulationChecks++;return simulate(s,a);};
 const visits:Record<string,number>={};let nextPacket:DecisionPacket|undefined;
 const revision=()=>`${world.snapshot().revision}/knowledge-${obsVersion}`;
 const domain:Domain<GameState,ExperimentAction,{fixed:true}>={
  async observe(s){s.throwIfAborted();return {state:world.snapshot(),revision:revision(),observedAt:Date.now()};},
  enumerate(ctx){nextPacket=undefined;const s=ctx.snapshot.state;const cs:Candidate<ExperimentAction>[]=legalPrimitives(s).filter(a=>{const n=project(s,a);return n.energy>0&&n.attacks<=s.attacks;}).map(a=>({id:idFor(a),description:describeAction(a),action:a,capability:`game.${a.kind}`}));
   if(!known)cs.push({id:'observe:resources',description:'读取当前能量、背包与交付事实；不移动角色，不推进物理回合。',action:{kind:'observe',field:'resources'},capability:'observe.resources'});
   const candidates=cs.map(c=>{const a=c.action,n=a.kind==='observe'?s:project(s,a);const facts:MissionFacts={current:{energy:known?s.energy:null,bag:known?s.bag:null,delivered:known?s.delivered:null},projected:{energy:known?n.energy:null,bag:known?n.bag:null,delivered:known?n.delivered:null},actionKind:a.kind,amount:a.kind==='deposit'?a.amount:0,homeSteps:path(s,s.player,s.home)?.length??null,afterHomeSteps:path(n,n.player,n.home)?.length??null,berrySteps:closest(s),afterBerrySteps:closest(n),reachableBerries:reachableBerries(s).length,priorVisits:a.kind==='move'?(visits[`${a.x},${a.y}`]??0):0,capacity:s.capacity,unknownResources:!known,source:'known-physics-observation/v1'};return {id:c.id,description:c.description,action:a,facts};});
   if(candidates.length)nextPacket=packet({level:'parent',goal:t.description,snapshotRevision:ctx.snapshot.revision,policyVersion:1,orderSeed:(options.orderSeed??441)+s.turn,scope:{name:'mission-safe-primitives/v04',note:'All currently legal one-step-safe primitives; action affordances visible. Resource fields require the declared observe action when masked. No future oracle.'},projection:{task:t,observation:{resources:known?'observed':'unknown'},position:s.player},preferences:{contract:t},candidates});
   return nextPacket?nextPacket.candidates.map(c=>cs.find(x=>x.id===c.id)!):[];
  },
  gate(ctx,c){if(c.action.kind==='observe')return !known&&observations<(options.maxObservations??1)?{kind:'allow'}:{kind:'deny',reason:'observation unavailable/budget'};
   if(!legalPrimitives(ctx.snapshot.state).some(a=>actionKey(a)===c.id))return {kind:'deny',reason:'not legal'};const n=project(ctx.snapshot.state,c.action);return n.energy>0&&n.attacks<=ctx.snapshot.state.attacks?{kind:'allow'}:{kind:'deny',reason:'unsafe'};},
  async execute(req,s){s.throwIfAborted();if(req.expectedRevision!==revision())return {status:'stale',detail:'changed before action'};
   if(performance.now()-started>=deadline)return {status:'failed',detail:'deadline before action'};
   if(req.candidate.action.kind==='observe'){if(known||observations>=(options.maxObservations??1))return {status:'failed',detail:'observation budget'};known=true;obsVersion++;observations++;log({runId:'experiment',seq:events.length+1,cycle:0,at:Date.now(),type:'observation_acquired',data:{fields:['energy','bag','delivered'],revision:revision(),physicalActions:0}});return {status:'applied',detail:'Current resources observed; new knowledge revision.'};}
   const a=req.candidate.action,before=world.snapshot(),expected=project(before,a);
   if(!world.transact(String(before.revision),draft=>applyAction(draft,a)))return {status:'stale',detail:'world revision changed'};if(exactWorldKey(expected)!==exactWorldKey(world.snapshot()))return {status:'unknown',detail:'actual result mismatch'};actions++;if(a.kind==='move')visits[`${a.x},${a.y}`]=(visits[`${a.x},${a.y}`]??0)+1;
   if(options.perturb&&id==='chain'&&actions===3){const edit=world.edit('wall',{x:3,y:8});if(edit.ok)perturbations++;log({runId:'experiment',seq:events.length+1,cycle:0,at:Date.now(),type:'scripted_environment_change',data:{afterPhysicalAction:3,wall:{x:3,y:8},applied:edit.ok}});}
   frames.push(world.snapshot());return {status:'applied',detail:'GameWorld physical step; simulator preconditions rechecked.'};
  },
  completion(s){return taskSuccess(s.state,t)?'succeeded':s.state.energy<=0||s.state.delivered>=t.delivery||actions>=t.maxActions?'failed':'running';},
  feedback(before,c,receipt,after){return {actionSucceeded:receipt.status==='applied',progress:receipt.status==='applied',metrics:{energyDelta:after.state.energy-before.state.energy,deliveredDelta:after.state.delivered-before.state.delivered},facts:[receipt.detail]};},
  parsePolicy(raw){if(!raw||typeof raw!=='object'||(raw as any).fixed!==true||Object.keys(raw).length!==1)throw Error('immutable experimental policy');return {fixed:true};},validatePolicy(){return [];}
 };
 const engine=new GSEngine<GameState,ExperimentAction,{fixed:true}>({runId:'decision-experiment',goal:{id:t.id,description:t.description,verifierId:'task-contract/v1'},initialPolicy:{id:'fixed-experiment',version:1,body:{fixed:true}},domain,
 limits:{maxCycles:60,maxActions:60,maxModelCalls:60,maxRepairs:1,maxDurationMs:deadline,ioTimeoutMs:Math.min(25000,deadline),noProgressWindow:40,historySize:8},
 selector:{evaluate:async(ctx,cs,s)=>{const p=nextPacket!;packets.push(p);try{const remaining=deadline-(performance.now()-started);if(remaining<1)throw Error('judgment_deadline');
   const result=await evaluatePacket(p,options.strategy,backend,{signal:s,maxRequests:Math.max(1,(options.maxRequests??512)-requests),maxQuestions:(options.maxQuestions??512)-questions,timeoutMs:Math.max(1,Math.floor(remaining)),currentKey:()=>revision()===p.snapshotRevision?p.id:'stale',charge:n=>{if(requests+1>(options.maxRequests??512))throw Error('request budget exhausted');requests++;questions+=n.questions;externalRequests+=n.externalRequests;}});runs.push(result.report);onEvent({runs,packets,final:world.snapshot()});return {output:result.judgment};
  }catch(e){if(e instanceof JudgmentError)runs.push(e.report);throw e;}}},
 arbiter:{decide:(_ctx,cs,j)=>j.choice&&cs.some(c=>c.id===j.choice)?{kind:'execute',candidateId:j.choice}:{kind:'pause',reason:'no_suitable_candidate'}},
 planner:{propose:async()=>({output:{}})},journal:{append:e=>log(e)}});
 let last:StepResult|undefined;
 let busy=false;
 const finished=()=>!!last&&['done','fault','paused','stopped'].includes(last.kind);
 const result=():ExperimentResult=>({schema:'gs/experiment/v04',task:t,strategy:options.strategy,backend:backend.id,backendKind:backend.kind,status:last?.kind==='done'?last.outcome:last?.kind??'ready',reason:last&&'reason'in last?last.reason:null,initial,final:world.snapshot(),actions,observations,requests,externalRequests,questions,simulationChecks,elapsedMs:performance.now()-started,syntheticDelayMs:options.delayMs??0,deadlineMs:deadline,packets,runs,events,frames,perturbations,realModels:backend.kind==='rule'||backend.kind==='mock'?'NOT_RUN':'REQUESTED',oracle:null});
 return {
  world, engine, get finished(){return finished();}, get lastResult(){return last;},
  async step(){if(busy)throw Error('concurrent_experiment_step');if(finished())return last!;busy=true;try{last=await engine.step(signal);return last;}finally{busy=false;}},
  cancel(){lifetime.abort(new Error('experiment cancelled'));engine.cancel();},
  edit(tool:EditTool,p:Point){if(busy)throw Error('experiment_busy');const r=world.edit(tool,p);if(r.ok){perturbations++;frames.push(world.snapshot());log({runId:'experiment',seq:events.length+1,cycle:engine.counters.cycles,at:Date.now(),type:'external_intervention',data:{tool,point:p}});}return r;},
  result, export:result,
 };
}
export async function runExperiment(id:TaskId,options:ExperimentOptions,onEvent:(result:Partial<ExperimentResult>)=>void=()=>{}):Promise<ExperimentResult>{
 const session=createExperimentSession(id,options,onEvent);
 for(let i=0;i<60&&!session.finished;i++)await session.step();
 return session.result();
}

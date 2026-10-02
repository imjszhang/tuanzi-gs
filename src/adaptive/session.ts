/** v0.5 autonomous lane: incomplete, fallible S + evidence-driven G reconfiguration.
 * Deliberately no imports of reference skills/search/plan or old failure records.
 */
import {AdaptiveGS,AdaptiveStale,InvalidAdaptation} from '../../vendor/gs-engine-ts/src/adaptive.js';
import type {AdaptiveFrame,AdaptivePatch,AdaptationRequest,OutputRepairRequest,AdaptiveEvent,AdaptiveAnswer,AdaptiveSubproblem} from '../../vendor/gs-engine-ts/src/adaptive.js';
import type {EngineEvent,StepResult,ModelResult} from '../../vendor/gs-engine-ts/src/types.js';
import type {JudgmentBackend} from '../../vendor/gs-engine-ts/src/judgment.js';
import {stableJson,evidenceKey} from '../../vendor/gs-engine-ts/src/decision.js';
import {GameWorld,applyAction} from '../game/world.js';
import {GOAL} from '../game/types.js';
import type {GameState,GameAction,EditTool,Point} from '../game/types.js';
import {PUBLIC_RULES,publicWorld,legalActions,actionId,actionWire,describe,observe,measured,stageComplete,actionFacts} from './world-port.js';
import {parsePatches,parseProgram,programWarnings,KINDS,GROUPS} from './spec.js';
import {repairIntegrity,integrityDiagnostics} from './repair.js';
import {assertConditions,scopeExpired,conditionIssues} from './conditions.js';
import type {Program,Patch,Stage,ProgramPatch,StagePatch} from './spec.js';
import {judge} from './judgment.js';
import type {Strategy} from './judgment.js';
export type AdaptiveGenerator={id:string;kind:'local'|'llm'|'mock';propose(input:AdaptationRequest|OutputRepairRequest,signal:AbortSignal):Promise<ModelResult<unknown>>};
export type AdaptiveMemory={schema:'gs/self-memory/v05';informationPolicy:'no-reference/v05';records:SelfRecord[]};
export type SelfRecord={program:Program;source:'llm'|'local'|'mock';worldEvidence:string;status:'trial'|'local-completed'|'root-succeeded'|'failed'|'interrupted';actualActions:number;deliveredDelta:number;attacks:number};
export const INITIAL_REVIEW_CAUSE='initial_environment_review';
export type InitializationState={policy:'g-before-action/v054';status:'pending'|'reviewing'|'ready'|'failed'|'skipped-terminal';reviewCount:number;reviewedRevision:string|null;policyVersion:number|null;reason:string|null};
export type AdaptiveOptions={backend:JudgmentBackend;generator:AdaptiveGenerator;strategy:Strategy;orderSeed:number;signal?:AbortSignal;experience?:'off'|'record'|'use';memory?:AdaptiveMemory;maxActions?:number;maxSteps?:number;maxGCalls?:number;gTimeoutMs?:number;maxDepth?:number;maxRevisions?:number;maxFormatRepairs?:number;noProgressWindow?:number;deadlineMs?:number};
const baseStage=():Stage=>({name:'初始局部判断',question:'根据当前有限观测选择一个有助于根目标的合法动作；不能决定时保留 none。',hypothesis:'尚无生成策略。信息可能不完整；S 允许出错或弃权。',groups:['self','nearby'],ruleIds:['goal','coordinates','energy','inventory','wait'],kinds:[...KINDS],target:null,candidateIds:null,until:[{kind:'delta',field:'delivered',atLeast:1}],maxActions:24});
export class AutonomousSession{
 readonly world:GameWorld;readonly runId=`adaptive-${crypto.randomUUID()}`;readonly initial:GameState;readonly events:EngineEvent[]=[];readonly decisions:unknown[]=[];readonly history:ReturnType<typeof measured>[]=[];
 readonly audit:{role:'G'|'S';depth:number;input:unknown;output?:unknown;error?:string;source:string;elapsedMs:number}[]=[];
 readonly records:SelfRecord[]=[];private program:Program={schema:'gs/decision-program/v1',title:'未形成策略',stages:[baseStage()]};private stageIndex=0;private stageStart:GameState;private programStart:GameState;private policyVersion=1;
 private formatRepairs=0;private invalidOutputs=0;private validBatches=0;private revisionAttempts=0;private committedRevisions=0;private latestValidation:unknown=null;private cumulativeBefore={generations:0,formatRepairs:0,invalidOutputs:0,validBatches:0,revisionAttempts:0,committed:0};
 private seq=0;private cycles=0;private gCalls=0;private sCalls=0;private metaCalls=0;private abort=new AbortController();private started=0;private busy=false;private issue:string|undefined;private activeDepth=0;private phase='ready';private previousIssue:unknown=null;private activeRecord:SelfRecord|undefined;private readonly subproblemResults:unknown[]=[];private interventions=0;private stopReason:string|null=null;
 private initialization:InitializationState={policy:'g-before-action/v054',status:'pending',reviewCount:0,reviewedRevision:null,policyVersion:null,reason:null};
 finished=false;lastResult:StepResult|undefined;lastDecision:unknown=null;
 constructor(initial:GameState,private readonly options:AdaptiveOptions,private readonly notify:(e:EngineEvent)=>void=()=>{}){
  this.initial=structuredClone(initial);this.world=new GameWorld(initial);this.stageStart=structuredClone(initial);this.programStart=structuredClone(initial);
  if(options.memory){if(options.memory.schema!=='gs/self-memory/v05'||options.memory.informationPolicy!=='no-reference/v05')throw Error('foreign_memory_forbidden');for(const r of options.memory.records.slice(-24)){parseProgram(r.program,Object.keys(PUBLIC_RULES));if(!['llm','mock','local'].includes(r.source))throw Error('foreign_memory_source');this.records.push(structuredClone(r));}}
 }
 private emit(type:string,data:unknown){const e:EngineEvent={runId:this.runId,seq:++this.seq,cycle:this.cycles,at:Date.now(),type,data:structuredClone(data)};this.events.push(e);this.notify(e);}
 private check(revision:string,signal:AbortSignal){signal.throwIfAborted();if(this.finished)throw Error('run_finished');if(String(this.world.snapshot().revision)!==revision)throw new AdaptiveStale('world_changed_during_decision');if(this.started&&performance.now()-this.started>=(this.options.deadlineMs??120000))throw Error('root_deadline_exhausted');}
 private get stage(){return this.program.stages[this.stageIndex]??baseStage();}
 private recent(){return this.history.slice(-8);}
 private actionFrame(program=this.program,index=this.stageIndex,start=this.stageStart):AdaptiveFrame{
  const s=this.world.snapshot(),stage=program.stages[index]??baseStage();const base=legalActions(s);const legal=base.filter(a=>!scopeExpired(stage,s)&&stage.kinds.includes(a.kind)&&(!stage.candidateIds||stage.candidateIds.includes(actionId(a))));
  // Seed permutation never uses a task score. G-supplied filters are explicit and audited.
  legal.sort((a,b)=>evidenceKey([this.options.orderSeed,s.turn,actionId(a)]).localeCompare(evidenceKey([this.options.orderSeed,s.turn,actionId(b)])));
  const options=legal.map(a=>({id:actionId(a),description:describe(a),value:{action:actionWire(a),facts:actionFacts(s,a,stage.target)}}));
  return {kind:'action',revision:String(s.revision),question:stage.question,context:{schema:'gs/s-context/v05',startupReview:{state:this.initialization.status==='ready'?'committed':'pending',meaning:'Initial conditions reviewed for trial, not certified correct.'},rootGoal:GOAL,localObjective:stage.question,gHypothesis:{text:stage.hypothesis,status:'unverified-generator-hypothesis'},rules:Object.fromEntries(stage.ruleIds.map(id=>[id,PUBLIC_RULES[id]])),observation:observe(s,stage.groups,this.recent()),target:stage.target,stage:{until:stage.until,usedActions:s.turn-start.turn,maxActions:stage.maxActions},candidateScope:{allLegal:base.map(actionId),allowedKinds:stage.kinds,allowedIds:stage.candidateIds,lifecycle:stage.candidateIds===null?'dynamic-kinds':stage.candidateScope?.mode??'legacy-fixed-stage',scopeRevision:stage.candidateScope?.mode==='snapshot'?stage.candidateScope.revision:null,expired:scopeExpired(stage,s),excluded:base.filter(a=>!legal.some(b=>actionId(b)===actionId(a))).map(actionId)},epistemicBoundary:'Missing observations are intentional; no reference answer, rank, future rollout, tactical binding or guaranteed strategy is supplied.'},options};
 }
 private evidence(){return {schema:'gs/g-evidence/v05',informationPolicy:'no-reference/v05',rootGoal:GOAL,publicRules:PUBLIC_RULES,observedWorld:publicWorld(this.world.snapshot()),availableActions:legalActions(this.world.snapshot()).map(a=>({id:actionId(a),action:actionWire(a),description:describe(a)})),currentProgram:this.program,policyVersion:this.policyVersion,currentStage:this.stageIndex,measuredHistory:this.recent(),selectorHistory:this.decisions.filter((d:any)=>d.packet?.level==='child').slice(-3),selfMemory:this.options.experience==='use'?this.records.slice(-12):[],previousIssue:this.previousIssue,subproblemResults:this.subproblemResults.slice(-4),initialization:{...this.initialization,actionSelectorHasRun:this.decisions.some((d:any)=>d.depth===0),frameRole:this.initialization.status==='reviewing'?'unexecuted-action-frame-draft':'current-decision-frame'},budget:{gUsed:this.gCalls,gLimit:this.options.maxGCalls??12,depthLimit:this.options.maxDepth??2,remainingActions:(this.options.maxActions??180)-(this.world.snapshot().turn-this.initial.turn)},notAvailable:['reference-controller outputs','reference solutions','reference simulation validation','optimized placement','future intervention schedule']};}
 private parse(raw:unknown,frame:AdaptiveFrame):AdaptivePatch[]{
  if(raw&&typeof raw==='object'&&'invalidProposal'in raw){const m=(raw as any).invalidProposal;throw new InvalidAdaptation(String(m.reason??'invalid output'),m.diagnostics);}
  return parsePatches(raw,frame.kind,Object.keys(PUBLIC_RULES)).map((value,i)=>{
   const p=value.kind==='program'?value.program:value.kind==='stage-update'&&value.expectedPolicyVersion===this.policyVersion&&value.stageIndex===this.stageIndex?this.previewProgram(value):null;
   const warnings=p?programWarnings(p):[];if(warnings.length)this.emit('proposal_warnings',{index:i,warnings,scope:'advisory-static-consistency-no-strategy-verification'});
   return {id:`proposal-${i}`,description:value.kind==='program'?value.program.title:value.kind==='stage-update'?`局部修订阶段 ${value.stageIndex+1}：${Object.keys(value.changes).join('、')}`:value.kind==='subproblem'?`子问题：${value.task.question}`:value.question,value,warnings};
  });
 }
 private previewProgram(p:ProgramPatch|StagePatch):Program{
  if(p.kind==='program')return p.program;
  if(p.expectedPolicyVersion!==this.policyVersion||p.stageIndex!==this.stageIndex)throw new InvalidAdaptation('stale_stage_update',{schema:'gs/output-validation/v1',issues:[{path:'/proposals',code:'stale_stage_update',message:'Local update must refer to current policy and stage',expected:{policyVersion:this.policyVersion,stageIndex:this.stageIndex}}]});
  const next=structuredClone(this.program);next.stages[this.stageIndex]={...next.stages[this.stageIndex]!,...structuredClone(p.changes)};return parseProgram(next,Object.keys(PUBLIC_RULES));
 }
 private apply(frame:AdaptiveFrame,proposal:AdaptivePatch):AdaptiveFrame{const p=proposal.value as Patch;
  if(frame.kind==='action'){if(p.kind!=='program'&&p.kind!=='stage-update')throw new InvalidAdaptation('wrong patch kind');
   const program=this.previewProgram(p);assertConditions(program,p.kind==='stage-update'?this.stageIndex:0,this.world.snapshot(),p.kind==='stage-update'?this.stageStart:this.world.snapshot());const next=p.kind==='stage-update'?this.actionFrame(program,this.stageIndex,this.stageStart):this.actionFrame(program,0,this.world.snapshot());
   // Startup is a real pending->committed transition: G may affirm an unchanged
   // interface after reviewing this snapshot. Only this initial gate can do so;
   // later title-only/clock-reset repairs still fail the same deduplication.
   if(this.initialization.status==='reviewing'){const c=next.context as Record<string,unknown>;next.context={...c,startupReview:{state:'committed',meaning:'Initial conditions reviewed for trial, not certified correct.'}};}
   // Resetting a stage clock is not new evidence or a new decision condition.
   const content=(f:AdaptiveFrame)=>{const c=f.context as Record<string,unknown>,stage=c.stage as Record<string,unknown>;return {...f,context:{...c,stage:{...stage,usedActions:null}}};};
   return stableJson(content(frame))===stableJson(content(next))?frame:next;
  }
  if(frame.kind==='analysis'){
   if(p.kind!=='analysis')throw new InvalidAdaptation('analysis_frame_requires_analysis_patch');
   if(new Set(p.candidates.map(c=>c.id)).size!==p.candidates.length)throw new InvalidAdaptation('duplicate_analysis_candidate');
   return {...frame,question:p.question,context:{schema:'gs/analysis-context/v054',task:(frame.context as any).task,
    rootGoal:GOAL,parentIssue:(frame.context as any).parentIssue,
    hypothesis:{text:p.hypothesis,status:'unverified-generator-hypothesis'},
    rules:Object.fromEntries(p.ruleIds.map(id=>[id,PUBLIC_RULES[id]])),observation:observe(this.world.snapshot(),p.groups,this.recent()),
    epistemicBoundary:'Read-only child hypothesis selection; no world actions, policy approval, or certified truth.'},
    options:p.candidates.map(c=>({id:c.id,description:c.description,value:{claim:c.claim,epistemicStatus:'unverified-generator-hypothesis'}}))};
  }
  if(p.kind!=='reframe')throw new InvalidAdaptation('wrong patch kind');if(p.candidateIds?.some(id=>!frame.options.some(o=>o.id===id)))throw new InvalidAdaptation('invented_meta_candidate');
  return {...frame,question:p.question,context:{schema:'gs/meta-context/v05',originalContext:(frame.context as any)?.schema==='gs/meta-context/v05'?(frame.context as any).originalContext:frame.context,hypothesis:{text:p.hypothesis,status:'unverified-generator-hypothesis'},rules:Object.fromEntries(p.ruleIds.map(id=>[id,PUBLIC_RULES[id]])),...(p.includeBroaderObservation?{observedWorld:publicWorld(this.world.snapshot())}:{})},options:frame.options.filter(o=>!p.candidateIds||p.candidateIds.includes(o.id))};
 }
 private subproblem(frame:AdaptiveFrame,proposal:AdaptivePatch):AdaptiveSubproblem|null{
  const p=proposal.value as Patch;if(p.kind!=='subproblem')return null;
  const t=p.task;
  return {frame:{kind:'analysis',revision:frame.revision,question:t.question,options:[],
   context:{schema:'gs/analysis-context/v054',rootGoal:GOAL,task:t,parentIssue:{question:frame.question,kind:frame.kind},
    hypothesis:{text:t.hypothesis,status:'unverified-generator-hypothesis'},
    observation:observe(this.world.snapshot(),t.groups,this.recent()),rules:Object.fromEntries(t.ruleIds.map(id=>[id,PUBLIC_RULES[id]])),
    epistemicBoundary:'Read-only bounded subproblem; findings remain unverified model judgments. Return to original G, never execute.'}},
   expectedResult:t.expectedResult,maxRevisions:t.maxRevisions,maxGenerations:t.maxGenerations};
 }
 private event=(e:AdaptiveEvent)=>{
  const d=e.data as Record<string,unknown>;let initializedNow=false;this.activeDepth=Number(d.depth??this.activeDepth);
  if(e.type==='s_requested')this.phase='selecting';if(e.type==='g_requested')this.phase=d.schema==='gs/output-repair-request/v1'?'format-repairing':this.initialization.status==='reviewing'?'initializing':'adapting';
  if(e.type==='adaptation_accounting'){this.formatRepairs=this.cumulativeBefore.formatRepairs+Number(d.formatRepairs);this.invalidOutputs=this.cumulativeBefore.invalidOutputs+Number(d.invalidOutputs);this.validBatches=this.cumulativeBefore.validBatches+Number(d.validBatches);this.revisionAttempts=this.cumulativeBefore.revisionAttempts+Number(d.revisionAttempts);this.committedRevisions=this.cumulativeBefore.committed+Number(d.committed);}
  if(e.type==='subproblem_return'){this.subproblemResults.push(structuredClone(d));this.activeDepth=Number(d.parentDepth??0);}
  if(e.type==='subproblem_enter')this.phase='investigating';
  if(e.type==='same_layer_resumed'){this.activeDepth=Number(d.depth??0);this.phase='adapting';}
  if(e.type==='adaptation_rejected'&&['output-format','decision-conditions'].includes(String(d.category)))this.latestValidation=d;
  if(e.type==='adaptation_committed'&&d.depth===0){const p=d.patch as Patch;if(p.kind==='program'||p.kind==='stage-update'){
    const next=this.previewProgram(p);if(this.activeRecord?.status==='trial')this.activeRecord.status='interrupted';
    this.program=structuredClone(next);if(p.kind==='program'){this.stageIndex=0;this.stageStart=this.world.snapshot();}this.programStart=this.world.snapshot();this.policyVersion++;
    this.activeRecord={program:structuredClone(next),source:this.options.generator.kind,worldEvidence:evidenceKey(publicWorld(this.world.snapshot())),status:'trial',actualActions:0,deliveredDelta:0,attacks:0};if(this.options.experience!=='off')this.records.push(this.activeRecord);
    if(this.initialization.status==='reviewing'){this.initialization={...this.initialization,status:'ready',reviewedRevision:String(this.world.snapshot().revision),policyVersion:this.policyVersion,reason:null};initializedNow=true;}
  }}
  this.emit(e.type,e.data);
  if(initializedNow)this.emit('initialization_ready',{...this.initialization,physicalActions:this.history.length,note:'Initial decision conditions provisionally installed at the same layer; S still chooses world actions. Not proof of strategy correctness.'});
 };
 private makeResolver(){this.cumulativeBefore={generations:this.gCalls,formatRepairs:this.formatRepairs,invalidOutputs:this.invalidOutputs,validBatches:this.validBatches,revisionAttempts:this.revisionAttempts,committed:this.committedRevisions};return new AdaptiveGS({check:(r,s)=>this.check(r,s),evidence:()=>this.evidence(),parse:(r,f)=>this.parse(r,f),apply:(f,p)=>this.apply(f,p),subproblem:(f,p)=>this.subproblem(f,p),event:this.event,
  select:async(frame,depth,signal)=>{this.sCalls++;if(depth)this.metaCalls++;const at=performance.now();const row={role:'S' as const,depth,input:structuredClone(frame),source:this.options.backend.id,elapsedMs:0} as AutonomousSession['audit'][number];this.audit.push(row);
   try{const result=await judge(frame,this.options.strategy,this.options.backend,signal,()=>String(this.world.snapshot().revision),Math.min(25000,this.options.deadlineMs??120000),b=>this.emit('judgment_batch',{...b as object,depth}));row.output=result.answer;this.emit('judgment_run',{...result.report,depth});
    const answer=result.answer;const probs:Record<string,number>={};const raw=result.report.answers.choose;if(raw?.type==='choice')frame.options.forEach((c,i)=>probs[c.id]=raw.probabilities[`a${i}`]??0);
    const record={packet:{schema:'gs/decision-packet/v1',id:evidenceKey(frame),factsVersion:'gs/public-facts/v05',questionVersion:result.report.questionVersion,level:depth?'parent':'child',goal:frame.question,projection:frame.context,scope:{name:'autonomous-decision-interface/v05',note:'Only G-authored narrowing, no reference rank'},candidates:frame.options.map(o=>({id:o.id,description:o.description,action:o.value,facts:(o.value as any)?.facts??{}})),taskContext:{rootGoal:GOAL,localGoal:{description:frame.question},immediateObjective:{description:frame.question},gHypothesis:'Generated; not verified truth'},snapshotRevision:frame.revision,policyVersion:this.policyVersion},source:this.options.backend.kind,selectorIdentity:this.options.backend.id,choice:answer.choice,status:answer.choice?'selected':'abstained',latencyMs:performance.now()-at,externalRequests:result.report.transportAttempts?.externalRequests??result.report.externalRequests,questions:result.report.questions,transportAttempts:result.report.transportAttempts,judgment:{choice:answer.choice,probabilities:probs,confidence:raw?.type==='choice'?raw.confidence:null,abstainProbability:raw?.type==='choice'?raw.probabilities.none:null,raw:answer.detail},depth};
    this.lastDecision=record;this.decisions.push(record);this.emit('decision_audit',record);return answer;
   }catch(e){row.error=String(e).slice(0,600);throw e;}finally{row.elapsedMs=performance.now()-at;}
  },
  generate:(request,signal)=>this.invokeG(request,signal),
  repairOutput:(request,signal)=>this.invokeG(request,signal)
 },{maxDepth:this.options.maxDepth??2,maxRevisions:this.options.maxRevisions??3,maxFormatRepairs:this.options.maxFormatRepairs??2,maxGenerations:Math.max(1,Math.min(24,(this.options.maxGCalls??12)-this.gCalls)),ioTimeoutMs:Math.min(120000,this.options.deadlineMs??120000),gTimeoutMs:Math.min(this.options.gTimeoutMs??600000,this.options.deadlineMs??120000)});}
 private async invokeG(request:AdaptationRequest|OutputRepairRequest,signal:AbortSignal):Promise<unknown>{
  if(this.gCalls>=(this.options.maxGCalls??12))throw Error('root_g_budget_exhausted');this.gCalls++;
  const at=performance.now();const row={role:'G' as const,depth:request.depth,input:structuredClone(request),source:this.options.generator.id,elapsedMs:0} as AutonomousSession['audit'][number];this.audit.push(row);
  try{const out=await this.options.generator.propose(request,signal);this.check(request.frame.revision,signal);row.output=structuredClone(out.output);this.emit('g_response',{depth:request.depth,requestKind:request.schema==='gs/output-repair-request/v1'?'output-repair':'adaptation',output:out.output,usage:out.usage??null});
   if(request.schema==='gs/output-repair-request/v1'&&!(out.output&&typeof out.output==='object'&&'invalidProposal'in out.output)){
    const check=repairIntegrity(request.preserveFrom??request.previousOutput,out.output,Object.keys(PUBLIC_RULES));this.emit('output_repair_integrity',check);
    if(check.issues.length)return {invalidProposal:{reason:'repair_intent_changed',content:JSON.stringify(out.output),diagnostics:integrityDiagnostics(check.issues)}};
   }return out.output;
  }catch(e){row.error=String(e).slice(0,600);throw e;}finally{row.elapsedMs=performance.now()-at;}
 }
 private finish(result:StepResult){
  if(this.initialization.status==='pending'||this.initialization.status==='reviewing'){const reason='reason'in result?result.reason:null;this.initialization={...this.initialization,status:result.kind==='done'?'skipped-terminal':'failed',reason};this.emit(result.kind==='done'?'initialization_skipped':'initialization_failed',{...this.initialization,physicalActions:this.history.length});}
  this.finished=true;this.lastResult=result;if('reason'in result)this.stopReason=result.reason;if(this.activeRecord&&this.activeRecord.status==='trial')this.activeRecord.status=result.kind==='done'&&result.outcome==='succeeded'?'root-succeeded':result.kind==='done'?'failed':'interrupted';this.phase='finished';this.emit('run_finished',result);return result;}
 cancel(){this.abort.abort(Error('cancelled'));if(!this.busy&&!this.finished)this.finish({kind:'stopped',reason:'cancelled'});}
 edit(tool:EditTool,p:Point){const r=this.world.edit(tool,p);if(r.ok){this.interventions++;this.issue='external_world_changed';this.previousIssue={kind:'external_change',revision:this.world.snapshot().revision};if(this.activeRecord)this.activeRecord.status='interrupted';this.emit('external_change',{tool,point:p,result:r});}return r;}
 async step():Promise<StepResult>{if(this.busy)throw Error('concurrent_step');if(this.finished)return this.lastResult!;this.busy=true;this.started||=performance.now();this.cycles++;const signal=AbortSignal.any([this.abort.signal,...(this.options.signal?[this.options.signal]:[])]);
  try{
   const s=this.world.snapshot();this.check(String(s.revision),signal);
   if(s.delivered>=s.target&&s.energy>0)return this.finish({kind:'done',outcome:'succeeded'});if(s.energy<=0||s.turn>=s.maxTurns)return this.finish({kind:'done',outcome:'failed'});
   if(this.cycles>(this.options.maxSteps??400)||s.turn-this.initial.turn>=(this.options.maxActions??180))return this.finish({kind:'stopped',reason:'root_action_or_cycle_budget'});
   // Creation is side-effect free. Every new autonomous session (including a fork)
   // must establish initial decision conditions through G before action-level S.
   // Reuse the bounded resolver; do not fabricate an S failure or provide an answer.
   if(this.initialization.status!=='ready'){
    this.initialization={...this.initialization,status:'reviewing',reviewCount:this.initialization.reviewCount+1,reason:null};
    this.phase='initializing';this.issue=INITIAL_REVIEW_CAUSE;
    this.emit('initialization_started',{...this.initialization,revision:String(s.revision),physicalActions:this.history.length,cause:INITIAL_REVIEW_CAUSE,note:'Inspect permitted initial environment; action frame is a draft, not a previous S response.'});
   }
   // Stage completion is measured from actual state, never a model claim or a simulated reference.
   let changed=false;while(this.stageIndex<this.program.stages.length&&stageComplete(this.stage,s,this.stageStart)){this.emit('local_goal_completed',{stage:this.stageIndex,goal:this.stage.until,rootSucceeded:false,actualActions:s.turn-this.stageStart.turn});this.stageIndex++;this.stageStart=structuredClone(s);changed=true;}
   if(this.stageIndex>=this.program.stages.length){if(this.activeRecord?.status==='trial')this.activeRecord.status='local-completed';this.issue??='local_program_completed_root_pending';this.stageIndex=this.program.stages.length-1;}
   else if(s.turn-this.stageStart.turn>=this.stage.maxActions)this.issue??='local_stage_budget';
   if(scopeExpired(this.stage,s)){this.issue='candidate_scope_expired';this.previousIssue={kind:this.issue,scope:this.stage.candidateScope,worldRevision:String(s.revision),note:'No automatic widening; G must author the replacement.'};}
   const contradictions=conditionIssues(this.program,this.stageIndex,s,this.stageStart);
   if(contradictions.length){this.issue??='inconsistent_decision_conditions';this.previousIssue={kind:this.issue,diagnostics:contradictions,referenceCompared:false};}

   const frame=this.actionFrame();const cause=this.issue;this.issue=undefined;
   const resolution=await this.makeResolver().resolve(frame,signal,cause);
   if(resolution.kind==='blocked')return this.finish({kind:'paused',reason:resolution.reason});
   // A selected physical action must never bypass the initial G/commit gate.
   if(this.initialization.status!=='ready')throw Error('initialization_not_committed');
   const before=this.world.snapshot();this.check(resolution.frame.revision,signal);
   if(stageComplete(this.stage,before,this.stageStart)||before.turn-this.stageStart.turn>=this.stage.maxActions){if(!stageComplete(this.stage,before,this.stageStart))this.issue='local_stage_budget';return this.lastResult={kind:'policy_updated',version:this.policyVersion};}
   const action=legalActions(before).find(a=>actionId(a)===resolution.choice);if(!action){this.issue='selected_action_no_longer_legal';return this.lastResult={kind:'stale'};}
   const allowed=resolution.frame.options.some(o=>o.id===actionId(action));if(!allowed)throw Error('action_not_in_s_selected_frame');
   this.emit('action_intent',{candidate:{id:actionId(action),description:describe(action),action:actionWire(action)},expectedRevision:resolution.frame.revision,policyVersion:this.policyVersion,idempotencyKey:`${this.runId}:${this.cycles}`});
   const applied=this.world.transact(resolution.frame.revision,state=>applyAction(state,action));if(!applied)return this.lastResult={kind:'stale'};
   const after=this.world.snapshot(),actual=measured(before,action,after);this.history.push(actual);if(this.activeRecord){this.activeRecord.actualActions++;this.activeRecord.deliveredDelta=after.delivered-this.programStart.delivered;this.activeRecord.attacks=after.attacks-this.programStart.attacks;}
   const localProgress=stageComplete(this.stage,after,this.stageStart);const rootProgress=after.delivered>before.delivered;const feedback={actionSucceeded:true,progress:localProgress||rootProgress,metrics:actual.delta,facts:[after.lastFact]};
   this.emit('action_receipt',{status:'applied',actual});this.emit('transition',{cycle:this.cycles,policyVersion:this.policyVersion,before:{revision:String(before.revision),state:before},candidate:{id:actionId(action),description:describe(action),action},after:{revision:String(after.revision),state:after},feedback});
   const w=this.options.noProgressWindow??6,tail=this.history.slice(-w);const positions=tail.map(t=>`${t.after.player.x},${t.after.player.y}`);const sameResources=tail.length===w&&tail.every(t=>!t.delta.delivered&&!t.delta.bag&&!t.delta.baitUsed&&!t.delta.eaten);const changingGuards=tail.length===w&&tail.some(t=>JSON.stringify(t.worldChanges)!==JSON.stringify(tail[0]!.worldChanges));
   if(actual.delta.attacks>0){this.issue='unexpected_damage';}
   else if(sameResources&&new Set(positions).size<=2&&!changingGuards)this.issue='observed_cycle_without_progress';
   else if(tail.length===w*1&&this.history.length%w===0&&!localProgress&&!rootProgress&&sameResources&&!changingGuards)this.issue='progress_review_due';
   if(this.issue){this.previousIssue={kind:this.issue,reviewOnly:true,notProofOfError:true,observedDisplacement:tail.length?{from:tail[0]!.before.player,to:tail.at(-1)!.after.player}:null,evidence:tail,selectedBy:this.options.backend.id,referenceCompared:false};this.emit('feedback_review_required',this.previousIssue);}
   this.phase='acting';this.activeDepth=0;
   if(after.delivered>=after.target&&after.energy>0)return this.finish({kind:'done',outcome:'succeeded'});if(after.energy<=0||after.turn>=after.maxTurns)return this.finish({kind:'done',outcome:'failed'});
   return this.lastResult={kind:'executed',actionId:actionId(action),feedback};
  }catch(e){if(e instanceof AdaptiveStale||String(e).includes('stale_judgment_snapshot')){this.issue='observation_changed';if(this.history.length===0){this.initialization={...this.initialization,status:'pending',reviewedRevision:null,policyVersion:null,reason:'world_changed_before_first_action'};this.phase='ready';this.emit('initialization_invalidated',{...this.initialization,revision:String(this.world.snapshot().revision)});}this.emit('stale_result_discarded',{reason:String(e)});return this.lastResult={kind:'stale'};}const reason=String(e instanceof Error?e.message:e).slice(0,600);return this.finish({kind:signal.aborted||reason.includes('budget')||reason.includes('deadline')?'stopped':'fault',reason});}
  finally{this.busy=false;}
 }
 inspect(){return {lastDecision:this.lastDecision,activeSkill:this.finished?null:{runId:this.runId,spec:{title:this.program.title,phases:this.program.stages.map(s=>({rule:s.name})),source:this.options.generator.kind},phase:this.stageIndex,binding:{},adaptive:true,depth:this.activeDepth,mode:this.phase},lastSkillResult:this.activeRecord??null,diagnostics:this.diagnostics()};}
 diagnostics(){return {schema:'gs/adaptive-diagnostics/v05',controlMode:'same-layer-first/v054',candidatePolicy:'explicit-scope/v054',subproblems:this.subproblemResults,phase:this.phase,initialization:{...this.initialization},depth:this.activeDepth,policyVersion:this.policyVersion,sCalls:this.sCalls,gCalls:this.gCalls,metaCalls:this.metaCalls,latestIssue:this.previousIssue,reason:this.stopReason,program:this.program,actualActions:this.history.length,adaptations:this.events.filter(e=>e.type==='adaptation_committed').map(e=>e.data),outputAccounting:{formatRepairs:this.formatRepairs,invalidOutputs:this.invalidOutputs,validBatches:this.validBatches,revisionAttempts:this.revisionAttempts,committedRevisions:this.committedRevisions,actualActionTrials:this.history.length},latestValidation:this.latestValidation,budgets:{gTimeoutMs:this.options.gTimeoutMs??600000,gUsed:this.gCalls,gLimit:this.options.maxGCalls??12,depthLimit:this.options.maxDepth??2,maxFormatRepairs:this.options.maxFormatRepairs??2,maxRevisions:this.options.maxRevisions??3},informationPolicy:'no-reference/v05',assistance:{exampleSolution:false,referenceController:false,referenceRollouts:0,optimizedTargetBinding:false,pathPlanner:false},provenance:{generator:this.options.generator.id,selector:this.options.backend.id,source:this.options.generator.kind},note:'Same-layer provisional updates, explicit read-only subproblems. Structural checks are not policy success. Root success comes only from actual environment. Same-world reframing is permitted; equivalent decision interfaces are not retried blindly.'};}
 memory():AdaptiveMemory{return {schema:'gs/self-memory/v05',informationPolicy:'no-reference/v05',records:structuredClone(this.options.experience==='off'?[]:this.records.slice(-24))};}
 export(){return {format:'tuanzi-autonomous-trace/v05',informationPolicy:'no-reference/v05',initialWorld:this.initial,finalWorld:this.world.snapshot(),result:this.lastResult??null,decisionAudit:this.decisions,history:this.history,program:this.program,diagnostics:this.diagnostics(),selfMemory:this.memory(),requests:this.audit,events:this.events,notes:{referenceResultRead:false,realModelPerformance:'determined-by-request-provenance-not-config',interventions:this.interventions}};}
}

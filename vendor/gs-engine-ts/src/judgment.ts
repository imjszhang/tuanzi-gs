/** v0.4: bounded dependency-aware judgment scheduling, not an unrestricted workflow VM. */
import type {Json,Usage} from './types.js';
import {stableJson,evidenceKey} from './decision.js';
export type Question = {type:'choice';instructions:Json;criteria:Record<string,Json>} |
 {type:'noul';instructions:Json;criteria?:Json} |
 {type:'score';instructions:Json;criteria:Json[]};
export type TypedAnswer={type:'choice';choice:string;probabilities:Record<string,number>;confidence:number}|
 {type:'noul';noul:number}|
 {type:'score';score:number;probabilities?:Record<string,number>;confidence?:number};
export type DecisionTask={id:string;dependsOn:string[];question:Question;
 bindFrom?:{kind:'choice-from-noul';threshold:number;none:string;optionTasks:Record<string,string>}};
export type DecisionGraph={schema:'gs/decision-graph/v1';id:string;snapshotKey:string;goalVersion:string;questionVersion:string;
 evidence:Json;tasks:DecisionTask[]};
export type BatchInput={state:Json;questions:Record<string,Question>};
export type TransportAttempts={requests:number;externalRequests:number;questions:number};
export type BatchAnswer={transportAttempts?:TransportAttempts;answers:Record<string,TypedAnswer>;usage?:Usage;model?:string};
export type JudgmentBackend={id:string;kind:'rule'|'mock'|'jev'|'llm';ask(input:BatchInput,signal:AbortSignal):Promise<BatchAnswer>};
export type BatchAudit={transportAttempts?:TransportAttempts;index:number;taskIds:string[];dependencies:string[];questionCount:number;inputKey:string;
 requestStartedMs:number;latencyMs:number;status:'returned'|'invalid'|'failed'|'timeout';backend:string;external:boolean;usage:Usage|null;error?:string};
export type ScheduleReport={transportAttempts?:TransportAttempts;questionStrategy?:'direct'|'batch'|'serial'|'dependent';dispatchStrategy?:'batch'|'serial';schema:'gs/judgment-run/v1';graphId:string;snapshotKey:string;goalVersion:string;questionVersion:string;
 strategy:'batch'|'serial';answers:Record<string,TypedAnswer>;batches:BatchAudit[];status:'complete'|'failed';reason:string|null;
 elapsedMs:number;questions:number;requestAttempts:number;externalRequests:number;dependencyWaves:number};
export type ScheduleOptions={strategy?:'batch'|'serial';maxRequests:number;maxQuestions:number;timeoutMs:number;
 currentKey:()=>string;signal:AbortSignal;charge?:(n:{externalRequests:number;questions:number})=>void;onBatch?:(audit:BatchAudit)=>void};
export class JudgmentError extends Error{constructor(message:string,readonly report:ScheduleReport){super(message);}}
function probability(n:unknown){if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)throw Error('invalid_probability');return n;}
function own(o:object,k:string){return Object.prototype.hasOwnProperty.call(o,k);}
function safeId(s:string){return /^[a-zA-Z0-9_.:-]{1,100}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);}
export function validateQuestion(q:Question){
 if(!q||!['choice','score','noul'].includes(q.type)||q.instructions==null||stableJson(q.instructions).length>16000)throw Error('invalid_question');
 if(q.type==='choice'&&(!q.criteria||Array.isArray(q.criteria)||typeof q.criteria!=='object'||Object.keys(q.criteria).length<1||Object.keys(q.criteria).length>255||Object.keys(q.criteria).some(k=>!safeId(k))))throw Error('invalid_choice_options');
 if(q.type==='score'&&(!Array.isArray(q.criteria)||q.criteria.length<2||q.criteria.length>20))throw Error('invalid_score_levels');
}
export function validateGraph(g:DecisionGraph){
 if(!g||g.schema!=='gs/decision-graph/v1'||!g.snapshotKey||!g.goalVersion||!g.questionVersion||!Array.isArray(g.tasks)||!g.tasks.length||g.tasks.length>128||stableJson(g).length>500000)throw Error('invalid_graph');
 if(g.tasks.some(t=>!t||typeof t!=='object'||typeof t.id!=='string'||!t.question))throw Error('invalid_task');
 const ids=new Set(g.tasks.map(t=>t.id));if(ids.size!==g.tasks.length||g.tasks.some(t=>!safeId(t.id)))throw Error('duplicate_or_invalid_task');
 for(const t of g.tasks){validateQuestion(t.question);if(!Array.isArray(t.dependsOn)||new Set(t.dependsOn).size!==t.dependsOn.length||t.dependsOn.some(d=>!ids.has(d)||d===t.id))throw Error('invalid_dependencies');
  if(t.bindFrom){const b=t.bindFrom;if(t.question.type!=='choice'||b.kind!=='choice-from-noul'||!own(t.question.criteria,b.none)||typeof b.threshold!=='number'||!Number.isFinite(b.threshold)||!b.optionTasks||typeof b.optionTasks!=='object'||Array.isArray(b.optionTasks)||b.threshold<0||b.threshold>1||Object.entries(b.optionTasks).some(([o,d])=>!own((t.question as Extract<Question,{type:'choice'}>).criteria,o)||!t.dependsOn.includes(d)||g.tasks.find(t=>t.id===d)?.question.type!=='noul'))throw Error('invalid_dependency_binding');}}
 const pending=new Set(ids),done=new Set<string>();while(pending.size){const ready=g.tasks.filter(t=>pending.has(t.id)&&t.dependsOn.every(d=>done.has(d)));if(!ready.length)throw Error('cyclic_graph');for(const t of ready){pending.delete(t.id);done.add(t.id);}}
}
export function validateAnswer(q:Question,a:unknown):TypedAnswer{
 if(!a||typeof a!=='object'||Array.isArray(a))throw Error('invalid_answer');const r=a as any;
 if(r.type!==q.type)throw Error('answer_type_mismatch');
 if(q.type==='noul')return {type:'noul',noul:probability(r.noul)};
 if(q.type==='score'){if(typeof r.score!=='number'||!Number.isFinite(r.score)||r.score<0||r.score>q.criteria.length-1)throw Error('invalid_score');return {type:'score',score:r.score,...(r.confidence!==undefined?{confidence:probability(r.confidence)}:{})};}
 if(typeof r.choice!=='string'||!own(q.criteria,r.choice)||!r.probabilities||typeof r.probabilities!=='object'||Object.keys(r.probabilities).sort().join('|')!==Object.keys(q.criteria).sort().join('|'))throw Error('unknown_choice_or_distribution');
 const entries=Object.entries(r.probabilities).map(([k,v])=>[k,probability(v)] as const),sum=entries.reduce((a,b)=>a+b[1],0);
 // Keep the inclusive 1% contract; compensate only for floating-point summation.
 // Preserve the provider's probabilities and choice rather than normalizing them.
 const tolerance=.01,roundoff=Number.EPSILON*entries.length*Math.max(1,Math.abs(sum));
 if(Math.abs(sum-1)>tolerance+roundoff)throw Object.assign(Error('distribution_not_normalized'),{validation:{code:'distribution_not_normalized',sum,tolerance,roundoff}});
 if((r.probabilities[r.choice] as number)+1e-6<Math.max(...entries.map(x=>x[1])))throw Error('choice_not_distribution_max');
 return {type:'choice',choice:r.choice,probabilities:Object.fromEntries(entries),confidence:probability(r.confidence)};
}
function boundQuestion(t:DecisionTask,answers:Record<string,TypedAnswer>):Question{
 if(!t.bindFrom)return structuredClone(t.question);
 const q=t.question as Extract<Question,{type:'choice'}>,b=t.bindFrom,criteria:Record<string,Json>={[b.none]:q.criteria[b.none]!};
 for(const [option,dependency] of Object.entries(b.optionTasks)){const a=answers[dependency];if(a?.type!=='noul')throw Error('missing_dependency_answer');if(a.noul>=b.threshold)criteria[option]=q.criteria[option]!;}
 return {...q,criteria};
}
async function bounded<T>(work:(s:AbortSignal)=>Promise<T>,signal:AbortSignal,ms:number):Promise<T>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let listener:()=>void;
 const aborted=new Promise<never>((_r,reject)=>{listener=()=>{controller.abort(signal.reason);reject(signal.reason??Error('cancelled'));};if(signal.aborted)listener();else signal.addEventListener('abort',listener,{once:true});timer=setTimeout(()=>{controller.abort(Error('judgment_deadline'));reject(Error('judgment_deadline'));},Math.max(1,ms));});
 try{signal.throwIfAborted();return await Promise.race([work(controller.signal),aborted]);}finally{if(timer)clearTimeout(timer);signal.removeEventListener('abort',listener!);}
}
/** Only ready nodes with the SAME dependency context share a provider call. No hidden fan-out calls. */
export async function runDecisionGraph(graph:DecisionGraph,backend:JudgmentBackend,options:ScheduleOptions):Promise<ScheduleReport>{
 validateGraph(graph);for(const n of [options.maxRequests,options.maxQuestions,options.timeoutMs])if(!Number.isSafeInteger(n)||n<1)throw Error('invalid_schedule_limit');
 const g=structuredClone(graph),start=performance.now(),report:ScheduleReport={schema:'gs/judgment-run/v1',graphId:g.id,snapshotKey:g.snapshotKey,goalVersion:g.goalVersion,questionVersion:g.questionVersion,strategy:options.strategy??'batch',answers:{},batches:[],status:'complete',reason:null,elapsedMs:0,questions:0,requestAttempts:0,externalRequests:0,dependencyWaves:0};
 const check=()=>{options.signal.throwIfAborted();if(options.currentKey()!==g.snapshotKey)throw Error('stale_judgment_snapshot');if(performance.now()-start>=options.timeoutMs)throw Error('judgment_deadline');};
 try{
  const pending=new Map(g.tasks.map(t=>[t.id,t]));
  while(pending.size){check();const ready=[...pending.values()].filter(t=>t.dependsOn.every(d=>own(report.answers,d)));if(!ready.length)throw Error('unresolved_dependencies');report.dependencyWaves++;
   const groups=new Map<string,DecisionTask[]>();for(const t of ready){const key=options.strategy==='serial'?t.id:stableJson([...t.dependsOn].sort());groups.set(key,[...(groups.get(key)??[]),t]);}
   for(const tasks of groups.values()){
    check();if(report.requestAttempts>=options.maxRequests||report.questions+tasks.length>options.maxQuestions)throw Error('judgment_budget_exhausted');
    const deps=[...tasks[0]!.dependsOn].sort(),input:BatchInput={state:{evidence:g.evidence,dependencyAnswers:Object.fromEntries(deps.map(d=>[d,report.answers[d]!])) as Json},questions:Object.fromEntries(tasks.map(t=>[t.id,boundQuestion(t,report.answers)]))};
    const external=backend.kind==='jev'||backend.kind==='llm';options.charge?.({externalRequests:external?1:0,questions:tasks.length});
    const audit:BatchAudit={index:++report.requestAttempts,taskIds:tasks.map(t=>t.id),dependencies:deps,questionCount:tasks.length,inputKey:evidenceKey(input),requestStartedMs:performance.now()-start,latencyMs:0,status:'returned',backend:backend.id,external,usage:null};report.questions+=tasks.length;if(external)report.externalRequests++;
    const tick=performance.now();
    try{
     const result=await bounded(s=>backend.ask(structuredClone(input),s),options.signal,options.timeoutMs-(performance.now()-start));if(result.transportAttempts)audit.transportAttempts=result.transportAttempts;audit.usage=result.usage??null;if(result.model)audit.backend=result.model;check();
     if(!result.answers||Object.keys(result.answers).sort().join('|')!==tasks.map(t=>t.id).sort().join('|'))throw Error('answer_task_set_mismatch');
     const parsed=tasks.map(t=>[t.id,validateAnswer(input.questions[t.id]!,result.answers[t.id])] as const);
     // Commit a whole batch only after all answers and the snapshot are validated.
     for(const [id,a] of parsed){report.answers[id]=a;pending.delete(id);}
    }catch(e){if(e&&typeof e==='object'&&'transportAttempts'in e)audit.transportAttempts=e.transportAttempts as TransportAttempts;if(e&&typeof e==='object'&&'usage'in e&&e.usage&&typeof e.usage==='object')audit.usage=e.usage as Usage;audit.status=String(e).includes('deadline')?'timeout':audit.usage?'invalid':'failed';audit.error=String(e).slice(0,300);throw e;}
    finally{audit.latencyMs=performance.now()-tick;report.batches.push(audit);options.onBatch?.(structuredClone(audit));}
   }
  }
  check();return report;
 }catch(e){report.status='failed';report.reason=String(e).slice(0,300);throw new JudgmentError(report.reason,report);}
 finally{report.elapsedMs=performance.now()-start;report.transportAttempts=report.batches.reduce((t,b)=>({requests:t.requests+(b.transportAttempts?.requests??1),externalRequests:t.externalRequests+(b.transportAttempts?.externalRequests??(b.external?1:0)),questions:t.questions+(b.transportAttempts?.questions??b.questionCount)}),{requests:0,externalRequests:0,questions:0});}
}

import type {AdaptiveFrame,AdaptiveAnswer} from '../../vendor/gs-engine-ts/src/adaptive.js';
import {runDecisionGraph} from '../../vendor/gs-engine-ts/src/judgment.js';
import type {JudgmentBackend,DecisionGraph,DecisionTask,ScheduleReport} from '../../vendor/gs-engine-ts/src/judgment.js';
import {evidenceKey} from '../../vendor/gs-engine-ts/src/decision.js';
export type Strategy='direct'|'batch'|'serial'|'dependent';
export function compileAdaptive(frame:AdaptiveFrame,strategy:Strategy):DecisionGraph{
 const criteria=Object.fromEntries([['none','Abstain: evidence is insufficient or no offered option is suitable. This triggers a bounded G review, not a forced action.'],...frame.options.map((o,i)=>[`a${i}`,{description:o.description,value:o.value}])]);
 const instruction={question:frame.question,scope:frame.kind,notes:'Judge using only state.evidence. Generator hypotheses are not observed facts. Permission and root verification are external. Never invent an option.'};
 const tasks:DecisionTask[]=[];
 if(strategy==='direct')tasks.push({id:'choose',dependsOn:[],question:{type:'choice',instructions:instruction,criteria:criteria as never}});
 else{frame.options.forEach((o,i)=>{tasks.push({id:`fit${i}`,dependsOn:[],question:{type:'noul',instructions:{...instruction,question:'Is this offered candidate suitable for the current local decision?',candidate:o as never}}});if(strategy!=='dependent')tasks.push({id:`score${i}`,dependsOn:[],question:{type:'score',instructions:{...instruction,question:'What priority should this offered candidate receive within the current local objective?',candidate:o as never},criteria:['not useful','low','possible','useful','high','urgent','necessary']}});});if(strategy==='dependent')tasks.push({id:'choose',dependsOn:frame.options.map((_,i)=>`fit${i}`),question:{type:'choice',instructions:instruction,criteria:criteria as never},bindFrom:{kind:'choice-from-noul',none:'none',threshold:.5,optionTasks:Object.fromEntries(frame.options.map((_,i)=>[`a${i}`,`fit${i}`]))}});}
 const key=evidenceKey(frame);return {schema:'gs/decision-graph/v1',id:evidenceKey([key,strategy]),snapshotKey:frame.revision,goalVersion:evidenceKey(frame.question),questionVersion:`gs/autonomous/v05/${strategy}`,evidence:{frame:frame as never},tasks};
}
export async function judge(frame:AdaptiveFrame,strategy:Strategy,backend:JudgmentBackend,signal:AbortSignal,check:()=>string,timeoutMs:number,onBatch:(b:unknown)=>void):Promise<{answer:AdaptiveAnswer;report:ScheduleReport;graph:DecisionGraph}>{
 const graph=compileAdaptive(frame,strategy);const report=await runDecisionGraph(graph,backend,{signal,strategy:strategy==='serial'?'serial':'batch',timeoutMs,maxRequests:128,maxQuestions:128,currentKey:check,onBatch});
 let choice:string|null=null;const a=report.answers.choose;
 if(strategy==='direct'||strategy==='dependent'){if(a?.type!=='choice')throw Error('choice_missing');if(a.choice!=='none')choice=frame.options[Number(a.choice.slice(1))]?.id??null;}
 else{const ranked=frame.options.map((o,i)=>{const f=report.answers[`fit${i}`],s=report.answers[`score${i}`];if(f?.type!=='noul'||s?.type!=='score')throw Error('dimensions_missing');return {id:o.id,fit:f.noul,score:s.score};}).filter(x=>x.fit>=.5).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));choice=ranked[0]?.id??null;}
 report.questionStrategy=strategy;report.dispatchStrategy=strategy==='serial'?'serial':'batch';return {answer:{choice,detail:{answers:report.answers,model:report.batches.at(-1)?.backend??backend.id,semantics:'relative judgment, not execution success probability'}},report,graph};
}

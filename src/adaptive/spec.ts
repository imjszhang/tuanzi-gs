/** G's structural language. Runtime and prompt share schema.ts; never a reference solver. */
import {InvalidAdaptation} from '../../vendor/gs-engine-ts/src/adaptive.js';
import {GROUPS,KINDS,PREDICATE_SCHEMA,programSchema,patchesSchema,validateSchema,outputContract} from './schema.js';
export {GROUPS,KINDS,outputContract};
export type Group=typeof GROUPS[number];export type Kind=typeof KINDS[number];
export type Predicate={kind:'at';x:number;y:number}|{kind:'delta';field:'bag'|'delivered'|'eaten'|'baitUsed'|'turn';atLeast:number}|{kind:'value';field:'bag'|'delivered'|'energy'|'lureCount'|'guardEating';op:'gte'|'lte'|'eq';value:number};
export type Stage={name:string;question:string;hypothesis:string;groups:Group[];ruleIds:string[];kinds:Kind[];target:{x:number;y:number}|null;candidateIds:string[]|null;candidateScope?:{mode:'stage'}|{mode:'snapshot';revision:string};until:Predicate[];maxActions:number};
export type Program={schema:'gs/decision-program/v1';title:string;stages:Stage[]};
export type ProgramPatch={kind:'program';program:Program};
export type StagePatch={kind:'stage-update';expectedPolicyVersion:number;stageIndex:number;changes:Partial<Stage>};
export type MetaPatch={kind:'reframe';question:string;hypothesis:string;ruleIds:string[];includeBroaderObservation:boolean;candidateIds:string[]|null};
export type SubproblemPatch={kind:'subproblem';task:{question:string;hypothesis:string;expectedResult:string;groups:Group[];ruleIds:string[];maxRevisions:number;maxGenerations:number}};
export type AnalysisPatch={kind:'analysis';question:string;hypothesis:string;groups:Group[];ruleIds:string[];candidates:{id:string;description:string;claim:string}[]};
export type Patch=ProgramPatch|StagePatch|MetaPatch|SubproblemPatch|AnalysisPatch;
export function object(x:unknown,label:string):Record<string,unknown>{if(!x||typeof x!=='object'||Array.isArray(x))throw new InvalidAdaptation(label+': object required');return x as Record<string,unknown>;}
function checked<T>(raw:unknown,schema:Parameters<typeof validateSchema>[1],path=''):T{
 const d=validateSchema(raw,schema,path);
 if(!d.valid)throw new InvalidAdaptation(`${d.issues[0]!.message} at ${d.issues[0]!.path||'/'}`,d);
 return structuredClone(raw) as T;
}
export function predicate(raw:unknown):Predicate{return checked(raw,PREDICATE_SCHEMA);}
export function parseProgram(raw:unknown,ruleIds:readonly string[]):Program{return checked(raw,programSchema(ruleIds));}
export function parsePatches(raw:unknown,kind:'action'|'analysis'|'reframe',ruleIds:readonly string[]):Patch[]{
 if(JSON.stringify(raw)?.length>60000)throw new InvalidAdaptation('proposal_output_too_large',{schema:'gs/output-validation/v1',valid:false,issues:[{path:'',code:'maxLength',message:'Output exceeds 60000 characters',expected:60000}],scope:'structure-only-not-strategy'});
 return checked<{proposals:Patch[]}>(raw,patchesSchema(kind,ruleIds)).proposals;
}
/** Backwards-compatible documentation export. Runtime requests use frame-specific outputContract(). */
export const OUTPUT_SPEC=outputContract('action',[]);
/** Advisory checks based only on declared primitives, not natural-language or task solutions.
 * Warnings go to the S / audit and audit. They never rewrite/approve a strategy.
 */
export function programWarnings(p:Program){const out:{path:string;code:string;message:string}[]=[];
 p.stages.forEach((s,i)=>{const path=`/program/stages/${i}`;
  for(const [j,c]of s.until.entries())if(c.kind==='delta'){
   const needs:Record<string,string>={delivered:'deposit',baitUsed:'drop',eaten:'eat',bag:'pickup'};const k=needs[c.field];
   if(k&&!s.kinds.includes(k as Kind))out.push({path:path+`/until/${j}`,code:'delta_without_capability',message:`This stage requires a positive ${c.field} delta but does not offer ${k}. No implicit loop or capability is inserted.`});
  }
  if(s.candidateIds?.length===0)out.push({path:path+'/candidateIds',code:'empty_candidate_scope',message:'This explicit subset has no actions; S can only abstain.'});
  for(const id of s.candidateIds??[])if(!s.kinds.includes(id.split(':')[0] as Kind))out.push({path:path+'/candidateIds',code:'candidate_kind_excluded',message:`${id} is excluded by this stage kinds.`});
 });return out;}

/** Output-repair integrity, not task evaluation. Never applies a normalized object.
 * Legacy wrappers are recognized ONLY to compare preserved content. A response still
 * must independently pass the canonical schema before it can be considered.
 */
import {stableJson} from '../../vendor/gs-engine-ts/src/decision.js';
import {validateSchema,stageProperties,PREDICATE_SCHEMA,CONTRACT_VERSION,patchesSchema} from './schema.js';
import type {ValidationDiagnostics,ValidationIssue} from './schema.js';
function decoded(raw:unknown):any{if(typeof raw==='string'){try{return JSON.parse(raw);}catch{return null;}}return raw;}
function candidates(raw:unknown):any[]|null{const x=decoded(raw);if(!x||typeof x!=='object')return null;
 if(Array.isArray(x.proposals))return x.proposals.map((v:any)=>v&&Object.keys(v).length===1&&(v.actionFrame||v.reframeFrame)?(v.actionFrame||v.reframeFrame):v);
 if(Object.keys(x).length===1&&(x.actionFrame||x.reframeFrame))return [x.actionFrame||x.reframeFrame];return null;
}
export function repairIntegrity(original:unknown,repaired:unknown,ruleIds:readonly string[]){
 const a=candidates(original),b=candidates(repaired),issues:ValidationIssue[]=[];
 const add=(path:string)=>{if(issues.length<64)issues.push({path,code:'repair_intent_changed',message:'Output-only repair changed a previously structurally valid field. Preserve it; strategic re-planning needs a separate G request.'});};
 const same=(x:unknown,y:unknown,p:string)=>{if(stableJson(x)!==stableJson(y))add(p);};
 if(!a||!b)return {checked:false,reason:'unparseable-original-or-envelope; semantic preservation cannot be mechanically certified',issues};
 if(a.length>=1&&a.length<=3&&a.length!==b.length)add('/proposals');
 for(let i=0;i<Math.min(a.length,b.length);i++){
  const x=a[i],y=b[i],p=`/proposals/${i}`;if(!x||typeof x!=='object'||!y||typeof y!=='object')continue;
  if(['program','stage-update','reframe','subproblem','analysis'].includes(x.kind))same(x.kind,y.kind,p+'/kind');
  if(x.program&&Array.isArray(x.program.stages)&&y.program&&Array.isArray(y.program.stages)){
   if(typeof x.program.title==='string'&&x.program.title.trim()&&x.program.title.length<=100)same(x.program.title,y.program.title,p+'/program/title');
   if(x.program.stages.length>=1&&x.program.stages.length<=8)same(x.program.stages.length,y.program.stages.length,p+'/program/stages');
   for(let j=0;j<Math.min(x.program.stages.length,y.program.stages.length);j++)compareStage(x.program.stages[j],y.program.stages[j],p+`/program/stages/${j}`);
  }else if(x.kind==='stage-update'&&y.kind==='stage-update'){
   if(Number.isSafeInteger(x.expectedPolicyVersion)&&x.expectedPolicyVersion>=1)same(x.expectedPolicyVersion,y.expectedPolicyVersion,p+'/expectedPolicyVersion');if(Number.isSafeInteger(x.stageIndex)&&x.stageIndex>=0&&x.stageIndex<=7)same(x.stageIndex,y.stageIndex,p+'/stageIndex');compareStage(x.changes,y.changes,p+'/changes');
  }else if(['subproblem','analysis'].includes(x.kind)&&x.kind===y.kind){
   const shape=patchesSchema('analysis',ruleIds).properties!.proposals!.items!.anyOf!.find(z=>z.properties?.kind?.const===x.kind)!;
   for(const [k,def]of Object.entries(shape.properties??{}))if(k!=='kind'&&x[k]!==undefined&&validateSchema(x[k],def).valid)same(x[k],y[k],p+'/'+k);
  }else if(x.kind==='reframe'&&y.kind==='reframe'){const props=patchesSchema('reframe',ruleIds).properties!.proposals!.items!.properties!;for(const k of ['question','hypothesis','includeBroaderObservation','candidateIds','ruleIds'])if(x[k]!==undefined&&validateSchema(x[k],props[k]!).valid)same(x[k],y[k],p+'/'+k);}
 }
 function compareStage(x:any,y:any,p:string){if(!x||!y||typeof x!=='object'||typeof y!=='object')return;
  for(const [k,s]of Object.entries(stageProperties(ruleIds))){if(x[k]===undefined)continue;
   if(k==='until'&&Array.isArray(x.until)&&Array.isArray(y.until)){
    if(x.until.length>=1&&x.until.length<=4)same(x.until.length,y.until.length,p+'/until');
    for(let i=0;i<x.until.length;i++)if(validateSchema(x.until[i],PREDICATE_SCHEMA).valid)same(x.until[i],y.until[i],p+'/until/'+i);
   }else if(validateSchema(x[k],s).valid)same(x[k],y[k],p+'/'+k);
  }
 }
 return {checked:true,reason:'compared previously valid program fields; corrected predicates are whole semantic units and require model authorship',issues};
}
export function integrityDiagnostics(issues:ValidationIssue[]):ValidationDiagnostics{return {schema:'gs/output-validation/v1',valid:issues.length===0,issues,truncated:false,scope:'structure-only-not-strategy',contractVersion:CONTRACT_VERSION};}

/** Run-local recovery evidence. Canonical strings are equality keys; short hashes are labels only. */
import {stableJson,evidenceKey} from '../../vendor/gs-engine-ts/src/decision.js';
import type {DecisionAudit} from '../../vendor/gs-engine-ts/src/decision.js';
import type {Json} from '../../vendor/gs-engine-ts/src/types.js';
import type {SkillSpec,Binding} from './spec.js';
import type {GameState} from '../game/types.js';
import {exactWorldKey} from '../planning/programs.js';
import {TASK_CONTEXT_VERSION} from './context.js';
export type FailureKind='decision_blocked'|'execution_failed'|'structure_gap'|'infrastructure'|'external_change';
export function canonicalSkill(s:SkillSpec):string {
 return stableJson({schema:s.schema,parameters:s.parameters,initiation:s.initiation,success:s.success,maxSteps:s.maxSteps,
  capabilities:[...s.capabilities].sort(),features:[...s.features].sort(),weights:s.weights,
  phases:s.phases.map(p=>({rule:p.rule,until:p.until,maxSteps:p.maxSteps}))});
}
/** Guards zero-action repeats with mere numeric changes; not a global equivalence claim. */
export function skillFamily(s:SkillSpec):string {
 return stableJson({parameters:s.parameters,initiation:s.initiation,success:s.success,
  capabilities:[...s.capabilities].sort(),features:[...s.features].sort(),phases:s.phases.map(p=>({rule:p.rule,until:p.until}))});
}
export function structureId(s:SkillSpec){return evidenceKey(canonicalSkill(s));}
export function recoveryScope(s:GameState,b:Binding,controller:string):string {
 return stableJson({world:exactWorldKey(s),binding:{...b,targetBerryIds:[...b.targetBerryIds].sort()},controller,contextVersion:TASK_CONTEXT_VERSION});
}
export type ExecutionFailure={schema:'gs/execution-failure/v1';id:string;kind:FailureKind;reason:string;
 runId:string;skillId:string;skillVersion:number;structureId:string;structure:string;family:string;scope:string;
 spec:SkillSpec;binding:Binding;phase:{index:number;rule:string};
 world:{startRevision:string;revision:string;turn:number;key:string};
 outcome:{steps:number;energyDelta:number;deliveredDelta:number;dispatchCompleted:boolean};
 decision:DecisionAudit|null;controller:string;contextVersion:string;
 route:'pause-and-inspect'|'repair-skill'|'reconcile-execution'|'reobserve';
 informationNovel:boolean;};
export class RecoveryJournal {
 private records:ExecutionFailure[]=[];
 private seen=new Set<string>();
 record(input:Omit<ExecutionFailure,'schema'|'id'|'informationNovel'>):ExecutionFailure {
  const novelty=stableJson({scope:input.scope,structure:input.structure,kind:input.kind,phase:input.phase,reason:input.reason,
   context:input.decision?.packet.taskContext??null,candidates:input.decision?.packet.candidates??null});
  const row:ExecutionFailure={...structuredClone(input),schema:'gs/execution-failure/v1',id:evidenceKey(novelty),informationNovel:!this.seen.has(novelty)};
  this.seen.add(novelty);this.records.push(row);this.records=this.records.slice(-16);return structuredClone(row);
 }
 list(){return structuredClone(this.records);}
 latest(){return this.records.length?structuredClone(this.records[this.records.length-1]!):null;}
 repeated(spec:SkillSpec,scope:string):ExecutionFailure|null {
  const structure=canonicalSkill(spec),family=skillFamily(spec);
  const found=[...this.records].reverse().find(r=>r.scope===scope&&['execution_failed','structure_gap','decision_blocked'].includes(r.kind)&&
   (r.structure===structure||(r.outcome.steps===0&&r.family===family)));
  return found?structuredClone(found):null;
 }
 /** Full most recent packet+answer and bounded prior summaries; never replace validation feedback. */
 feedback():Json|undefined {
  const last=this.latest();if(!last)return undefined;
  return {schema:'gs/repair-evidence/v1',contextVersion:TASK_CONTEXT_VERSION,latest:last as unknown as Json,
   previous:this.records.slice(-4,-1).map(r=>({id:r.id,kind:r.kind,reason:r.reason,structureId:r.structureId,phase:r.phase,outcome:r.outcome})),
   instructions:'Read measured execution feedback separately from proposal validation. None is a judgment block, not proof of physical impossibility. A new ID/title is not a new behavior. Root goal, authority and budgets remain fixed.'};
 }
}

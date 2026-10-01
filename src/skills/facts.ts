/** Both the rule selector and the provider receive this packet. No aggregate score is transmitted. */
import type {Json} from '../../vendor/gs-engine-ts/src/types.js';
import type {DecisionPacket,FactCandidate} from '../../vendor/gs-engine-ts/src/decision.js';
import {FACTS_VERSION,QUESTION_VERSION,evidenceKey,neutralOrder,validatePacket} from '../../vendor/gs-engine-ts/src/decision.js';
import type {Weights} from './spec.js';
export type PrimitiveFacts={phase:string;kind:string;targetBeforeSteps:number|null;targetAfterSteps:number|null;
 milestone:boolean; threatened:boolean; energyAfter:number;attackDelta:number;guardDistanceAfter:number;priorVisits:number;source:'deterministic-transition-and-path/v1'};
export function primitiveRule(f:PrimitiveFacts,w:Weights):number {
 let progress=0;
 if(f.kind==='move'&&f.targetBeforeSteps!==null&&f.targetAfterSteps!==null)progress=(f.targetBeforeSteps-f.targetAfterSteps)*5;
 if((f.phase==='gather'||f.phase==='deliver')&&f.kind==='wait')progress=f.targetBeforeSteps===null?1:-6;
 if(f.milestone)progress=30;
 if(f.phase==='wait-access')progress=f.kind==='wait'?2:5;
 return w.progress*progress-w.cost+w.safety*f.guardDistanceAfter*.01-f.priorVisits*12;
}
export type RootFacts={contract:string;energy:number;bag:number;capacity:number;delivered:number;target:number;
 homeSteps:number|null;targetSteps:number|null;reachableCount:number;remainingCount:number;guardCount:number;
 allRemainingGuarded:boolean;amount:number;history:{n:number;successes:number;meanSteps:number;meanAttacks:number}|null;source:'registered-world-facts/v1'};
export function experiencePreference(f:RootFacts,w:Weights):number {const h=f.history;if(!h||h.n<2)return 0;return w.experience*Math.min(1,h.n/5)*((h.successes/h.n-.5)*8-Math.min(20,h.meanSteps)*.05-h.meanAttacks*2);}
export function parentRule(f:RootFacts,w:Weights):number{
 const enough=f.delivered+f.bag>=f.target, home=f.homeSteps??999;let base=-1000;
 const reserve=!enough&&f.remainingCount>0&&f.guardCount>0&&f.allRemainingGuarded;
 if(f.contract==='energy-restored'&&f.bag>0&&f.energy<=Math.max(24,home+3)&&!(enough&&f.energy>home+3))base=1000;
 if(f.contract==='deposited'&&f.amount===f.bag-(reserve?1:0)&&(enough||f.bag>=f.capacity||(!f.reachableCount&&f.bag>1)))base=900;
 if(f.contract==='acquired-one'&&!enough&&f.bag<f.capacity)base=500-(f.targetSteps??999)*w.cost;
 if(f.contract==='access-open'&&!enough&&!f.reachableCount&&f.guardCount>0&&f.bag>0)base=400;
 return base+experiencePreference(f,w);
}
export function packet(input:Omit<DecisionPacket,'schema'|'id'|'factsVersion'|'questionVersion'|'candidates'> & {candidates:FactCandidate[]}):DecisionPacket{
 const p:DecisionPacket={schema:'gs/decision-packet/v1',id:'',factsVersion:FACTS_VERSION,questionVersion:QUESTION_VERSION,...input,candidates:neutralOrder(input.candidates,input.orderSeed)};
 if(input.taskContext)p.questionVersion='gs/select/v042';
 p.id=evidenceKey({...p,id:undefined});validatePacket(p);return structuredClone(p);
}
/** Only the shared packet is available here. No world/simulator, private rank, or answer key. */
export function selectPacket(p:DecisionPacket):string|null{
 const weights=p.preferences as Weights;
 const ranked=p.candidates.map(c=>({id:c.id,score:p.level==='parent'?parentRule(c.facts as RootFacts,weights):primitiveRule(c.facts as PrimitiveFacts,weights)})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 return ranked[0]&&(p.level==='child'||ranked[0].score>0)?ranked[0].id:null;
}

import {primitiveRule} from './facts.js';
import type {PrimitiveFacts} from './facts.js';
/** Registered domain knowledge. These rules are authored; generated phase compositions
 * must never be advertised as discovery of the game's physics. No legacy lureSite call. */
import type {GameState,GameAction,Point} from '../game/types.js';
import {dist,same} from '../game/types.js';
import {path,walkable,dangerous,DIRECTIONS,reachableBerries} from '../game/world.js';
import {legalPrimitives,simulate} from '../planning/search.js';
import {actionKey} from '../planning/programs.js';
import type {SkillSpec,Binding} from './spec.js';
export type Charge=(n:number)=>void;
export type Frame={binding:Binding;initial:GameState;phase:number;phaseStart:number;acquired:number;placed:number;
 placement:{drop:Point;stand:Point}|null;bindingChecks:number;simulationChecks:number;transitions:number;visits:Record<string,number>};
export function createFrame(s:GameState,b:Binding):Frame{return {binding:structuredClone(b),initial:structuredClone(s),phase:0,phaseStart:s.turn,acquired:0,placed:0,placement:null,bindingChecks:0,simulationChecks:0,transitions:0,visits:{}};}
export function localSuccess(spec:SkillSpec,f:Frame,s:GameState):boolean {
 if(s.energy<=0||s.attacks>f.initial.attacks)return false;
 switch(spec.success){
 case 'acquired-one':return f.acquired>=1;
 case 'deposited':return s.delivered>f.initial.delivered;
 case 'energy-restored':return s.energy>f.initial.energy;
 case 'access-open':return accessOpen(s,f.binding);
 }
}
export function accessOpen(s:GameState,b:Binding):boolean {
 const guard=s.guards.find(g=>g.id===b.targetId);
 const available=reachableBerries(s).filter(x=>!b.targetBerryIds.length||b.targetBerryIds.includes(x.berry.id));
 return available.length>=Math.min(2,Math.max(1,b.targetBerryIds.filter(id=>s.berries.some(b=>b.id===id)).length)) && (!guard||guard.eating>0);
}
export function applicable(spec:SkillSpec,b:Binding,s:GameState):boolean {
 if(s.energy<=0||s.turn>=s.maxTurns)return false;
 switch(spec.initiation){
 case 'can-gather':return s.bag<s.capacity&&s.berries.some(x=>x.id===b.targetId)&&!!path(s,s.player,s.berries.find(x=>x.id===b.targetId)!);
 case 'can-deliver':return s.bag>0&&b.amount>0&&b.amount<=s.bag&&path(s,s.player,s.home)!==null;
 case 'can-consume':return s.bag>0&&s.energy<s.maxEnergy;
 case 'can-create-access':return (s.bag>0||s.lures.length>0||s.guards.some(g=>g.eating>0))&&s.guards.some(g=>g.id===b.targetId)&&s.berries.length>0;
 }
}
export function advance(spec:SkillSpec,f:Frame,s:GameState){
 while(f.phase<spec.phases.length && !localSuccess(spec,f,s)){
  const p=spec.phases[f.phase]!;
  if(p.until==='resource-placed'&&(f.placed>0||s.lures.length>0||s.guards.some(g=>g.id===f.binding.targetId&&g.eating>0))){f.phase++;f.phaseStart=s.turn;f.transitions++;}
  else break;
 }
}
function fork(s:GameState,a:GameAction,f:Frame,charge:Charge){charge(1);f.simulationChecks++;return simulate(s,a);}
/** Relational parameter binding uses a bounded, charged local simulation. It does not
 * synthesize a whole-task route. The chosen coordinate is a SkillRun variable, not SkillSpec. */
export function bindPlacement(s:GameState,f:Frame,charge:Charge):{drop:Point;stand:Point}|null {
 const guard=s.guards.find(g=>g.id===f.binding.targetId);if(!guard||s.bag<1)return null;
 let best:{drop:Point;stand:Point;score:number}|null=null;
 const berries=s.berries.filter(b=>f.binding.targetBerryIds.includes(b.id));
 for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
  const drop={x,y};
  if(!walkable(s,drop)||dangerous(s,drop)||same(drop,s.home)||dist(drop,guard)>9||dist(drop,guard)<4)continue;
  for(const d of DIRECTIONS){
   const stand={x:x+d.x,y:y+d.y},route=path(s,s.player,stand);
   if(!route||route.length>12)continue;
   charge(1);f.bindingChecks++;
   let shadow=s,valid=true;
   for(const p of route){shadow=fork(shadow,{kind:'move',...p,objective:'safe',targetId:'binding',distance:1},f,charge);if(shadow.attacks>s.attacks||shadow.energy<=3){valid=false;break;}}
   if(!valid)continue;
   const a=legalPrimitives(shadow).find(a=>a.kind==='drop'&&same(a,drop));if(!a)continue;
   shadow=fork(shadow,a,f,charge);
   for(let i=0;i<20 && !accessOpen(shadow,f.binding)&&shadow.attacks===s.attacks&&shadow.energy>3;i++)shadow=fork(shadow,{kind:'wait'},f,charge);
   if(shadow.attacks!==s.attacks||!accessOpen(shadow,f.binding))continue;
   const near=berries.length?Math.min(...berries.map(b=>path(shadow,shadow.player,b)?.length??999)):999;
   const away=berries.length?Math.min(...berries.map(b=>dist(b,drop))):0;
   // Declared heuristic, not learned causal value. Prefer a useful opening and low approach cost.
   const score=away*1.2-near*0.8-route.length*0.7-(shadow.turn-s.turn)*0.2;
   if(!best||score>best.score)best={drop,stand,score};
  }
 }
 return best?{drop:best.drop,stand:best.stand}:null;
}
export type SkillCandidate={action:GameAction;score:number;progress:number;cost:number;reason:string;facts:PrimitiveFacts};
export function candidates(spec:SkillSpec,f:Frame,s:GameState,charge:Charge=()=>{}):SkillCandidate[]{
 advance(spec,f,s);const phase=spec.phases[f.phase];if(!phase||localSuccess(spec,f,s))return [];
 const legal=legalPrimitives(s).filter(a=>spec.capabilities.includes(a.kind));
 let target:Point|undefined;
 if(phase.rule==='gather')target=s.berries.find(b=>b.id===f.binding.targetId);
 if(phase.rule==='deliver')target=s.home;
 if(phase.rule==='place-resource'){
  if(!f.placement || !path(s,s.player,f.placement.stand) || !walkable(s,f.placement.drop)||dangerous(s,f.placement.drop))f.placement=bindPlacement(s,f,charge);
  if(f.placement)target=f.placement.stand;
 }
 const beforeDistance=target?path(s,s.player,target)?.length:undefined;
 const out:SkillCandidate[]=[];
 for(const action of legal){
  let progress=-999,reason='';
  if(action.kind==='move'&&target&&beforeDistance!==undefined){
   const afterDistance=path(s,action,target)?.length;
   if(afterDistance!==undefined&&afterDistance<=beforeDistance+2){progress=(beforeDistance-afterDistance)*5;reason='rebind current path';}
  }
  if((phase.rule==='gather'||phase.rule==='deliver')&&target&&action.kind==='wait'&&s.guards.length){progress=beforeDistance===undefined?1:-6;reason='react to transient path blockage';}
  if(phase.rule==='gather'&&action.kind==='pickup'&&action.berryId===f.binding.targetId){progress=30;reason='local acquisition';}
  if(phase.rule==='deliver'&&action.kind==='deposit'&&action.amount===Math.min(s.bag,f.binding.amount)){progress=30;reason='local delivery';}
  if(phase.rule==='consume'&&action.kind==='eat'){progress=30;reason='local energy gain';}
  if(phase.rule==='place-resource'&&action.kind==='drop'&&f.placement&&same(action,f.placement.drop)&&same(s.player,f.placement.stand)){progress=30;reason='resource placed';}
  if(phase.rule==='wait-access'){
    if(action.kind==='wait'){progress=2;reason='wait for observable guard state';}
    else if(action.kind==='move'&&dangerous(s,s.player)){progress=5;reason='leave threatened location';}
  }
  if(progress===-999)continue;
  const projected=fork(s,action,f,charge);if(projected.energy<=0||projected.attacks>s.attacks)continue;
  const safety=projected.guards.length?Math.min(5,...projected.guards.map(g=>dist(projected.player,g))):5;
  const revisit=action.kind==='move'?(f.visits[`${action.x},${action.y}`]??0):0;
  const facts:PrimitiveFacts={phase:phase.rule,kind:action.kind,targetBeforeSteps:beforeDistance??null,
    targetAfterSteps:target?(path(s,action.kind==='move'?action:s.player,target)?.length??null):null,
    milestone:progress===30,threatened:dangerous(s,s.player),energyAfter:projected.energy,attackDelta:projected.attacks-s.attacks,
    guardDistanceAfter:safety,priorVisits:revisit,source:'deterministic-transition-and-path/v1'};
  const score=primitiveRule(facts,spec.weights);
  out.push({action,score,progress,cost:1,reason,facts});
 }
 return out.sort((a,b)=>b.score-a.score||actionKey(a.action).localeCompare(actionKey(b.action)));
}
export function markApplied(f:Frame,a:GameAction){if(a.kind==='move')f.visits[`${a.x},${a.y}`]=(f.visits[`${a.x},${a.y}`]??0)+1;if(a.kind==='pickup'&&a.berryId===f.binding.targetId)f.acquired++;if(a.kind==='drop')f.placed++;}
export function failureReason(spec:SkillSpec,f:Frame,s:GameState):string|null {
 if(s.energy<=0||s.attacks>f.initial.attacks)return 'unsafe_outcome';
 if(s.turn-f.initial.turn>=spec.maxSteps)return 'skill_step_budget';
 if(f.phase>=spec.phases.length)return 'phases_exhausted';
 if(s.turn-f.phaseStart>=spec.phases[f.phase]!.maxSteps)return 'phase_step_budget';
 return null;
}
export function simulateSkill(spec:SkillSpec,s:GameState,b:Binding,charge:Charge=()=>{}):{success:boolean;final:GameState;steps:number;reason:string;checks:number;bindingChecks:number;validationScope:'authored-reference-controller-only';controllerVersion:'rules/v031';factsVersion:'gs/decision-facts/v1'}{
 const f=createFrame(s,b);let state=structuredClone(s);
 if(!applicable(spec,b,state))return {success:false,final:state,steps:0,reason:'initiation_failed',checks:0,bindingChecks:0,validationScope:'authored-reference-controller-only',controllerVersion:'rules/v031',factsVersion:'gs/decision-facts/v1'};
 for(let i=0;i<spec.maxSteps;i++){
  advance(spec,f,state);if(localSuccess(spec,f,state))break;
  const failed=failureReason(spec,f,state);if(failed)break;
  const chosen=candidates(spec,f,state,charge)[0];if(!chosen)break;
  state=fork(state,chosen.action,f,charge);markApplied(f,chosen.action);
 }
 const success=localSuccess(spec,f,state);
 return {success,final:state,steps:state.turn-s.turn,reason:success?'local_goal_passed':failureReason(spec,f,state)??'no_local_action',checks:f.simulationChecks,bindingChecks:f.bindingChecks,validationScope:'authored-reference-controller-only',controllerVersion:'rules/v031',factsVersion:'gs/decision-facts/v1'};
}

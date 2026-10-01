/** OFFLINE deterministic test doubles. Never a simulation of Jev's semantic competence. */
import {createWorld} from '../../dist/src/game/world.js';
import {SkillSession} from '../../dist/src/skills/runtime.js';
import {makeSkill} from '../../dist/src/skills/spec.js';
import {selectPacket} from '../../dist/src/skills/facts.js';
export const access=()=>makeSkill('access-open',['place-resource','wait-access'],'llm');
export const signal=()=>new AbortController().signal;
export function answer(cs,id){return {choice:id,confidence:id?1:.58,
 probabilities:Object.fromEntries(cs.map(c=>[c.id,c.id===id?1:id?0:0])),
 suitability:Object.fromEntries(cs.map(c=>[c.id,c.id===id?1:0])),abstainProbability:id?0:1};}
export function fixture(mode='abstain-child',extras={}){
 const stats={selects:0,generates:0,inputs:[],packets:[],actualExternalRequests:0};
 const providers={source:'test-provider',identity:'offline-incident-fixture/'+mode,
  select:async input=>{stats.selects++;stats.packets.push(structuredClone(input.packet));
   let id=null;
   if(mode==='context-gated-rule'){
    if(input.level==='parent'||input.packet.taskContext?.immediateObjective?.description)id=selectPacket(input.packet);
   }else if(mode==='abstain-parent')id=null;
   else if(input.level==='parent')id=input.candidates.find(c=>c.facts?.contract==='access-open')?.id??null;
   return {output:answer(input.candidates,id)};
  },
  generate:async input=>{stats.generates++;stats.inputs.push(structuredClone(input));return {output:{...access(),id:'offline-proposal-'+stats.generates}};}
 };
 const session=new SkillSession(createWorld('guarded'),'reactive-live',undefined,{providers,...extras});
 return {session,stats};
}
export async function finish(s,n=400){for(let i=0;i<n&&!s.finished;i++)await s.step();return s;}

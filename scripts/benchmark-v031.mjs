import fs from 'node:fs';import {createWorld} from '../dist/src/game/world.js';import {SkillSession} from '../dist/src/skills/runtime.js';import {selectPacket} from '../dist/src/skills/facts.js';
const rows=[],fixtures=[];
for(const scenario of ['meadow','detour','guarded','remix'])for(const seed of [731,123]){
 let reference;
 for(const provider of [false,true]){
 const mock={identity:'packet-only-test',source:'test-provider',select:async input=>{const id=selectPacket(input.packet);return {output:{choice:id,confidence:1,probabilities:Object.fromEntries(input.candidates.map(c=>[c.id,c.id===id?1:0])),suitability:Object.fromEntries(input.candidates.map(c=>[c.id,c.id===id?1:0])),abstainProbability:id?0:1},usage:{provider:'mock-not-billed',model:'packet-only-test',inputTokens:0,outputTokens:0}};}};
 const s=new SkillSession(createWorld(scenario),'reactive',undefined,{orderSeed:seed,...(provider?{providers:mock}:{})});const start=performance.now();
 for(let i=0;i<400&&!s.finished;i++)await s.step();
 const physical=s.events.filter(e=>e.type==='transition').map(e=>e.data.candidate.action);
 if(!provider)reference=JSON.stringify(physical);
 const ok=s.lastResult?.kind==='done'&&s.lastResult.outcome==='succeeded';
 rows.push({scenario,seed,controller:provider?'packet-only-mock':'authored-rules/v031',success:ok,steps:s.world.snapshot().turn,energy:s.world.snapshot().energy,elapsedMs:performance.now()-start,sameTrajectoryAsRule:reference===JSON.stringify(physical),decisions:s.decisions.length,providerAttempts:s.planning.providerS,realProviderRequests:0});
 if(!provider&&seed===731)fixtures.push(...s.decisions.slice(0,14).map(d=>({packet:d.packet,referenceChoice:d.choice,reference:'authored-rule, NOT ground-truth optimal'})));
 if(!ok||reference!==JSON.stringify(physical))throw Error(`031 gate failed: ${scenario}`);
 }
}
fs.writeFileSync('reports/benchmark-v031.json',JSON.stringify({version:'0.3.1',scope:'4 development maps x 2 seeds x 2 selectors; mock only. Rule is not optimal oracle.',realModels:'NOT_RUN',rows},null,2));
fs.writeFileSync('reports/decision-fixtures-v031.json',JSON.stringify({schema:'gs/fixtures/v1',split:'development-regression-not-heldout',fixtures},null,2));console.table(rows.map(({scenario,seed,controller,success,steps,energy,sameTrajectoryAsRule})=>({scenario,seed,controller,success,steps,energy,sameTrajectoryAsRule})));

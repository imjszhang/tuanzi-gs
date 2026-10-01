/** Offline CONTROL-FLOW fixtures, not evidence of model intelligence or independent discovery.
 * Production never imports test controllers. All scripted G/S behavior is labeled in output.
 */
import fs from 'node:fs';import path from 'node:path';
import {AutonomousSession} from '../dist/src/adaptive/session.js';
import {explorationBackend,contextOnlyGenerator} from '../dist/src/adaptive/local.js';
import {createWorld} from '../dist/src/game/world.js';
import {tiny,backend,generator,program,proposal,chooseDeposit} from '../tests/fixtures/adaptive-v05.mjs';
const out=path.resolve('reports/v053/behavior');fs.mkdirSync(out,{recursive:true});const rows=[];
async function run(name,b,g,w=tiny(),opts={}){
 const s=new AutonomousSession(w,{backend:b,generator:g,strategy:'direct',orderSeed:441,experience:'use',maxActions:80,maxGCalls:4,maxRevisions:3,maxDepth:2,deadlineMs:20000,...opts});const at=performance.now();
 for(let i=0;i<150&&!s.finished;i++)await s.step();
 const d=s.diagnostics(),r={name,source:b.kind==='mock'?'SCRIPTED_TEST_CONTROLLERS':'LOCAL_ROTATION_NOT_A_SOLVER',status:s.lastResult,actions:s.world.snapshot().turn-w.turn,delivered:s.world.snapshot().delivered,energy:s.world.snapshot().energy,gCalls:d.gCalls,sCalls:d.sCalls,metaCalls:d.metaCalls,elapsedMs:performance.now()-at,externalRequests:0,oracleCalls:0,rootSucceeded:s.lastResult?.kind==='done'&&s.lastResult.outcome==='succeeded'};
 rows.push(r);fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({experiment:r,...s.export()},null,2));console.log(JSON.stringify(r));
}
await run('startup-output-invalid',backend(()=>null),generator(()=>({proposals:[]})),tiny(),{maxGCalls:1});
await run('startup-then-action-abstention-reframed',backend(f=>f.kind==='reframe'?chooseDeposit(f):f.question.includes('完成当前')?chooseDeposit(f):null),generator(i=>i.cause==='initial_environment_review'?proposal(i.evidence.currentProgram):proposal()));
await run('confident-stagnation',backend(f=>f.kind==='reframe'?f.options[0].id:f.question.includes('完成')?chooseDeposit(f):'wait'),generator(i=>i.cause==='initial_environment_review'?proposal(i.evidence.currentProgram):proposal()));
await run('recursive-meta-reframed',backend(f=>f.kind==='action'?(f.question.includes('完成')?chooseDeposit(f):null):(f.question==='focus-meta'||f.context.lowerFrame?.kind==='reframe'?f.options[0].id:null)),generator(i=>i.frame.kind==='action'?proposal():{proposals:[{kind:'reframe',question:'focus-meta',hypothesis:'Synthetic control-flow fixture',ruleIds:['goal'],includeBroaderObservation:true,candidateIds:null}]}));
await run('persistent-abstention',backend(()=>null),generator(i=>i.frame.kind==='action'?proposal():{proposals:[{kind:'reframe',question:'focus-meta',hypothesis:'Synthetic fixture; not evidence of a valid plan',ruleIds:[],includeBroaderObservation:false,candidateIds:null}]}));
await run('rename-only',backend(f=>f.kind==='reframe'?f.options[0].id:null),generator((i,n)=>{const p=program();p.title='renamed-'+n;return proposal(p);}));
for(const scenario of ['meadow','detour','guarded','remix'])await run('local-'+scenario,explorationBackend(),contextOnlyGenerator(),createWorld(scenario),{maxActions:40,maxGCalls:3});
const report={version:'0.5.3',scope:'protocol-and-local-behavior-only',realModels:'NOT_RUN',warning:'Scripted fixtures demonstrate repair transitions; they are NOT independent G generation. The shipped local generator only expands public context and is NOT a game solver. No metrics show Jev/LLM improvement.',rows};
fs.writeFileSync(path.join(out,'benchmark-v05.json'),JSON.stringify(report,null,2));

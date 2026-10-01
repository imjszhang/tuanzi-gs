/** Protocol experiments only. Explicit SCRIPTED_TEST_CONTROLLERS, not model performance. */
import fs from 'node:fs';
import {AutonomousSession} from '../dist/src/adaptive/session.js';
import {createWorld} from '../dist/src/game/world.js';
import {tiny,program,proposal,generator,backend,chooseDeposit} from '../tests/fixtures/adaptive-v05.mjs';
import {subproblem,analysis} from '../tests/fixtures/adaptive-v054.mjs';
import {contextOnlyGenerator as localGenerator,explorationBackend as localBackend} from '../dist/src/adaptive/local.js';
const dir='reports/v054/experiments';fs.mkdirSync(dir,{recursive:true});const rows=[];
const scripted='SCRIPTED_TEST_CONTROLLERS; microtask starts at home with delivered=4 and bag=1; NOT fruit-orchard success';
const any=f=>f.kind==='analysis'?f.options[0]?.id??null:chooseDeposit(f);
async function run(id,g,b,options={},world=tiny(),limit=12,label=scripted){const s=new AutonomousSession(world,{generator:g,backend:b,strategy:'direct',orderSeed:441,maxGCalls:12,maxDepth:2,maxRevisions:3,...options});const at=performance.now();for(let i=0;i<limit&&!s.finished;i++)await s.step();if(!s.finished)s.cancel();const d=s.diagnostics(),end=s.world.snapshot();const trace=s.export();fs.writeFileSync(`${dir}/${id}.json`,JSON.stringify(trace,null,2));rows.push({id,source:label,result:s.lastResult,physicalActions:s.history.length,delivered:end.delivered,energy:end.energy,G:d.gCalls,S:d.sCalls,childS:d.metaCalls,rootCommits:trace.events.filter(e=>e.type==='adaptation_committed'&&e.data.depth===0).length,childReturns:d.subproblems.length,requestOrder:trace.requests.map(r=>`${r.role}${r.depth}`),externalModelRequests:0,elapsedMs:performance.now()-at});}
await run('direct-startup',generator(),backend(any),{maxDepth:0});
await run('abstain-rewrite',generator(i=>proposal(program(i.cause==='selector_abstained'?'changed':'original'))),backend(f=>f.question==='changed'?chooseDeposit(f):null));
await run('child-depth-return',generator(i=>i.frame.kind==='analysis'?(i.cause==='subproblem_unresolved'?analysis():subproblem('Deeper question')):i.cause==='subproblem_completed'?proposal():subproblem()),backend(any),{maxDepth:1});
await run('all-abstain-bounded',generator((_,n)=>proposal(program('different '+n))),backend(()=>null),{maxDepth:0});
const old=JSON.parse(fs.readFileSync('tests/fixtures/v053-invalid-scope.json','utf8'));
await run('declaration-rejected',generator(()=>old),backend(any),{},createWorld('guarded'),1,'RECORDED_INVALID_PROPOSAL_NEGATIVE_TEST; no policy execution or oracle feedback');
await run('snapshot-expiry',generator(i=>proposal(program('wait-scope',['wait'],{candidateIds:i.cause==='candidate_scope_expired'?null:['wait'],candidateScope:i.cause==='candidate_scope_expired'?{mode:'stage'}:{mode:'snapshot',revision:i.frame.revision},until:[{kind:'delta',field:'turn',atLeast:24}],maxActions:24}))),backend(f=>f.options.find(o=>o.id==='wait')?.id??null),{},tiny(),2);
for(const name of ['meadow','detour','guarded','remix'])await run(`local-${name}`,localGenerator(),localBackend(),{maxGCalls:3,maxDepth:0},createWorld(name),40,'LOCAL_ROTATION_NOT_A_SOLVER; authored general interface-expansion fixture, not Jev/LLM');
const out={version:'0.5.4',realModels:'NOT_RUN',notes:['All successful microtasks use explicit scripted outputs.','No reference route, rollout, recommended action or solution is supplied to the autonomous production lane.','Wall time is local machine protocol timing, not model speed/cost.','Partial snapshot test is intentionally cancelled after two actual actions.'],rows};fs.writeFileSync('reports/v054/benchmark-v054.json',JSON.stringify(out,null,2));console.table(rows.map(({id,result,physicalActions,delivered,G,S,childS})=>({id,result:result.reason??result.outcome,actions:physicalActions,delivered,G,S,childS})));

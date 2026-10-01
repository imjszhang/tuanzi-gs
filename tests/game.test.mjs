import test from 'node:test';
import assert from 'node:assert/strict';
import {GSEngine} from '../dist/vendor/gs-engine-ts/src/engine.js';
import {GameWorld,createWorld,path,reachableBerries,dangerous,applyAction} from '../dist/src/game/world.js';
import {TuanziDomain} from '../dist/src/game/domain.js';
import {INITIAL_POLICY,GOAL,clone} from '../dist/src/game/types.js';
import {GameSession,compareOffline} from '../dist/src/runtime/session.js';
import {HeuristicSelector,TemplatePlanner,GameArbiter} from '../dist/src/runtime/controllers.js';
const signal=()=>new AbortController().signal;
async function context(domain,policy=INITIAL_POLICY){return {goal:GOAL,snapshot:await domain.observe(signal()),policy:clone(policy),recent:[]};}
function fixture(s=createWorld()){
  const world=new GameWorld(s),domain=new TuanziDomain(world);domain.bindPolicy(INITIAL_POLICY);return {world,domain};
}
async function run(scenario,mode='adaptive'){const s=new GameSession(createWorld(scenario),mode);for(let i=0;i<220&&!s.finished;i++)await s.step();return s;}
function engineWith(domain,selector=new HeuristicSelector(),planner=new TemplatePlanner()){
 const events=[];const engine=new GSEngine({runId:'test-run',goal:GOAL,initialPolicy:INITIAL_POLICY,domain,selector,planner,arbiter:new GameArbiter(),journal:{append:e=>{events.push(e);if(e.type==='policy_committed')domain.bindPolicy(e.data.next);}},limits:{maxCycles:260,maxActions:180,maxModelCalls:260,maxRepairs:5,maxDurationMs:10000,ioTimeoutMs:4000,noProgressWindow:5,historySize:12}});
 return {engine,events};
}
test('world snapshot is a detached copy',()=>{const w=new GameWorld();const s=w.snapshot();s.energy=0;s.berries.length=0;assert.equal(w.snapshot().energy,86);assert.equal(w.snapshot().berries.length,15);});
test('world generation is deterministic',()=>assert.deepEqual(createWorld('guarded'),createWorld('guarded')));
test('home and terrain cannot be edited',()=>{const w=new GameWorld();assert.equal(w.edit('wall',w.snapshot().home).ok,false);assert.equal(w.edit('erase',{x:7,y:2}).ok,false);assert.equal(w.snapshot().revision,1);});
test('placing and erasing objects increments authoritative revision',()=>{const w=new GameWorld();assert.equal(w.edit('wall',{x:10,y:6}).ok,true);assert.equal(w.snapshot().revision,2);assert.equal(w.edit('erase',{x:10,y:6}).ok,true);assert.equal(w.snapshot().revision,3);});
test('guard editing moves rather than duplicates a guard',()=>{const w=new GameWorld();assert.equal(w.edit('guard',{x:9,y:7}).ok,true);assert.equal(w.snapshot().guards.length,1);assert.deepEqual(w.snapshot().guards[0].anchor,{x:9,y:7});});
test('BFS routes around developer-independent obstacles',()=>{const s=createWorld('detour');const route=path(s,s.player,{x:6,y:7});assert.ok(route?.length);assert.ok(route.every(p=>!s.walls.some(w=>p.x===w.x&&p.y===w.y)));});
test('guarded fruit is initially unavailable for safe pickup',()=>{const s=createWorld('guarded');assert.equal(reachableBerries(s).length,0);assert.equal(dangerous(s,{x:12,y:3}),true);});
test('goal is verified by delivered fruit, not the backpack or model text',async()=>{const {domain}=fixture();const c=await context(domain);c.snapshot.state.bag=3;assert.equal(domain.completion(c.snapshot),'running');c.snapshot.state.delivered=5;assert.equal(domain.completion(c.snapshot),'succeeded');c.snapshot.state.energy=0;assert.equal(domain.completion(c.snapshot),'failed');});
test('action gate rejects teleportation',async()=>{const {domain}=fixture();const c=await context(domain);assert.equal(domain.gate(c,{id:'bad',description:'teleport',capability:'game.move',action:{kind:'move',x:12,y:8,objective:'home',targetId:'home',distance:1}}).kind,'deny');});
test('execution is idempotent for the same logical action key',async()=>{const {domain,world}=fixture();const c=await context(domain);const candidate=domain.enumerate(c).find(a=>a.action.kind==='move');const req={candidate,expectedRevision:c.snapshot.revision,policyVersion:1,idempotencyKey:'one'};const a=await domain.execute(req,signal());const b=await domain.execute(req,signal());assert.deepEqual(a,b);assert.equal(world.snapshot().turn,1);assert.equal(world.snapshot().energy,85);});
test('execution rejects an outdated world snapshot',async()=>{const {domain,world}=fixture();const c=await context(domain);const candidate=domain.enumerate(c)[0];world.edit('berry',{x:10,y:6});const r=await domain.execute({candidate,expectedRevision:c.snapshot.revision,policyVersion:1,idempotencyKey:'stale'},signal());assert.equal(r.status,'stale');assert.equal(world.snapshot().turn,0);});
test('execution rejects an outdated policy version',async()=>{const {domain}=fixture();const c=await context(domain);const r=await domain.execute({candidate:domain.enumerate(c)[0],expectedRevision:c.snapshot.revision,policyVersion:2,idempotencyKey:'bad-version'},signal());assert.equal(r.status,'stale');});
test('policy JSON rejects arbitrary fields and executable capability names',()=>{const {domain}=fixture();assert.throws(()=>domain.parsePolicy({...INITIAL_POLICY.body,goal:'change the target'}));assert.throws(()=>domain.parsePolicy({...INITIAL_POLICY.body,enabled:['move','eval']}));assert.throws(()=>domain.parsePolicy({...INITIAL_POLICY.body,reserveEnergy:999}));});
test('policy cannot remove fundamental safety/lifecycle capabilities',()=>{const {domain}=fixture();assert.ok(domain.validatePolicy({...INITIAL_POLICY.body,enabled:['pickup']}).length);assert.ok(domain.validatePolicy({...INITIAL_POLICY.body,mode:'lure'}).length);});
test('one eat action consumes one berry and caps energy before turn cost',()=>{const s=createWorld();s.energy=90;s.bag=1;applyAction(s,{kind:'eat'});assert.equal(s.energy,99);assert.equal(s.bag,0);assert.equal(s.turn,1);});
test('ordinary meadow completes without strategy repair',async()=>{const s=await run('meadow');assert.deepEqual(s.lastResult,{kind:'done',outcome:'succeeded'});assert.equal(s.world.snapshot().turn,36);assert.equal(s.engine.currentPolicy.version,1);assert.equal(s.events.filter(e=>e.type==='repair_requested').length,0);});
test('ordinary detour completes with BFS and no policy repair',async()=>{const s=await run('detour');assert.deepEqual(s.lastResult,{kind:'done',outcome:'succeeded'});assert.equal(s.world.snapshot().turn,56);assert.equal(s.engine.currentPolicy.version,1);});
test('guarded orchard fixed-policy baseline stops transparently',async()=>{const s=await run('guarded','fixed');assert.equal(s.lastResult.kind,'paused');assert.equal(s.lastResult.reason,'planner_proposed_no_change');assert.equal(s.world.snapshot().turn,0);assert.equal(s.engine.currentPolicy.version,1);});
test('guarded orchard adopts a preset policy, really uses bait, and completes',async()=>{const s=await run('guarded');const w=s.world.snapshot();assert.deepEqual(s.lastResult,{kind:'done',outcome:'succeeded'});assert.equal(w.delivered,5);assert.equal(w.turn,76);assert.equal(w.baitUsed,2);assert.equal(w.attacks,0);assert.equal(s.engine.currentPolicy.version,2);assert.ok(s.events.some(e=>e.type==='policy_committed'&&e.data.explanation.includes('离线')));});
test('policy update is its own cycle and does not silently execute an old action',async()=>{const s=new GameSession(createWorld('guarded'));const r=await s.step();assert.equal(r.kind,'policy_updated');assert.equal(s.world.snapshot().turn,0);assert.equal(s.engine.currentPolicy.version,2);assert.equal(s.events.filter(e=>e.type==='action_intent').length,0);});
test('player intervention during selection discards the stale choice',async()=>{
 const {world,domain}=fixture();let entered,release;
 const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const selector={async evaluate(ctx,cs,signal){entered();await gate;return new HeuristicSelector().evaluate(ctx,cs,signal);}};
 const {engine,events}=engineWith(domain,selector);const pending=engine.step();await started;world.edit('berry',{x:10,y:6});release();
 assert.equal((await pending).kind,'stale');assert.equal(world.snapshot().turn,0);assert.ok(events.some(e=>e.type==='stale_result_discarded'));
});
test('player intervention during planning discards the stale proposal',async()=>{
 const {world,domain}=fixture(createWorld('guarded'));let entered,release;
 const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const planner={async propose(ctx,reason,signal){entered();await gate;return new TemplatePlanner().propose(ctx,reason,signal);}};
 const {engine}=engineWith(domain,new HeuristicSelector(),planner);const pending=engine.step();await started;world.edit('berry',{x:6,y:8});release();
 assert.equal((await pending).kind,'stale');assert.equal(engine.currentPolicy.version,1);assert.equal(world.snapshot().turn,0);
});
test('offline comparison clones the same snapshot and does not modify its input',async()=>{const initial=createWorld('guarded');const before=clone(initial);const rows=await compareOffline(initial);assert.deepEqual(initial,before);assert.deepEqual(rows.map(r=>r.outcome),['策略耗尽','任务完成']);assert.ok(rows.every(r=>r.externalCalls===0));assert.deepEqual(rows[0].trace.initialWorld,rows[1].trace.initialWorld);});
test('export separately preserves player interventions',()=>{const s=new GameSession(createWorld());s.edit('wall',{x:10,y:6});const trace=s.export();assert.equal(trace.interventions.length,1);assert.equal(trace.interventions[0].after.revision,2);assert.equal(trace.events.length,0);assert.equal(trace.mode,'adaptive');});

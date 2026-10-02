// Synthetic controller choices test host boundaries, not autonomous performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {LabRun} from '../dist/src/lab/manager.js';
import {parseConfig} from '../dist/src/lab/types.js';
import {createHosted} from '../dist/src/lab/session.js';
import {createWorld} from '../dist/src/game/world.js';
import {keyEvents} from '../dist/src/lab/presentation.js';
import {generator,backend,chooseDeposit,proposal,program,tiny} from './fixtures/adaptive-v05.mjs';

const actor={id:'agent:referee-test',kind:'agent',label:'Synthetic host test'};
const config=extra=>parseConfig({kind:'game',controller:'adaptive',scenario:'guarded',strategy:'direct',backend:'jev',generator:'llm',allowLive:true,maxRequests:30,...extra});
const providers=(g,b)=>({ready:()=>true,backend:()=>b,adapt:g.propose.bind(g),adaptSource:{id:'synthetic-G-test-only',kind:'mock'}});
function home(){const w=createWorld('guarded');w.player={...w.home};return w;}
const command=(r,action,extra={})=>r.command({commandId:crypto.randomUUID(),expectedControlVersion:r.controlVersion,actor,action,...extra});
function fixture(t,{world=home(),cfg={},g=generator(),b=backend(chooseDeposit)}={}){
 const c=config(cfg),p=providers(g,b),r=new LabRun(c,actor,p,world);t.after(()=>r.shutdown());return {r,g,b,c,p};
}

test('referee initial deadlock is lazy and stops before any G/S calls',async t=>{
 const w=home();w.bag=0;w.delivered=1;const {r,g,b}=fixture(t,{world:w});
 assert.equal(r.view().status,'ready');assert.equal(r.view().referee,undefined);
 assert.equal(r.export().evaluation.referee,null);assert.equal(r.events.some(e=>e.type==='deadlock_referee'),false);
 const cmd={commandId:'one-step',expectedControlVersion:0,actor,action:'step'};
 const result=await r.command(cmd);
 assert.equal(result.state.status,'failed');assert.match(result.state.reason,/deadlock_proven:stationary_resource_lock/);
 assert.equal(result.state.requests,0);assert.equal(result.state.physicalActions,0);assert.equal(result.state.decisionSteps,0);
 assert.equal(g.calls.length,0);assert.equal(b.calls.length,0);
 const count=r.events.length;assert.equal((await r.command(cmd)).replayed,true);assert.equal(r.events.length,count);
 await assert.rejects(command(r,'start'),e=>e.code==='RUN_TERMINAL');
 assert.equal(r.events.filter(e=>e.type==='deadlock_referee').length,1);
});

test('deposit-induced deadlock stops at the action boundary without changing controller inputs or memory',async t=>{
 const w=home(),{r,g,b,c}=fixture(t,{world:w});
 const baselineG=generator(),baselineS=backend(chooseDeposit);
 const bare=createHosted(c,w,()=>{},{requests:0,externalRequests:0,questions:0,rows:[]},new AbortController().signal,providers(baselineG,baselineS));
 const rawResult=await bare.step();assert.equal(rawResult.kind,'executed');assert.equal(bare.finished,false);
 await command(r,'step');const view=r.view(),report=r.export();
 assert.equal(view.status,'failed');assert.equal(view.physicalActions,1);assert.equal(view.world.bag,0);assert.equal(view.world.delivered,1);
 assert.equal(view.outcome.source,'environment-referee');assert.equal(view.referee.observerOnly,true);
 assert.deepEqual(g.calls,baselineG.calls);assert.deepEqual(b.calls,baselineS.calls);
 assert.deepEqual(report.trace.selfMemory,bare.memory().adaptive);assert.equal(report.trace.result.kind,'executed');
 assert.equal(report.trace.events.some(e=>e.type==='deadlock_referee'),false);
 assert.deepEqual(report.evaluation.referee,view.referee);
 assert.equal(keyEvents(report.events,view.lastSeq).filter(e=>e.raw.type==='deadlock_referee').length,1);
 for(const value of [g.calls,b.calls,report.trace.requests,report.trace.selfMemory,report.trace.diagnostics]){
  assert.doesNotMatch(JSON.stringify(value),/gs\/deadlock-referee|stationary_resource_lock|environment-referee|observerOnly/);
 }
 const cp=await command(r,'checkpoint');assert.deepEqual(r.getCheckpoint(cp.checkpointId).memory,bare.memory());
 assert.equal(report.events.find(e=>e.type==='run_ended').data.actualEngineResult.kind,'executed');
 const changed=view.referee;changed.reason='tampered';assert.notEqual(r.view().referee.reason,'tampered');
});

test('continuous mode stops after the first proven deadlock, before another provider request',async t=>{
 const {r,g,b}=fixture(t);await command(r,'start');
 for(let i=0;i<200&&!r.terminal;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(r.status,'failed');assert.equal(r.view().physicalActions,1);assert.equal(g.calls.length,1);assert.equal(b.calls.length,1);
});

test('same-boundary intervention is applied before the referee checks a deposit',async t=>{
 const {r}=fixture(t,{cfg:{interventions:[{afterAction:1,tool:'berry',point:{x:3,y:8}}]}});
 await command(r,'step');assert.equal(r.view().status,'paused');assert.equal(r.view().referee.verdict,'not-proven');
 assert.equal(r.view().world.berries.length,9);assert.equal(r.view().interventions[0].result.ok,true);
});

test('an action-zero intervention can open access before the initial referee check',async t=>{
 const w=home();w.bag=0;w.delivered=1;
 const g=generator(()=>proposal(program('synthetic wait',['wait'],{until:[{kind:'delta',field:'turn',atLeast:10}]})));
 const {r,b}=fixture(t,{world:w,g,b:backend(()=> 'wait'),cfg:{interventions:[{afterAction:0,tool:'berry',point:{x:3,y:8}}]}});
 await command(r,'step');assert.equal(r.status,'paused');assert.equal(r.view().physicalActions,1);
 assert.equal(r.view().interventions[0].actualAfterAction,0);assert.equal(r.view().referee.verdict,'not-proven');
 assert.equal(g.calls.length,1);assert.equal(b.calls.length,1);
});

test('future scheduled interventions defer a proof, and the last intervention triggers a fresh check',async t=>{
 const w=home();w.bag=0;w.delivered=1;
 const g=generator(()=>proposal(program('synthetic wait',['wait'],{until:[{kind:'delta',field:'turn',atLeast:10}]})));
 const {r}=fixture(t,{world:w,g,b:backend(()=> 'wait'),cfg:{interventions:[{afterAction:2,tool:'wall',point:{x:0,y:0}}]}});
 await command(r,'step');assert.equal(r.status,'paused');assert.equal(r.view().referee.reason,'pending_interventions');
 await command(r,'step');assert.equal(r.status,'failed');assert.equal(r.view().physicalActions,2);assert.equal(r.view().interventions.length,1);
});

test('interactive world changes invalidate the last observer assessment until the next step',async t=>{
 const {r}=fixture(t,{g:generator(()=>proposal(program('synthetic wait',['wait'],{until:[{kind:'delta',field:'turn',atLeast:10}]}))),b:backend(()=> 'wait')});
 await command(r,'step');assert.equal(r.view().referee.verdict,'not-proven');
 await command(r,'intervene',{tool:'wall',point:{x:0,y:0},expectedWorldRevision:r.view().worldRevision});
 assert.equal(r.view().referee,undefined);await command(r,'step');assert.equal(r.view().referee.worldRevision,r.view().worldRevision);
});

test('natural success and exhaustion keep the existing terminal outcome',async t=>{
 const {r}=fixture(t,{world:tiny()});await command(r,'step');assert.equal(r.status,'succeeded');assert.notEqual(r.view().referee?.verdict,'proven-deadlock');
 const w=home();w.energy=0;w.bag=0;const second=fixture(t,{world:w});await command(second.r,'step');
 assert.equal(second.r.status,'failed');assert.equal(second.r.reason,null);assert.equal(second.g.calls.length,0);
});

test('provider fault and explicit cancellation are not relabeled as deadlocks',async t=>{
 const bad=fixture(t,{g:generator(()=>{throw Error('test_provider_fault');})});await command(bad.r,'step');
 assert.equal(bad.r.status,'fault');assert.match(bad.r.reason,/test_provider_fault/);
 const cancelled=fixture(t);await command(cancelled.r,'cancel');assert.equal(cancelled.r.status,'cancelled');assert.equal(cancelled.r.view().referee,undefined);
});

test('referee is outside the legacy reference controller lane',async t=>{
 const c=parseConfig({kind:'game',controller:'rules'}),r=new LabRun(c,actor,undefined,tiny());t.after(()=>r.shutdown());
 await command(r,'step');assert.equal(r.view().referee,undefined);assert.equal(r.export().evaluation.deadlockPolicy,undefined);
});

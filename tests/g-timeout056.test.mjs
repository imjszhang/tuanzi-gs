// Synthetic clocks/providers validate timeout boundaries, not model performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveGS,InvalidAdaptation} from '../dist/vendor/gs-engine-ts/src/adaptive.js';
import {parseConfig} from '../dist/src/lab/types.js';
import {LabRun} from '../dist/src/lab/manager.js';
import {generator,backend,chooseDeposit,tiny} from './fixtures/adaptive-v05.mjs';
const frame={kind:'action',revision:'1',question:'fixture',context:{},options:[{id:'a',description:'fixture',value:null}]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function resolver(overrides={},limits={}) {return new AdaptiveGS({check:(_r,s)=>s.throwIfAborted(),event(){},evidence:()=>({}),select:async()=>({choice:'a',detail:null}),generate:async()=>({}),parse:()=>[{id:'p',description:'fixture',value:{}}],apply:f=>({...f,question:'changed'}),...overrides},{ioTimeoutMs:25,gTimeoutMs:250,...limits});}
test('G timeout config defaults and validation',()=>{
 assert.equal(parseConfig({kind:'game'}).gTimeoutMs,600000);
 assert.equal(parseConfig({gTimeoutMs:3600000}).gTimeoutMs,3600000);
 for(const gTimeoutMs of [0,99,3600001,NaN,100.5,'600000'])assert.throws(()=>parseConfig({gTimeoutMs}));
});
test('G can exceed the independent S timeout',async()=>{
 const gs=resolver({generate:async()=>{await delay(70);return {};}});
 assert.equal((await gs.resolve(frame,new AbortController().signal,'initial_environment_review')).kind,'selected');
});
test('format correction also uses the longer G timeout',async()=>{
 const gs=resolver({generate:async()=>null,parse:v=>{if(v===null)throw new InvalidAdaptation('fixture');return [{id:'p',description:'fixture',value:{}}];},repairOutput:async()=>{await delay(70);return {};}});
 assert.equal((await gs.resolve(frame,new AbortController().signal,'initial_environment_review')).kind,'selected');
});
test('long G allowance does not widen S timeout',async()=>{
 const gs=resolver({select:async()=>{await delay(70);return {choice:'a',detail:null};}});
 await assert.rejects(gs.resolve(frame,new AbortController().signal),/adaptive_io_timeout/);
});
test('G deadline aborts provider signal',async()=>{
 let aborted=false;
 const gs=resolver({generate:(_r,s)=>new Promise((_,reject)=>s.addEventListener('abort',()=>{aborted=true;reject(s.reason);},{once:true}))},{gTimeoutMs:30});
 await assert.rejects(gs.resolve(frame,new AbortController().signal,'initial_environment_review'),/adaptive_io_timeout/);assert.equal(aborted,true);
});
for(const mode of ['deadline','cancel'])test(`host ${mode} interrupts a long G without physical action`,async()=>{
 let started;const ready=new Promise(r=>started=r);let aborted=false;
 const g=generator((_r,_n,s)=>{started();return new Promise((_,reject)=>s.addEventListener('abort',()=>{aborted=true;reject(s.reason);},{once:true}));});
 const b=backend(chooseDeposit),actor={id:'agent:timeout-test',kind:'agent',label:'fixture'};
 const config=parseConfig({kind:'game',controller:'adaptive',generator:'llm',backend:'jev',allowLive:true,maxRequests:10,deadlineMs:mode==='deadline'?100:2000,gTimeoutMs:600000});
 const providers={ready:()=>true,backend:()=>b,adapt:g.propose.bind(g),adaptSource:{id:g.id,kind:'mock'}};
 const run=new LabRun(config,actor,providers,tiny());
 try{
  await run.command({commandId:'start',expectedControlVersion:0,actor,action:'start'});await ready;
  if(mode==='cancel')await run.command({commandId:'cancel',expectedControlVersion:1,actor,action:'cancel'});
  for(let i=0;i<100&&!run.terminal;i++)await delay(5);
  assert.equal(run.terminal,true);assert.equal(run.status,mode==='deadline'?'stopped':'cancelled');assert.equal(run.reason,mode==='deadline'?'wall_clock_deadline':'operator_cancel');
  assert.equal(aborted,true);assert.equal(run.view().physicalActions,0);assert.equal(b.calls.length,0);
 }finally{run.shutdown();}
});

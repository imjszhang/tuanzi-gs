import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parseConfig} from '../dist/src/lab/types.js';
import {createHosted} from '../dist/src/lab/session.js';
import {ExperimentManager} from '../dist/src/lab/manager.js';
import {AdaptiveGS} from '../dist/vendor/gs-engine-ts/src/adaptive.js';
import {publicWorld,observe} from '../dist/src/adaptive/world-port.js';
import {tiny,backend,generator,chooseDeposit} from './fixtures/adaptive-v05.mjs';
const actor={id:'agent:isolation',kind:'agent',label:'isolation fixture'};
for(const controller of ['hierarchy','program','rules'])for(const backend of ['jev','llm'])test(`v05 ${controller}+${backend} cannot open old assistance model lane`,()=>{assert.throws(()=>parseConfig({kind:'game',controller,backend,allowLive:true,maxRequests:20}),/LEGACY|offline|reference/);});
test('v05 legacy hierarchical G model also prohibited with local S',()=>assert.throws(()=>parseConfig({kind:'game',controller:'hierarchy',generator:'llm',allowLive:true,maxRequests:20}),/offline reference/));
test('v05 default game controller is autonomous; no implicit old skill library',()=>assert.equal(parseConfig({kind:'game'}).controller,'adaptive'));
test('v05 direct hosted factory also rejects bypassed unsafe typed config',()=>{assert.throws(()=>createHosted({...parseConfig({kind:'game',controller:'hierarchy'}),backend:'jev'},tiny(),()=>{}, {requests:0,externalRequests:0,questions:0,rows:[]},new AbortController().signal),/LEGACY/);});
test('v05 configuration cannot import a benchmark solution, model context or root override',()=>{for(const name of ['referenceSolution','oracle','prompt','initialSkills','target','context','memory'])assert.throws(()=>parseConfig({kind:'game',[name]:'CANARY'}),/Unsupported/);});
test('v05 all observation groups omit scenario hints and extra reference fields',()=>{const w=tiny();w.lastFact='HINT_CANARY';w.scenario='HINT_CANARY';w.oracle='HINT_CANARY';assert.ok(!JSON.stringify(publicWorld(w)).includes('HINT_CANARY'));assert.ok(!JSON.stringify(observe(w,['self','nearby','map','objects'],[])).includes('HINT_CANARY'));});
test('v05 isolated modules never import reference controllers, tactical bindings or score code',()=>{for(const file of ['session','world-port','spec','judgment','local']){const src=fs.readFileSync(new URL(`../src/adaptive/${file}.ts`,import.meta.url),'utf8');for(const re of [/from\s+['"][^'"]*\/skills\//,/from\s+['"][^'"]*\/planning\//,/from\s+['"][^'"]*\/decision\/pipeline/,/\b(simulateSkill|bindPlacement|lureSite|selectPacket|parentRule|primitiveRule)\s*\(/])assert.ok(!re.test(src),`${file}: ${re}`);}});
test('v05 reference memory cannot flow through a cross-controller fork',async t=>{const m=new ExperimentManager();t.after(()=>m.close());const r=await m.create({requestId:'ref',actor,config:{kind:'game',controller:'hierarchy'}});await assert.rejects(m.fork(r.runId,{requestId:'cross',actor,checkpointId:'initial',memory:'inherit',config:{controller:'adaptive'}}),/MEMORY_LANE|reference/i);});
test('v05 actual world only fork is allowed and labeled without memory inheritance',async t=>{const m=new ExperimentManager();t.after(()=>m.close());const r=await m.create({requestId:'ref',actor,config:{kind:'game',controller:'hierarchy'}});const f=await m.fork(r.runId,{requestId:'world',actor,checkpointId:'initial',memory:'none',config:{controller:'adaptive'}});assert.equal(f.config.controller,'adaptive');assert.equal(f.lineage.historyInherited,false);assert.equal(f.requests,0);});
test('v05 host rejects old reference memory before executing any request',()=>{const c=parseConfig({kind:'game'});assert.throws(()=>createHosted(c,tiny(),()=>{},{requests:0,externalRequests:0,questions:0,rows:[]},new AbortController().signal,undefined,{catalogue:{schema:'gs/reactive-catalogue/v1',records:[]}}),/reference_memory/);});
test('v05 metadata ID changes are not a generic valid authority change',async()=>{
 const f={kind:'action',revision:'r1',question:'q',context:{},options:[]};
 const gs=new AdaptiveGS({check:()=>{},evidence:()=>({}),event:()=>{},select:async x=>({choice:x.kind==='reframe'?x.options[0].id:null,detail:{}}),generate:async()=>({}),parse:()=>[{id:'p',description:'p',value:{}}],apply:x=>({...x,revision:'r2'})});await assert.rejects(gs.resolve(f,new AbortController().signal),/changed_authority/);
});
test('v05 G receives neither reference admission verdict nor score from host',async()=>{
 const g=generator(),b=backend(chooseDeposit),c=parseConfig({kind:'game',backend:'jev',generator:'llm',allowLive:true,maxRequests:20});
 const ledger={requests:0,externalRequests:0,questions:0,rows:[]};const s=createHosted(c,tiny(),()=>{},ledger,new AbortController().signal,{ready:()=>true,backend:()=>b,adapt:g.propose.bind(g),adaptSource:{id:'test-G',kind:'mock'}});
 await s.step();const wire=JSON.stringify(g.calls);for(const k of ['milestone','targetBeforeSteps','guardDistanceAfter','authored-reference-controller-only','local_goal_passed','validationScope'])assert.ok(!wire.includes('"'+k+'"'));assert.equal(ledger.externalRequests,0);
});

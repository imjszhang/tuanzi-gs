import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAnswer} from '../dist/vendor/gs-engine-ts/src/judgment.js';
import {judgmentRequest} from '../server/judgment.mjs';
import {LabRun} from '../dist/src/lab/manager.js';
import {parseConfig} from '../dist/src/lab/types.js';
import {tiny,proposal} from './fixtures/adaptive-v05.mjs';
const q={type:'choice',instructions:'Fixture choice',criteria:{a:'A',b:'B',none:'None'}};
const answer=probabilities=>({type:'choice',choice:'a',confidence:.7,probabilities});
for(const probabilities of [{a:.88,b:.06,none:.07},{a:.88,b:.05,none:.06}])
 test(`normalization tolerance includes rounded boundary ${Object.values(probabilities).reduce((a,b)=>a+b,0)}`,()=>{
  assert.deepEqual(validateAnswer(q,answer(probabilities)),answer(probabilities));
 });
for(const probabilities of [{a:.88,b:.060001,none:.07},{a:.88,b:.049999,none:.06},{a:.1,b:.1,none:.1}])
 test(`out-of-tolerance distribution remains rejected ${JSON.stringify(probabilities)}`,()=>{
  assert.throws(()=>validateAnswer(q,answer(probabilities)),e=>e.message==='distribution_not_normalized'&&e.validation.sum===Object.values(probabilities).reduce((a,b)=>a+b,0)&&e.validation.tolerance===.01);
 });
test('boundary handling still rejects a choice below the maximum',()=>{
 assert.throws(()=>validateAnswer(q,{...answer({a:.06,b:.88,none:.07})}),/choice_not_distribution_max/);
});
test('failed provider answer survives terminal ledger and events, without retry or action',async()=>{
 let calls=0,original;
 const raw={id:'jev:fixture',kind:'jev',ask:(input,signal)=>judgmentRequest({backend:'jev',...input},{signal,charge:()=>calls++,env:{TYPESAFE_API_KEY:'DO_NOT_EXPORT_THIS_KEY'},fetcher:async()=>{
  original={model:'fixture',usage:{input_tokens:12,output_tokens:3},answers:Object.fromEntries(Object.entries(input.questions).map(([id,question])=>{
   const ids=Object.keys(question.criteria);return [id,{type:'choice',choice:ids[0],confidence:.5,probabilities:Object.fromEntries(ids.map(k=>[k,0]))}];
  }))};return new Response(JSON.stringify({...original,unrelated:'DO_NOT_EXPORT_THIS_FIELD'}));
 }})};
 const actor={id:'agent:evidence-test',kind:'agent',label:'Evidence fixture'};
 const run=new LabRun(parseConfig({kind:'game',controller:'adaptive',strategy:'direct',backend:'jev',generator:'llm',allowLive:true,maxRequests:10,maxDepth:0,jevRetryBaseMs:0,jevRetryMaxMs:0}),actor,{ready:()=>true,backend:()=>raw,adaptSource:{id:'fixture',kind:'mock'},adapt:async()=>({output:proposal()})},tiny());
 await run.command({action:'step',actor,commandId:'one',expectedControlVersion:0});
 assert.equal(calls,1);assert.equal(run.view().physicalActions,0);assert.match(run.reason,/distribution_not_normalized/);
 const exported=run.export(),row=exported.ledger.rows.find(r=>r.source==='jev:fixture');
 assert.equal(row.status,'failed');assert.equal(row.retryable,false);assert.equal(row.failureKind,'answer_validation');
 assert.equal(row.validation.sum,0);assert.equal(row.validation.tolerance,.01);
 assert.deepEqual(row.transport.response,{model:original.model,answers:original.answers});
 assert.equal(row.usage.inputTokens,12);
 const event=exported.events.find(e=>e.data?.event?.type==='lab_request_finished'&&e.data.event.data.source==='jev:fixture');
 assert.deepEqual(event.data.event.data.transport,row.transport);
 assert(!JSON.stringify(exported).includes('DO_NOT_EXPORT_THIS_KEY'));
 assert(!JSON.stringify(exported).includes('DO_NOT_EXPORT_THIS_FIELD'));
});

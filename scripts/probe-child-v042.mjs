#!/usr/bin/env node
/** Frozen first child decision. Default writes NOT_RUN; --live needs explicit budget and local server.
 * Legacy variant is a reconstructed old-shaped packet, not either missing incident export. */
import fs from 'node:fs';import path from 'node:path';
import {createWorld} from '../dist/src/game/world.js';
import {makeSkill} from '../dist/src/skills/spec.js';
import {createFrame,candidates} from '../dist/src/skills/behavior.js';
import {skillTaskContext,localGoalText} from '../dist/src/skills/context.js';
import {projectState} from '../dist/src/skills/experience.js';
import {packet} from '../dist/src/skills/facts.js';
import {actionKey} from '../dist/src/planning/programs.js';
import {describeAction} from '../dist/src/game/domain.js';
import {evaluatePacket,compileDecision} from '../dist/src/decision/pipeline.js';
const opts={};for(const arg of process.argv.slice(2)){if(!arg.startsWith('--'))throw Error('Use --name=value or --live');const [k,...v]=arg.slice(2).split('=');if(!['live','backend','variant','samples','max-requests','url','out'].includes(k))throw Error('Unknown option: '+k);opts[k]=v.length?v.join('='):true;}
const live=opts.live===true,variant=opts.variant??'current',kind=opts.backend??'jev',samples=Number(opts.samples??1),limit=Number(opts['max-requests']??0);
if(!['current','legacy'].includes(variant)||!['jev','llm'].includes(kind)||!Number.isSafeInteger(samples)||samples<1||samples>5)throw Error('Invalid variant, backend, or samples (1..5)');
if(live&&(!Number.isSafeInteger(limit)||limit<samples||limit>12))throw Error('--live requires explicit --max-requests=N (samples <= N <= 12)');
const state=createWorld('guarded'),spec=makeSkill('access-open',['place-resource','wait-access'],'authored'),binding={targetId:state.guards[0].id,targetBerryIds:state.berries.map(b=>b.id),amount:0};
const frame=createFrame(state,binding),offered=candidates(spec,frame,state);
const p=packet({level:'child',goal:variant==='current'?localGoalText(spec):spec.success,
 ...(variant==='current'?{taskContext:skillTaskContext(spec,frame,state)}:{}),snapshotRevision:String(state.revision),policyVersion:1,orderSeed:441,
 scope:{name:'frozen-incident-probe/v042',note:'Same registered capabilities and deterministic binding; no rule score or selected answer.'},
 projection:projectState(state,spec.features,spec.phases[frame.phase].rule),preferences:spec.weights,
 candidates:offered.map(c=>({id:actionKey(c.action),description:describeAction(c.action),action:c.action,facts:c.facts}))});
const out={schema:'gs/frozen-child-probe/v042',status:live?'REQUESTED':'NOT_RUN',variant,backend:kind,scope:'Frozen one-step diagnostic only. No LLM generation, no physical execution, no root success conclusion. Legacy is reconstruction, not raw replay.',packet:p,graph:compileDecision(p,'direct'),externalRequests:0,samples:[]};
if(live){
 const base=new URL(String(opts.url??'http://127.0.0.1:4173'));
 if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw Error('Local HTTP server only');
 const statusResponse=await fetch(new URL('/api/status',base),{signal:AbortSignal.timeout(5000)});if(!statusResponse.ok)throw Error('Cannot connect to local service');
 const status=await statusResponse.json();if(!status.token||!(kind==='jev'?status.jevReady:status.llmReady))throw Error('Requested backend not configured');
 const backend={id:kind+'/configured-frozen-probe',kind,ask:async(input,signal)=>{
  if(out.externalRequests>=limit)throw Error('probe_request_budget');out.externalRequests++;
  const res=await fetch(new URL('/api/judgment',base),{method:'POST',headers:{'x-gs-token':status.token,'content-type':'application/json'},body:JSON.stringify({backend:kind,...input}),signal});
  const value=await res.json();if(!res.ok)throw Error('Provider bridge failed: '+String(value.error??res.status));return value;
 }};
 for(let i=0;i<samples;i++){
  try{const r=await evaluatePacket(p,'direct',backend,{signal:AbortSignal.timeout(30000),currentKey:()=>p.id,timeoutMs:25000,maxRequests:1,maxQuestions:1});
   out.samples.push({index:i+1,status:'returned',judgment:r.judgment,report:r.report});}
  catch(e){out.samples.push({index:i+1,status:'failed',reason:String(e),report:e.report??null});break;}
 }
 out.status=out.samples.every(s=>s.status==='returned')?'COMPLETED':'FAILED';
}
const dest=path.resolve(String(opts.out??`reports/v042/probe-child-${variant}-${live?'live':'NOT_RUN'}.json`));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2));
console.log(JSON.stringify({status:out.status,variant,backend:kind,externalRequests:out.externalRequests,samples:out.samples.length,report:dest},null,2));

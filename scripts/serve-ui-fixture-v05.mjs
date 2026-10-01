/** UI/HTTP fixture only. Explicit synthetic S/G; no network model is reachable here. */
import http from 'node:http';import fs from 'node:fs';
import {ExperimentManager,LabRun} from '../dist/src/lab/manager.js';import {parseConfig} from '../dist/src/lab/types.js';import {createLabHandler} from '../server/lab/http.mjs';
import {tiny,backend,generator,proposal,chooseDeposit} from '../tests/fixtures/adaptive-v05.mjs';
const port=Number(process.env.PORT||4195),token='fixture-token-not-a-secret',sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=backend(chooseDeposit),g=generator(async()=>{await sleep(200);return proposal();});
const providers={ready:()=>true,backend:()=>b,adapt:g.propose.bind(g),adaptSource:{id:'synthetic-G-test-only',kind:'mock'}};
const m=new ExperimentManager(providers),actor={id:'agent:ui-fixture',kind:'agent',label:'离线测试替身 · 非真实模型'};
const r=new LabRun(parseConfig({kind:'game',backend:'jev',generator:'llm',allowLive:true,maxRequests:20,deadlineMs:120000}),actor,providers,tiny());m.runs.set(r.runId,r);
const blockedProviders={ready:()=>true,backend:()=>backend(()=>null),adapt:generator(i=>i.frame.kind==='action'?proposal():{proposals:[{kind:'reframe',question:'核验候选修订',hypothesis:'离线测试，不宣称模型学会',ruleIds:[],includeBroaderObservation:true,candidateIds:null}]}).propose,adaptSource:{id:'synthetic-G-test-only',kind:'mock'}};
const blocked=new LabRun(parseConfig({kind:'game',backend:'jev',generator:'llm',allowLive:true,maxRequests:20,deadlineMs:120000}),actor,blockedProviders,tiny());m.runs.set(blocked.runId,blocked);
const handler=createLabHandler({manager:m,token,baseUrl:`http://127.0.0.1:${port}`,archiveDir:process.env.GS_LAB_OUTPUT_DIR||'/tmp/gs-v05-ui-fixture'});
const server=http.createServer(async(req,res)=>{if(req.url==='/api/status'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({token,jevReady:true,llmReady:true}));return;}if(req.url==='/fixture-ids'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({recovery:r.runId,blocked:blocked.runId,source:'MOCK_ONLY'}));return;}if(!await handler(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({recovery:r.runId,blocked:blocked.runId,source:'MOCK_ONLY'})));
const close=()=>{m.close();server.close();setTimeout(()=>process.exit(0),100).unref();};process.on('SIGTERM',close);process.on('SIGINT',close);

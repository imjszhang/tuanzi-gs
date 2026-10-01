/** Explicit test/demo service, not a product provider. Uses loopback SSE only; never reads .env. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ExperimentManager,LabRun} from '../dist/src/lab/manager.js';
import {parseConfig} from '../dist/src/lab/types.js';import {createLabHandler} from '../server/lab/http.mjs';
import {adaptiveRequest} from '../server/adaptive.mjs';import {tiny,backend,proposal,chooseDeposit} from '../tests/fixtures/adaptive-v05.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const port=Number(process.env.PORT||4197),token='stream-fixture-local-token',sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pending=new Map(),perModel=new Map();let calls=0;
const upstream=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);const mode=body.model;calls++;const nth=(perModel.get(mode)||0)+1;perModel.set(mode,nth);
 res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store'});res.flushHeaders();
 const send=(d,finish=null,extra={})=>res.write('data: '+JSON.stringify({model:mode,choices:[{index:0,delta:d,finish_reason:finish}],...extra})+'\n\n');
 if(nth===1){send({content:JSON.stringify({actionFrame:proposal().proposals[0]})},'stop');res.end('data: [DONE]\n\n');return;}
 let release;const gate=new Promise(r=>release=r);pending.set(mode,release);res.once('close',()=>{release();pending.delete(mode);});
 if(!mode.includes('no-reason'))for(let i=0;i<12&&!res.destroyed;i++){send({reasoning_content:`${i+1}. 离线格式纠错夹具：这段文字由本机测试服务发送，不是模型思考或求解证据。这里只验证坏格式→定点纠错→上层选择，不代表模型解题。\n`});await sleep(60);}
 const p=proposal();if(mode.includes('invalid'))p.proposals[0].program.stages[0].until=[{kind:'value',field:'baitUsed',op:'gte',value:1}];const output=JSON.stringify(p);send({content:output.slice(0,130)});await gate;pending.delete(mode);if(res.destroyed)return;
 if(mode.includes('error')){res.write('event: error\ndata: {"error":"intentional mock error"}\n\n');res.end();return;}
 for(let i=130;i<output.length&&!res.destroyed;i+=70){send({content:output.slice(i,i+70)});await sleep(30);}
 if(!res.destroyed){send({},'stop',{usage:{prompt_tokens:99,completion_tokens:44}});res.end('data: [DONE]\n\n');}
});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const baseUp=`http://127.0.0.1:${upstream.address().port}/chat/completions`,manager=new ExperimentManager(),actor={id:'agent:stream-fixture',kind:'agent',label:'本地流式协议夹具 · 不是模型实测'},ids={};
for(const name of ['visible','invalid']){
 const providers={ready:()=>true,backend:()=>backend(chooseDeposit),adaptSource:{id:`mock-stream-${name}`,kind:'mock'},adapt:(input,signal,onProgress)=>adaptiveRequest(input,{signal,onProgress,env:{LLM_URL:baseUp,LLM_MODEL:`mock-${name}`,LLM_API_KEY:'FIXTURE_KEY_NEVER_REAL'},charge:()=>{}})};
 const run=new LabRun(parseConfig({kind:'game',controller:'adaptive',scenario:'guarded',backend:'jev',generator:'llm',allowLive:true,maxRequests:30,maxFormatRepairs:1,deadlineMs:120000}),actor,providers,tiny());manager.runs.set(run.runId,run);ids[name]=run.runId;
}
const handler=createLabHandler({manager,token,baseUrl:`http://127.0.0.1:${port}`,archiveDir:process.env.GS_LAB_OUTPUT_DIR||'/tmp/gs-format-fixture'});
const server=http.createServer(async(req,res)=>{if(req.url==='/api/status'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({token,jevReady:true,llmReady:true,fixture:true}));return;}
 if(req.url==='/fixture-ids'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({...ids,calls,source:'MOCK_ONLY_LOOPBACK_SSE'}));return;}
 if(req.url?.startsWith('/fixture-release/')){const name=req.url.split('/').at(-1);pending.get('mock-'+name)?.();res.writeHead(200,{'content-type':'application/json'});res.end('{"released":true}');return;}
 if(await handler(req,res,new URL(req.url,'http://localhost')))return;
 const files={'/lab':'lab.html','/lab.js':'lab.js','/lab.css':'lab.css'};const p=files[req.url];if(p){res.writeHead(200,{'content-type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'});res.end(fs.readFileSync(path.join(root,'public',p)));return;}res.writeHead(404);res.end();
});server.listen(port,'127.0.0.1',()=>console.log(`MOCK_ONLY ${JSON.stringify(ids)}\nhttp://127.0.0.1:${port}/lab`));
const close=()=>{for(const r of pending.values())r();manager.close();server.closeAllConnections();upstream.closeAllConnections();server.close();upstream.close();setTimeout(()=>process.exit(0),100).unref();};process.on('SIGTERM',close);process.on('SIGINT',close);

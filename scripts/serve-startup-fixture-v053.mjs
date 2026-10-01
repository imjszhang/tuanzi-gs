/** Explicit loopback streaming fixture; no .env, reference solver or remote provider. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {LabRun,ExperimentManager} from '../dist/src/lab/manager.js';import {parseConfig} from '../dist/src/lab/types.js';import {createWorld} from '../dist/src/game/world.js';
import {createLabHandler} from '../server/lab/http.mjs';import {adaptiveRequest} from '../server/adaptive.mjs';
import {program,proposal,backend} from '../tests/fixtures/adaptive-v05.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=Number(process.env.PORT||4198),token='mock-local-startup-token',manager=new ExperimentManager(),pending=new Map(),ids={};let calls=0,sCalls=0;
const upstream=http.createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;const wire=JSON.parse(body),name=wire.model;calls++;
 res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8'});res.flushHeaders();
 const send=(delta,finish=null)=>res.write('data: '+JSON.stringify({model:name,choices:[{index:0,delta,finish_reason:finish}]})+'\n\n');
 if(name.endsWith('-invalid')){send({content:'{"wrong":true}'},'stop');res.end('data: [DONE]\n\n');return;}
 let release;const gate=new Promise(r=>release=r);pending.set(name,release);res.once('close',()=>{release();pending.delete(name);});
 send({reasoning_content:'本机流式测试夹具，不是真实模型推理。此时仅检查启动顺序：G 先读取允许的初始环境，尚未调用动作层 S，也未推进游戏。\n'});
 const output=JSON.stringify(proposal(program('协议夹具：等待一个回合，验证 G 初始化先于 S 动作',['wait'],{until:[{kind:'delta',field:'delivered',atLeast:1}],maxActions:24})));
 send({content:output.slice(0,120)});await gate;pending.delete(name);if(res.destroyed)return;send({content:output.slice(120)},'stop');res.end('data: [DONE]\n\n');
});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const actor={id:'agent:startup-fixture',kind:'agent',label:'MOCK · 开局 G 传输夹具（非模型实测）'};
for(const name of ['visible','invalid']){const b=backend(f=>{sCalls++;return f.kind==='reframe'?f.options[0]?.id??null:f.options.find(x=>x.id==='wait')?.id??null;});const providers={ready:()=>true,backend:()=>b,adaptSource:{id:'MOCK-startup-G',kind:'mock'},adapt:(input,signal,onProgress)=>adaptiveRequest(input,{signal,onProgress,charge:()=>{},env:{LLM_URL:`http://127.0.0.1:${upstream.address().port}/chat`,LLM_MODEL:'MOCK_STARTUP-'+name,LLM_API_KEY:'MOCK_ONLY_KEY'}})};const r=new LabRun(parseConfig({kind:'game',scenario:'guarded',strategy:'direct',controller:'adaptive',backend:'jev',generator:'llm',allowLive:true,maxRequests:30,maxFormatRepairs:0,deadlineMs:120000}),actor,providers,createWorld('guarded'));manager.runs.set(r.runId,r);ids[name]=r.runId;}
const handler=createLabHandler({manager,token,baseUrl:`http://127.0.0.1:${port}`,archiveDir:process.env.GS_LAB_OUTPUT_DIR||'/tmp/gs-startup-fixture'});
const server=http.createServer(async(req,res)=>{if(req.url==='/api/status'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({token,jevReady:true,llmReady:true,fixture:true}));return;}if(req.url==='/fixture-ids'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({...ids,calls,sCalls,source:'MOCK_LOOPBACK_STARTUP_ONLY'}));return;}if(req.url?.startsWith('/fixture-release/')){pending.get('MOCK_STARTUP-'+req.url.split('/').at(-1))?.();res.writeHead(200,{'content-type':'application/json'});res.end('{"released":true}');return;}if(await handler(req,res,new URL(req.url,'http://localhost')))return;const file={'/lab':'lab.html','/lab.js':'lab.js','/lab.css':'lab.css'}[req.url];if(file){res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(fs.readFileSync(path.join(root,'public',file)));return;}res.writeHead(404);res.end();});
server.listen(port,'127.0.0.1',()=>console.log('MOCK ONLY '+JSON.stringify(ids)));
const close=()=>{for(const r of pending.values())r();manager.close();server.closeAllConnections();upstream.closeAllConnections();server.close();upstream.close();setTimeout(()=>process.exit(0),100).unref();};process.on('SIGTERM',close);process.on('SIGINT',close);

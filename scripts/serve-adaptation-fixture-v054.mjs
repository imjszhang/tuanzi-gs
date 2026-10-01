/** Local streaming+child protocol demo. No .env read, no external model, no solver. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {ExperimentManager,LabRun} from '../dist/src/lab/manager.js';import {parseConfig} from '../dist/src/lab/types.js';
import {createLabHandler} from '../server/lab/http.mjs';import {adaptiveRequest} from '../server/adaptive.mjs';
import {createWorld} from '../dist/src/game/world.js';import {backend,program,proposal} from '../tests/fixtures/adaptive-v05.mjs';
import {subproblem,analysis} from '../tests/fixtures/adaptive-v054.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=Number(process.env.PORT??4198),token='MOCK_ONLY_LOCAL_054';
const manager=new ExperimentManager(),ids={},calls=[],gates=new Map();
const safeWait=()=>proposal(program('协议夹具：等待以检查同层装载与事件',['wait'],{until:[{kind:'delta',field:'turn',atLeast:24}],maxActions:24}));
const upstream=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),u=JSON.parse(body.messages[1].content),i=u.request??u.repair,name=body.model;
 calls.push({model:name,depth:i.depth,cause:i.cause});let out;
 if(name.endsWith('returning'))out=i.frame.kind==='action'?(i.cause==='subproblem_completed'?safeWait():subproblem('MOCK：检查当前输入契约')):(i.cause==='subproblem_unresolved'?analysis():subproblem('MOCK：触发深度边界'));
 else if(name.endsWith('conflict'))out=proposal(program('MOCK 固定候选矛盾，不是实际策略',['move','wait'],{candidateIds:['move:7,7','wait'],target:{x:2,y:8},until:[{kind:'at',x:2,y:8}]}));
 else out=safeWait();
 const content=JSON.stringify(out);res.writeHead(200,{'content-type':'text/event-stream'});
 const send=(delta,finish=null)=>res.write('data: '+JSON.stringify({model:name,choices:[{index:0,delta,finish_reason:finish}]})+'\n\n');
 send({content:content.slice(0,90)});
 if(name.endsWith('visible')&&i.cause==='initial_environment_review'){let release;const gate=new Promise(r=>release=r);gates.set('visible',release);res.once('close',release);await gate;gates.delete('visible');}
 if(res.destroyed)return;send({content:content.slice(90)},'stop');res.end('data: [DONE]\n\n');
});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const actor={id:'agent:adaptation-fixture',kind:'agent',label:'MOCK · 同层调整与子问题协议夹具'};
for(const name of ['visible','returning','conflict']){
 const providers={ready:()=>true,backend:()=>backend(f=>f.kind==='analysis'?f.options[0]?.id??null:f.options.find(o=>o.id==='wait')?.id??null),adaptSource:{id:'MOCK_G_054',kind:'mock'},
 adapt:(input,signal,onProgress)=>adaptiveRequest(input,{signal,onProgress,charge:()=>{},env:{LLM_URL:`http://127.0.0.1:${upstream.address().port}/chat`,LLM_MODEL:'MOCK_054_'+name,LLM_API_KEY:'MOCK_ONLY_054'}})};
 const r=new LabRun(parseConfig({kind:'game',scenario:'guarded',controller:'adaptive',strategy:'direct',backend:'jev',generator:'llm',allowLive:true,maxRequests:30,maxGCalls:8,maxDepth:name==='returning'?1:2,maxRevisions:3,deadlineMs:120000}),actor,providers,createWorld('guarded'));manager.runs.set(r.runId,r);ids[name]=r.runId;
}
const handler=createLabHandler({manager,token,baseUrl:`http://127.0.0.1:${port}`,archiveDir:process.env.GS_LAB_OUTPUT_DIR??'/tmp/gs-v054-demo'});
const server=http.createServer(async(req,res)=>{if(req.url==='/api/status'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({token,jevReady:true,llmReady:true,fixture:true}));return;}
 if(req.url==='/fixture-ids'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({...ids,calls,source:'MOCK_ONLY_NO_TASK_SOLVER'}));return;}
 if(req.url==='/fixture-release/visible'){gates.get('visible')?.();res.writeHead(200,{'content-type':'application/json'});res.end('{"released":true}');return;}
 if(await handler(req,res,new URL(req.url,'http://localhost')))return;
 const file={'/lab':'lab.html','/lab.js':'lab.js','/lab.css':'lab.css'}[req.url?.split('?')[0]];if(file){res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(fs.readFileSync(path.join(root,'public',file)));return;}
 res.writeHead(404);res.end();});
server.listen(port,'127.0.0.1',()=>console.log('MOCK ONLY '+JSON.stringify(ids)));
const close=()=>{for(const release of gates.values())release();manager.close();server.closeAllConnections();upstream.closeAllConnections();server.close();upstream.close();setTimeout(()=>process.exit(0),100).unref();};process.on('SIGTERM',close);process.on('SIGINT',close);

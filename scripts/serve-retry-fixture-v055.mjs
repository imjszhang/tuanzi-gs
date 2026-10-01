/** Explicit local HTTP 503 -> Jev-shaped response fixture. Never reads .env or solves the orchard. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {ExperimentManager,LabRun} from '../dist/src/lab/manager.js';import {parseConfig} from '../dist/src/lab/types.js';import {createWorld} from '../dist/src/game/world.js';import {createLabHandler} from '../server/lab/http.mjs';import {judgmentRequest} from '../server/judgment.mjs';
import {proposal,program} from '../tests/fixtures/adaptive-v05.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=Number(process.env.PORT??4199),token='MOCK_RETRY_055_TOKEN',calls=[],gates=new Map();let charged=0;
const upstream=http.createServer(async(req,res)=>{let text='';for await(const b of req)text+=b;const input=JSON.parse(text);calls.push(input);if(calls.length===1){res.writeHead(503,{'retry-after':'4'});res.end('MOCK temporary failure');return;}
 if(calls.length===2){let release;const p=new Promise(r=>release=r);gates.set('response',release);res.on('close',release);await p;gates.delete('response');if(res.destroyed)return;}
 const answers={};for(const [id,q] of Object.entries(input.questions)){let choice=Object.keys(q.criteria??{}).find(k=>q.criteria[k]?.value?.action?.kind==='wait')??'none';answers[id]=q.type==='choice'?{type:'choice',choice,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}:q.type==='noul'?{type:'noul',noul:1}:{type:'score',score:1};}
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({model:'MOCK_JEV_055',answers,usage:{input_tokens:10,output_tokens:4}}));
});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const providers={ready:()=>true,backend:()=>({id:'jev:MOCK_HTTP_055',kind:'jev',ask:(input,signal)=>judgmentRequest({backend:'jev',...input},{signal,charge:()=>charged++,env:{TYPESAFE_API_KEY:'MOCK_ONLY_NO_REAL_KEY',JEV_MODEL:'MOCK_JEV_055'},fetcher:(_url,opts)=>fetch(`http://127.0.0.1:${upstream.address().port}`,opts)})}),adaptSource:{id:'MOCK_G_WAIT',kind:'mock'},adapt:async()=>({output:proposal(program('MOCK：等待一步以检查网络恢复；不是解题方案',['wait'],{until:[{kind:'delta',field:'turn',atLeast:24}],maxActions:24}))})};
const manager=new ExperimentManager(providers),actor={id:'agent:mcp',kind:'agent',label:'MOCK · HTTP重试与MCP观察'},run=new LabRun(parseConfig({kind:'game',controller:'adaptive',backend:'jev',generator:'llm',allowLive:true,maxRequests:12,jevMaxRetries:2,jevAttemptTimeoutMs:15000,deadlineMs:90000,strategy:'direct'}),actor,providers,createWorld('guarded'));manager.runs.set(run.runId,run);
const handler=createLabHandler({manager,token,baseUrl:`http://127.0.0.1:${port}`,archiveDir:process.env.GS_LAB_OUTPUT_DIR??'/tmp/gs-retry-055'});
const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/status'){res.end(JSON.stringify({token,jevReady:true,llmReady:true,fixture:true,version:'0.5.5'}));return;}
 if(req.url==='/fixture-ids'){res.end(JSON.stringify({visible:run.runId,calls:calls.length,charged,source:'MOCK_HTTP_503_ONLY'}));return;}
 if(req.url==='/fixture-release'){gates.get('response')?.();res.end('{"released":true}');return;}
 if(await handler(req,res,new URL(req.url,'http://localhost')))return;
 const f={'/lab':'lab.html','/lab.css':'lab.css','/lab.js':'lab.js'}[req.url.split('?')[0]];if(f){res.writeHead(200,{'content-type':f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html'});res.end(fs.readFileSync(path.join(root,'public',f)));return;}res.writeHead(404);res.end();
});server.listen(port,'127.0.0.1',()=>console.log(`MOCK 055 local only: ${JSON.stringify({runId:run.runId,port})}`));
function close(){gates.get('response')?.();manager.close();server.closeAllConnections();upstream.closeAllConnections();server.close();upstream.close();setTimeout(()=>process.exit(0),30);}
process.on('SIGTERM',close);process.on('SIGINT',close);

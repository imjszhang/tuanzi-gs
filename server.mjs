/** Local-only transport. v0.5 model game runs have exactly one autonomous entry. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ExperimentManager} from './dist/src/lab/manager.js';
import {createLabHandler} from './server/lab/http.mjs';
import {judgmentRequest} from './server/judgment.mjs';
import {adaptiveRequest} from './server/adaptive.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
const port=Number(process.env.PORT||4173),maxCalls=Number(process.env.MAX_SERVER_CALLS||200);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('PORT must be 1024..65535');
if(!Number.isSafeInteger(maxCalls)||maxCalls<1||maxCalls>10000)throw Error('MAX_SERVER_CALLS must be 1..10000');
const token=crypto.randomBytes(32).toString('hex'),jevModel=process.env.JEV_MODEL||'jev-1.13.0';
const jevReady=Boolean(process.env.TYPESAFE_API_KEY),llmReady=Boolean(process.env.LLM_URL&&process.env.LLM_API_KEY&&process.env.LLM_MODEL);
let providerCalls=0;let queue=Promise.resolve();
const error=(m,status=400)=>Object.assign(Error(m),{status});
const charge=()=>{if(providerCalls>=maxCalls)throw error('Server model-call budget exhausted',429);providerCalls++;};
const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
async function requestBody(req){let length=0;const chunks=[];for await(const c of req){length+=c.length;if(length>256*1024)throw error('Request too large',413);chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw error('Invalid JSON');}}
async function broker(kind,input,signal,onProgress){let release;const previous=queue;queue=new Promise(r=>{release=r;});try{await previous;signal.throwIfAborted();return await (kind==='adapt'?adaptiveRequest:judgmentRequest)(input,{signal,charge,onProgress});}finally{release();}}
const manager=new ExperimentManager({ready:b=>b==='jev'?jevReady:llmReady,backend:b=>({id:b==='jev'?`jev:${jevModel}`:`llm:${process.env.LLM_MODEL||'unconfigured'}`,kind:b,ask:(input,signal)=>broker('judgment',{backend:b,...input},signal)}),adapt:(input,signal,onProgress)=>broker('adapt',input,signal,onProgress)});
const handler=createLabHandler({manager,token,baseUrl:`http://127.0.0.1:${port}`,archiveDir:path.resolve(root,process.env.GS_LAB_OUTPUT_DIR||'.gs-lab/exports')});
const hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
const removed=new Set(['/api/select','/api/plan','/api/program','/api/reactive-select','/api/reactive-plan']);
export const server=http.createServer(async(req,res)=>{try{
 if(!hosts.has(req.headers.host))throw error('Host not allowed',403);const url=new URL(req.url,'http://127.0.0.1');
 if(await handler(req,res,url))return;
 if(url.pathname==='/api/status'&&req.method==='GET'){
  if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw error('Origin not allowed',403);
  return send(res,200,{available:true,version:'0.5.6',jevReady,llmReady,token,jevModel,providerCalls,maxCalls,modelGameController:'adaptive',legacyLive:false,generationStreaming:process.env.LLM_STREAM!=='false'});
 }
 if(removed.has(url.pathname))throw error('LEGACY_ASSISTANCE_FORBIDDEN: use controller=adaptive at /lab; historical controllers are offline references.',410);
 if(url.pathname==='/api/judgment'){
  if(req.method!=='POST')throw error('POST required',405);
  if(req.headers.origin!==`http://${req.headers.host}`||req.headers['x-gs-token']!==token)throw error('Local same-origin authorization required',403);
  if(!String(req.headers['content-type']).startsWith('application/json'))throw error('JSON required',415);
  const input=await requestBody(req);const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(Error('provider_timeout')),25000);const disconnected=()=>{if(!res.writableEnded)abort.abort();};res.once('close',disconnected);
  try{return send(res,200,await broker('judgment',input,abort.signal));}finally{clearTimeout(timeout);res.off('close',disconnected);}
 }
 if(req.method!=='GET'&&req.method!=='HEAD')throw error('Method not allowed',405);
 const files={'/':'index.html','/index.html':'index.html','/app.css':'app.css','/app.js':'app.js','/lab':'lab.html','/lab.html':'lab.html','/lab.js':'lab.js','/lab.css':'lab.css'};
 const filename=files[url.pathname];if(!filename)throw error('Not found',404);
 const mime=filename.endsWith('.css')?'text/css':filename.endsWith('.js')?'application/javascript':'text/html';res.writeHead(200,{'content-type':`${mime}; charset=utf-8`,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});
 if(req.method==='HEAD')return res.end();fs.createReadStream(path.join(root,'public',filename)).pipe(res);
 }catch(e){if(!res.headersSent)send(res,e.status??500,{error:String(e.message??e).slice(0,600),...(e.usage?{usage:e.usage}:{})});else res.end();}});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is busy. Set PORT to another local port.`:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`\n G/S Lab v0.5.6\n http://127.0.0.1:${port}/lab\n CLI: node bin/gs-lab.mjs capabilities\n Models: Jev ${jevReady?'ready':'not configured'}, G ${llmReady?'ready':'not configured'}.\n Autonomous runs do not read reference solutions. MAX_SERVER_CALLS=${maxCalls}.\n`));
function shutdown(){manager.close();server.close();setTimeout(()=>process.exit(0),1500).unref();}process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);

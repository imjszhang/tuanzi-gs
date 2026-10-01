/** HTTP/SSE façade. The manager owns runs; disconnecting a viewer never cancels a run. */
import fs from 'node:fs';
import path from 'node:path';
import {LabError} from '../../dist/src/lab/types.js';
const error=(code,message,status=400)=>{throw new LabError(code,message,status);};
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
async function read(req){if(!String(req.headers['content-type']??'').startsWith('application/json'))error('JSON_REQUIRED','Use application/json',415);let bytes=0;const chunks=[];for await(const p of req){bytes+=p.length;if(bytes>65536)error('REQUEST_TOO_LARGE','Maximum 64 KiB',413);chunks.push(p);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{error('INVALID_JSON','Invalid JSON');}}
function number(raw,fallback,max){if(raw===null||raw===undefined||raw==='')return fallback;if(!/^\d+$/.test(String(raw)))error('INVALID_CURSOR','Expected nonnegative integer');const v=Number(raw);if(!Number.isSafeInteger(v)||v>max)error('INVALID_CURSOR','Cursor out of range');return v;}
export function createLabHandler({manager,token,baseUrl,archiveDir=null}){
 const subscribed=new Set(),archiveStatus=new Map();let streams=0;
 function track(run){if(subscribed.has(run.runId))return;subscribed.add(run.runId);run.subscribe(e=>{if(e.type!=='state'||!run.terminal||!archiveDir)return;try{fs.mkdirSync(archiveDir,{recursive:true,mode:0o700});const file=path.join(archiveDir,`${run.runId}.json`),temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(run.export()),{mode:0o600});fs.renameSync(temp,file);archiveStatus.set(run.runId,{saved:true,file:`${run.runId}.json`});}catch(e){archiveStatus.set(run.runId,{saved:false,error:String(e.message).slice(0,200)});}});}
 const decorate=s=>({...s,viewerUrl:new URL(s.viewerPath,baseUrl).toString(),archive:archiveStatus.get(s.runId)??null});
 return async function handle(req,res,url){if(!url.pathname.startsWith('/api/lab'))return false;
  try{
   if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)error('ORIGIN_FORBIDDEN','Same-origin or local non-browser client required',403);
   if(req.headers['sec-fetch-site']==='cross-site')error('ORIGIN_FORBIDDEN','Cross-site request denied',403);
   if(req.headers['x-gs-token']!==token)error('UNAUTHORIZED','Read the local /api/status token; send X-GS-Token',401);
   const parts=url.pathname.split('/').filter(Boolean);if(parts[0]!=='api'||parts[1]!=='lab')error('NOT_FOUND','Not found',404);
   if(parts.length===3&&parts[2]==='capabilities'&&req.method==='GET'){json(res,200,{...manager.capabilities(),baseUrl,archiveDirectory:archiveDir?'local output directory (completed reports only)':null});return true;}
   if(parts.length===3&&parts[2]==='runs'){
    if(req.method==='GET'){json(res,200,{runs:[...manager.runs.values()].map(r=>{const v=r.view();return {runId:v.runId,status:v.status,owner:v.owner,config:v.config,createdAt:v.createdAt,lastSeq:v.lastSeq,viewerUrl:new URL(v.viewerPath,baseUrl).toString()};}),complete:true});return true;}
    if(req.method==='POST'){const v=await manager.create(await read(req));track(manager.get(v.runId));json(res,201,decorate(v));return true;}
   }
   if(parts[2]!=='runs'||parts.length<4)error('NOT_FOUND','Unknown endpoint',404);const run=manager.get(parts[3]);track(run);
   if(parts.length===4&&req.method==='GET'){json(res,200,decorate(run.view()));return true;}
   if(parts.length!==5)error('NOT_FOUND','Unknown endpoint',404);
   const op=parts[4];
   if(op==='commands'&&req.method==='POST'){const answer=await run.command(await read(req));json(res,200,{...answer,state:decorate(answer.state)});return true;}
   if(op==='forks'&&req.method==='POST'){const v=await manager.fork(run.runId,await read(req));track(manager.get(v.runId));json(res,201,decorate(v));return true;}
   if(op==='checkpoints'&&req.method==='GET'){json(res,200,{checkpoints:[...run.checkpoints.values()].map(({memory,world,...c})=>({...c,worldRevision:String(world.revision),turn:world.turn}))});return true;}
   if(op==='result'&&req.method==='GET'){json(res,200,{complete:run.terminal,state:decorate(run.view()),ledger:run.export().ledger,trace:run.terminal?run.export().trace:null});return true;}
   if(op==='export'&&req.method==='GET'){res.setHeader('content-disposition',`attachment; filename="${run.runId}.json"`);json(res,200,run.export());return true;}
   if((op==='events'||op==='stream')&&req.method==='GET'){
    const after=number(req.headers['last-event-id']??url.searchParams.get('after'),0,10000000);if(after>run.view().lastSeq)error('CURSOR_AHEAD','Re-read state; cursor is ahead of this run',409);
    if(op==='events'){const limit=number(url.searchParams.get('limit'),100,1000);if(!limit)error('INVALID_LIMIT','limit must be positive');const events=run.events.filter(e=>e.seq>after).slice(0,limit),next=events.at(-1)?.seq??after;json(res,200,{runId:run.runId,events,nextCursor:next,hasMore:next<run.view().lastSeq,terminal:run.terminal});return true;}
    if(streams>=16)error('STREAM_LIMIT','Maximum 16 concurrent streams',429);streams++;
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no','x-content-type-options':'nosniff'});res.flushHeaders();res.write('retry: 1000\n\n');
    let closed=false,last=after,unsubscribe=()=>{};const close=()=>{if(closed)return;closed=true;clearInterval(heartbeat);unsubscribe();streams--;};
    const write=e=>{if(closed||e.seq<=last)return;last=e.seq;if(res.writableLength>2*1024*1024){res.end();close();return;}res.write(`id: ${e.seq}\nevent: lab\ndata: ${JSON.stringify(e)}\n\n`);};
    const heartbeat=setInterval(()=>{if(!closed)res.write(': heartbeat\n\n');},12000);heartbeat.unref?.();res.once('close',close);
    // Single event-loop turn makes replay + registration gap-free.
    unsubscribe=run.subscribe(write);for(const e of run.events)write(e);return true;
   }
   error('METHOD_OR_ENDPOINT','Unsupported method or endpoint',404);
  }catch(e){if(res.headersSent){res.end();return true;}json(res,e.status??500,{error:{code:e.code??'INTERNAL_ERROR',message:String(e.message??e).slice(0,600)}});return true;}
 };
}

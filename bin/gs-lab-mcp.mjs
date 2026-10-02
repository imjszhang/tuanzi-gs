#!/usr/bin/env node
/** MCP stdio adapter. stdout is protocol-only; no .env loading, no model calls here. */
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {McpService} from '../server/mcp/service.mjs';
import {redact} from '../server/mcp/access.mjs';
const argv=process.argv.slice(2),flags={};const switches=new Set(['allow-control','allow-live','allow-takeover','help']);
try{
 for(let i=0;i<argv.length;i++){const a=argv[i];if(!a.startsWith('--'))throw Error('Use --name value arguments');const k=a.slice(2);if(Object.hasOwn(flags,k))throw Error('Duplicate argument');if(!['root','url','profile','actor','exports',...switches].includes(k))throw Error('Unknown argument '+k);flags[k]=switches.has(k)?true:argv[++i];if(flags[k]===undefined)throw Error('Missing argument '+k);}
 if(flags.help){process.stderr.write('G/S Lab MCP v0.5.6 (stdio)\nnode bin/gs-lab-mcp.mjs [--url http://127.0.0.1:4173] [--profile operator|audit] [--allow-control] [--allow-live] [--allow-takeover] [--actor agent:mcp] [--exports DIRECTORY]\n');process.exit(0);}
 const root=flags.root??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const service=new McpService({root,baseUrl:flags.url??'http://127.0.0.1:4173',profile:flags.profile??'operator',actor:flags.actor??'agent:mcp',allowControl:!!flags['allow-control'],allowLive:!!flags['allow-live'],allowTakeover:!!flags['allow-takeover'],exportDir:flags.exports});
 const versions=['2025-11-25','2025-06-18','2025-03-26','2024-11-05'];let initialized=false,ready=false,closing=false;const pending=new Map();let buffer=Buffer.alloc(0);
 function write(v){if(!closing){const line=JSON.stringify(redact(v))+'\n';if(process.stdout.writableLength>8*1024*1024){process.stderr.write('MCP output backpressure limit\n');shutdown();return;}process.stdout.write(line);}}
 function error(id,code,message,data){write({jsonrpc:'2.0',id,error:{code,message,...(data?{data}:{})}});}
 async function dispatch(method,p,signal){
  if(method==='initialize'){if(initialized)throw Object.assign(Error('Already initialized'),{rpc:-32600});if(typeof p.protocolVersion!=='string'||!p.clientInfo||!p.capabilities)throw Object.assign(Error('Invalid initialize parameters'),{rpc:-32602});initialized=true;return {protocolVersion:versions.includes(p.protocolVersion)?p.protocolVersion:versions[0],serverInfo:{name:'tuanzi-gs-lab',version:'0.5.6'},capabilities:{tools:{},resources:{},prompts:{}},instructions:service.instructions()};}
  if(method==='ping')return {};
  if(!initialized||!ready)throw Object.assign(Error('Initialize and notify initialized first'),{rpc:-32002});
  const paged=(items,key)=>{if(Object.keys(p).some(k=>k!=='cursor'))throw Object.assign(Error('Unknown list argument'),{rpc:-32602});const cursor=p.cursor??'0';if(typeof cursor!=='string'||!/^\d+$/.test(cursor))throw Object.assign(Error('Invalid cursor'),{rpc:-32602});const at=Number(cursor);if(!Number.isSafeInteger(at)||at>items.length)throw Object.assign(Error('Invalid cursor'),{rpc:-32602});return {[key]:items.slice(at,at+100),...(at+100<items.length?{nextCursor:String(at+100)}:{})};};
  if(method==='tools/list')return paged(service.tools,'tools');
  if(method==='tools/call'){if(typeof p.name!=='string')throw Object.assign(Error('Missing tool name'),{rpc:-32602});try{const result=redact(await service.call(p.name,p.arguments??{},signal));return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false};}catch(e){return {content:[{type:'text',text:JSON.stringify({error:{code:e.code??'MCP_TOOL_ERROR',message:String(e.message??e).slice(0,600)}})}],isError:true};}}
  if(method==='resources/list')return paged(await service.resources(),'resources');
  if(method==='resources/templates/list')return paged(service.templates(),'resourceTemplates');
  if(method==='resources/read'){if(typeof p.uri!=='string')throw Object.assign(Error('Missing URI'),{rpc:-32602});return service.readResource(p.uri,signal);}
  if(method==='prompts/list')return paged([{name:'experiment-briefing',description:'Read project and API boundaries before operating experiments'},{name:'inspect-run',description:'Read and diagnose a run without altering it',arguments:[{name:'runId',description:'Authoritative run id',required:true}]}],'prompts');
  if(method==='prompts/get'){if(!['experiment-briefing','inspect-run'].includes(p.name))throw Object.assign(Error('Unknown prompt'),{rpc:-32602});if(p.name==='inspect-run'&&typeof p.arguments?.runId!=='string')throw Object.assign(Error('runId required'),{rpc:-32602});return {description:'Evidence-based experiment operator workflow',messages:[{role:'user',content:{type:'text',text:p.name==='experiment-briefing'?'Read project_info, project MCP guide and lab_capabilities. Explain available experiment controls and budgets without starting any run. Never use reference answers as runtime guidance.':`Inspect run ${p.arguments.runId}. Use lab_snapshot, lab_events and lab_read /ledger and /trace. Separate transport failures from S abstention and G errors. Preserve evidence; do not modify or restart the run, force actions or feed reference solutions.`}}]};}
  throw Object.assign(Error('Method not found'),{rpc:-32601});
 }
 function accept(message){
  if(!message||typeof message!=='object'||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'){error(message?.id??null,-32600,'Invalid request');return;}
  const hasId=Object.hasOwn(message,'id'),requestId=message.id,p=message.params??{};
  if(!hasId){if(message.method==='notifications/initialized'&&initialized)ready=true;else if(message.method==='notifications/cancelled')pending.get(p.requestId)?.abort(Error('MCP request cancelled'));return;}
  if(!(typeof requestId==='string'||(typeof requestId==='number'&&Number.isSafeInteger(requestId)))||!p||typeof p!=='object'||Array.isArray(p)){error(requestId??null,-32600,'Invalid request ID or params');return;}
  if(pending.has(requestId)){error(requestId,-32600,'Duplicate pending request id');return;}if(pending.size>=16){error(requestId,-32000,'Too many concurrent requests');return;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(Error('MCP request deadline')),125000);pending.set(requestId,controller);
  Promise.resolve().then(()=>dispatch(message.method,p,controller.signal)).then(result=>{if(!controller.signal.aborted)write({jsonrpc:'2.0',id:requestId,result});else if(controller.signal.reason?.message==='MCP request deadline')error(requestId,-32001,'MCP request deadline. A submitted lab command may still be running; inspect state and replay the SAME commandId if necessary.');}).catch(e=>{if(!controller.signal.aborted)error(requestId,e.rpc??-32002,String(e.message??e).slice(0,600),e.code?{code:e.code}:undefined);}).finally(()=>{clearTimeout(timer);pending.delete(requestId);});
 }
 function shutdown(){if(closing)return;closing=true;for(const c of pending.values())c.abort(Error('MCP closed'));process.stdin.pause();process.exitCode=0;setTimeout(()=>process.exit(0),20);}
 process.stdin.on('data',data=>{buffer=Buffer.concat([buffer,data]);for(;;){const end=buffer.indexOf(10);if(end<0)break;if(end>1024*1024){error(null,-32700,'Message too large');shutdown();return;}let line;try{line=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,end));}catch{error(null,-32700,'Invalid UTF-8');buffer=buffer.subarray(end+1);continue;}buffer=buffer.subarray(end+1);if(!line.trim())continue;try{accept(JSON.parse(line));}catch{error(null,-32700,'Parse error');}}if(buffer.length>1024*1024){error(null,-32700,'Message too large');shutdown();}});
 process.stdin.on('end',shutdown);process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);process.stdout.on('error',shutdown);
}catch(e){process.stderr.write(`MCP startup error: ${String(e.message??e)}\n`);process.exitCode=2;}

#!/usr/bin/env node
/** Thin CLI client: never runs its own copy of the game. JSON stdout, errors on stderr. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const argv=process.argv.slice(2),words=[],flags={};let parseError=null;const booleans=new Set(['json','human','mask-resources','allow-live','wait','follow']);
for(let i=0;i<argv.length;i++){const a=argv[i];if(!a.startsWith('--')){words.push(a);continue;}const [key,inline]=a.slice(2).split(/=(.*)/s);if(Object.hasOwn(flags,key))parseError='duplicate flag '+key;flags[key]=inline??(booleans.has(key)?(argv[i+1]==='true'||argv[i+1]==='false'?argv[++i]:true):(argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true));}
const command=words[0]??'help',runId=words[1];
const allowed=new Set(['url','json','actor','label','human','request-id','command-id','if-version','if-world','kind','task','scenario','controller','strategy','backend','generator','experience','seed','mask-resources','delay-ms','allow-live','max-requests','max-questions','max-actions','max-steps','max-search-nodes','deadline-ms','max-g-calls','g-timeout-ms','max-depth','max-revisions','max-format-repairs','jev-max-retries','jev-retry-base-ms','jev-retry-max-ms','jev-attempt-timeout-ms','config','wait','timeout','after','limit','follow','out','checkpoint','memory','tool','x','y','after-action']);
const die=(code,message,status)=>{throw Object.assign(Error(message),{code,status});};
const output=value=>console.log(JSON.stringify(value,null,flags.json===false?0:2));
const bool=k=>flags[k]===true||flags[k]==='true';
const number=(k,fallback)=>{if(flags[k]===undefined)return fallback;if(!/^\d+$/.test(String(flags[k])))die('INVALID_FLAG',`--${k} requires a nonnegative integer`);return Number(flags[k]);};
let base;
let token=process.env.GS_LAB_TOKEN;
async function request(endpoint,{method='GET',body,stream=false}={}){
 const headers={'x-gs-token':token};if(body!==undefined)headers['content-type']='application/json';
 const res=await fetch(new URL(endpoint,base),{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(number('timeout',120000))});
 if(stream&&res.ok)return res;const data=await res.json();if(!res.ok)die(data.error?.code??'HTTP_ERROR',data.error?.message??String(data.error),res.status);return data;
}
async function init(){if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password)die('LOCAL_ONLY','Use http://127.0.0.1:PORT; SSH-forward for another machine');
 if(!token){const r=await fetch(new URL('/api/status',base),{signal:AbortSignal.timeout(5000)});if(!r.ok)die('BOOTSTRAP_FAILED',`HTTP ${r.status}`);token=(await r.json()).token;}if(!token)die('NO_TOKEN','No local control token');}
function config(){let c=flags.config?JSON.parse(fs.readFileSync(String(flags.config),'utf8')):{};if(!c||typeof c!=='object'||Array.isArray(c))die('INVALID_CONFIG','Config must be an object');
 const names={kind:'kind',task:'task',scenario:'scenario',controller:'controller',strategy:'strategy',backend:'backend',generator:'generator',experience:'experience',seed:'orderSeed','delay-ms':'delayMs','max-requests':'maxRequests','max-questions':'maxQuestions','max-actions':'maxActions','max-steps':'maxSteps','max-search-nodes':'maxSearchNodes','deadline-ms':'deadlineMs','max-g-calls':'maxGCalls','g-timeout-ms':'gTimeoutMs','max-depth':'maxDepth','max-revisions':'maxRevisions','max-format-repairs':'maxFormatRepairs','jev-max-retries':'jevMaxRetries','jev-retry-base-ms':'jevRetryBaseMs','jev-retry-max-ms':'jevRetryMaxMs','jev-attempt-timeout-ms':'jevAttemptTimeoutMs'};
 for(const [flag,field]of Object.entries(names))if(flags[flag]!==undefined)c[field]=['seed','delay-ms','max-requests','max-questions','max-actions','max-steps','max-search-nodes','deadline-ms','max-g-calls','g-timeout-ms','max-depth','max-revisions','max-format-repairs','jev-max-retries','jev-retry-base-ms','jev-retry-max-ms','jev-attempt-timeout-ms'].includes(flag)?number(flag):String(flags[flag]);
 if(flags['allow-live']!==undefined)c.allowLive=bool('allow-live');if(flags['mask-resources']!==undefined)c.maskResources=bool('mask-resources');return c;}
const actor=()=>({id:String(flags.actor??process.env.GS_LAB_ACTOR??'agent:cli'),kind:bool('human')?'human':'agent',label:String(flags.label??process.env.GS_LAB_ACTOR??'CLI experiment operator')});
const root=id=>`/api/lab/runs/${encodeURIComponent(id)}`;
async function wait(id){const started=Date.now(),timeout=number('timeout',120000);for(;;){const s=await request(root(id));if(['succeeded','failed','blocked','cancelled','stopped','fault'].includes(s.status))return request(root(id)+'/result');if(Date.now()-started>timeout)die('WAIT_TIMEOUT','Run continues on the server; read status or cancel explicitly');await new Promise(r=>setTimeout(r,100));}}
async function events(id){const after=number('after',0);if(!bool('follow'))return output(await request(`${root(id)}/events?after=${after}&limit=${number('limit',100)}`));
 const res=await request(`${root(id)}/stream?after=${after}`,{stream:true}),reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';
 const quit=()=>{void reader.cancel();};process.once('SIGINT',quit);
 try{for(;;){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let i;while((i=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,i);buffer=buffer.slice(i+2);const data=block.split('\n').filter(x=>x.startsWith('data: ')).map(x=>x.slice(6)).join('\n');if(!data)continue;const e=JSON.parse(data);console.log(JSON.stringify(e));if(e.type==='state'&&['succeeded','failed','blocked','cancelled','stopped','fault'].includes(e.data.status)){await reader.cancel();return;}}}}
 finally{process.off('SIGINT',quit);}}
function help(){console.log(`G/S Lab v0.5.6 — shared experiment client (Node >=22)

Start service: npm start                 Viewer: http://127.0.0.1:4173/lab
Commands:
  capabilities | list
  create [--kind judgment|game] [--task energy] [--scenario guarded]
         [--strategy direct|batch|serial|dependent] [--backend rule|jev|llm]
         [--controller adaptive|hierarchy|program|rules] [--config config.json]
         [--max-g-calls 12] [--g-timeout-ms 600000] [--max-depth 2] [--max-revisions 3] [--max-format-repairs 2] [--jev-max-retries 2] [--jev-attempt-timeout-ms 8000]
  status RUN | result RUN | wait RUN
  start RUN [--wait] | step RUN | pause RUN | cancel RUN | takeover RUN
  checkpoint RUN [--label name]
  fork RUN [--checkpoint initial|CP] [--memory none|inherit] [config overrides]
  schedule RUN --after-action 3 --tool wall --x 3 --y 8
  edit RUN --tool wall --x 3 --y 8   (quiescent only, explicit intervention)
  events RUN [--after SEQ] [--limit 100] [--follow]
  export RUN --out reports/run.json

Default output is JSON. Errors: JSON stderr, exit 2. Experiment failure is data, not a CLI error.
--url http://127.0.0.1:4173 | GS_LAB_URL; --actor ID | GS_LAB_ACTOR
--command-id ID + --if-version V retries the EXACT command without double execution.
Control version conflict never auto-retries. Takeover pauses at a decision boundary.
Live calls require --allow-live --max-requests N and server-side credentials.
Pause does not undo an in-flight action; deadline includes operator pauses after first step.
Game default is adaptive. hierarchy/program/rules are offline references only.
This CLI never chooses the in-game action and never bypasses the root verifier.`);}
try{
 if(parseError)die('INVALID_FLAGS',parseError);
 try{base=new URL(String(flags.url??process.env.GS_LAB_URL??'http://127.0.0.1:4173'));}catch{die('INVALID_URL','--url must be an absolute local HTTP URL');}
 for(const k of Object.keys(flags))if(!allowed.has(k))die('UNKNOWN_FLAG',`Unknown --${k}`);
 if(command==='help'){help();}else{
 await init();
 if(command==='capabilities')output(await request('/api/lab/capabilities'));
 else if(command==='list')output(await request('/api/lab/runs'));
 else if(command==='create')output(await request('/api/lab/runs',{method:'POST',body:{requestId:flags['request-id']??crypto.randomUUID(),actor:actor(),config:config()}}));
 else {
 if(!runId)die('RUN_ID_REQUIRED','Supply runId');
 if(command==='status')output(await request(root(runId)));
 else if(command==='result')output(await request(root(runId)+'/result'));
 else if(command==='wait')output(await wait(runId));
 else if(command==='events')await events(runId);
 else if(command==='export'){const data=await request(root(runId)+'/export');if(flags.out){const file=path.resolve(String(flags.out));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2));output({savedTo:file,runId,state:data.state.status});}else output(data);}
 else if(command==='fork')output(await request(root(runId)+'/forks',{method:'POST',body:{requestId:flags['request-id']??crypto.randomUUID(),actor:actor(),checkpointId:flags.checkpoint??'initial',memory:flags.memory??'none',config:config()}}));
 else if(['start','step','pause','cancel','takeover','checkpoint','schedule','edit'].includes(command)){
 const state=await request(root(runId)),body={commandId:flags['command-id']??crypto.randomUUID(),expectedControlVersion:number('if-version',state.controlVersion),actor:actor(),action:command==='edit'?'intervene':command};
 if(command==='edit'||command==='schedule'){body.tool=flags.tool;body.point={x:number('x'),y:number('y')};if(command==='edit')body.expectedWorldRevision=String(flags['if-world']??state.worldRevision);else body.afterAction=number('after-action');}
 if(command==='checkpoint'&&flags.label)body.label=String(flags.label);
 const result=await request(root(runId)+'/commands',{method:'POST',body});output(command==='start'&&bool('wait')?await wait(runId):result);
 }else die('UNKNOWN_COMMAND',`Unknown command: ${command}`);
 }
 }
}catch(e){console.error(JSON.stringify({error:{code:e.code??'CLI_ERROR',message:String(e.message??e),...(e.status?{status:e.status}:{})}}));process.exitCode=2;}

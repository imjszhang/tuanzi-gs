/** Chat Completions transport reader. Only API-exposed text is observed, never inferred thoughts.
 * No tools, model retries, prompt changes or partial-proposal execution.
 */
const failure = message => Object.assign(Error(message), {status:502});
export function exposedText(value){
 if(value==null)return '';
 if(typeof value==='string')return value;
 // Some compatible endpoints return content blocks; unsupported structures fail explicitly.
 if(Array.isArray(value))return value.map(x=>{if(x?.type==='text'&&typeof x.text==='string')return x.text;throw failure('Unsupported G content block');}).join('');
 throw failure('Invalid G text field');
}
export function usageOf(u,model){return Number.isSafeInteger(u?.prompt_tokens)&&u.prompt_tokens>=0&&Number.isSafeInteger(u?.completion_tokens)&&u.completion_tokens>=0?{provider:'configured-chat-completions',model,inputTokens:u.prompt_tokens,outputTokens:u.completion_tokens}:undefined;}
export function redact(text,secrets){let s=String(text);for(const key of secrets.filter(Boolean))s=s.split(key).join('[REDACTED]');return s;}
/** Hold only possible secret-prefix suffixes so split chunks cannot expose configured credentials. */
export function redactingSink(secrets,emit){let pending='';const keys=[...new Set(secrets.filter(Boolean))];return {
 push(text){pending+=text;pending=redact(pending,keys);let n=0;for(const key of keys)for(let k=1;k<key.length&&k<=pending.length;k++)if(pending.endsWith(key.slice(0,k)))n=Math.max(n,k);const safe=pending.slice(0,pending.length-n);pending=pending.slice(pending.length-n);if(safe)emit(safe);},
 finish(){if(pending)emit('[REDACTED_PARTIAL]');pending='';}
};}
export function abortable(promise,signal,onLate){signal.throwIfAborted();return new Promise((resolve,reject)=>{let settled=false;const abort=()=>{if(settled)return;settled=true;reject(signal.reason??Error('cancelled'));};signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(v=>{if(settled){onLate?.(v);return;}settled=true;signal.removeEventListener('abort',abort);resolve(v);},e=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);reject(e);});});}
export async function readCompletion(response,{signal,onText=()=>{},onMode=()=>{},fallbackModel='',maxBytes=4*1024*1024,maxContent=60000,maxReasoning=120000}={}){
 signal.throwIfAborted();const streaming=(response.headers.get('content-type')??'').toLowerCase().includes('text/event-stream');
 const mode=streaming?'sse':'buffered';onMode(mode);let content='',reasoning='',model=fallbackModel,usage,finishReason=null,done=false,seenChoice=false,unsupported=false,refusal=false,bytes=0;
 const append=(channel,v)=>{const text=exposedText(v);if(!text)return;if(channel==='content'){if(content.length+text.length>maxContent)throw failure('G content exceeds limit');content+=text;}else {if(reasoning.length+text.length>maxReasoning)throw failure('G reasoning exceeds limit');reasoning+=text;}onText(channel,text);};
 const chunk=data=>{
  if(!data||typeof data!=='object'||Array.isArray(data))throw failure('G stream event is not an object');
  if(data.error)throw failure('G provider stream error');
  if(typeof data.model==='string')model=data.model;
  const u=usageOf(data.usage,model);if(u)usage=u;
  if(!Array.isArray(data.choices))throw failure('Missing G choices');
  if(data.choices.length>1)throw failure('Multiple G choices unsupported');
  const c=data.choices[0];if(!c)return;
  if(c.index!=null&&c.index!==0)throw failure('Unexpected G choice index');seenChoice=true;
  if(c.finish_reason!=null){if(typeof c.finish_reason!=='string')throw failure('Invalid G finish reason');finishReason=c.finish_reason;}
  const d=streaming?c.delta:c.message;if(!d||typeof d!=='object')throw failure('Missing G message delta');
  if(d.tool_calls?.length||d.function_call)unsupported=true;
  if(d.refusal)refusal=true;
  append('reasoning',d.reasoning_content??d.reasoning);
  append('content',d.content);
 };
 let reader=response.body?.getReader();if(!reader)throw failure('G response body missing');
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 const decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',dataLines=[],eventName='';
 const dispatch=()=>{if(!dataLines.length){eventName='';return;}const raw=dataLines.join('\n');dataLines=[];if(eventName==='error')throw failure('G provider SSE error');eventName='';if(raw.trim()==='[DONE]'){done=true;return;}let obj;try{obj=JSON.parse(raw);}catch{throw failure('Malformed G SSE JSON');}chunk(obj);};
 const line=l=>{if(l===''){dispatch();return;}if(l[0]===':')return;const p=l.indexOf(':'),field=p<0?l:l.slice(0,p),value=p<0?'':l.slice(p+1).replace(/^ /,'');if(field==='data')dataLines.push(value);if(field==='event')eventName=value;};
 const consume=()=>{while(!done){let n=buffer.search(/[\r\n]/);if(n<0)return;if(buffer[n]==='\r'&&n===buffer.length-1)return;const l=buffer.slice(0,n);const width=buffer[n]==='\r'&&buffer[n+1]==='\n'?2:1;buffer=buffer.slice(n+width);line(l);}};
 try{
  while(!done){const r=await abortable(reader.read(),signal);signal.throwIfAborted();if(r.done)break;bytes+=r.value.byteLength;if(bytes>maxBytes)throw failure('G response too large');buffer+=decoder.decode(r.value,{stream:true});if(streaming)consume();}
  if(streaming){buffer+=decoder.decode();consume();if(!done)throw failure('G stream interrupted before [DONE]');if(!seenChoice||finishReason===null)throw failure('G stream missing completion marker');}
  else {buffer+=decoder.decode();let data;try{data=JSON.parse(buffer);}catch{throw failure('G envelope not JSON');}chunk(data);done=true;}
  signal.throwIfAborted();if(unsupported)throw failure('G tool calls are not executable');if(refusal)throw failure('G provider refused generation');
  if(finishReason!==null&&finishReason!=='stop')throw failure(`G incomplete output: ${finishReason}`);
  if(!seenChoice)throw failure('G returned no choice');
  return {content,reasoning,model,usage,finishReason,mode,bytes};
 }catch(e){if(usage)e.usage=usage;throw e;}
 finally{signal.removeEventListener('abort',cancel);void reader.cancel().catch(()=>{});}
}

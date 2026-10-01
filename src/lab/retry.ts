/** Transport-only retry. Semantic answers (including none) never pass this path. */
export type RetryPolicy={maxRetries:number;baseMs:number;maxMs:number;attemptTimeoutMs:number};
export const JEV_RETRY_DEFAULTS:RetryPolicy={maxRetries:2,baseMs:500,maxMs:5000,attemptTimeoutMs:8000};
export type RetryState={schema:'gs/s-retry/v1';logicalRequestId:string;state:'attempting'|'waiting'|'recovered'|'failed'|'aborted';attempt:number;maxAttempts:number;worldRevision:string;delayMs?:number;nextAttemptAt?:number;reason?:string;failureKind?:string;providerStatus?:number};
export function transportInfo(error:unknown):{retryable:boolean;failureKind:string;providerStatus?:number;retryAfterMs?:number}{
 const e=error as any;return {retryable:e?.retryable===true,failureKind:typeof e?.failureKind==='string'?e.failureKind:'non_retryable',...(Number.isInteger(e?.providerStatus)?{providerStatus:e.providerStatus}:{}),...(Number.isFinite(e?.retryAfterMs)&&e.retryAfterMs>=0?{retryAfterMs:e.retryAfterMs}:{})};
}
export function abortableDelay(ms:number,signal:AbortSignal):Promise<void>{signal.throwIfAborted();return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});}
async function bounded<T>(fn:(s:AbortSignal)=>Promise<T>,signal:AbortSignal,ms:number):Promise<T>{
 signal.throwIfAborted();const local=new AbortController(),joined=AbortSignal.any([signal,local.signal]);
 const timeout=Object.assign(Error('jev_attempt_timeout'),{retryable:true,failureKind:'timeout'});
 const timer=setTimeout(()=>local.abort(timeout),ms);let rejectAbort:(e:unknown)=>void=()=>{};
 const abort=()=>rejectAbort(joined.reason);
 try{return await Promise.race([Promise.resolve().then(()=>{joined.throwIfAborted();return fn(joined);}),new Promise<never>((_,reject)=>{rejectAbort=reject;joined.addEventListener('abort',abort,{once:true});if(joined.aborted)abort();})]);}
 finally{clearTimeout(timer);joined.removeEventListener('abort',abort);}
}
export async function retryTransport<T>(args:{policy:RetryPolicy;signal:AbortSignal;check:()=>void;run:(attempt:number,s:AbortSignal)=>Promise<T>;onRetry:(data:{attempt:number;nextAttempt:number;delayMs:number;error:unknown})=>void;random?:()=>number}):Promise<T>{
 const {policy:p,signal,check,run,onRetry}=args;
 for(let attempt=1;;attempt++){
  signal.throwIfAborted();check();
  try{const answer=await bounded(s=>run(attempt,s),signal,p.attemptTimeoutMs);signal.throwIfAborted();check();return answer;}
  catch(error){signal.throwIfAborted();check();const info=transportInfo(error);if(!info.retryable)throw error;
   if(attempt>p.maxRetries)throw Object.assign(Error(`jev_transport_retries_exhausted: ${info.failureKind}`),{...info,retryable:false,attempts:attempt,cause:error});
   // Never retry earlier than Retry-After. An impractically long provider delay stops instead.
   if((info.retryAfterMs??0)>60000)throw Object.assign(Error('jev_retry_after_exceeds_limit'),{...info,retryable:false});
   const exponential=Math.min(p.maxMs,p.baseMs*2**(attempt-1));const jitter=Math.floor(exponential*(.5+.5*(args.random??Math.random)()));
   const delayMs=Math.max(jitter,info.retryAfterMs??0);onRetry({attempt,nextAttempt:attempt+1,delayMs,error});await abortableDelay(delayMs,signal);
  }
 }
}

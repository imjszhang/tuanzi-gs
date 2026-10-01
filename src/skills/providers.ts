import type {ReactiveProviders} from './runtime.js';
import {ProposalRejected} from '../../vendor/gs-engine-ts/src/rejection.js';
/** Explicit same-origin transport. No credentials in model state, no retry/fallback. */
export function remoteSkills(token:string,withGenerator:boolean):ReactiveProviders {
 const request=async(endpoint:string,input:unknown,signal:AbortSignal)=>{
  const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-gs-token':token},body:JSON.stringify(input),signal});
  const data=await r.json();if(!r.ok){if(r.status===422&&data.rejection)throw new ProposalRejected(data.rejection,data.usage??undefined);throw Error(data.error??`Provider bridge HTTP ${r.status}`);}return data;
 };
 return {identity:'jev/configured',source:'jev',select:(input,signal)=>request('/api/reactive-select',input,signal),...(withGenerator?{generate:(input:Parameters<NonNullable<ReactiveProviders['generate']>>[0],signal:AbortSignal)=>request('/api/reactive-plan',input,signal)}:{})};
}

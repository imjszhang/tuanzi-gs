/** Example external experimenter: four same-origin runs; no browser automation or move commands.
 * The browser can watch /lab?run=... while this script runs. Offline only by design. */
const base=process.env.GS_LAB_URL||'http://127.0.0.1:4173';
const {token}=await (await fetch(base+'/api/status')).json();
const actor={id:'agent:comparison',kind:'agent',label:'Four-strategy comparison'};
const api=async(path,body)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'x-gs-token':token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d;};
const rows=[];
for(const strategy of ['direct','batch','serial','dependent']){
 const s=await api('/api/lab/runs',{requestId:crypto.randomUUID(),actor,config:{kind:'judgment',task:'energy',strategy,backend:'rule',delayMs:10,maxRequests:512,deadlineMs:120000}});
 console.error(`Watch ${s.viewerUrl}`);
 await api(`/api/lab/runs/${s.runId}/commands`,{commandId:crypto.randomUUID(),expectedControlVersion:s.controlVersion,actor,action:'start'});
 let result;for(;;){result=await api(`/api/lab/runs/${s.runId}/result`);if(result.complete)break;await new Promise(r=>setTimeout(r,100));}
 rows.push({runId:s.runId,strategy,status:result.state.status,actions:result.state.physicalActions,requests:result.state.requests,questions:result.state.questions,external:result.state.externalRequests,viewerUrl:s.viewerUrl});
}
console.log(JSON.stringify({schema:'gs/agent-comparison/v1',note:'Independent cold runs, shared rules and seed; offline, synthetic delay, NOT model performance.',rows},null,2));

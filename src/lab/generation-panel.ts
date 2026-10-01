/** Presentation only: no provider, adaptive engine or reference solver dependencies. */
import type {LabEvent} from './types.js';
import {generationPurpose,generationHistory,generationActive,GENERATION_STATUS} from './generation.js';
import type {GenerationRecord} from './generation.js';
export const generationCard=`<section id="generation-card" class="generation-card hidden" aria-label="G 的可见输出">
 <div class="generation-heading"><span class="generation-mark">G</span><div><h3>生成过程</h3><p id="generation-meta"></p></div><span id="generation-live" class="stream-indicator">●</span><button id="generation-expand" class="text-button" aria-haspopup="dialog">展开 ↗</button></div>
 <p id="generation-status" class="generation-status" role="status"></p>
 <div class="generation-switch" role="tablist" aria-label="输出类型"><button id="generation-reasoning-tab" role="tab" aria-selected="true" aria-controls="generation-preview" tabindex="0">推理</button><button id="generation-content-tab" role="tab" aria-selected="false" aria-controls="generation-preview" tabindex="-1">内容</button><span id="generation-count"></span></div>
 <pre id="generation-preview" class="stream-text compact" tabindex="0" role="tabpanel" aria-label="当前通道的可见输出"></pre>
 <div class="generation-foot"><small id="generation-mode"></small><button id="generation-follow" class="text-button">跟随最新 ↓</button></div>
 <p class="generation-disclaimer">仅显示接口实际返回的文本。流式草稿未生效，完整提案仍需校验与 S 选择。</p>
</section>`;
export const generationDialog=`<dialog id="generation-dialog" class="generation-dialog" aria-labelledby="generation-title">
 <div class="dialog-head"><div><p class="overline">G / 生成输出 · 只读</p><h2 id="generation-title">查看生成过程</h2></div><button class="icon-button" data-close="generation-dialog" aria-label="关闭生成过程">×</button></div>
 <div class="dialog-body"><label for="generation-select">本场实验的 G 调用</label><select id="generation-select"></select>
 <div class="stream-detail-meta"><span id="generation-detail-status" role="status"></span><span id="generation-detail-metrics"></span></div>
 <p id="generation-detail-source" class="field-help"></p>
 <div class="stream-columns"><section><h3>推理 <span>服务商显式返回</span></h3><pre id="generation-reasoning" class="stream-text" tabindex="0" aria-label="服务商返回的推理"></pre></section><section><h3>内容 <span>生成的提案文本</span></h3><pre id="generation-content" class="stream-text" tabindex="0" aria-label="生成的内容"></pre></section></div>
 <p id="generation-detail-error" class="callout warning hidden"></p>
 <p class="field-help">文本不是已验证事实，也不是已执行动作。未公开的内部推理无法展示。失败或中断后保留已收到的片段，但不执行半成品。</p></div>
 <div class="dialog-footer"><span id="generation-reading-state">只读观察不会重试或产生模型调用。</span><button id="generation-detail-follow" class="quiet">跟随最新 ↓</button><button id="generation-copy" class="quiet">复制可见文本</button><button class="primary" data-close="generation-dialog">关闭</button></div>
</dialog>`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const set=(id:string,v:unknown)=>{const e=$(id),s=String(v??'');if(e.textContent!==s)e.textContent=s;};
const show=(id:string,yes:boolean)=>$(id).classList.toggle('hidden',!yes);
const modeLabel=(r:GenerationRecord)=>r.mode==='sse'?'真实增量传输':r.mode==='buffered'?'整包返回 · 非流式':r.mode==='local'?'本地生成 · 非模型':r.mode==='requested-sse'?'已请求流式响应':'等待生成器响应';
const empty=(r:GenerationRecord,channel:'reasoning'|'content')=>r.mode==='local'?'本地夹具没有模型推理或流式文本。':channel==='reasoning'?generationActive(r)?'尚未收到可见推理；仅在接口公开返回时显示。':'本次接口未返回可见推理，不补写。':generationActive(r)?'等待内容输出；生成期间不会执行草稿。':'没有收到内容输出。';
export class GenerationPanel{
 private records:GenerationRecord[]=[];private run='';private selected:string|null=null;private latest='';private channel:'reasoning'|'content'='reasoning';private explicitChannel=false;private reading=false;private replay=false;private connected=true;private cacheKey='';
 constructor(private open:()=>void,private toast:(s:string)=>void){
  $('generation-expand').onclick=()=>{this.selected=null;this.detail();this.open();};
  $('generation-history-open').onclick=()=>{this.selected=null;this.detail();this.open();};
  $<HTMLSelectElement>('generation-select').onchange=()=>{this.selected=$<HTMLSelectElement>('generation-select').value;this.resetScroll();this.detail();};
  for(const c of ['reasoning','content'] as const){const b=$('generation-'+c+'-tab');b.onclick=()=>{this.channel=c;this.explicitChannel=true;this.resetScroll('generation-preview');this.compact();};b.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const other=c==='content'?'reasoning':'content';$('generation-'+other+'-tab').click();$('generation-'+other+'-tab').focus();}};}
  for(const event of ['wheel','touchmove'])$('generation-preview').addEventListener(event,()=>{this.explicitChannel=true;},{passive:true});
  $('generation-follow').onclick=()=>this.resetScroll('generation-preview');
  $('generation-detail-follow').onclick=()=>{this.selected=null;this.resetScroll();this.detail();};
  $('generation-copy').onclick=async()=>{const r=this.chosen();if(!r)return;const t=`${r.source} / ${r.model}\n${GENERATION_STATUS[r.status]}\n\n[推理：接口返回]\n${r.reasoning||empty(r,'reasoning')}\n\n[内容：未代表执行]\n${r.content}`;try{await navigator.clipboard.writeText(t);this.toast('已复制当前可见文本。');}catch{this.toast('浏览器未允许剪贴板，请在文本区域选择复制。');}};
 }
 private resetScroll(id?:string){for(const key of id?[id]:['generation-preview','generation-reasoning','generation-content']){const e=$(key);e.scrollTop=e.scrollHeight;}this.reading=false;}
 private paintText(id:string,value:string){const e=$(id);if(e.textContent===value)return;const follow=e.scrollHeight-e.scrollTop-e.clientHeight<32;const pos=e.scrollTop;e.textContent=value;if(follow)e.scrollTop=e.scrollHeight;else{e.scrollTop=pos;this.reading=true;}}
 update(runId:string,events:readonly LabEvent[],through:number,{replay,connected}:{replay:boolean;connected:boolean}){
  if(this.run!==runId){this.run=runId;this.selected=null;this.latest='';this.explicitChannel=false;this.channel='reasoning';this.cacheKey='';this.records=[];this.resetScroll();}
  this.replay=replay;this.connected=connected;const key=`${runId}:${through}:${events.length}`;
  if(key!==this.cacheKey){this.records=generationHistory(events,through);this.cacheKey=key;}
  this.compact();show('generation-history-open',this.records.length>0);
  set('generation-history-note',this.records.length?`${this.records.length} 次 G 调用，按当前查看时刻截取；不会请求重算。`:'尚无流式记录。旧报告不补造生成过程。');
  if($<HTMLDialogElement>('generation-dialog').open)this.detail();
 }
 private compact(){const r=this.records.at(-1);show('generation-card',!!r);if(!r)return;
  if(r.id!==this.latest){this.latest=r.id;this.channel=r.reasoning?'reasoning':'content';this.explicitChannel=false;this.resetScroll('generation-preview');}
  if(!this.explicitChannel)this.channel=r.content?'content':'reasoning';
  const active=generationActive(r);const status=this.replay?'历史快照 · '+GENERATION_STATUS[r.status]:!this.connected&&active?'连接中断 · 显示最后收到的片段':GENERATION_STATUS[r.status];
  set('generation-meta',`第 ${r.requestIndex} 个请求 · ${generationPurpose(r)} · 层 ${r.depth}`);set('generation-status',status);
  $('generation-live').classList.toggle('working',active&&!this.replay&&this.connected);
  set('generation-live',active&&!this.replay?'●':['failed','aborted','invalid'].includes(r.status)?'!':'✓');
  for(const c of ['reasoning','content']){const e=$('generation-'+c+'-tab');e.setAttribute('aria-selected',String(this.channel===c));e.tabIndex=this.channel===c?0:-1;}
  const text=r[this.channel];this.paintText('generation-preview',text||empty(r,this.channel));set('generation-count',`${Array.from(text).length.toLocaleString()} 字符`);
  const elapsed=Math.max(0,((active&&!this.replay&&this.connected?Date.now():Date.parse(r.updatedAt))-Date.parse(r.startedAt))/1000);
  set('generation-mode',`${modeLabel(r)} · ${elapsed.toFixed(1)} 秒${r.source.includes('mock')||r.source.includes('synthetic')?' · 测试替身':''}`);
  $('generation-card').dataset.streamId=r.id;$('generation-card').dataset.status=r.status;
 }
 private chosen(){return this.records.find(r=>r.id===this.selected)??this.records.at(-1);}
 private detail(){const r=this.chosen();const select=$<HTMLSelectElement>('generation-select');
  const signature=this.records.map(x=>`${x.id}:${x.status}`).join('|');if(select.dataset.signature!==signature){select.replaceChildren(...this.records.map(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=`请求 ${x.requestIndex} · ${generationPurpose(x)} · 层 ${x.depth} · ${GENERATION_STATUS[x.status]}`;return o;}));select.dataset.signature=signature;}
  if(!r){select.replaceChildren();set('generation-detail-status','当前时刻尚无 G 输出');set('generation-detail-source','回放不会展示未来的生成内容。');set('generation-detail-metrics','');this.paintText('generation-reasoning','暂无记录');this.paintText('generation-content','暂无记录');show('generation-detail-error',false);return;}
  select.value=r.id;set('generation-detail-status',`${this.replay?'历史 · ':''}${GENERATION_STATUS[r.status]}`);
  const end=Date.parse(r.updatedAt)-Date.parse(r.startedAt),u=r.usage as {inputTokens?:number;outputTokens?:number}|null;
  set('generation-detail-metrics',`记录跨度 ${(Math.max(0,end)/1000).toFixed(1)} 秒 · 首段文本 ${r.firstTextMs===null?'未记录':Math.round(r.firstTextMs)+' ms'}${u?.inputTokens!==undefined?` · token ${u.inputTokens} / ${u.outputTokens}`:''}`);
  set('generation-detail-source',`${r.source}${r.model?' / '+r.model:''} · ${modeLabel(r)} · 世界 v${r.revision} · 触发：${r.cause||'未记录'}`);
  this.paintText('generation-reasoning',r.reasoning||empty(r,'reasoning'));this.paintText('generation-content',r.content||empty(r,'content'));
  show('generation-detail-error',!!r.reason);set('generation-detail-error',r.reason);set('generation-reading-state',this.reading?'已保留阅读位置；点击「跟随最新」恢复自动滚动。':'只读观察；生成完成不代表提案已选中或实际成功。');
 }
 snapshot(){return structuredClone(this.records);}
}

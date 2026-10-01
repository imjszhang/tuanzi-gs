/** Separate the local game and judgment fixture visually; do not mutate either session. */
export function mountWorkspaceNavigation(){
 const shell=document.querySelector<HTMLElement>('main.shell')!,lab=document.getElementById('decision-lab')!;
 const game=document.createElement('section');game.id='local-game';game.setAttribute('role','tabpanel');game.setAttribute('aria-labelledby','local-tab-game');
 for(const child of [...shell.children])if(child!==lab)game.append(child);
 lab.setAttribute('role','tabpanel');lab.setAttribute('aria-labelledby','local-tab-judgment');lab.hidden=true;
 const nav=document.createElement('div');nav.className='local-scope-nav';nav.innerHTML=`<div><span class="local-kicker">本地试玩 · 浏览器独立世界</span><p>完整任务与判断实验分开查看，不与服务端会话混用。</p></div><div class="local-tabs" role="tablist" aria-label="本地实验范围"><button id="local-tab-game" role="tab" aria-selected="true" aria-controls="local-game" tabindex="0">完整任务体验</button><button id="local-tab-judgment" role="tab" aria-selected="false" aria-controls="decision-lab" tabindex="-1">判断组合实验</button></div>`;
 shell.prepend(nav,game);document.body.dataset.localScope='game';
 function select(which:string){const isGame=which==='game';game.hidden=!isGame;lab.hidden=isGame;document.body.dataset.localScope=which;
 for(const [id,on]of [['local-tab-game',isGame],['local-tab-judgment',!isGame]] as const){const b=document.getElementById(id)!;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
 }
 for(const [id,scope]of [['local-tab-game','game'],['local-tab-judgment','judgment']]){const b=document.getElementById(id!)!;b.onclick=()=>select(scope!);b.onkeydown=e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'game':e.key==='End'?'judgment':document.body.dataset.localScope==='game'?'judgment':'game';select(next);document.getElementById('local-tab-'+next)?.focus();}};}
 const controls=lab.querySelector('.lab-controls'),options=lab.querySelector('.lab-options');
 const detail=document.createElement('details');detail.className='local-lab-advanced';detail.innerHTML='<summary>高级实验条件 · 延迟、截止与观察</summary><div class="local-lab-fields"></div>';
 const fields=detail.querySelector('.local-lab-fields')!;for(const id of ['lab-delay','lab-deadline']){const label=document.getElementById(id)?.closest('label');if(label)fields.append(label);}if(options)fields.append(options);controls?.after(detail);
 const selectMode=document.getElementById('run-mode') as HTMLSelectElement;
 const groups=[['反应技能',['reactive','reactive-off','reactive-record','reactive-jev','reactive-live']],['明确的对照实现',['program','rules-full','program-jev','program-live']],['历史配置兼容',['adaptive','fixed','jev-template','live']]] as const;
 for(const [name,values]of groups){const optgroup=document.createElement('optgroup');optgroup.label=name;for(const value of values){const opt=[...selectMode.options].find(o=>o.value===value);if(opt){opt.textContent=opt.textContent?.replace(/^v[\d.]+\s*/,'')??value;optgroup.append(opt);}}selectMode.append(optgroup);}
 for(const opt of [...(document.getElementById('decision-style') as HTMLSelectElement).options])opt.textContent=opt.textContent?.replace(/^v[\d.]+\s*/,'')??opt.value;
 const styleLabel=document.querySelector('label[for="decision-style"]');if(styleLabel)styleLabel.textContent='技能模式的判断组织';
 const heading=document.querySelector('#connect-dialog h2');if(heading)heading.textContent='运行配置';
 const btn=document.getElementById('btn-connect');if(btn){btn.title='运行配置';const txt=btn.querySelector('.btn-text');if(txt)txt.textContent='运行配置';}
 const link=document.createElement('a');link.href='/lab';link.className='local-shared-link';link.textContent='打开共享实验观测台 ↗';
 if(location.protocol==='http:'||location.protocol==='https:')nav.append(link);
}

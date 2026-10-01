"""v0.4.3 UI regression. Hosted HTML bytes + REAL local API through an explicit
transport fixture because sandbox blocks navigation. SSE wire separately tested by
unchanged Node tests. No true model calls. Includes screenshots and runtime equality.
"""
import os,json,time,pathlib,subprocess,urllib.request,urllib.error
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent;REPORT=R/'reports/v043';REPORT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('GS_LAB_URL','http://127.0.0.1:4184');FAULT=os.environ.get('GS_LAB_FAULT_URL','http://127.0.0.1:4185')
checks=[];errors=[];http_calls=[]
def check(name,ok):
 checks.append({'name':name,'pass':bool(ok)});print(name,bool(ok),flush=True)
 (REPORT/'browser-progress.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
 if not ok:raise AssertionError(name)
def http(req,base=BASE):
 url=req['url'];url=base+url if url.startswith('/') else url;data=req.get('body');http_calls.append({'url':req['url'],'method':req.get('method','GET')})
 request=urllib.request.Request(url,data=data.encode() if data is not None else None,method=req.get('method','GET'),headers=req.get('headers',{}))
 try:
  with urllib.request.urlopen(request,timeout=40) as r:return {'status':r.status,'text':r.read().decode(),'headers':{'content-type':'application/json'}}
 except urllib.error.HTTPError as e:return {'status':e.code,'text':e.read().decode(),'headers':{'content-type':'application/json'}}
def cli(*args,base=BASE,actor='agent:ui-043'):
 p=subprocess.run(['node','bin/gs-lab.mjs',*args,'--url',base,'--actor',actor],cwd=R,text=True,capture_output=True,timeout=90)
 return json.loads(p.stderr if p.returncode else p.stdout)
BRIDGE=r"""
(()=>{
const originalFetch=window.fetch.bind(window);
history.pushState=history.replaceState=(_a,_b,url)=>{window.__fixtureURL=url;};
window.fetch=async(input,init={})=>{
 const url=String(input);if(!url.startsWith('/api/'))return originalFetch(input,init);
 if(window.__disconnect)throw new TypeError('Simulated observer network loss');
 if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');
 if(url.includes('/stream?')){
  let stopped=false,timer,ctl;const parsed=new URL(url,'http://fixture'),base=parsed.pathname.replace('/stream','/events');let after=Number(parsed.searchParams.get('after')||0);
  const stream=new ReadableStream({start(controller){ctl=controller;const pump=async()=>{if(stopped)return;try{if(window.__disconnect)throw Error('Simulated stream loss');const r=await __labHttp({url:base+'?after='+after+'&limit=250',method:'GET',headers:init.headers||{}});if(stopped)return;if(r.status!==200)throw Error(r.text);const data=JSON.parse(r.text);for(const e of data.events){after=e.seq;controller.enqueue(new TextEncoder().encode('id: '+e.seq+'\nevent: lab\ndata: '+JSON.stringify(e)+'\n\n'));}timer=setTimeout(pump,25);}catch(e){if(!stopped){stopped=true;controller.error(e);}}};pump();},cancel(){stopped=true;clearTimeout(timer);}});
  init.signal?.addEventListener('abort',()=>{if(!stopped){stopped=true;clearTimeout(timer);ctl.error(new DOMException('Aborted','AbortError'));}},{once:true});return new Response(stream,{status:200,headers:{'content-type':'text/event-stream'}});
 }
 const r=await __labHttp({url,method:init.method||'GET',headers:init.headers||{},body:init.body??null});if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');return new Response(r.text,{status:r.status,headers:r.headers});
};
})();
"""
def mount(b,width=1440,base=BASE):
 p=b.new_page(viewport={'width':width,'height':1060 if width>600 else 844});p.set_default_timeout(15000);p.on('pageerror',lambda e:errors.append(str(e)));p.expose_function('__labHttp',lambda req:http(req,base))
 html=(R/'public/lab.html').read_text().replace('<link rel="stylesheet" href="/lab.css">','<style>'+(R/'public/lab.css').read_text()+'</style>').replace('<script src="/lab.js"></script>','<script>'+BRIDGE+'</script><script>'+(R/'public/lab.js').read_text().replace('</script','<\\/script')+'</script>')
 p.set_content(html);p.wait_for_function('window.gsLabViewer && document.querySelectorAll(".run-row").length>0');return p
def select(p,rid):
 if not p.locator('#list-page').is_visible():p.locator('#back-list').click()
 p.locator('#run-search').fill('');p.locator('#status-filter').select_option('all');p.locator('#refresh').click();p.locator('[data-run="'+rid+'"]').click();p.wait_for_function('(id)=>window.gsLabViewer.snapshot()?.runId===id && !window.gsLabViewer.view().listing',arg=rid)
 p.wait_for_function('window.gsLabViewer.view().connected')
def nooverflow(p):return p.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
try:
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  game=cli('create','--kind','game','--scenario','guarded','--strategy','batch','--deadline-ms','3600000','--label','外部实验 Agent');rid=game['runId']
  energy=cli('create','--task','energy','--strategy','direct','--deadline-ms','120000');eid=energy['runId']
  p=mount(b);before_count=len(cli('list')['runs'])
  check('043-default-is-list-not-creation-wall',p.locator('#list-page').is_visible() and not p.locator('#create-dialog').is_visible() and not p.locator('#run-page').is_visible())
  check('043-current-version-visible','0.4.3' in p.locator('header').inner_text())
  check('043-list-title-status-owner-legible',p.locator('.run-row').count()>=2 and '程序化参考' in p.locator('#run-list').inner_text())
  p.locator('#run-search').fill(rid);check('043-search-matches-id',p.locator('.run-row').count()==1);p.locator('#run-search').fill('')
  p.screenshot(path=str(REPORT/'desktop-list-v043.png'),full_page=True)
  p.locator('#new-run').click();check('043-create-in-modal-independent-context',p.locator('#create-dialog').is_visible() and p.locator('input[name="scope"][value="game"]').is_checked())
  p.locator('#strategy').select_option('serial');p.keyboard.press('Escape');check('043-cancel-draft-does-not-create',len(cli('list')['runs'])==before_count)
  check('043-dialog-focus-restored',p.evaluate('document.activeElement.id')=='new-run')
  select(p,rid);check('043-default-run-tab-overview',p.locator('#tab-overview').get_attribute('aria-selected')=='true' and not p.locator('#panel-config').is_visible())
  check('043-no-new-form-or-edit-tools-in-overview',not p.locator('#create-form').is_visible() and not p.locator('#checkpoint-list').is_visible() and not p.locator('#tool').is_visible())
  check('043-nonowner-only-takeover',p.locator('#takeover').is_visible() and not p.locator('#start').is_visible() and not p.locator('#step').is_visible())
  initial=cli('status',rid)
  for tab in ['decision','diagnostics','config','overview']:p.locator('#tab-'+tab).click()
  check('043-tabs-never-mutate-or-request-model',cli('status',rid)['world']==initial['world'] and cli('status',rid)['requests']==0)
  p.locator('#tab-overview').focus();p.keyboard.press('ArrowRight');check('043-tabs-roving-keyboard-navigation',p.locator('#tab-decision').get_attribute('aria-selected')=='true' and p.evaluate('document.activeElement.id')=='tab-decision');p.keyboard.press('Home')
  for _ in range(5):cli('step',rid)
  p.wait_for_function('window.gsLabViewer.snapshot()?.physicalActions>=4')
  check('043-cli-and-viewer-world-identical',p.evaluate('window.gsLabViewer.snapshot().world')==cli('status',rid)['world'])
  check('043-active-skill-and-immediate-task-readable','创造采集' in p.locator('#current-skill').inner_text() and '[object Object]' not in p.locator('#immediate-task').inner_text())
  check('043-key-events-human-readable',p.locator('.timeline-item').count()>0 and 'parent_event' not in p.locator('#activity').inner_text())
  check('043-overview-no-raw-json',not p.locator('#evidence-json').is_visible())
  p.locator('#title').focus();p.screenshot(path=str(REPORT/'desktop-overview-v043.png'),full_page=True)
  p.locator('#tab-decision').click();check('043-structured-decision-candidates',p.locator('.candidate-row').count()>0)
  p.locator('#decision-content [data-evidence]').first.click();check('043-raw-evidence-on-demand',p.locator('#evidence-dialog').is_visible() and len(p.locator('#evidence-json').inner_text())>50);p.keyboard.press('Escape')
  p.locator('#tab-config').click();check('043-config-is-readonly-and-game-goal-not-energy',p.locator('#panel-config input').count()==0 and 'task 字段不改变' in p.locator('#config-content').inner_text())
  p.locator('#config-copy').click();p.locator('#strategy').select_option('dependent');p.keyboard.press('Escape');check('043-draft-not-current-configuration',cli('status',rid)['config']['strategy']=='batch');p.locator('#tab-overview').click()
  p.locator('#takeover').click();check('043-takeover-requires-clear-confirmation',p.locator('#confirm-dialog').is_visible() and cli('status',rid)['owner']['kind']=='agent');p.locator('#confirm-action').click();p.wait_for_function('window.gsLabViewer.snapshot()?.owner.kind==="human"')
  check('043-human-takeover-enables-controls',p.locator('#step').is_visible() and p.locator('#step').is_enabled() and not p.locator('#takeover').is_visible())
  rejected=cli('step',rid);check('043-old-agent-refused',rejected.get('error',{}).get('code')=='NOT_CONTROLLER')
  n=p.evaluate('window.gsLabViewer.snapshot().decisionSteps');p.locator('#step').click();p.wait_for_function('(n)=>window.gsLabViewer.snapshot().decisionSteps>n && !window.gsLabViewer.snapshot().busy',arg=n)
  check('043-human-step-same-runtime',p.evaluate('window.gsLabViewer.snapshot().world')==cli('status',rid)['world'])
  p.locator('#more-open').click();p.locator('#fork-open').click();p.locator('#fork-dialog').wait_for(state='visible');check('043-fork-dialog-separate-from-create',p.locator('#fork-dialog').is_visible() and not p.locator('#create-dialog').is_visible())
  p.locator('#checkpoint').click();p.wait_for_function('document.querySelector("#checkpoint-list").options.length>1');check('043-checkpoint-recorded',p.locator('#checkpoint-list option').count()>1)
  p.locator('#fork-strategy').select_option('direct');p.locator('#fork').click();p.wait_for_function('(id)=>window.gsLabViewer.snapshot()?.runId!==id',arg=rid);fid=p.evaluate('window.gsLabViewer.snapshot().runId');fork=cli('status',fid)
  check('043-fork-has-explicit-strategy-and-lineage',fork['config']['strategy']=='direct' and fork['lineage']['memory']=='none' and fork['physicalActions']==0)
  check('043-fork-does-not-use-stale-create-draft',fork['config']['strategy']!='dependent' and cli('status',rid)['config']['strategy']=='batch')
  p.locator('#more-open').click();p.locator('#intervene-open').click();p.locator('#point-x').fill('0');p.locator('#point-y').fill('0');p.locator('#edit').click();p.wait_for_function('window.gsLabViewer.snapshot().interventions.length>0');check('043-intervention-retains-record',cli('status',fid)['interventions'][0]['tool']=='wall')
  p.locator('#more-open').click();p.locator('#cancel').click();p.locator('#confirm-action').click();p.wait_for_function('window.gsLabViewer.snapshot().status==="cancelled"');check('043-terminal-no-resume',not p.locator('#start').is_visible() and not p.locator('#step').is_visible())
  select(p,eid);cli('step',eid);p.wait_for_function('window.gsLabViewer.snapshot().physicalActions===1');p.locator('#tab-decision').click();check('043-judgment-report-displays-actual-choice','已选择候选' in p.locator('#decision-content').inner_text());p.locator('#tab-overview').click()
  cli('start',eid,'--wait');p.wait_for_function('window.gsLabViewer.snapshot().status==="succeeded" && document.querySelector("#status-title").textContent.includes("根任务已完成")');check('043-terminal-success-from-authority','根任务已完成' in p.locator('#status-title').inner_text())
  p.locator('#replay').click();p.wait_for_function('window.gsLabViewer.readOnlyReplay()');check('043-replay-start-metrics-and-world-aligned',p.evaluate('window.gsLabViewer.displayedSnapshot().world.energy')==10 and p.locator('#external').inner_text()=='0' and p.locator('#progress').inner_text()=='4 / 5')
  p.locator('#tab-decision').click();check('043-replay-hides-future-judgment','尚未发生判断' in p.locator('#decision-content').inner_text());p.locator('#tab-overview').click()
  mx=p.locator('#replay-slider').get_attribute('max');p.locator('#replay-slider').fill(mx);p.locator('#replay-slider').dispatch_event('input');check('043-replay-end-metrics-aligned',p.evaluate('window.gsLabViewer.displayedSnapshot().world.energy')==40 and p.locator('#progress').inner_text()=='5 / 5')
  check('043-replay-no-state-mutation',cli('status',eid)['physicalActions']==2);p.locator('#live').click()
  p.locator('#more-open').click()
  with p.expect_download() as dl:p.locator('#export').click()
  exported=REPORT/'browser-report.json';dl.value.save_as(str(exported));check('043-export-keeps-original-schema',json.loads(exported.read_text())['schema']=='gs/lab-export/v1')
  p.locator('#back-list').click();p.locator('#import').set_input_files(str(exported));p.wait_for_function('window.gsLabViewer.view().imported');check('043-import-is-readonly-without-live-actions',p.locator('#replay-bar').is_visible() and not p.locator('#start').is_visible() and not p.locator('#live').is_visible())
  check('043-import-uses-historical-metrics',p.evaluate('window.gsLabViewer.displayedSnapshot().world.energy')==10)
  select(p,rid);p.evaluate('window.__disconnect=true');p.wait_for_function('!window.gsLabViewer.view().connected');check('043-stream-loss-explains-stale-snapshot',p.locator('#stale-banner').is_visible() and p.locator('#step').is_disabled());p.evaluate('window.__disconnect=false');p.wait_for_function('window.gsLabViewer.view().connected',timeout=10000);check('043-reconnect-resumes-events-not-engine',p.evaluate('window.gsLabViewer.snapshot().world')==cli('status',rid)['world'])
  # Responsive order: world before the detailed metrics, no desktop sidebars below.
  mobile=mount(b,390);select(mobile,rid);check('043-mobile-no-horizontal-overflow',nooverflow(mobile));check('043-mobile-world-within-first-screen',mobile.locator('.world-panel').bounding_box()['y']<600)
  check('043-mobile-no-long-forms-in-page',not mobile.locator('#create-form').is_visible() and not mobile.locator('#tool').is_visible());mobile.screenshot(path=str(REPORT/'mobile-overview-v043.png'),full_page=True)
  mobile.locator('#new-run').click();check('043-mobile-create-modal-fits',mobile.locator('#create-dialog').bounding_box()['width']<=390);mobile.screenshot(path=str(REPORT/'mobile-create-v043.png'),full_page=True);mobile.keyboard.press('Escape');mobile.close()
  # UI creation is lazy and real-model configuration is unavailable on normal service.
  p.locator('#new-run').click();check('043-missing-models-disabled',p.locator('#preset option[value="jev"]').evaluate('(e)=>e.disabled'))
  p.locator('input[name="scope"][value="judgment"]').check();p.locator('#task').select_option('reserve');p.locator('#strategy').select_option('batch');p.screenshot(path=str(REPORT/'desktop-create-v043.png'),full_page=True);p.locator('#create').click();p.wait_for_function('window.gsLabViewer.snapshot().config.task==="reserve" && window.gsLabViewer.snapshot().status==="ready"');check('043-create-lazy-and-goal-correct',p.locator('#goal').inner_text().find('2')>=0 and p.evaluate('window.gsLabViewer.snapshot().requests')==0)
  # Different fixture server: explicit, non-real model abstention.
  blocked=cli('create','--kind','game','--scenario','guarded','--strategy','direct','--backend','jev','--generator','llm','--allow-live','--max-requests','80','--deadline-ms','600000',base=FAULT)
  bid=blocked['runId'];cli('start',bid,'--wait',base=FAULT);bp=mount(b,1440,FAULT);select(bp,bid)
  check('043-blocked-human-readable-and-raw-cause', '子层未选出' in bp.locator('#status-title').inner_text() and 'decision_blocked:no_local_suitable_action' in bp.locator('#status-reason').inner_text())
  check('043-blocked-zero-action-and-no-resume',bp.evaluate('window.gsLabViewer.snapshot().physicalActions')==0 and not bp.locator('#start').is_visible())
  check('043-fixture-not-labelled-real-Jev','测试替身' in bp.locator('#source-caption').inner_text() and '测试替身' in bp.locator('#external-label').inner_text())
  count=cli('status',bid,base=FAULT)['requests'];bp.locator('#status-detail').click();check('043-diagnostics-show-exact-budget-and-recovery','1 / 3' in bp.locator('#diagnostics-content').inner_text());bp.locator('#diagnostics-content [data-evidence]').first.click();check('043-complete-recovery-json-accessible','gs/skill-task-context/v042' in bp.locator('#evidence-json').inner_text());bp.keyboard.press('Escape');bp.locator('#tab-overview').click();bp.screenshot(path=str(REPORT/'desktop-blocked-v043.png'),full_page=True)
  check('043-diagnostic-browsing-never-retries-model',cli('status',bid,base=FAULT)['requests']==count)
  bp.locator('#more-open').click();bp.locator('#fork-open').click();bp.locator('#fork-dialog').wait_for(state='visible');check('043-live-fork-requires-new-consent',bp.locator('#fork-live').is_visible() and not bp.locator('#fork-allow-live').is_checked());bp.locator('#fork').click();check('043-no-silent-live-authorization',bp.locator('#fork-error').is_visible());bp.keyboard.press('Escape');bp.close()
  # Local standalone modes remain isolated, navigation has no execution side effects.
  lp=b.new_page(viewport={'width':1440,'height':1000});lp.on('pageerror',lambda e:errors.append(str(e)));lp.set_content((R/'play.html').read_text());lp.wait_for_function('window.gsDecisionLab && window.tuanziLab');check('043-local-game-only-in-default-view',lp.locator('#local-game').is_visible() and not lp.locator('#decision-lab').is_visible())
  snap=lp.evaluate('window.tuanziLab.snapshot()');lp.locator('#local-tab-judgment').click();check('043-local-judgment-separate-context',lp.locator('#decision-lab').is_visible() and not lp.locator('#local-game').is_visible());lp.locator('#decision-lab h2').evaluate('(e)=>{e.tabIndex=-1;e.focus()}');lp.keyboard.press('ArrowRight');check('043-hidden-game-hotkeys-dont-step',lp.evaluate('window.tuanziLab.snapshot()')==snap)
  lp.locator('#lab-compare').click();lp.wait_for_function('!document.querySelector("#lab-run").disabled',timeout=60000);rs=lp.evaluate('window.gsDecisionLab.results()');check('043-four-local-comparisons-unchanged',len(rs)==4 and all(r['status']=='succeeded' for r in rs) and [r['requests'] for r in rs]==[2,2,50,4]);check('043-local-experiment-does-not-change-main-world',lp.evaluate('window.tuanziLab.snapshot()')==snap)
  lp.locator('#local-tab-game').click();lp.locator('#btn-connect').click();check('043-local-options-grouped-without-version-prefixes',lp.locator('#run-mode optgroup').count()==3 and not lp.locator('#run-mode option').first.inner_text().startswith('v0.'));lp.keyboard.press('Escape');lp.screenshot(path=str(REPORT/'desktop-local-v043.png'),full_page=True);lp.close()
  check('043-desktop-no-overflow',nooverflow(p));check('043-no-uncaught-browser-errors',not errors)
  p.close();b.close()
 (REPORT/'browser-v043.json').write_text(json.dumps({'checks':checks,'errors':errors,'navigation':'set_content + real local HTTP transport fixture; native navigation blocked by sandbox','externalModels':'NOT_RUN','apiReadsAndWrites':len(http_calls)},ensure_ascii=False,indent=2))
except Exception as e:
 (REPORT/'browser-v043.json').write_text(json.dumps({'checks':checks,'errors':errors,'failure':str(e)},ensure_ascii=False,indent=2));raise

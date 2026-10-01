"""Browser operates shipped viewer bytes with a LOCAL HTTP transport fixture.
The sandbox denies HTTP navigation. Real SSE wire behavior is tested separately in lab-http.test.mjs.
The fixture substitutes fetch with real HTTP calls and a JSON-cursor-to-stream adapter, not fake game results.
"""
import os,sys,json,time,pathlib,subprocess,urllib.request,urllib.error
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent; REPORT=R/'reports/v042'; REPORT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('GS_LAB_URL','http://127.0.0.1:4183'); checks=[];errors=[]

def check(name,value):
 checks.append({'name':name,'pass':bool(value)})
 print(name,bool(value),flush=True)
 (REPORT/'browser-progress.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
 if not value: raise AssertionError(name)

def http(req):
 url=req['url'];url=BASE+url if url.startswith('/') else url
 body=req.get('body');request=urllib.request.Request(url,data=body.encode() if body is not None else None,method=req.get('method','GET'),headers=req.get('headers',{}))
 try:
  with urllib.request.urlopen(request,timeout=30) as r:return {'status':r.status,'text':r.read().decode(),'headers':{'content-type':'application/json'}}
 except urllib.error.HTTPError as e:return {'status':e.code,'text':e.read().decode(),'headers':{'content-type':'application/json'}}

def cli(*args,actor='agent:browser-test'):
 p=subprocess.run(['node','bin/gs-lab.mjs',*args,'--url',BASE,'--actor',actor],cwd=R,text=True,capture_output=True,timeout=60)
 if p.returncode: return {'cliError':json.loads(p.stderr),'returncode':p.returncode}
 return json.loads(p.stdout)

BRIDGE=r"""
(()=>{
const originalFetch=window.fetch.bind(window);
history.replaceState=(_a,_b,url)=>{window.__fixtureURL=url;};
window.fetch=async(input,init={})=>{
 const url=String(input);if(!url.startsWith('/api/'))return originalFetch(input,init);
 if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');
 if(url.includes('/stream?')){
  let stopped=false,timer,ctl;const parsed=new URL(url,'http://fixture'),base=parsed.pathname.replace('/stream','/events');let after=Number(parsed.searchParams.get('after')||0);
  const stream=new ReadableStream({start(controller){ctl=controller;const pump=async()=>{if(stopped)return;try{const r=await __labHttp({url:base+'?after='+after+'&limit=250',method:'GET',headers:init.headers||{}});if(stopped)return;if(r.status!==200)throw Error(r.text);const data=JSON.parse(r.text);for(const e of data.events){after=e.seq;controller.enqueue(new TextEncoder().encode('id: '+e.seq+'\nevent: lab\ndata: '+JSON.stringify(e)+'\n\n'));}timer=setTimeout(pump,25);}catch(e){if(!stopped){stopped=true;controller.error(e);}}};pump();},cancel(){stopped=true;clearTimeout(timer);}});
  init.signal?.addEventListener('abort',()=>{if(!stopped){stopped=true;clearTimeout(timer);ctl.error(new DOMException('Aborted','AbortError'));}},{once:true});
  return new Response(stream,{status:200,headers:{'content-type':'text/event-stream'}});
 }
 const r=await __labHttp({url,method:init.method||'GET',headers:init.headers||{},body:init.body??null});if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');return new Response(r.text,{status:r.status,headers:r.headers});
};
})();
"""

def mount(browser,width=1512):
 page=browser.new_page(viewport={'width':width,'height':1100 if width>600 else 844},device_scale_factor=1)
 page.set_default_timeout(15000);page.on('pageerror',lambda e:errors.append(str(e)));page.expose_function('__labHttp',http)
 template=(R/'public/lab.html').read_text().replace('<link rel="stylesheet" href="/lab.css">','<style>'+(R/'public/lab.css').read_text()+'</style>').replace('<script src="/lab.js"></script>','<script>'+BRIDGE+'</script><script>'+(R/'public/lab.js').read_text().replace('</script','<\\/script')+'</script>')
 page.set_content(template,wait_until='load');page.wait_for_function('window.gsLabViewer && document.querySelector("#connection").textContent.includes("连接")',timeout=10000)
 return page

def select(page,run_id):
 page.locator('#refresh').click();page.locator('[data-run="'+run_id+'"]').click();page.wait_for_function('(id)=>window.gsLabViewer.snapshot()?.runId===id',arg=run_id,timeout=20000)

def wait_actions(page,n):page.wait_for_function('(n)=>window.gsLabViewer.snapshot()?.physicalActions===n',arg=n,timeout=20000)

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  created=cli('create','--kind','game','--scenario','guarded','--strategy','direct','--backend','jev','--generator','local','--allow-live','--max-requests','80','--deadline-ms','600000','--label','离线弃权测试 · 不是 Jev 实测')
  rid=created['runId'];page=mount(browser);select(page,rid)
  check('042-version-is-visible','0.4.2' in page.locator('header').inner_text())
  cli('start',rid,'--wait')
  page.wait_for_function('window.gsLabViewer.snapshot()?.status==="blocked"',timeout=25000)
  s=cli('status',rid)
  check('042-cli-and-viewer-same-blocked-world',page.evaluate('window.gsLabViewer.snapshot().world')==s['world'])
  check('042-no-physical-fallback',s['physicalActions']==0 and s['world']['revision']==1)
  check('042-exact-cause-main-status', 'decision_blocked:no_local_suitable_action' in page.locator('#stop-detail').inner_text())
  check('042-runtime-repair-budget-shown','修复次数 / 上限' in page.locator('#runtime').inner_text() and '1 / 3' in page.locator('#runtime').inner_text())
  check('042-organisation-vs-dispatch-separated','问题组织' in page.locator('#runtime').inner_text() and '请求调度' in page.locator('#runtime').inner_text())
  check('042-mock-source-honestly-labeled','测试替身' in page.locator('#run-tags').inner_text())
  page.locator('[data-tab="recovery"]').click()
  check('042-recovery-context-visible','gs/skill-task-context/v042' in page.locator('#detail-json').inner_text())
  check('042-abstention-response-visible','"choice": null' in page.locator('#detail-json').inner_text())
  check('042-stage-and-target-visible','resource-placement-stand' in page.locator('#detail-json').inner_text())
  page.locator('[data-tab="config"]').click()
  check('042-task-field-game-not-energy-fixture','不使用 energy 夹具' in page.locator('#detail-json').inner_text())
  check('042-terminal-block-cannot-start',page.locator('#start').is_disabled())
  check('042-no-overflow-desktop',page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
  page.locator('[data-tab="events"]').click();page.screenshot(path=str(REPORT/'desktop-recovery-v042.png'),full_page=True)
  current=cli('status',rid);page.locator('#refresh').click();time.sleep(.1)
  check('042-reading-does-not-trigger-repair',cli('status',rid)['requests']==current['requests'])
  report=cli('export',rid,'--out',str(REPORT/'browser-fault-fixture.json'))
  archive=json.loads((REPORT/'browser-fault-fixture.json').read_text())
  check('042-export-same-diagnostics',archive['state']['diagnostics']['latestFailure']['reason']==s['reason'])
  mobile=mount(browser,390);select(mobile,rid);mobile.locator('#stop-detail').wait_for(state='visible',timeout=10000)
  check('042-mobile-reason-readable',mobile.locator('#stop-detail').is_visible() and 'decision_blocked' in mobile.locator('#stop-detail').inner_text())
  check('042-no-overflow-mobile',mobile.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
  mobile.screenshot(path=str(REPORT/'mobile-recovery-v042.png'),full_page=True)
  mobile.close();page.close();browser.close()
 check('042-no-browser-uncaught-errors',len(errors)==0)
 (REPORT/'browser-v042.json').write_text(json.dumps({'checks':checks,'errors':errors,'transport':'set_content + real local HTTP, SSE delivered through existing polling-to-stream test bridge; no actual model','fixture':'offline child-abstention injection'},ensure_ascii=False,indent=2))
except Exception as e:
 (REPORT/'browser-v042.json').write_text(json.dumps({'checks':checks,'errors':errors,'failure':str(e)},ensure_ascii=False,indent=2));raise

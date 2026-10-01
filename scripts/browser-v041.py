"""Browser operates shipped viewer bytes with a LOCAL HTTP transport fixture.
The sandbox denies HTTP navigation. Real SSE wire behavior is tested separately in lab-http.test.mjs.
The fixture substitutes fetch with real HTTP calls and a JSON-cursor-to-stream adapter, not fake game results.
"""
import os,sys,json,time,pathlib,subprocess,urllib.request,urllib.error
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent; REPORT=R/'reports/v041'; REPORT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('GS_LAB_URL','http://127.0.0.1:4182'); checks=[];errors=[]

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
  # A real CLI process creates the authoritative game before any browser exists.
  created=cli('create','--kind','game','--scenario','guarded','--deadline-ms','300000');rid=created['runId']
  count=len(cli('list')['runs']);page=mount(browser);select(page,rid)
  check('viewer-uses-existing-run-not-second-engine',len(cli('list')['runs'])==count)
  check('viewer-default-read-only-for-agent-owned-run',page.locator('#step').is_disabled() and page.locator('#takeover').is_enabled())
  check('disabled-unconfigured-models',page.locator('#backend option[value="jev"]').evaluate('(o)=>o.disabled') and page.locator('#backend option[value="llm"]').evaluate('(o)=>o.disabled'))
  for _ in range(8):cli('step',rid)
  current=cli('status',rid);wait_actions(page,current['physicalActions'])
  check('cli-step-updates-browser-same-world',page.evaluate('window.gsLabViewer.snapshot().world')==current['world'])
  check('cli-step-shared-control-version',page.evaluate('window.gsLabViewer.snapshot().controlVersion')==current['controlVersion'])
  check('actual-skill-visible',page.evaluate('!!window.gsLabViewer.snapshot().activeSkill'))
  page.locator('[data-tab="skill"]').click();check('skill-contract-panel', 'gs/skill/v1' in page.locator('#detail-json').inner_text())
  page.locator('[data-tab="events"]').click();check('engine-events-visible',page.locator('.activity-item').count()>0)
  page.screenshot(path=str(REPORT/'desktop-agent-v041.png'),full_page=True)
  # Takeover invalidates the old external operator, while physical state is kept.
  page.locator('#takeover').click(timeout=6000);page.wait_for_function('window.gsLabViewer.snapshot()?.owner.kind==="human"')
  check('human-takeover-recorded',page.locator('#step').is_enabled())
  reject=cli('step',rid);check('old-agent-rejected-after-takeover',reject.get('cliError',{}).get('error',{}).get('code')=='NOT_CONTROLLER')
  old_turn=page.evaluate('window.gsLabViewer.snapshot().decisionSteps');page.locator('#step').click();page.wait_for_function('(n)=>window.gsLabViewer.snapshot()?.decisionSteps===n+1 && !window.gsLabViewer.snapshot().busy',arg=old_turn)
  check('human-control-same-authoritative-world',page.evaluate('window.gsLabViewer.snapshot().world')==cli('status',rid)['world'])
  page.locator('#checkpoint').click();page.wait_for_function('document.querySelector("#checkpoint-list").options.length>1')
  check('checkpoint-persisted-in-service',page.locator('#checkpoint-list option').count()==2)
  page.locator('#point-x').fill('0');page.locator('#point-y').fill('0');page.locator('#edit').click();page.wait_for_function('window.gsLabViewer.snapshot().interventions.length>0')
  check('interactive-edit-audited',cli('status',rid)['interventions'][-1]['origin']=='interactive')
  page.locator('#fork').click();page.wait_for_function('(old)=>window.gsLabViewer.snapshot()?.runId!==old',arg=rid)
  child=page.evaluate('window.gsLabViewer.snapshot()');check('fork-is-separate-run-with-lineage',child['lineage']['parentRunId']==rid and child['physicalActions']==0)
  check('fork-does-not-edit-parent',cli('status',rid)['world']['turn']==current['world']['turn']+1)
  # Ordinary UI creation can drive the SAME service and test lab, not a cloned local world.
  page.locator('#kind').select_option('judgment');page.locator('#task').select_option('energy');page.locator('#create').click();page.wait_for_function('(old)=>window.gsLabViewer.snapshot()?.runId!==old',arg=child['runId'])
  energy=page.evaluate('window.gsLabViewer.snapshot()');page.locator('#start').click();page.wait_for_function('window.gsLabViewer.snapshot()?.status==="succeeded"',timeout=20000)
  check('web-created-run-visible-to-cli',cli('status',energy['runId'])['status']=='succeeded')
  check('final-ui-and-api-identical',page.evaluate('window.gsLabViewer.snapshot().world')==cli('status',energy['runId'])['world'])
  check('request-and-external-counters',page.locator('#request-count').inner_text()=='2' and page.locator('#external').inner_text()=='0')
  page.locator('#replay').click();page.wait_for_function('window.gsLabViewer.readOnlyReplay()')
  before=cli('status',energy['runId']);page.locator('#replay-slider').fill('0');page.locator('#replay-slider').dispatch_event('input');check('replay-never-executes-an-action',cli('status',energy['runId'])['world']==before['world'])
  page.locator('#live').click();check('return-to-authoritative-state',not page.evaluate('window.gsLabViewer.readOnlyReplay()'))
  with page.expect_download() as dl:page.locator('#export').click()
  exported=REPORT/'browser-export.json';dl.value.save_as(str(exported));data=json.loads(exported.read_text())
  check('download-contains-real-run-and-trace',data['state']['runId']==energy['runId'] and data['trace']['actions']==2)
  # Disconnecting/reopening viewer does not own run lifetime.
  running=cli('create','--task','chain','--strategy','serial','--delay-ms','20','--deadline-ms','120000');rr=running['runId'];cli('start',rr);page.close();time.sleep(.25)
  check('closing-browser-does-not-cancel-run',cli('status',rr)['status'] in ['running','succeeded'])
  page=mount(browser);select(page,rr);page.wait_for_function('window.gsLabViewer.snapshot()?.status==="succeeded"',timeout=30000)
  check('reconnected-viewer-restores-latest-state',page.evaluate('window.gsLabViewer.snapshot().world')==cli('status',rr)['world'])
  check('reconnected-cursor-matches-server',page.evaluate('window.gsLabViewer.cursor()')==cli('status',rr)['lastSeq'])
  # Actual API network actions; rapid controls are checked with injected latency.
  r=cli('create','--task','chain','--delay-ms','60');select(page,r['runId']);cli('start',r['runId']);page.wait_for_function('window.gsLabViewer.snapshot()?.busy')
  page.locator('#takeover').click(timeout=6000);page.wait_for_function('window.gsLabViewer.snapshot()?.status==="paused" && !window.gsLabViewer.snapshot()?.busy')
  n=cli('status',r['runId'])['physicalActions'];time.sleep(.2);check('takeover-during-run-stops-next-quantum',cli('status',r['runId'])['physicalActions']==n)
  page.locator('#start').click();page.wait_for_function('window.gsLabViewer.snapshot()?.busy');page.locator('#cancel').click();page.wait_for_function('window.gsLabViewer.snapshot()?.status==="cancelled"')
  check('cancel-reaches-server-terminal-state',cli('status',r['runId'])['status']=='cancelled')
  page.locator('#import').set_input_files(str(exported));page.wait_for_function('window.gsLabViewer.snapshot()?.readOnly===true')
  check('imported-report-is-read-only',page.locator('#step').is_disabled() and page.locator('#fork').is_disabled())
  # Responsive observer renders actual data, no alternate mobile engine.
  mobile=mount(browser,390);select(mobile,rid);mobile.wait_for_timeout(100)
  check('mobile-no-horizontal-overflow',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  check('mobile-world-visible',mobile.locator('#world').is_visible())
  mobile.screenshot(path=str(REPORT/'mobile-agent-v041.png'),full_page=True)
  check('no-unhandled-browser-errors',not errors)
  browser.close()
 (REPORT/'browser-v041.json').write_text(json.dumps({'checks':checks,'errors':errors,'transport':'shipped HTML/CSS/JS + real local HTTP fixture; SSE stream emulated from real event cursor responses; actual SSE tested separately','navigation':'real localhost navigation attempted, blocked by sandbox administrator','liveModels':'NOT_RUN'},ensure_ascii=False,indent=2))
except Exception:
 (REPORT/'browser-v041.json').write_text(json.dumps({'checks':checks,'errors':errors,'failed':True},ensure_ascii=False,indent=2));raise

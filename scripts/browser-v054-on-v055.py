"""v0.5 observed shared-session UI. Sandbox navigation limitation explicitly recorded.
Delivered bytes + loopback real HTTP bridge, synthetic model fixtures disclosed.
"""
import os,json,time,pathlib,subprocess,urllib.request,urllib.error,socket,threading
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent;D=R/'reports/v055/regression-v054';D.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];requests=[];processes=[]
def check(n,v):
 checks.append({'name':n,'pass':bool(v)});print(n,bool(v),flush=True)
 (D/'browser-progress.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
 if not v:raise AssertionError(n)
def free():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def start(script):
 port=free();base=f'http://127.0.0.1:{port}';env={**os.environ,'PORT':str(port),'TYPESAFE_API_KEY':'','LLM_API_KEY':'','LLM_MODEL':'','LLM_URL':'','GS_LAB_OUTPUT_DIR':str(D/f'ui-exports-{port}')}
 p=subprocess.Popen(['node',script],cwd=R,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE);processes.append(p)
 for _ in range(100):
  try:
   with urllib.request.urlopen(base+'/api/status',timeout=1):return base
  except Exception:time.sleep(.03)
 raise RuntimeError('server not ready')
def http(req,base):
 requests.append((req['url'],req.get('method','GET')));data=req.get('body');url=base+req['url'] if req['url'].startswith('/') else req['url']
 q=urllib.request.Request(url,data=data.encode() if data is not None else None,method=req.get('method','GET'),headers=req.get('headers',{}))
 try:
  with urllib.request.urlopen(q,timeout=60) as r:return {'status':r.status,'text':r.read().decode(),'headers':{'content-type':'application/json'}}
 except urllib.error.HTTPError as e:return {'status':e.code,'text':e.read().decode(),'headers':{'content-type':'application/json'}}
def cli(base,*args,actor='agent:adaptation-fixture'):
 p=subprocess.run(['node','bin/gs-lab.mjs',*args,'--url',base,'--actor',actor],cwd=R,capture_output=True,text=True,timeout=90)
 if p.returncode:raise RuntimeError(p.stderr)
 return json.loads(p.stdout)
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
def mount(browser,base,width=1440):
 p=browser.new_page(viewport={'width':width,'height':1000 if width>600 else 844});p.set_default_timeout(15000);p.on('pageerror',lambda e:errors.append(str(e)));p.expose_function('__labHttp',lambda req:http(req,base))
 html=(R/'public/lab.html').read_text().replace('<link rel="stylesheet" href="/lab.css">','<style>'+(R/'public/lab.css').read_text()+'</style>').replace('<script src="/lab.js"></script>','<script>'+BRIDGE+'</script><script>'+(R/'public/lab.js').read_text().replace('</script','<\\/script')+'</script>')
 p.set_content(html);p.wait_for_function('window.gsLabViewer && document.querySelector("#connection").textContent.includes("连接")');return p
def select(p,rid):
 if not p.locator('#list-page').is_visible():p.locator('#back-list').click()
 p.locator('#run-search').fill('');p.locator('#refresh').click();p.locator('[data-run="'+rid+'"]').click();p.wait_for_function('(id)=>window.gsLabViewer.snapshot()?.runId===id&&window.gsLabViewer.view().connected&&document.querySelector("#run-page").dataset.runId===id',arg=rid)
def snapshot(p):return p.evaluate('window.gsLabViewer.snapshot()')
def nooverflow(p):return p.evaluate('document.documentElement.scrollWidth<=innerWidth+1')

try:
 base=start('scripts/serve-adaptation-fixture-v054.mjs');ids=json.loads(http({'url':'/fixture-ids'},base)['text'])
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  native=b.new_page();native_method=''
  try:
   native.goto(base+'/lab',timeout=8000);native.wait_for_selector('#list-title',timeout=4000);native_method='native navigation smoke passed'
  except Exception as ex:native_method=str(ex).split('\n')[0]
  native.close()
  p=mount(b,base);select(p,ids['visible'])
  check('current-version','v0.5.5' in p.locator('header').inner_text())
  check('viewing-does-not-trigger-G',len(json.loads(http({'url':'/fixture-ids'},base)['text'])['calls'])==0)
  check('ready-zero-requests',snapshot(p)['requests']==0)
  check('ready-G-first','先由 G' in p.locator('#run-page').inner_text())
  result=[];failed=[]
  def step_visible():
   try:result.append(cli(base,'step',ids['visible']))
   except Exception as e:failed.append(str(e))
  th=threading.Thread(target=step_visible);th.start()
  p.wait_for_function('window.gsLabViewer.generation().some(x=>x.content.length>0)')
  check('startup-label','开局环境研判' in p.locator('#generation-meta').inner_text())
  check('no-actions-during-G',snapshot(p)['physicalActions']==0)
  check('no-S-before-G-installed',snapshot(p)['diagnostics']['sCalls']==0)
  check('world-energy-unchanged',snapshot(p)['world']['energy']==98)
  check('world-revision-unchanged',snapshot(p)['worldRevision']=='1')
  check('four-tabs-preserved',p.locator('[data-tab]').count()==4)
  check('desktop-no-overflow',nooverflow(p))
  p.screenshot(path=str(D/'desktop-same-layer-startup.png'),full_page=True)
  q=mount(b,base,390);select(q,ids['visible']);q.wait_for_function('window.gsLabViewer.generation().some(x=>x.content.length>0)')
  check('mobile-same-run',snapshot(q)['runId']==ids['visible'])
  check('mobile-no-overflow',nooverflow(q))
  check('observation-does-not-duplicate-generation',len(json.loads(http({'url':'/fixture-ids'},base)['text'])['calls'])==1)
  q.screenshot(path=str(D/'mobile-same-layer-startup.png'),full_page=True)
  cli(base,'pause',ids['visible']);http({'url':'/fixture-release/visible'},base);th.join(timeout=15)
  check('CLI-step-returned',not failed and len(result)==1)
  p.wait_for_function('window.gsLabViewer.snapshot().physicalActions===1&&window.gsLabViewer.snapshot().status==="paused"')
  check('direct-initialization-ready',snapshot(p)['diagnostics']['initialization']['status']=='ready')
  check('one-G-one-action-S',snapshot(p)['diagnostics']['gCalls']==1 and snapshot(p)['diagnostics']['sCalls']==1)
  check('no-automatic-meta-approval',snapshot(p)['diagnostics']['metaCalls']==0)
  check('display-control-mode',snapshot(p)['diagnostics']['controlMode']=='same-layer-first/v054')
  check('completed-stream-kept',p.evaluate('window.gsLabViewer.generation()[0].status')=='complete')
  p.locator('#tab-diagnostics').click()
  check('same-layer-mode-visible','same-layer-first/v054' in p.locator('#diagnostics-content').inner_text())
  check('scope-policy-visible','explicit-scope/v054' in p.locator('#diagnostics-content').inner_text())
  p.screenshot(path=str(D/'desktop-same-layer-diagnostics.png'),full_page=True)
  cli(base,'step',ids['visible']);p.wait_for_function('window.gsLabViewer.snapshot().physicalActions===2')
  check('resume-does-not-repeat-startup',snapshot(p)['diagnostics']['gCalls']==1)
  select(p,ids['returning']);cli(base,'step',ids['returning']);p.wait_for_function('window.gsLabViewer.snapshot().physicalActions===1')
  d=snapshot(p)['diagnostics'];check('child-returns-to-original-G',d['gCalls']==4 and d['sCalls']==2)
  check('one-child-S-one-action-S',d['metaCalls']==1)
  check('depth-exhaustion-is-not-root-stop',snapshot(p)['status'] not in ['blocked','fault','stopped'])
  check('child-failure-evidence-kept',any(x['result']['reason']=='subproblem_depth_exhausted' for x in d['subproblems']))
  check('child-answer-unverified',any(x['result']['status']=='answered' and x['result']['epistemicStatus']=='model-judgment-not-world-fact' for x in d['subproblems']))
  check('root-world-only-one-action',snapshot(p)['world']['turn']==1 and snapshot(p)['world']['energy']==97)
  check('child-stream-marked',any(x['purpose']=='subproblem' for x in p.evaluate('window.gsLabViewer.generation()')))
  p.locator('#tab-overview').click();p.screenshot(path=str(D/'desktop-child-return-overview.png'),full_page=True)
  p.locator('#tab-diagnostics').click();check('child-records-entry','只读子问题返回记录' in p.locator('#diagnostics-content').inner_text());check('child-readable-summary',p.locator('#subproblem-results').is_visible())
  p.screenshot(path=str(D/'desktop-child-return-diagnostics.png'),full_page=True)
  select(q,ids['returning']);q.locator('#tab-diagnostics').click();check('child-mobile-no-overflow',nooverflow(q));q.screenshot(path=str(D/'mobile-child-return.png'),full_page=True)
  exported=cli(base,'export',ids['returning']);check('export-same-world',exported['state']['worldRevision']==snapshot(p)['worldRevision'])
  check('export-has-child-events',any(e.get('type')=='engine' and e.get('data',{}).get('event',{}).get('type')=='subproblem_return' for e in exported['events']))
  select(p,ids['conflict']);cli(base,'step',ids['conflict']);p.wait_for_function('window.gsLabViewer.snapshot().status==="blocked"')
  check('contradiction-returned-to-G',snapshot(p)['diagnostics']['gCalls']==3)
  check('contradiction-not-force-run',snapshot(p)['physicalActions']==0 and snapshot(p)['diagnostics']['sCalls']==0)
  check('local-budget-not-depth',snapshot(p)['reason']=='adaptation_budget_exhausted')
  check('blocked-no-resume',not p.locator('#start').is_visible())
  p.locator('#tab-diagnostics').click();check('precise-condition-error-visible','fixed_scope_excludes_goal' in p.locator('#diagnostics-content').inner_text() and '固定候选' in p.locator('#diagnostics-content').inner_text())
  p.screenshot(path=str(D/'desktop-candidate-contradiction.png'),full_page=True)
  check('no-browser-errors',not errors)
  q.close();p.close();b.close()
 (D/'browser-v054.json').write_text(json.dumps({'checks':checks,'errors':errors,'nativeNavigation':native_method,'method':'delivered HTML bytes + real loopback HTTP bridge; native HTTP/SSE covered by Node tests','models':'NOT_RUN; explicit MOCK G/S, no task solver'},ensure_ascii=False,indent=2))
except Exception as e:
 (D/'browser-v054.json').write_text(json.dumps({'checks':checks,'errors':errors,'failure':str(e)},ensure_ascii=False,indent=2));raise
finally:
 for p in processes:p.terminate()
 for p in processes:
  try:p.wait(timeout=3)
  except subprocess.TimeoutExpired:p.kill()

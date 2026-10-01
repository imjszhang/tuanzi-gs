"""v0.5 observed shared-session UI. Sandbox navigation limitation explicitly recorded.
Delivered bytes + loopback real HTTP bridge, synthetic model fixtures disclosed.
"""
import os,json,time,pathlib,subprocess,urllib.request,urllib.error,socket,threading
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent;D=R/'reports/v051/regression-v05';D.mkdir(parents=True,exist_ok=True)
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
def cli(base,*args,actor='agent:v05-ui'):
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
 base=start('server.mjs');mock=start('scripts/serve-ui-fixture-v05.mjs');rid=cli(base,'create','--kind','game','--scenario','guarded','--strategy','direct','--max-g-calls','4','--deadline-ms','600000')['runId']
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  p=mount(b,base);p.locator('.run-row').first.wait_for();check('list-first-no-form-wall',p.locator('#list-page').is_visible() and not p.locator('#create-dialog').is_visible());check('version-05','v0.5.1' in p.locator('header').inner_text());check('local-controller-not-presented-as-model-or-solver','非求解器' in p.locator('#run-list').inner_text() or '轮换夹具' in p.locator('#run-list').inner_text())
  n=len(cli(base,'list')['runs']);p.locator('#new-run').click();check('default-controller-is-adaptive',p.locator('#controller').input_value()=='adaptive');check('offline-source-is-explicit','不保证通关' in p.locator('#preset').inner_text());p.locator('#advanced-config summary').click();check('G-budget-depth-controls',p.locator('#max-g').input_value()=='12' and p.locator('#max-depth').input_value()=='2');check('no-credentials-live-presets-disabled',p.locator('#preset option[value="live"]').evaluate('(e)=>e.disabled'));p.locator('#controller').select_option('hierarchy');check('reference-controller-forces-offline',p.locator('#backend').input_value()=='rule' and p.locator('#generator').input_value()=='local');p.keyboard.press('Escape');check('cancel-draft-no-run-no-model',len(cli(base,'list')['runs'])==n)
  select(p,rid);check('observer-does-not-own-agent-run',p.locator('#takeover').is_visible() and not p.locator('#step').is_visible());check('info-policy-in-overview','无参考解' in p.locator('#run-tags').inner_text());check('initial-state-agrees-cli',snapshot(p)['world']==cli(base,'status',rid)['world'])
  for _ in range(35):
   latest=cli(base,'step',rid)['state']
   if latest.get('diagnostics',{}).get('gCalls',0)>0:break
  p.wait_for_function('(n)=>window.gsLabViewer.snapshot().physicalActions>=n',arg=latest['physicalActions']);check('CLI-writes-visible-on-same-world',snapshot(p)['world']==cli(base,'status',rid)['world']);check('same-run-records-G-adjustment',snapshot(p)['diagnostics']['gCalls']>0)
  p.locator('#tab-diagnostics').click();check('diagnostic-explains-isolation','参考解隔离' in p.locator('#diagnostics-content').inner_text());check('before-after-adjustments-accessible','已提交的调整' in p.locator('#diagnostics-content').inner_text());p.locator('#diagnostics-content [data-evidence]').first.click();check('full-adaptation-evidence-available','no-reference/v05' in p.locator('#evidence-json').inner_text());p.keyboard.press('Escape');p.screenshot(path=str(D/'desktop-diagnostics-v05.png'),full_page=True)
  p.locator('#tab-config').click();check('current-config-uses-correct-version','0.5.1' in p.locator('#config-content').inner_text() and 'v0.4.3 仅修改界面' not in p.locator('#config-content').inner_text());p.locator('#tab-decision').click();check('decision-candidates-render',p.locator('.candidate-row').count()>0);p.locator('#tab-overview').click();p.screenshot(path=str(D/'desktop-overview-v05.png'),full_page=True);check('desktop-no-overflow',nooverflow(p))
  before=cli(base,'status',rid);p.locator('#replay').click();p.wait_for_function('window.gsLabViewer.readOnlyReplay()');p.locator('#replay-slider').fill('0');p.locator('#replay-slider').dispatch_event('input');check('replay-is-time-consistent',p.evaluate('window.gsLabViewer.displayedSnapshot().physicalActions')==0);check('replay-did-not-run-G',cli(base,'status',rid)['requests']==before['requests']);p.locator('#live').click()
  p.locator('#takeover').click();p.locator('#confirm-action').click();p.wait_for_function('window.gsLabViewer.snapshot().owner.kind==="human"');check('takeover-and-old-agent-rejected',snapshot(p)['owner']['kind']=='human');p.locator('#step').click();p.wait_for_function('(n)=>window.gsLabViewer.snapshot().physicalActions>n',arg=before['physicalActions']);check('human-step-updates-shared-state',snapshot(p)['world']==cli(base,'status',rid)['world'])
  p.locator('#more-open').click();p.locator('#export').click();p.wait_for_timeout(100);check('no-external-requests-in-local-run',snapshot(p)['externalRequests']==0)
  mobile=mount(b,base,390);select(mobile,rid);mobile.locator('#tab-overview').click();mobile.wait_for_timeout(80);mobile.screenshot(path=str(D/'mobile-debug.png'),full_page=True);check('mobile-map-visible',mobile.locator('#world').is_visible());check('mobile-no-overflow',nooverflow(mobile));mobile.screenshot(path=str(D/'mobile-overview-v05.png'),full_page=True);mobile.close()
  ids=json.loads(http({'url':'/fixture-ids'},mock)['text']);q=mount(b,mock);select(q,ids['recovery']);
  result=[]
  th=threading.Thread(target=lambda:result.append(cli(mock,'step',ids['recovery'],actor='agent:ui-fixture')));th.start();q.wait_for_function('window.gsLabViewer.snapshot().diagnostics?.phase==="adapting"');check('live-G-phase-with-world-unadvanced',snapshot(q)['physicalActions']==0);q.wait_for_function('window.gsLabViewer.snapshot().status==="succeeded"');th.join();check('same-session-recovers-after-abstention',snapshot(q)['diagnostics']['gCalls']==1 and snapshot(q)['physicalActions']==1);check('mock-source-never-claimed-real-model','测试' in q.locator('#source-caption').inner_text() or '测试' in q.locator('#external-label').inner_text());check('meta-selection-counted',snapshot(q)['diagnostics']['metaCalls']==1)
  q.locator('#tab-diagnostics').click();check('repair-difference-audit','已提交的调整' in q.locator('#diagnostics-content').inner_text());q.locator('#tab-overview').click();q.screenshot(path=str(D/'synthetic-recovery-v05.png'),full_page=True)
  select(q,ids['blocked']);cli(mock,'step',ids['blocked'],actor='agent:ui-fixture');q.wait_for_function('window.gsLabViewer.snapshot().status==="blocked"');check('persistent-abstention-hits-bounded-recovery',snapshot(q)['reason']=='adaptation_depth_exhausted' and snapshot(q)['diagnostics']['gCalls']==2);check('terminal-block-is-not-resumable',not q.locator('#start').is_visible());check('first-none-did-not-immediately-end-root',snapshot(q)['diagnostics']['sCalls']==3)
  check('no-browser-errors',not errors);q.close();p.close();b.close()
 (D/'browser-v05.json').write_text(json.dumps({'checks':checks,'errors':errors,'nativeNavigation':'attempted: ERR_BLOCKED_BY_ADMINISTRATOR','method':'delivered HTML + actual loopback HTTP bridge; SSE protocol separately tested natively in Node','models':'NOT_RUN; synthetic fixtures explicitly marked','httpCalls':len(requests)},ensure_ascii=False,indent=2))
except Exception as e:
 (D/'browser-v05.json').write_text(json.dumps({'checks':checks,'errors':errors,'failure':str(e)},ensure_ascii=False,indent=2));raise
finally:
 for p in processes:p.terminate()
 for p in processes:
  try:p.wait(timeout=3)
  except subprocess.TimeoutExpired:p.kill()

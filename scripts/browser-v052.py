"""v0.5 observed shared-session UI. Sandbox navigation limitation explicitly recorded.
Delivered bytes + loopback real HTTP bridge, synthetic model fixtures disclosed.
"""
import os,json,time,pathlib,subprocess,urllib.request,urllib.error,socket,threading
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent;D=R/'reports/v052/browser';D.mkdir(parents=True,exist_ok=True)
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
def cli(base,*args,actor='agent:stream-fixture'):
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
 base=start('scripts/serve-format-fixture-v052.mjs');ids=json.loads(http({'url':'/fixture-ids'},base)['text'])
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  native=b.new_page();native_method=''
  try:
   native.goto(base+'/lab',timeout=8000);native.wait_for_selector('#list-title',timeout=4000);native_method='native navigation smoke passed'
  except Exception as ex:native_method=str(ex).split('\n')[0]
  native.close()
  p=mount(b,base);select(p,ids['visible']);results=[];th=threading.Thread(target=lambda:results.append(cli(base,'step',ids['visible'])));th.start()
  p.wait_for_function('window.gsLabViewer.generation().length===2 && window.gsLabViewer.generation()[1].reasoning.length>100')
  check('format-repair-visible-before-completion','格式纠错' in p.locator('#generation-meta').inner_text())
  check('no-physical-action-before-corrected-output',snapshot(p)['physicalActions']==0)
  check('original-error-retained',p.evaluate('window.gsLabViewer.generation()[0].status')=='invalid')
  check('same-world-during-repair',snapshot(p)['worldRevision']=='1')
  check('main-status-not-strategic-retry','修正输出' in p.locator('#process-status-title').inner_text())
  check('four-tabs-kept',p.locator('[data-tab]').count()==4)
  p.locator('#tab-diagnostics').click();p.wait_for_selector('#output-validation')
  check('exact-pointer-visible','/actionFrame' in p.locator('#output-validation').inner_text())
  check('format-not-strategy-failure-label','不是策略失败' in p.locator('#output-validation').inner_text())
  check('separate-accounting-visible','有效修订尝试' in p.locator('#diagnostics-content').inner_text() and '输出格式纠错' in p.locator('#diagnostics-content').inner_text())
  p.screenshot(path=str(D/'desktop-format-diagnostics.png'),full_page=True)
  p.locator('#tab-overview').click();p.screenshot(path=str(D/'desktop-format-overview.png'),full_page=True)
  p.locator('#generation-expand').click();check('history-labels-distinguish-repair','格式纠错' in p.locator('#generation-select').inner_text());p.keyboard.press('Escape')
  q=mount(b,base,390);select(q,ids['visible']);q.wait_for_function('window.gsLabViewer.generation().length===2');q.locator('#tab-diagnostics').click();q.wait_for_selector('#output-validation')
  check('mobile-no-overflow',nooverflow(q));q.screenshot(path=str(D/'mobile-format-diagnostics.png'),full_page=True)
  http({'url':'/fixture-release/visible'},base);th.join(timeout=10);p.wait_for_function('window.gsLabViewer.snapshot().status==="succeeded"')
  check('correction-then-meta-then-real-action',snapshot(p)['physicalActions']==1 and snapshot(p)['diagnostics']['metaCalls']==1)
  check('effective-revision-not-spent-by-format',snapshot(p)['diagnostics']['outputAccounting']['revisionAttempts']==1)
  check('correction-count-one',snapshot(p)['diagnostics']['outputAccounting']['formatRepairs']==1)
  check('stream-history-retained',p.evaluate('window.gsLabViewer.generation().map(x=>x.status)')==['invalid','complete'])
  select(p,ids['invalid']);r=[];t=threading.Thread(target=lambda:r.append(cli(base,'step',ids['invalid'])));t.start();p.wait_for_function('window.gsLabViewer.generation().length===2 && window.gsLabViewer.generation()[1].content.length>0');http({'url':'/fixture-release/invalid'},base);t.join(timeout=10)
  p.wait_for_function('window.gsLabViewer.snapshot().status==="blocked"');check('format-exhaustion-distinct-reason',snapshot(p)['reason']=='output_format_repair_exhausted');check('invalid-output-zero-meta',snapshot(p)['diagnostics']['metaCalls']==0);check('invalid-output-never-executed',snapshot(p)['physicalActions']==0)
  p.locator('#tab-diagnostics').click();check('predicate-exact-path', '/proposals/0/program/stages/0/until/0/field' in p.locator('#output-validation').inner_text())
  check('desktop-no-overflow',nooverflow(p));check('no-page-errors',not errors)
  q.close();p.close();b.close()
 (D/'browser-v052.json').write_text(json.dumps({'checks':checks,'errors':errors,'nativeNavigation':native_method,'method':'delivered bytes + real loopback HTTP bridge; see separate production HTTP/CLI test','models':'NOT_RUN; scripted format fixtures only'},ensure_ascii=False,indent=2))
except Exception as e:
 (D/'browser-v052.json').write_text(json.dumps({'checks':checks,'errors':errors,'failure':str(e)},ensure_ascii=False,indent=2));raise
finally:
 for p in processes:p.terminate()
 for p in processes:
  try:p.wait(timeout=3)
  except subprocess.TimeoutExpired:p.kill()

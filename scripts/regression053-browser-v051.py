"""v0.5 observed shared-session UI. Sandbox navigation limitation explicitly recorded.
Delivered bytes + loopback real HTTP bridge, synthetic model fixtures disclosed.
"""
import os,json,time,pathlib,subprocess,urllib.request,urllib.error,socket,threading
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent;D=R/'reports/v053/regression-v051';D.mkdir(parents=True,exist_ok=True)
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
 base=start('scripts/serve-stream-fixture-v051.mjs');ids=json.loads(http({'url':'/fixture-ids'},base)['text'])
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  native=b.new_page();native_method=''
  try:
   native.goto(base+'/lab',timeout=8000);native.wait_for_selector('#list-title',timeout=4000);native_method='native navigation passed'
  except Exception as ex:native_method=str(ex).split('\n')[0]
  native.close()
  p=mount(b,base);select(p,ids['visible']);check('no-stream-panel-before-G',not p.locator('#generation-card').is_visible());before=snapshot(p)['requests']
  result=[];th=threading.Thread(target=lambda:result.append(cli(base,'step',ids['visible'])));th.start()
  p.wait_for_function('window.gsLabViewer.generation().some(g=>g.reasoning.length>100)');check('visible-before-completion',snapshot(p)['physicalActions']==0 and th.is_alive());check('panel-within-current-GS-process',p.locator('.process-panel #generation-card').count()==1);check('four-tabs-unchanged',p.locator('[data-tab]').count()==4);check('mock-provenance-visible','测试替身' in p.locator('#generation-mode').inner_text());check('preview-not-valid-policy','未生效' in p.locator('.generation-disclaimer').inner_text())
  p.locator('#generation-expand').click();check('expand-dialog',p.locator('#generation-dialog').is_visible());p.wait_for_function('document.querySelector("#generation-reasoning").textContent.length>550');check('reasoning-is-upstream-text','离线流式协议夹具' in p.locator('#generation-reasoning').inner_text());check('copy-exposed-text-only',p.locator('#generation-copy').is_visible());
  p.locator('#generation-reasoning').evaluate('(e)=>{e.scrollTop=0;}');y=p.locator('#generation-reasoning').evaluate('(e)=>e.scrollTop');p.wait_for_timeout(200);check('reader-scroll-not-yanked',p.locator('#generation-reasoning').evaluate('(e)=>e.scrollTop')==y)
  p.locator('#generation-detail-follow').click();check('follow-latest-restores-scroll',p.locator('#generation-reasoning').evaluate('(e)=>e.scrollTop>0'))
  p.wait_for_function('window.gsLabViewer.generation()[0].content.length>0');check('reasoning-and-content-separate','proposals' in p.locator('#generation-content').inner_text() and 'proposals' not in p.locator('#generation-reasoning').inner_text())
  p.screenshot(path=str(D/'desktop-stream-detail.png'),full_page=False);p.keyboard.press('Escape');p.locator('#generation-reasoning-tab').click();check('reasoning-tab-switch',p.locator('#generation-reasoning-tab').get_attribute('aria-selected')=='true');p.locator('#generation-reasoning-tab').focus();p.screenshot(path=str(D/'desktop-stream-overview.png'),full_page=True);check('desktop-no-overflow',nooverflow(p));
  q=mount(b,base);select(q,ids['visible']);q.wait_for_function('window.gsLabViewer.generation().some(g=>g.content.length>0)');check('late-observer-sees-prefix',q.evaluate('window.gsLabViewer.generation()[0].reasoning.length')>550);check('viewers-dont-create-requests',json.loads(http({'url':'/fixture-ids'},base)['text'])['calls']==1)
  q.evaluate('window.__disconnect=true');q.wait_for_function('!window.gsLabViewer.view().connected',timeout=7000);check('disconnect-retains-text',q.evaluate('window.gsLabViewer.generation()[0].reasoning.length')>550);q.evaluate('window.__disconnect=false');q.wait_for_function('window.gsLabViewer.view().connected');check('reconnect-no-duplicate-deltas',q.evaluate('window.gsLabViewer.generation()[0].reasoning')==p.evaluate('window.gsLabViewer.generation()[0].reasoning'))
  mobile=mount(b,base,390);select(mobile,ids['visible']);mobile.wait_for_function('window.gsLabViewer.generation().some(g=>g.reasoning.length>0)');mobile.locator('#generation-reasoning-tab').click();check('mobile-no-horizontal-overflow',nooverflow(mobile));mobile.screenshot(path=str(D/'mobile-stream-overview.png'),full_page=True);mobile.locator('#generation-expand').click();check('mobile-dialog-both-channels',mobile.locator('#generation-reasoning').is_visible() and mobile.locator('#generation-content').is_visible());check('mobile-dialog-no-overflow',nooverflow(mobile));mobile.screenshot(path=str(D/'mobile-stream-detail.png'),full_page=True);mobile.keyboard.press('Escape')
  http({'url':'/fixture-release/visible'},base);th.join(timeout=8);p.wait_for_function('window.gsLabViewer.snapshot().status==="succeeded"');p.wait_for_function('window.gsLabViewer.generation()[0]?.status==="complete"');check('completed-output-stays-visible',p.locator('#generation-card').is_visible() and p.evaluate('window.gsLabViewer.generation()[0].status')=='complete');check('complete-only-after-valid-content',result[0]['state']['physicalActions']==1);check('usage-tail-visible',p.evaluate('window.gsLabViewer.generation()[0].usage.inputTokens')==99)
  p.locator('#tab-decision').click();p.locator('#generation-history-open').click();check('G-history-in-existing-judgment-tab',p.locator('#generation-dialog').is_visible());p.keyboard.press('Escape');p.locator('#tab-overview').click();p.locator('#replay').click();p.locator('#replay-slider').fill('0');p.locator('#replay-slider').dispatch_event('input');check('past-replay-no-future-G',not p.locator('#generation-card').is_visible());p.locator('#replay-slider').fill(p.locator('#replay-slider').get_attribute('max'));p.locator('#replay-slider').dispatch_event('input');check('terminal-replay-shows-recorded-output',p.locator('#generation-card').is_visible());check('replay-is-readonly',not p.locator('#start').is_visible());p.locator('#live').click()
  for name in ['no-reason','error','cancel']:
   select(p,ids[name]);outputs=[];t=threading.Thread(target=lambda n=name:outputs.append(cli(base,'step',ids[n])));t.start();p.wait_for_function('window.gsLabViewer.generation().some(g=>g.content.length>0)');p.locator('#generation-expand').click()
   if name=='no-reason':
    http({'url':'/fixture-release/'+name},base);t.join(timeout=8);p.wait_for_function('window.gsLabViewer.generation()[0].status==="complete"');check('no-reasoning-clear-label','未返回可见推理' in p.locator('#generation-reasoning').inner_text())
   elif name=='error':
    http({'url':'/fixture-release/'+name},base);t.join(timeout=8);p.wait_for_function('window.gsLabViewer.generation()[0].status==="failed"');check('partial-output-on-error','proposals' in p.locator('#generation-content').inner_text());check('error-status-explicit',p.locator('#generation-detail-error').is_visible());check('error-no-physical-execution',snapshot(p)['physicalActions']==0)
   else:
    cli(base,'cancel',ids[name]);http({'url':'/fixture-release/'+name},base);t.join(timeout=8);p.wait_for_function('window.gsLabViewer.generation()[0].status==="aborted"');check('cancel-marked-not-complete','中断' in p.locator('#generation-detail-status').inner_text());check('cancel-no-execution',snapshot(p)['physicalActions']==0)
   p.keyboard.press('Escape')
  select(p,ids['long']);check('run-switch-clears-previous-text',p.evaluate('window.gsLabViewer.generation().length')==0 and not p.locator('#generation-card').is_visible());check('no-browser-errors',not errors);mobile.close();q.close();p.close();b.close()
 (D/'browser-v051.json').write_text(json.dumps({'checks':checks,'errors':errors,'nativeNavigation':native_method,'method':'delivered HTML + loopback HTTP bridge; upstream and Node SSE are real loopback transports','models':'NOT_RUN; all text from MOCK_ONLY fixture','httpCalls':len(requests)},ensure_ascii=False,indent=2))
except Exception as e:
 (D/'browser-v051.json').write_text(json.dumps({'checks':checks,'errors':errors,'failure':str(e)},ensure_ascii=False,indent=2));raise
finally:
 for p in processes:p.terminate()
 for p in processes:
  try:p.wait(timeout=3)
  except subprocess.TimeoutExpired:p.kill()

"""v0.5 observed shared-session UI. Sandbox navigation limitation explicitly recorded.
Delivered bytes + loopback real HTTP bridge, synthetic model fixtures disclosed.
"""
import os,json,time,pathlib,subprocess,urllib.request,urllib.error,socket,threading
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent;D=R/'reports/v055/browser';D.mkdir(parents=True,exist_ok=True)
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
 base=start('scripts/serve-retry-fixture-v055.mjs');ids=json.loads(http({'url':'/fixture-ids'},base)['text']);rid=ids['visible']
 # Real stdio MCP client, not browser-only debugging functions.
 mcp=subprocess.Popen(['node','bin/gs-lab-mcp.mjs','--url',base,'--allow-control','--allow-live','--exports',str(D/f"ui-exports-{base.rsplit(':',1)[1]}")],cwd=R,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1);processes.append(mcp)
 seq=[0]
 def call(method,params={}):
  seq[0]+=1;i=seq[0];mcp.stdin.write(json.dumps({'jsonrpc':'2.0','id':i,'method':method,'params':params})+'\n');mcp.stdin.flush();r=json.loads(mcp.stdout.readline());assert r['id']==i;return r
 def tool(name,args={}):
  r=call('tools/call',{'name':name,'arguments':args})['result'];assert not r.get('isError'),r;return json.loads(r['content'][0]['text'])
 call('initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'Browser-MCP-wire-check','version':'1'}})
 mcp.stdin.write(json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'})+'\n');mcp.stdin.flush()
 check('real-stdio-MCP-project-info',tool('project_info')['version']=='0.5.5')
 check('MCP-read-only-before-command',json.loads(tool('lab_snapshot',{'runId':rid,'pointer':'/requests'})['text'])==0)
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  native=b.new_page()
  try:
   native.goto(base+'/lab',timeout=5000);native.wait_for_selector('#list-title',timeout=2000);native_result='native navigation smoke passed'
  except Exception as e:native_result=str(e).split('\n')[0]
  native.close();p=mount(b,base);select(p,rid)
  check('version','v0.5.5' in p.locator('header').inner_text())
  check('viewing-no-model-call',snapshot(p)['requests']==0)
  start_result=tool('lab_command',{'runId':rid,'commandId':'mcp-start','expectedControlVersion':0,'action':'start'})
  check('MCP-start-same-run',start_result['state']['runId']==rid)
  p.wait_for_function('window.gsLabViewer.snapshot()?.transportRetry?.state==="waiting"')
  p.locator('#retry-card').wait_for(state='visible')
  check('waiting-retry-visible',p.locator('#retry-card').is_visible())
  check('retry-not-semantic-none','等待重试' in p.locator('#retry-title').inner_text())
  check('world-held',snapshot(p)['physicalActions']==0 and snapshot(p)['world']['energy']==98)
  check('failed-attempt-counted',snapshot(p)['requests']==2)
  check('same-policy-retained',snapshot(p)['diagnostics']['gCalls']==1)
  check('desktop-no-overflow',nooverflow(p))
  p.screenshot(path=str(D/'desktop-retry-waiting.png'),full_page=True)
  q=mount(b,base,390);select(q,rid)
  check('mobile-same-world',snapshot(q)['physicalActions']==0)
  check('mobile-no-overflow',nooverflow(q))
  q.screenshot(path=str(D/'mobile-retry-waiting.png'),full_page=True)
  # Pause through MCP while retry is in flight; one current quantum may finish.
  current=tool('lab_snapshot',{'runId':rid})['summary'];tool('lab_command',{'runId':rid,'commandId':'mcp-pause','expectedControlVersion':current['controlVersion'],'action':'pause'})
  p.wait_for_function('window.gsLabViewer.snapshot()?.transportRetry?.state==="attempting" && window.gsLabViewer.snapshot()?.transportRetry?.attempt===2')
  http({'url':'/fixture-release'},base)
  p.wait_for_function('window.gsLabViewer.snapshot()?.status==="paused" && window.gsLabViewer.snapshot()?.physicalActions===1')
  s=snapshot(p)
  check('recovered-on-second-attempt',s['transportRetry']['state']=='recovered' and s['transportRetry']['attempt']==2)
  check('one-physical-action-only',s['physicalActions']==1)
  check('did-not-rerun-G',s['diagnostics']['gCalls']==1)
  check('total-requests-includes-failure',s['requests']==3)
  check('MCP-sees-same-recovered-state',tool('lab_snapshot',{'runId':rid})['summary']['worldRevision']==s['worldRevision'])
  p.locator('#retry-inspect').click();check('retry-evidence-dialog',p.locator('#evidence-dialog').is_visible());check('HTTP-status-in-evidence','503' in p.locator('#evidence-json').inner_text());p.locator('[data-close="evidence-dialog"]').click()
  p.screenshot(path=str(D/'desktop-retry-recovered.png'),full_page=True)
  p.locator('#new-run').click();p.locator('#advanced-config').evaluate('(e)=>e.open=true')
  check('retry-controls-exposed',p.locator('#jev-retries').input_value()=='2' and p.locator('#jev-attempt-ms').input_value()=='8000')
  p.locator('[data-close="create-dialog"]').first.click()
  check('read-does-not-reinvoke-provider',json.loads(http({'url':'/fixture-ids'},base)['text'])['calls']==2)
  # Finish fixture and compare raw ledger through MCP.
  tool('lab_command',{'runId':rid,'commandId':'mcp-cancel','expectedControlVersion':s['controlVersion'],'action':'cancel'})
  ledger=json.loads(tool('lab_read',{'runId':rid,'pointer':'/ledger/rows'})['text'])
  check('independent-failure-and-success-ledger',[r['status'] for r in ledger]==['returned','failed','returned'])
  archive=tool('lab_archives');check('MCP-archive-readable',any(x['runId']==rid for x in archive['archives']))
  check('no-browser-errors',not errors)
  b.close()
 (D/'browser-v055.json').write_text(json.dumps({'checks':checks,'errors':errors,'nativeNavigation':native_result,'method':'Actual built bytes + local HTTP/SSE-paging bridge; actual stdio MCP controlled same run','realProviders':'NOT_RUN','mockProvider':'HTTP 503 then success; scripted wait, no solver'},ensure_ascii=False,indent=2))
finally:
 for proc in processes:
  try:proc.terminate();proc.wait(timeout=3)
  except Exception:proc.kill()

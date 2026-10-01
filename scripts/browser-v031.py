import pathlib,json,os,sys,subprocess,time
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent; checks=[]; errors=[]; nav=''; process=None

def check(n,x):
 checks.append({'name':n,'pass':bool(x)});print(n,bool(x),flush=True)
 if not x:raise AssertionError(n)
try:
 process=subprocess.Popen(['node','server.mjs'],cwd=R,env={**os.environ,'PORT':'4193'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(.5)
 with sync_playwright() as a:
  b=a.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);p=b.new_page(viewport={'width':1440,'height':1000});p.on('pageerror',lambda e:errors.append(str(e)))
  try:p.goto('http://127.0.0.1:4193',wait_until='networkidle',timeout=15000);nav='HTTP localhost'
  except Exception:
   p.close();p=b.new_page(viewport={'width':1440,'height':1000});p.on('pageerror',lambda e:errors.append(str(e)));p.set_content((R/'play.html').read_text(),wait_until='load');nav='standalone set_content fallback after blocked localhost navigation'
  p.wait_for_function('!!window.tuanziLab');check('version031-header','v0.3.1' in p.locator('.eyebrow').first.inner_text().lower())
  p.evaluate('window.tuanziLab.loadScenario("meadow")');p.locator('#btn-step').click();p.wait_for_function('window.tuanziLab.exportTrace().decisionAudit.records.length>0')
  check('audit-panel-visible',p.locator('#decision-audit-panel').is_visible());check('origin-visible',p.locator('#decision-origin').inner_text()!='尚未判断')
  p.locator('#decision-audit-panel summary').click();facts=json.loads(p.locator('#audit-facts').inner_text());check('facts-schema-visible',facts['schema']=='gs/decision-packet/v1');check('candidate-order-seed',facts['orderSeed']>=0)
  check('no-rule-score-in-packet','"score"' not in p.locator('#audit-facts').inner_text());check('scope-is-disclosed',bool(facts['scope']['note']))
  with p.expect_download() as d:p.locator('#btn-audit').click()
  check('audit-download',d.value.suggested_filename=='gs-decision-audit-v031.json')
  p.locator('#decision-audit-panel').screenshot(path=str(R/'reports/audit-v031.png'))
  p.set_viewport_size({'width':390,'height':844});check('mobile-audit-no-overflow',p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  check('no-browser-errors',not errors);b.close()
except Exception as e:checks.append({'name':'exception','pass':False,'error':str(e)})
finally:
 if process:process.terminate()
 (R/'reports/browser-v031.json').write_text(json.dumps({'navigation':nav,'checks':checks,'errors':errors,'realModels':'NOT_RUN'},ensure_ascii=False,indent=2));sys.exit(0 if all(c['pass'] for c in checks) else 1)

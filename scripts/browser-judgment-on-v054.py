"""Chromium operates delivered standalone bytes. No true model calls or navigation claims."""
import pathlib,json,sys,os
from playwright.sync_api import sync_playwright
R=pathlib.Path(__file__).resolve().parent.parent;checks=[];errors=[];requests=[]
def check(n,v):
 checks.append({'name':n,'pass':bool(v)});print(n,bool(v),flush=True);(R/'reports/v054/legacy-ui/browser-v04-adapted-progress.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
 if not v:raise AssertionError(n)
def mount(b,width=1440):
 p=b.new_page(viewport={'width':width,'height':1100 if width>600 else 844});p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:requests.append(r.url));p.set_content((R/'play.html').read_text(),wait_until='load');p.wait_for_function('!!window.gsDecisionLab');return p
def run(p,compare=False):
 p.locator('#local-tab-judgment').click()
 p.locator('#lab-compare' if compare else '#lab-run').click();p.wait_for_function('!document.querySelector("#lab-run").disabled',timeout=60000);return p.evaluate('window.gsDecisionLab.results()')
try:
 with sync_playwright() as a:
  b=a.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox']);p=mount(b)
  check('v043-visible-version','v0.5.0' in p.title() or 'v0.5' in p.title());p.locator('#local-tab-judgment').click()
  check('new-lab-exists-and-contract-visible',p.locator('#decision-lab').is_visible() and '35' in p.locator('#lab-contract').inner_text())
  check('unconfigured-providers-disabled',p.locator('#lab-backend option[value="jev"]').evaluate('(e)=>e.disabled') and p.locator('#lab-backend option[value="llm"]').evaluate('(e)=>e.disabled'))
  p.locator('#local-tab-game').click();p.evaluate('window.tuanziLab.loadScenario("meadow")');p.locator('#btn-step').click();p.wait_for_function('window.tuanziLab.exportTrace().decisionAudit.judgmentRuns.length>0')
  trace=p.evaluate('window.tuanziLab.exportTrace()');check('task-graphs-actually-integrated-in-parent-child-engine',trace['decisionAudit']['judgmentRuns'][0]['status']=='complete')
  check('question-version-belongs-to-v04',trace['decisionAudit']['records'][0]['packet']['questionVersion']=='gs/judgments/v04/batch')
  check('audit-panel-provenance-still-visible',p.locator('#decision-origin').inner_text()=='程序规则')
  p.locator('#decision-audit-panel summary').click();facts=json.loads(p.locator('#audit-facts').inner_text());check('audit-neutral-facts-are-real',facts['schema']=='gs/decision-packet/v1' and not any('score' in c['facts'] for c in facts['candidates']))
  with p.expect_download() as d:p.locator('#btn-audit').click()
  check('main-audit-export',d.value.suggested_filename=='gs-decision-audit-v04.json')
  main_before=p.evaluate('window.tuanziLab.snapshot()');rows=run(p,True)
  check('four-row-offline-comparison',len(rows)==4 and p.locator('[data-result]').count()==4)
  check('four-modes-complete-same-energy-contract',all(x['status']=='succeeded' and x['actions']==2 and x['final']['energy']==40 for x in rows))
  check('batch-versus-serial-identical-questions-fewer-requests',rows[1]['questions']==rows[2]['questions'] and rows[1]['requests']==2 and rows[2]['requests']==50)
  check('dependent-rounds-actually-two',all(x['dependencyWaves']==2 for x in rows[3]['runs']))
  check('same-world-clone-not-main-game-write',p.evaluate('window.tuanziLab.snapshot()')==main_before)
  check('zero-remote-calls-disclosed',all(x['externalRequests']==0 and x['realModels']=='NOT_RUN' for x in rows))
  check('reference-bfs-independent-optimum',all(x['oracle']['status']=='OPTIMAL' and x['oracle']['steps']==2 for x in rows))
  p.locator('[data-result="1"]').click();check('comparison-row-loads-actual-trace','合批' in p.locator('#lab-verdict').inner_text())
  p.locator('#lab-replay').fill('0');p.locator('#lab-replay').dispatch_event('input');check('replay-is-read-only-main-and-task-evidence',p.evaluate('window.tuanziLab.snapshot()')==main_before and '能量 10' in p.locator('#lab-resources').inner_text())
  p.locator('#lab-replay').fill('2');p.locator('#lab-replay').dispatch_event('input')
  with p.expect_download() as d:p.locator('#lab-export').click()
  check('experiment-evidence-export',d.value.suggested_filename=='gs-judgment-experiments-v04.json')
  p.locator('#decision-lab').screenshot(path=str(R/'reports/v054/legacy-ui/desktop-local-judgment.png'))
  p.locator('.local-lab-advanced summary').click();p.locator('#lab-strategy').select_option('dependent');p.locator('#lab-mask').check();r=run(p)[0]
  check('observation-actually-updates-evidence',r['observations']==1 and r['packets'][0]['projection']['observation']['resources']=='unknown' and r['packets'][1]['projection']['observation']['resources']=='observed')
  check('observation-not-fake-physical-step',r['actions']==2 and r['final']['turn']-r['initial']['turn']==2)
  check('masked-run-does-not-get-full-info-optimal-label',r['oracle'] is None)
  p.locator('#lab-mask').uncheck();p.locator('#lab-task').select_option('fast');r=run(p)[0];check('changed-goal-changes-behavior',r['status']=='succeeded' and r['actions']==1 and r['final']['energy']==9)
  p.locator('#lab-task').select_option('chain');p.locator('#lab-perturb').check();r=run(p)[0];check('scripted-world-change-executed',r['status']=='succeeded' and r['perturbations']==1)
  p.locator('#lab-perturb').uncheck();p.locator('#lab-task').select_option('energy');p.locator('#lab-strategy').select_option('serial');p.locator('#lab-delay').select_option('20');p.locator('#lab-deadline').select_option('150');r=run(p)[0]
  check('synthetic-latency-deadline-honestly-fails',r['status']!='succeeded' and r['syntheticDelayMs']==20 and r['externalRequests']==0)
  check('synthetic-latency-labeled-not-model','非模型' in p.locator('#lab-verdict').inner_text())
  p.locator('#lab-deadline').select_option('10000');p.locator('#lab-delay').select_option('50');p.locator('#lab-run').click();p.locator('#lab-cancel').click();p.wait_for_function('!document.querySelector("#lab-run").disabled');check('cancel-clears-busy-state','取消' in p.locator('#lab-status').inner_text())
  p.locator('#lab-delay').select_option('0');p.locator('#btn-connect').click();p.locator('#decision-style').select_option('dependent');p.locator('#apply-mode').click();p.locator('#local-tab-game').click();p.evaluate('window.tuanziLab.loadScenario("meadow")');p.locator('#btn-step').click();p.wait_for_function('window.tuanziLab.exportTrace().decisionAudit.judgmentRuns.length>0')
  check('main-game-dependent-mode-is-real',p.evaluate('window.tuanziLab.exportTrace().decisionAudit.judgmentRuns[0].dependencyWaves')==2)
  p.locator('#btn-connect').click();p.locator('#decision-style').select_option('classic');p.locator('#apply-mode').click();p.locator('#local-tab-game').click();p.evaluate('window.tuanziLab.loadScenario("meadow")');p.locator('#btn-step').click();p.wait_for_function('window.tuanziLab.snapshot().turn===1');check('legacy031-interface-remains-selectable',p.evaluate('window.tuanziLab.exportTrace().decisionAudit.judgmentRuns.length')==0)
  p.set_viewport_size({'width':390,'height':844});check('mobile-no-horizontal-overflow',p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  p.locator('#local-tab-judgment').click();p.locator('#lab-task').select_option('energy');p.locator('#lab-strategy').select_option('batch');r=run(p)[0];check('mobile-experiment-runs',r['status']=='succeeded');p.locator('#decision-lab').screenshot(path=str(R/'reports/v054/legacy-ui/mobile-local-judgment.png'))
  p.locator('#lab-evidence summary') if False else None
  p.locator('#decision-lab .lab-evidence details summary').click();check('mobile-json-contained',p.locator('#lab-json').bounding_box()['width']<390)
  check('no-uncaught-browser-errors',not errors);check('no-offline-external-request',not any(x.startswith(('https:','http:')) for x in requests));b.close()
except Exception as e:checks.append({'name':'exception','pass':False,'error':str(e)});print(str(e),flush=True)
finally:
 (R/'reports/v054/legacy-ui/browser-v04-adapted.json').write_text(json.dumps({'mode':'actual standalone bytes via set_content','realModels':'NOT_RUN','checks':checks,'errors':errors,'requests':requests},ensure_ascii=False,indent=2));sys.exit(0 if all(x['pass'] for x in checks) else 1)

"""Offline browser QA. This sandbox blocks HTTP/file URL navigation. Tests mount the
actual standalone bytes with set_content. Storage restart uses an injected Storage
fixture, NOT a claimed real browser reload. Real HTTP routes are covered by Node tests.
"""
import json, os, pathlib, sys
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
REPORT=ROOT/'reports';REPORT.mkdir(exist_ok=True)
HTML=(ROOT/'play.html').read_text()
checks=[];errors=[];requests=[]
def check(name,condition):
    checks.append({'name':name,'pass':bool(condition)})
    if not condition: raise AssertionError(name)
def mounted(browser,viewport={'width':1440,'height':1180},data=None):
    p=browser.new_page(viewport=viewport,device_scale_factor=1)
    p.on('pageerror',lambda e:errors.append(str(e)))
    p.on('request',lambda r:requests.append(r.url))
    if data is not None:
        p.evaluate('''(initial)=>{const m=new Map(Object.entries(initial));Object.defineProperty(window,'localStorage',{value:{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}});window.storageFixtureDump=()=>Object.fromEntries(m);}''',data)
    p.set_content(HTML,wait_until='load');p.wait_for_function('!!window.tuanziLab')
    return p
def closeResult(p):
    if p.locator('#result-close').is_visible():p.locator('#result-close').click()
try:
 with sync_playwright() as api:
    browser=api.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    p=mounted(browser,data={})
    check('default-v02-offline-program-mode',p.locator('#mode-label').inner_text()=='程序搜索 + 技能记忆 · 离线')
    check('four-scenarios-and-zero-requests',p.locator('[data-scenario]').count()==4 and p.locator('#count-api').inner_text()=='0')
    p.locator('#btn-step').click();p.wait_for_function('document.querySelector("#policy-version").textContent==="v2"',timeout=30000)
    t=p.evaluate('window.tuanziLab.exportTrace()')
    check('first-cycle-searches-and-verifies-without-executing',t['finalWorld']['turn']==0 and t['planning']['searchRuns']==1 and len(t['policy']['body']['program']['steps'])==72)
    check('shadow-pass-is-only-a-trial',p.evaluate('window.tuanziLab.skills().items[0].status')=='trial' and p.locator('#stat-skill').inner_text()=='0')
    p.locator('#btn-program').click();check('program-json-dialog-real-dsl','gs/program/v1' in p.locator('#program-json').inner_text());p.locator('[data-close="program-dialog"]').click()
    p.locator('#btn-step').click();p.wait_for_function('window.tuanziLab.snapshot().turn===1')
    check('physical-step-uses-program-candidate',p.evaluate('window.tuanziLab.snapshot().player')=={'x':8,'y':6})
    p.screenshot(path=str(REPORT/'v02-desktop.png'),full_page=True)
    p.locator('#btn-snapshot').click();saved=p.evaluate('window.tuanziLab.snapshot()');p.locator('#btn-step').click();p.wait_for_function('window.tuanziLab.snapshot().turn===2');p.locator('#btn-restore').click();check('snapshot-restore-preserves-cursor-state',p.evaluate('window.tuanziLab.snapshot()')==saved)
    # Fresh complete run, not the interrupted prefix above.
    p.evaluate('window.tuanziLab.clearSkills()');p.locator('[data-scenario="guarded"]').click()
    cold=p.evaluate('window.tuanziLab.runOfflineToEnd()');closeResult(p)
    check('cold-run-finishes-and-publishes-only-after-real-verifier',cold['result']=={'kind':'done','outcome':'succeeded'} and p.evaluate('window.tuanziLab.skills().items[0].status')=='verified')
    p.locator('#btn-book').click();check('book-shows-actual-success-evidence','实际成功 1' in p.locator('#book-records').inner_text());p.locator('[data-close="book-dialog"]').click()
    p.locator('#btn-reset').click();p.locator('#btn-step').click();p.wait_for_function('document.querySelector("#policy-version").textContent==="v2"')
    warm=p.evaluate('window.tuanziLab.exportTrace()');check('reset-reuses-verified-program-with-zero-new-search',warm['planning']['searchRuns']==0 and warm['planning']['skillHits']==1 and warm['finalWorld']['turn']==0)
    p.locator('#btn-step').click();p.wait_for_function('window.tuanziLab.snapshot().turn===1');p.screenshot(path=str(REPORT/'v02-reuse.png'),full_page=True)
    full=p.evaluate('window.tuanziLab.runOfflineToEnd()');closeResult(p)
    check('warm-and-cold-actual-worlds-match',full['finalWorld']==cold['finalWorld'])
    p.locator('#btn-replay').click();p.locator('#replay-range').fill('20');p.locator('#replay-range').dispatch_event('input');check('replay-is-read-only',p.evaluate('window.tuanziLab.snapshot().delivered')==5 and p.locator('#replay-position').inner_text().startswith('20 /'));p.locator('[data-close="replay-dialog"]').click()
    storage=p.evaluate('window.storageFixtureDump()');second=mounted(browser,data=storage);second.locator('#btn-step').click();second.wait_for_function('document.querySelector("#policy-version").textContent==="v2"');check('serialized-storage-reopen-fixture-revalidates-skill',second.evaluate('window.tuanziLab.exportTrace().planning.skillHits')==1);second.close()
    p.locator('[data-scenario="guarded"]').click();p.locator('#btn-compare').click();p.wait_for_selector('[data-replay-row="3"]',timeout=30000)
    check('four-way-fair-baseline-visible',p.locator('.comparison-card').count()==4 and '完整规则从开局启用' in p.locator('#compare-results').inner_text())
    check('comparison-all-standard-orchard-runs-succeed',p.locator('.comparison-outcome').all_inner_texts()==['任务完成']*4)
    p.screenshot(path=str(REPORT/'v02-comparison.png'),full_page=True);p.locator('[data-close="compare-dialog"]').first.click()
    p.locator('#btn-connect').click();check('unconfigured-live-options-disabled',p.locator('#run-mode option[value="program-live"]').is_disabled() and p.locator('#run-mode option[value="program-jev"]').is_disabled())
    p.locator('#run-mode').select_option('rules-full');p.locator('#apply-mode').click();p.locator('#btn-step').click();p.wait_for_function('window.tuanziLab.snapshot().turn===1');check('complete-rules-are-available-without-planning',p.locator('#stat-search').inner_text()=='0')
    p.locator('#btn-connect').click();p.locator('#run-mode').select_option('program');p.locator('#apply-mode').click();p.evaluate('window.tuanziLab.clearSkills()');p.locator('[data-scenario="guarded"]').click();p.locator('#btn-step').click();p.wait_for_function('document.querySelector("#policy-version").textContent==="v2"')
    # Actual map tool, coordinate conversion comes from the renderer geometry.
    rect=p.locator('#world').bounding_box();scale=min(rect['width']/866,rect['height']/578)
    x=rect['x']+(rect['width']-866*scale)/2+(42+.5*46)*scale
    y=rect['y']+(rect['height']-578*scale)/2+(36+.5*46)*scale
    p.locator('[data-tool="wall"]').click();p.mouse.click(x,y)
    check('actual-map-intervention-changes-world',p.evaluate('window.tuanziLab.snapshot().walls.some(w=>w.x===0&&w.y===0)'))
    p.locator('#btn-step').click();p.wait_for_function('window.tuanziLab.events().some(e=>e.type==="health_alert")',timeout=30000)
    check('intervention-discards-old-program-before-an-action',p.evaluate('window.tuanziLab.snapshot().turn')==0)
    # Ensure generation finished before selecting another scene.
    p.wait_for_function('!document.querySelector("#btn-step").disabled',timeout=30000)
    p.locator('[data-scenario="remix"]').click();mirror=p.evaluate('window.tuanziLab.runOfflineToEnd()');closeResult(p)
    check('new-layout-does-not-replay-old-coordinates',mirror['result']=={'kind':'done','outcome':'succeeded'} and mirror['planning']['searchRuns']==1 and mirror['planning']['skillHits']==0)
    p.locator('[data-scenario="meadow"]').click();p.locator('#speed').select_option('120');p.locator('#btn-play').click();p.wait_for_function('window.tuanziLab.snapshot().turn>=3');p.locator('#btn-play').click();p.wait_for_timeout(250);turn=p.evaluate('window.tuanziLab.snapshot().turn');p.wait_for_timeout(300);check('pause-does-not-drain-energy-or-advance-time',p.evaluate('window.tuanziLab.snapshot().turn')==turn)
    mobile=mounted(browser,{'width':390,'height':844});check('mobile-no-horizontal-overflow',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    mobile.locator('#btn-step').click();mobile.wait_for_function('document.querySelector("#policy-version").textContent==="v2"',timeout=30000);mobile.screenshot(path=str(REPORT/'v02-mobile.png'),full_page=True)
    check('mobile-program-and-memory-panels-render',mobile.locator('#program-steps').inner_text().find('移动')>=0 and mobile.locator('#stat-search').inner_text()=='1')
    mobile.locator('#btn-book').click();check('mobile-dialog-fits-viewport',mobile.locator('#book-dialog').bounding_box()['width']<=390);mobile.locator('[data-close="book-dialog"]').click()
    check('no-uncaught-browser-errors',not errors);check('inline-offline-mode-sends-no-external-network-requests',not any(u.startswith(('http:','https:')) for u in requests))
    browser.close()
except Exception as error:
    checks.append({'name':'unexpected-test-exception','pass':False,'error':str(error)})
finally:
    report={'mode':'Chromium + standalone HTML set_content','navigationLimitation':'HTTP and file URL navigation blocked administratively in this environment. No actual reload claim.','storageTest':'Injected Storage fixture across distinct pages plus Node serialization tests','checks':checks,'errors':errors,'requestURLs':requests}
    (REPORT/'browser-v02.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({'passed':sum(c['pass'] for c in checks),'total':len(checks),'failures':[c for c in checks if not c['pass']]},ensure_ascii=False))
    if not all(c['pass'] for c in checks):sys.exit(1)

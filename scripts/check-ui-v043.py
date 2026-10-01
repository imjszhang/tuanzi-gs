"""Run current UI suites against isolated local services. Optional Python Playwright needed.
Uses actual HTML with explicit transport fixture where native localhost navigation is blocked.
No external model credentials are used; mock server is explicitly an offline test double.
"""
import os, pathlib, socket, subprocess, sys, time, urllib.request
R=pathlib.Path(__file__).resolve().parent.parent
REPORT=R/'reports/v043';REPORT.mkdir(parents=True,exist_ok=True)
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
normal,mock=port(),port()
env=os.environ.copy()
# Do not let optional provider configuration turn browser tests into paid calls.
env.update({'GS_LAB_URL':f'http://127.0.0.1:{normal}','GS_LAB_FAULT_URL':f'http://127.0.0.1:{mock}'})
procs=[];handles=[]
try:
 for number,script,log in [(normal,'server.mjs','ui-http.txt'),(mock,'scripts/lib/serve-incident-fixture-v042.mjs','ui-mock.txt')]:
  h=open(REPORT/log,'w');handles.append(h)
  p=subprocess.Popen(['node',script],cwd=R,env={**env,'PORT':str(number)},stdout=h,stderr=subprocess.STDOUT);procs.append(p)
  for attempt in range(60):
   if p.poll() is not None:raise RuntimeError(f'Service exited: {script}; see {log}')
   try:
    with urllib.request.urlopen(f'http://127.0.0.1:{number}/api/status',timeout=1) as r:break
   except Exception:time.sleep(.15)
  else:raise TimeoutError('Local service did not start')
 for script,log in [('browser-v043.py','browser-current.txt'),('browser-v03.py','browser-hierarchy.txt'),('browser-legacy-on-v03.py','browser-legacy.txt'),('browser-v04-on-v043.py','browser-judgment.txt')]:
  print('Running',script,flush=True)
  with open(REPORT/log,'w') as h:
   subprocess.run([sys.executable,'-u','scripts/'+script],cwd=R,env=env,stdout=h,stderr=subprocess.STDOUT,check=True,timeout=480)
 print('Current viewer and local legacy behavior suites passed.',flush=True)
finally:
 for p in procs:p.terminate()
 for p in procs:
  try:p.wait(timeout=8)
  except subprocess.TimeoutExpired:p.kill();p.wait()
 for h in handles:h.close()

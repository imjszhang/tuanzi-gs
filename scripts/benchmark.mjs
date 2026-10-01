/** Reproducible OFFLINE benchmark. Never loads .env or calls providers. Warm row is
 * explicitly trained by the cold row and is not independent held-out evaluation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createWorld} from '../dist/src/game/world.js';
import {comparePrograms} from '../dist/src/runtime/session.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir=path.join(root,'reports');await fs.mkdir(dir,{recursive:true});
const scenarios=[];
for(const id of ['meadow','detour','guarded','remix']){
  const rows=await comparePrograms(createWorld(id));
  await fs.writeFile(path.join(dir,`trace-${id}.json`),JSON.stringify(rows,null,2));
  scenarios.push({id,rows:rows.map(({trace,...r})=>({...r,planning:trace.planning}))});
  console.log(id,rows.map(r=>`${r.label}: ${r.outcome}, ${r.turns} actions, ${r.energy} energy, search=${r.trace.planning.searchRuns}, reuse=${r.trace.planning.skillHits}`).join(' | '));
}
const report={version:'0.2.0',at:new Date().toISOString(),node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,
  scope:'Deterministic offline mechanism test; no real model performance, optimality, or generalized learning claim.',
  fairness:'Same world/goal/physical permissions. Last 3 rows use identical primitive candidates. Legacy row retains its older candidate generator. Warm row is trained by the cold row; cold generation overhead is reported separately.',scenarios};
await fs.writeFile(path.join(dir,'benchmark-v02.json'),JSON.stringify(report,null,2));

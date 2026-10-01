/** POST-RUN ONLY. Reads an immutable export file, computes offline baselines, writes a separate report.
 * Not imported by any engine, provider, server or viewer. It never writes back to a run.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {GameSession,runSessionToEnd} from '../dist/src/runtime/session.js';
const file=process.argv[2];if(!file){console.error('Usage: node scripts/evaluate-reference-v05.mjs completed-export.json [result.json]');process.exit(2);}
const bytes=fs.readFileSync(file),data=JSON.parse(bytes);const final=data.state;
if(!final||!['succeeded','failed','blocked','cancelled','stopped','fault'].includes(final.status)||!data.initial){throw Error('A terminal immutable lab export is required');}
const rows=[];
for(const mode of ['rules-full','program']){const at=performance.now(),s=await runSessionToEnd(new GameSession(data.initial,mode));rows.push({mode,kind:'OFFLINE_REFERENCE_ONLY',outcome:s.lastResult,actions:s.world.snapshot().turn-data.initial.turn,energy:s.world.snapshot().energy,elapsedMs:performance.now()-at,planning:s.planning,optimality:'NOT_PROVEN'});}
const output=process.argv[3]??file.replace(/\.json$/,'')+'-reference.json';if(path.resolve(output)===path.resolve(file))throw Error('Never overwrite input evidence');
fs.writeFileSync(output,JSON.stringify({schema:'gs/offline-reference/v05',sourceHash:crypto.createHash('sha256').update(bytes).digest('hex'),sourceRunId:final.runId,rows,noFeedbackToEngine:true,comparability:(data.script?.length||data.state.interventions?.length)?'UNMATCHED_INTERVENTIONS_DO_NOT_COMPARE_AS_EQUAL':'SAME_INITIAL_WORLD_STATIC_REFERENCE',note:'Reference results are offline review artifacts; do not feed this file into G/S. Search returns a reference result, not a global optimality proof.'},null,2));console.log(output);

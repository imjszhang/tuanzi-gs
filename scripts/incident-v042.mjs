/** Reproducible offline regression. No tokens, model keys, or external network are used. */
import fs from 'node:fs';import path from 'node:path';
import {fixture,finish,access} from './lib/incident-fixtures.mjs';
import {SkillSession} from '../dist/src/skills/runtime.js';
import {createWorld} from '../dist/src/game/world.js';
import {makeSkill} from '../dist/src/skills/spec.js';
const root=path.resolve(new URL('..',import.meta.url).pathname),dir=path.join(root,'reports/v042');fs.mkdirSync(dir,{recursive:true});
const rows=[];
for(const mode of ['abstain-child','abstain-parent','context-gated-rule']){
 const {session,stats}=fixture(mode);await finish(session);const world=session.world.snapshot();
 const trace=session.export(),file='incident-'+mode+'.json';fs.writeFileSync(path.join(dir,file),JSON.stringify({scope:'OFFLINE TEST DOUBLE; not a real Jev/LLM run',stats,trace},null,2));
 rows.push({case:mode,result:session.lastResult,physicalActions:world.turn,energy:world.energy,delivered:world.delivered,
  selectorInterfaceCalls:stats.selects,generatorInterfaceCalls:stats.generates,actualExternalRequests:0,
  rootRepairs:session.rootEngine.counters.repairs,progress:session.rootEngine.history.map(t=>t.feedback),trace:file});
}
const bad={...makeSkill('access-open',['wait-access'],'llm'),id:'bad-wait',maxSteps:2};let generationInputs=[];
const duplicate=new SkillSession(createWorld('guarded'),'reactive-live',undefined,{initialSkills:[bad],providers:{generate:async input=>{generationInputs.push(structuredClone(input));return {output:{...bad,id:'renamed-identical'}};}}});
await finish(duplicate);fs.writeFileSync(path.join(dir,'incident-duplicate.json'),JSON.stringify({scope:'OFFLINE TEST DOUBLE',generationInputs,trace:duplicate.export()},null,2));
rows.push({case:'failed-execution-renamed-proposal',result:duplicate.lastResult,physicalActions:duplicate.world.snapshot().turn,generatorInterfaceCalls:generationInputs.length,actualExternalRequests:0,executionFeedbackPresent:!!generationInputs[0]?.executionFeedback,trace:'incident-duplicate.json'});
const result={schema:'gs/incident-regression/v042',actualExternalRequests:0,scope:'Control-flow and contract tests. No claim of live model repair. User original raw exports were not available.',rows};
fs.writeFileSync(path.join(dir,'incident-summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));

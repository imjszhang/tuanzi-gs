import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,access,answer,finish,signal} from '../scripts/lib/incident-fixtures.mjs';
import {SkillSession} from '../dist/src/skills/runtime.js';
import {createWorld} from '../dist/src/game/world.js';
import {selectPacket} from '../dist/src/skills/facts.js';
import {makeSkill} from '../dist/src/skills/spec.js';
import {RecoveryJournal,canonicalSkill,skillFamily,structureId,recoveryScope} from '../dist/src/skills/recovery.js';
import {TASK_CONTEXT_VERSION,skillTaskContext} from '../dist/src/skills/context.js';
import {createFrame,candidates,simulateSkill} from '../dist/src/skills/behavior.js';
import {evaluatePacket,compileDecision,ruleBackend} from '../dist/src/decision/pipeline.js';
import {RepairBlocked,ProposalRejected} from '../dist/vendor/gs-engine-ts/src/rejection.js';
import {reactiveRequest} from '../server/reactive.mjs';
const binding=s=>({targetId:s.guards[0].id,targetBerryIds:s.berries.map(b=>b.id),amount:0});
const zeroFailure=(spec,s,controller='test-controller')=>({kind:'execution_failed',reason:'no_local_action',runId:'test',skillId:spec.id,skillVersion:spec.version,structureId:structureId(spec),structure:canonicalSkill(spec),family:skillFamily(spec),scope:recoveryScope(s,binding(s),controller),spec,binding:binding(s),phase:{index:0,rule:'place-resource'},world:{startRevision:'1',revision:'1',turn:0,key:'unit-fixture'},outcome:{steps:0,energyDelta:0,deliveredDelta:0,dispatchCompleted:true},decision:null,controller,contextVersion:TASK_CONTEXT_VERSION,route:'repair-skill'});

test('042 reported none loop stops after ONE skill generation; no physical fallback',async()=>{
 const {session:s,stats}=fixture();await finish(s);
 assert.deepEqual(s.lastResult,{kind:'paused',reason:'decision_blocked:no_local_suitable_action'});
 assert.equal(stats.generates,1);assert.equal(stats.selects,3);assert.equal(s.world.snapshot().turn,0);assert.equal(s.world.snapshot().revision,1);
 assert.equal(s.world.snapshot().energy,98);assert.equal(s.lease.activeOwner,null);assert.equal(stats.actualExternalRequests,0);
 assert.equal(s.rootEngine.counters.repairs,1);assert(s.events.some(e=>e.type==='post_transition_route'));
});
test('042 blocked summary is not a measured physical skill failure or success',async()=>{
 const {session:s}=fixture();await finish(s);const r=s.summaries[0];assert.equal(r.status,'decision_blocked');assert.equal(r.outcome.steps,0);
 assert.equal(s.catalogue.list()[0].successes,0);assert.equal(s.catalogue.list()[0].failures,0);assert.equal(s.experience.list().length,0);
 assert.equal(s.recovery.latest().kind,'decision_blocked');assert.equal(s.recovery.latest().route,'pause-and-inspect');
});
test('042 dispatch completion does NOT refresh task progress on zero-step abstention',async()=>{
 const {session:s}=fixture();await finish(s);const last=s.rootEngine.history.at(-1).feedback;
 assert.equal(last.progress,false);assert.equal(last.actionSucceeded,false);assert.equal(last.metrics.dispatchCompleted,1);
 assert.equal(last.metrics.physicalProgress,0);assert.equal(last.metrics.localGoalProgress,0);assert.equal(last.metrics.informationProgress,1);
});
test('042 measured decision, candidates, stage and controller retained in failure envelope',async()=>{
 const {session:s}=fixture();await finish(s);const r=s.recovery.latest();assert.equal(r.decision.judgment.choice,null);
 assert.equal(r.decision.judgment.abstainProbability,1);assert.equal(r.decision.packet.candidates.length,4);
 assert.equal(r.phase.rule,'place-resource');assert(r.controller.includes('fixture'));assert.equal(r.decision.packet.questionVersion,'gs/select/v042');
 assert.equal(s.export().hierarchy.failures.length,1);assert.equal(s.diagnostics().pendingHalt.reason,s.lastResult.reason);
});
test('042 child context explains current stand target and why move is useful before drop',async()=>{
 const {session:s,stats}=fixture();await finish(s);const p=stats.packets.find(x=>x.level==='child'),c=p.taskContext;
 assert.notEqual(p.goal,'access-open');assert.equal(c.schema,TASK_CONTEXT_VERSION);assert.equal(c.localGoal.id,'access-open');
 assert.equal(c.phase.rule,'place-resource');assert.equal(c.immediateObjective.targetRole,'resource-placement-stand');
 assert.deepEqual(c.relations.placement.stand,{x:8,y:6});assert.deepEqual(c.relations.placement.drop,{x:8,y:7});
 assert.equal(c.immediateObjective.pathSteps,1);assert.equal(c.immediateObjective.atTarget,false);
 assert(c.immediateObjective.description.includes('本步不需要'));assert(p.candidates.every(x=>x.action.kind==='move'));
 assert(!JSON.stringify(p).match(/bestAction|recommendedAction|"score":|oracleAnswer/));
});
test('042 same factual context is delivered to rule and test provider; no answer injected',async()=>{
 const a=new SkillSession(createWorld('guarded'),'reactive',undefined,{initialSkills:[access()]});await a.step();
 const b=fixture('context-gated-rule',{initialSkills:[access()]});await b.session.step();
 const pa=a.decisions.find(x=>x.packet.level==='child').packet,pb=b.stats.packets.find(x=>x.level==='child');
 assert.deepEqual(pa.taskContext,pb.taskContext);assert.deepEqual(pa.candidates,pb.candidates);
 a.cancel();b.session.cancel();
});
test('042 context-consuming TEST rule executes full task; not evidence of Jev improvement',async()=>{
 const {session:s,stats}=fixture('context-gated-rule');await finish(s);assert.equal(s.lastResult.outcome,'succeeded');assert.equal(stats.generates,1);
 assert(s.world.snapshot().energy>0);assert(s.world.snapshot().delivered>=5);assert.equal(stats.actualExternalRequests,0);
});
test('042 parent rejection of an already available access skill does not regenerate',async()=>{
 const {session:s,stats}=fixture('abstain-parent');await finish(s);assert.equal(stats.generates,1);assert.equal(stats.selects,2);
 assert.equal(s.lastResult.reason,'decision_blocked:parent_no_suitable_skill');assert.equal(s.summaries.length,0);assert.equal(s.world.snapshot().turn,0);
});
test('042 existing skill + parent none pauses without any generator invocation',async()=>{
 const {session:s,stats}=fixture('abstain-parent',{initialSkills:[access()]});await finish(s);assert.equal(stats.generates,0);assert.equal(s.lastResult.kind,'paused');
});
test('042 failed finite skill feeds measured execution into NEXT generator request',async()=>{
 const bad={...makeSkill('access-open',['wait-access'],'llm'),id:'bad-wait',maxSteps:2};let input;
 const s=new SkillSession(createWorld('guarded'),'reactive-live',undefined,{initialSkills:[bad],providers:{generate:async x=>{input=structuredClone(x);return {output:{...bad,id:'renamed-identical'}};}}});
 await finish(s);assert.equal(s.lastResult.reason,'duplicate_repair_no_new_evidence');
 assert.equal(input.executionFeedback.latest.skillId,'bad-wait');assert.equal(input.executionFeedback.latest.outcome.steps,2);
 assert.equal(input.executionFeedback.latest.reason,'skill_step_budget');assert.equal(input.feedback,undefined);
 assert.equal(s.world.snapshot().turn,2);assert.equal(s.rootEngine.counters.repairs,1);assert(s.events.some(x=>x.type==='duplicate_repair_blocked'));
});
test('042 genuinely different repair can proceed using failure feedback',async()=>{
 const bad={...makeSkill('access-open',['wait-access'],'llm'),id:'bad-wait',maxSteps:2};let inputs=[];
 const s=new SkillSession(createWorld('guarded'),'reactive-live',undefined,{initialSkills:[bad],providers:{generate:async x=>{inputs.push(structuredClone(x));return {output:access()};}}});
 await finish(s);assert.equal(inputs.length,1);assert.equal(inputs[0].executionFeedback.latest.reason,'skill_step_budget');
 assert.equal(s.lastResult.outcome,'succeeded');assert(s.summaries.some(x=>x.status==='failed'));assert(s.summaries.some(x=>x.status==='success'));
});
test('042 validation rejection feedback and execution feedback survive together',async()=>{
 const bad={...makeSkill('access-open',['wait-access'],'llm'),id:'bad-wait',maxSteps:2};const inputs=[];
 const s=new SkillSession(createWorld('guarded'),'reactive-live',undefined,{initialSkills:[bad],providers:{generate:async x=>{
  inputs.push(structuredClone(x));return {output:inputs.length===1?{...access(),eval:'forbidden'}:access()};}}});
 await finish(s);assert.equal(inputs.length,2);assert.equal(inputs[0].feedback,undefined);assert(inputs[1].feedback.rejection);
 assert.deepEqual(inputs[0].executionFeedback,inputs[1].executionFeedback);assert.equal(s.lastResult.outcome,'succeeded');
});
test('042 ID/title/source/version and phase labels do not change executable identity',()=>{
 const a=access(),b={...a,id:'rename',title:'different',source:'grammar-search',version:99,phases:a.phases.map((p,i)=>({...p,id:'label-'+i})),capabilities:[...a.capabilities].reverse(),features:[...a.features].reverse()};
 assert.equal(canonicalSkill(a),canonicalSkill(b));assert.equal(structureId(a),structureId(b));
});
test('042 behavior weights and budgets DO change full signature; family protects zero-step repeats',()=>{
 const a=access(),b={...a,id:'rename',maxSteps:a.maxSteps-1,weights:{...a.weights,cost:2}};
 assert.notEqual(canonicalSkill(a),canonicalSkill(b));assert.equal(skillFamily(a),skillFamily(b));
 const s=createWorld('guarded'),j=new RecoveryJournal();j.record(zeroFailure(a,s));assert(j.repeated(b,recoveryScope(s,binding(s),'test-controller')));
});
test('042 different rules change family and are not globally blacklisted',()=>{
 const a=access(),b=makeSkill('access-open',['wait-access']),s=createWorld('guarded'),j=new RecoveryJournal();j.record(zeroFailure(a,s));
 assert.notEqual(skillFamily(a),skillFamily(b));assert.equal(j.repeated(b,recoveryScope(s,binding(s),'test-controller')),null);
});
test('042 changed world or controller scope allows an explicit new assessment',()=>{
 const a=access(),s=createWorld('guarded'),j=new RecoveryJournal();j.record(zeroFailure(a,s));const next=structuredClone(s);next.energy--;
 assert.equal(j.repeated(a,recoveryScope(next,binding(next),'test-controller')),null);
 assert.equal(j.repeated(a,recoveryScope(s,binding(s),'new-controller')),null);
});
test('042 repeated identical failure is not repeatedly counted as new information',()=>{
 const a=access(),s=createWorld('guarded'),j=new RecoveryJournal(),f=zeroFailure(a,s);
 assert.equal(j.record(f).informationNovel,true);assert.equal(j.record({...f,skillId:'new-name',runId:'new-run'}).informationNovel,false);
});
test('042 canonical rejection returns typed non-retryable block with evidence',()=>{
 const s=new SkillSession(createWorld('guarded')),a=access();s.recovery.record(zeroFailure(a,s.world.snapshot(),s.controllerKey()));
 assert.throws(()=>s.assertNovel({...a,id:'different-id'},s.world.snapshot(),binding(s.world.snapshot())),e=>e instanceof RepairBlocked&&e.reason==='duplicate_repair_no_new_evidence');
 assert.equal(s.rootEngine.counters.repairs,0);s.cancel();
});
test('042 direct none remains abstention even when runner-up has probability 0.34',async()=>{
 const {session:s,stats}=fixture();await finish(s);const p=stats.packets.find(x=>x.level==='child');
 const backend={id:'reported-distribution-test',kind:'mock',ask:async input=>{const q=input.questions.choose;const probs={none:.58};for(let i=0;i<p.candidates.length;i++){const a=p.candidates[i].action;probs['a'+i]=a.x===8&&a.y===6?.34:a.x===8&&a.y===8?.05:a.x===7?.02:.01;}return {answers:{choose:{type:'choice',choice:'none',confidence:.58,probabilities:probs}}};}};
 const r=await evaluatePacket(p,'direct',backend,{signal:signal(),currentKey:()=>p.id,timeoutMs:1000,maxRequests:3,maxQuestions:20});
 assert.equal(r.judgment.choice,null);assert(Object.values(r.judgment.suitability).every(v=>v===0));
 assert.equal(r.report.questionStrategy,'direct');assert.equal(r.report.dispatchStrategy,'batch');assert.equal(r.report.questions,1);
});
test('042 all four question forms carry stage context and version',async()=>{
 const {session:s,stats}=fixture();await finish(s);const p=stats.packets.find(x=>x.level==='child');
 for(const mode of ['direct','batch','serial','dependent']){const g=compileDecision(p,mode);assert.equal(g.questionVersion,'gs/judgments/v042/'+mode);assert.deepEqual(g.evidence.packet.taskContext,p.taskContext);for(const t of g.tasks)assert.equal(t.question.instructions.taskContextRef,'evidence.packet.taskContext');
 const r=await evaluatePacket(p,mode,ruleBackend(),{signal:signal(),currentKey:()=>p.id,timeoutMs:1000,maxRequests:30,maxQuestions:40});assert.equal(r.report.questionStrategy,mode);assert.equal(r.report.dispatchStrategy,mode==='serial'?'serial':'batch');}
});
test('042 failed graph still labels question organisation separately from request dispatch',async()=>{
 const {session:s,stats}=fixture();await finish(s);const p=stats.packets.find(x=>x.level==='child');
 await assert.rejects(evaluatePacket(p,'dependent',{id:'bad',kind:'mock',ask:async()=>({answers:{}})},{signal:signal(),currentKey:()=>p.id,timeoutMs:1000,maxRequests:30,maxQuestions:40}),e=>e.report.questionStrategy==='dependent'&&e.report.dispatchStrategy==='batch');
});
test('042 context target rebinds in mirrored world instead of inventing directions',()=>{
 for(const id of ['guarded','remix']){const s=createWorld(id),spec=access(),f=createFrame(s,binding(s));candidates(spec,f,s);const ctx=skillTaskContext(spec,f,s);assert.deepEqual(ctx.immediateObjective.target,f.placement.stand);assert.equal(ctx.snapshotRevision,String(s.revision));}
});
test('042 stale none is discarded before arbitration, never logged as skill impossibility',async()=>{
 let s;let edited=false;const providers={identity:'stale-none-test',source:'test-provider',select:async i=>{
 if(i.level==='child'&&!edited){edited=true;s.edit('wall',{x:0,y:0});return {output:answer(i.candidates,null)};}
 return {output:answer(i.candidates,selectPacket(i.packet))};}};
 s=new SkillSession(createWorld('guarded'),'reactive-jev',undefined,{initialSkills:[access()],providers});
 await s.step();assert.equal(s.recovery.latest(),null);assert.equal(s.finished,false);assert.equal(s.world.snapshot().turn,0);
 assert(s.events.some(e=>e.type==='stale_result_discarded'));s.cancel();
});
test('042 model error never silently switches to a rule or generator',async()=>{
 const {session:s,stats}=fixture('abstain-child',{initialSkills:[access()],providers:{identity:'fault-test',source:'test-provider',select:async()=>{throw Error('provider offline');},generate:async()=>{assert.fail('no fallback generation');}}});
 await finish(s);assert.equal(s.lastResult.kind,'fault');assert.equal(s.world.snapshot().turn,0);assert.equal(s.recovery.latest(),null);
});
test('v05 removed legacy generator refuses requests, even valid schema and feedback',async()=>{
 let calls=0;await assert.rejects(reactiveRequest('reactive-plan',{}, {signal:signal(),charge:()=>calls++,fetcher:()=>{throw Error('no network')}}),/LEGACY_ASSISTANCE_FORBIDDEN/);assert.equal(calls,0);
});
test('042 new feedback/context scope does not consume legacy ambiguous failure aggregates',async()=>{
 const {experienceKey,ExperienceTable}=await import('../dist/src/skills/experience.js');const s=createWorld('guarded'),spec=access(),key=experienceKey(s,spec);
 assert(key.includes('gs/skill-feedback/v042'));assert(key.includes(TASK_CONTEXT_VERSION));const old=JSON.stringify(JSON.parse(key).slice(2)),book=new ExperienceTable('use');
 book.observe(old,{success:false,steps:0,energyDelta:0,attacks:0,providerCalls:0,searchNodes:0},'legacy-none');book.observe(old,{success:false,steps:0,energyDelta:0,attacks:0,providerCalls:0,searchNodes:0},'legacy-none');
 assert.equal(book.preference(key,spec.weights),0);assert.equal(book.list().length,1);
});

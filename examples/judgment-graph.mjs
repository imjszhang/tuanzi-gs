import {runDecisionGraph} from '../dist/vendor/gs-engine-ts/src/judgment.js';
// Two independent typed questions. The backend is explicitly a local rule, not AI.
const graph={schema:'gs/decision-graph/v1',id:'example',snapshotKey:'revision-1',goalVersion:'goal-1',questionVersion:'example-1',evidence:{energy:40},tasks:[{id:'a',dependsOn:[],question:{type:'noul',instructions:'Does the known resource exceed 20?'}},{id:'b',dependsOn:[],question:{type:'noul',instructions:'Is the known resource positive?'}}]};
const backend={id:'example-rule',kind:'rule',ask:async({state,questions})=>({answers:Object.fromEntries(Object.keys(questions).map(id=>[id,{type:'noul',noul:state.evidence.energy>(id==='a'?20:0)?1:0}]))})};
console.log(await runDecisionGraph(graph,backend,{signal:new AbortController().signal,currentKey:()=>graph.snapshotKey,maxRequests:2,maxQuestions:2,timeoutMs:1000}));

/** Static boundary audit. Complements dynamic canary tests; not an OS sandbox proof. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const checks=[],add=(name,pass,detail)=>checks.push({name,pass,detail});
const read=f=>fs.readFileSync(f,'utf8');
const sources=fs.readdirSync('src/adaptive').filter(x=>x.endsWith('.ts')).map(x=>'src/adaptive/'+x);
for(const f of sources){const s=read(f),imports=[...s.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(x=>x[1]);add('autonomous-import-boundary:'+f,!imports.some(x=>/\/(skills|planning)\/|\/decision\/(pipeline|experiment)/.test(x)),imports);add('no-reference-solver-call:'+f,!/\b(simulateSkill|bindPlacement|lureSite|searchProgram|selectPacket|primitiveRule|parentRule)\s*\(/.test(s),'Root physics not a reference solver');}
const transport=read('server/adaptive.mjs');add('G-prompt-no-completed-skill-example',!transport.includes('makeSkill(')&&!transport.includes('place-resource')&&!transport.includes('wait-access'),'Schema-only output contract');
add('old-model-endpoint-disabled',read('server/reactive.mjs').includes('LEGACY_ASSISTANCE_FORBIDDEN'),null);
const host=read('src/lab/session.ts');add('reference-memory-blocked',host.includes('reference_memory_forbidden_in_autonomous_run'),null);add('direct-factory-legacy-live-blocked',host.includes('LEGACY_ASSISTANCE_FORBIDDEN'),null);
add('world-hints-allowlisted',!read('src/adaptive/world-port.ts').match(/lastFact|s\.scenario|\.\.\.s[,}]/),'publicWorld deliberately excludes author prose and unrecognized properties');
add('reference-evaluator-not-runtime-imported',sources.every(f=>!read(f).includes('evaluate-reference')),null);
add('MCP-not-in-autonomous-inputs',sources.every(f=>!read(f).includes('/mcp/')),null);
add('MCP-no-env-load',!read('bin/gs-lab-mcp.mjs').includes('loadEnvFile('),null);
add('MCP-audit-read-only',read('server/mcp/service.mjs').includes('audit profile is always read-only'),null);
add('MCP-operator-reference-lane-check',read('server/mcp/access.mjs').includes('REFERENCE_LANE_HIDDEN'),null);
const files=[...sources,'server/adaptive.mjs','server/reactive.mjs','vendor/gs-engine-ts/src/adaptive.ts'].map(f=>({file:f,sha256:crypto.createHash('sha256').update(read(f)).digest('hex')}));
const result={version:'0.5.5',checks,files,pass:checks.every(x=>x.pass),limits:'Static trusted-code dataflow checks plus separate unit canaries. Does not prove absence of knowledge in pretrained models or isolate a malicious actor with full filesystem access.'};
fs.mkdirSync('reports/v055',{recursive:true});fs.writeFileSync('reports/v055/isolation-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;

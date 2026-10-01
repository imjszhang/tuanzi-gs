import {digest} from '../planning/programs.js';
export const FEATURE_IDS=['resources','access','danger','distances','stage'] as const;
export type FeatureId=typeof FEATURE_IDS[number];
export const RULE_IDS=['gather','deliver','consume','place-resource','wait-access'] as const;
export type RuleId=typeof RULE_IDS[number];
export type LocalGoal='acquired-one'|'deposited'|'energy-restored'|'access-open';
export type Weights={progress:number;cost:number;safety:number;experience:number};
export type SkillSpec={schema:'gs/skill/v1';id:string;version:number;title:string;source:'authored'|'grammar-search'|'llm';
  parameters:'berry'|'guard-region'|'delivery'|'none'; initiation:'can-gather'|'can-deliver'|'can-consume'|'can-create-access';
  success:LocalGoal; maxSteps:number; capabilities:string[];features:FeatureId[];weights:Weights;
  phases:{id:string;rule:RuleId;until:'local-success'|'resource-placed';maxSteps:number}[]};
export type Binding={targetId:string;targetBerryIds:string[];amount:number};
export const DEFAULT_WEIGHTS:Weights={progress:4,cost:1,safety:20,experience:3};
const capabilitySet=['move','pickup','eat','deposit','drop','wait'];
const contracts={
 'acquired-one':{parameters:'berry',initiation:'can-gather',rules:['gather']},
 'deposited':{parameters:'delivery',initiation:'can-deliver',rules:['deliver']},
 'energy-restored':{parameters:'none',initiation:'can-consume',rules:['consume']},
 'access-open':{parameters:'guard-region',initiation:'can-create-access',rules:['place-resource','wait-access']}
} as const;
function obj(raw:unknown):Record<string,unknown>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('skill:object required');return raw as Record<string,unknown>;}
function keys(r:Record<string,unknown>,allowed:string[]){if(Object.keys(r).some(k=>!allowed.includes(k)))throw Error('skill:unauthorized field');}
export function parseSkill(raw:unknown):SkillSpec {
 const r=obj(raw);keys(r,['schema','id','version','title','source','parameters','initiation','success','maxSteps','capabilities','features','weights','phases']);
 if(r.schema!=='gs/skill/v1'||typeof r.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(r.id)||!Number.isSafeInteger(r.version)||Number(r.version)<1)throw Error('skill:identity');
 if(typeof r.title!=='string'||!r.title.trim()||r.title.length>180||!['authored','grammar-search','llm'].includes(String(r.source)))throw Error('skill:metadata');
 const contract=contracts[r.success as LocalGoal];if(!contract||r.parameters!==contract.parameters||r.initiation!==contract.initiation)throw Error('skill:registered goal contract mismatch');
 if(!Number.isSafeInteger(r.maxSteps)||Number(r.maxSteps)<1||Number(r.maxSteps)>80)throw Error('skill:finite step bound');
 if(!Array.isArray(r.capabilities)||!r.capabilities.length||r.capabilities.some(c=>!capabilitySet.includes(c))||new Set(r.capabilities).size!==r.capabilities.length)throw Error('skill:capabilities');
 if(!Array.isArray(r.features)||!r.features.length||r.features.some(c=>!FEATURE_IDS.includes(c))||new Set(r.features).size!==r.features.length)throw Error('skill:features');
 const w=obj(r.weights);keys(w,['progress','cost','safety','experience']);if(['progress','cost','safety','experience'].some(k=>typeof w[k]!=='number'||!Number.isFinite(w[k])||Number(w[k])<0||Number(w[k])>30))throw Error('skill:weights');
 if(!Array.isArray(r.phases)||!r.phases.length||r.phases.length>4)throw Error('skill:finite phases');
 for(const x of r.phases){const p=obj(x);keys(p,['id','rule','until','maxSteps']);if(typeof p.id!=='string'||p.id.length>50||!(contract.rules as readonly string[]).includes(String(p.rule))||!['local-success','resource-placed'].includes(String(p.until))||!Number.isSafeInteger(p.maxSteps)||Number(p.maxSteps)<1||Number(p.maxSteps)>80)throw Error('skill:phase registry');
   if(p.until==='resource-placed'&&p.rule!=='place-resource')throw Error('skill:invalid phase predicate');
 }
 if(new Set(r.phases.map((p:any)=>p.id)).size!==r.phases.length)throw Error('skill:duplicate phase');
 return structuredClone(r) as SkillSpec;
}
export function makeSkill(goal:LocalGoal,rules:RuleId[],source:SkillSpec['source']='authored'):SkillSpec {
 const c=contracts[goal];const spec:SkillSpec={schema:'gs/skill/v1',id:`skill-${digest(JSON.stringify([goal,rules]))}`,version:1,
  title:({'acquired-one':'采集一颗','deposited':'返回并交付','energy-restored':'补充能量','access-open':'创造采集机会'})[goal],source,
  parameters:c.parameters,initiation:c.initiation,success:goal,maxSteps:goal==='energy-restored'?1:goal==='access-open'?36:65,
  capabilities:[...capabilitySet],features:[...FEATURE_IDS],weights:{...DEFAULT_WEIGHTS},phases:rules.map((rule,i)=>({id:`phase-${i+1}`,rule,until:rule==='place-resource'?'resource-placed':'local-success',maxSteps:rule==='consume'?1:rule==='wait-access'?24:65}))};
 return parseSkill(spec);
}
export const BASE_SKILLS=[makeSkill('acquired-one',['gather']),makeSkill('deposited',['deliver']),makeSkill('energy-restored',['consume'])];

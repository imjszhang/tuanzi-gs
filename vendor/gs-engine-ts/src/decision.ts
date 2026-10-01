/** Neutral, versioned decision packets. Hashes identify evidence, not cryptographic trust. */
import type {Json} from './types.js';
export const FACTS_VERSION = 'gs/decision-facts/v1';
export const QUESTION_VERSION = 'gs/select/v031';
export type DecisionSource = 'deterministic-resume' | 'deterministic-single' | 'authored-rule' | 'jev' | 'configured-model' | 'test-provider';
export type FactCandidate = {id:string; description:string; action:Json; facts:Json; evidence?:Json};
export type DecisionPacket = {schema:'gs/decision-packet/v1'; id:string; level:'parent'|'child'; goal:string;
 snapshotRevision:string; policyVersion:number; factsVersion:string; questionVersion:string;
 scope:{name:string; note:string}; taskContext?:Json; projection:Json; preferences:Json; candidates:FactCandidate[]; orderSeed:number};
export type DecisionAudit = {packet:DecisionPacket; source:DecisionSource; selectorIdentity:string; choice:string|null;
 status:'selected'|'abstained'|'error'; latencyMs:number; externalRequests:number; questions:number; judgment?:import('./types.js').Judgment; error?:string};
export function stableJson(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJson((value as Record<string,unknown>)[k])).join(',')+'}';
}
export function evidenceKey(value:unknown):string {let h=2166136261;for(const c of stableJson(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return 'ev-'+(h>>>0).toString(16);}
/** Canonical IDs first, then seeded Fisher-Yates: never use the heuristic rank as input order. */
export function neutralOrder<T extends {id:string}>(items:readonly T[],seed:number):T[]{
 const out=items.slice().sort((a,b)=>a.id.localeCompare(b.id));let x=seed>>>0;
 for(let i=out.length-1;i>0;i--){x=(Math.imul(1664525,x)+1013904223)>>>0;const j=x%(i+1);[out[i],out[j]]=[out[j]!,out[i]!];}return out;
}
export function validatePacket(p:DecisionPacket):void{
 if(p.schema!=='gs/decision-packet/v1'||!p.goal||!Number.isInteger(p.orderSeed)||!Number.isInteger(p.policyVersion)||p.policyVersion<1||!['parent','child'].includes(p.level)||!p.snapshotRevision||!p.candidates.length||p.candidates.length>64||new Set(p.candidates.map(c=>c.id)).size!==p.candidates.length)throw Error('invalid_decision_packet');
 if(stableJson(p).length>200000)throw Error('decision_packet_too_large');
 for(const c of p.candidates)if(!c.id||!c.description||c.facts===undefined)throw Error('decision_missing_facts');
}

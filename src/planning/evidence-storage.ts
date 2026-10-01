import type { ExecutionEvidence } from './evidence.js';
/** LocalStorage evidence is diagnostic, never an authorization or performance certificate. */
export function parseExecutions(raw:unknown):ExecutionEvidence[]{
 if(!Array.isArray(raw))return [];
 return raw.slice(-40).filter((e:any)=>e&&typeof e==='object' && typeof e.runId==='string'&&typeof e.initialKey==='string'&&
  e.initialKey.length<25000&&typeof e.programId==='string'&&Number.isSafeInteger(e.policyVersion)&&
  typeof e.exactReplay==='boolean'&&typeof e.goalSucceeded==='boolean'&&typeof e.receiptConfirmed==='boolean'&&
  Array.isArray(e.actualActions)&&e.actualActions.length<=180&&e.actualActions.every((x:unknown)=>typeof x==='string'&&x.length<200)&&
  Array.isArray(e.deviations)&&e.deviations.length<=600&&e.deviations.every((x:unknown)=>typeof x==='string'&&x.length<200)&&
  ['success','failure','interrupted','external_change','deviated'].includes(e.status)&&Number.isFinite(e.energyDelta)&&
  e.outcome&&typeof e.outcome.objectiveVersion==='string'&&['steps','energy','bag','delivered','attacks','providerCalls','searchExpanded'].every(k=>Number.isFinite(e.outcome[k])&&e.outcome[k]>=0)
 ).map(x=>structuredClone(x));
}

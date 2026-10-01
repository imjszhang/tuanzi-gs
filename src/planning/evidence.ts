import type { Transition } from '../../vendor/gs-engine-ts/src/types.js';
import type { GameAction, GameState } from '../game/types.js';
import type { GameProgram } from './programs.js';
import { exactWorldKey, actionKey, stateFingerprint } from './programs.js';
import { simulate } from './search.js';
export type OutcomeVector = { steps:number; energy:number; bag:number; delivered:number; attacks:number;
  providerCalls:number; searchExpanded:number; objectiveVersion:string };
export type ExecutionEvidence = { runId:string; policyVersion:number; programId:string; initialKey:string;
  exactReplay:boolean; goalSucceeded:boolean; receiptConfirmed:boolean; actualActions:string[];
  deviations:string[]; outcome:OutcomeVector; energyDelta:number; status:'success'|'failure'|'interrupted'|'external_change'|'deviated' };
export class TrialEvidence {
  readonly initial:GameState; readonly program:GameProgram;
  private actual:string[]=[]; private deviations:string[]=[]; private receipts=true;
  constructor(initial:GameState,program:GameProgram,readonly policyVersion:number,readonly runId:string) {
    this.initial=structuredClone(initial);this.program=structuredClone(program);
  }
  observe(t:Transition<GameState,GameAction>):void {
    const i=this.actual.length, expected=this.program.steps[i];
    this.actual.push(actionKey(t.candidate.action));
    if(!expected || expected.expect!==stateFingerprint(t.before.state) || t.policyVersion!==this.policyVersion)
      this.deviations.push(`step:${i+1}:basis_mismatch`);
    if(!expected || actionKey(expected.action)!==actionKey(t.candidate.action))
      this.deviations.push(`step:${i+1}:action_mismatch`);
    if(t.receipt.status!=='applied' || !t.feedback.actionSucceeded){this.receipts=false;this.deviations.push(`step:${i+1}:receipt_unconfirmed`);}
    if(expected && t.receipt.status==='applied') {
      try { if(exactWorldKey(simulate(t.before.state,expected.action))!==exactWorldKey(t.after.state))
        this.deviations.push(`step:${i+1}:result_mismatch`); }
      catch {this.deviations.push(`step:${i+1}:simulation_failed`);}
    }
  }
  finish(final:GameState,goalSucceeded:boolean,externalChange:boolean,providerCalls:number,searchExpanded:number,interrupted=false):ExecutionEvidence {
    const exactReplay=this.actual.length===this.program.steps.length && !this.deviations.length && this.receipts;
    const status=externalChange?'external_change':interrupted?'interrupted':this.deviations.length||!this.receipts?'deviated':goalSucceeded?(exactReplay?'success':'deviated'):'failure';
    return {runId:this.runId,policyVersion:this.policyVersion,programId:this.program.id,initialKey:exactWorldKey(this.initial),
      exactReplay,goalSucceeded,receiptConfirmed:this.receipts,actualActions:[...this.actual],deviations:[...this.deviations],status,
      energyDelta:final.energy-this.initial.energy,
      outcome:{steps:final.turn-this.initial.turn,energy:final.energy,bag:final.bag,delivered:final.delivered,attacks:final.attacks-this.initial.attacks,
        providerCalls,searchExpanded,objectiveVersion:'deliver-five-survive/v1'}};
  }
}
/** Explicit Pareto comparison; missing vectors are never treated as a free cost. */
export function dominates(a:OutcomeVector,b:OutcomeVector):boolean {
  if(a.objectiveVersion!==b.objectiveVersion)return false;
  const pairs:[[number,number],...[number,number][]]=[[b.steps,a.steps],[a.energy,b.energy],[a.bag,b.bag],
    [a.delivered,b.delivered],[b.attacks,a.attacks],[b.providerCalls,a.providerCalls],[b.searchExpanded,a.searchExpanded]];
  return pairs.every(([x,y])=>x>=y)&&pairs.some(([x,y])=>x>y);
}

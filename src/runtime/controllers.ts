import { ProposalRejected } from '../../vendor/gs-engine-ts/src/rejection.js';
import type { Selector, Planner, Arbiter, Judgment, ModelResult } from '../../vendor/gs-engine-ts/src/types.js';
import type { GameState, GameAction, GamePolicy, GameContext, GameCandidate } from '../game/types.js';
import { CAPABILITIES } from '../game/types.js';
import { reachableBerries, dangerous, path } from '../game/world.js';

/** Deliberately NOT an AI model. These scores are authored rules for offline demonstrations. */
export function heuristicScore(ctx:GameContext,c:GameCandidate):number {
  const s=ctx.snapshot.state,p=ctx.policy.body,a=c.action;
  const homeSteps=path(s,s.player,s.home)?.length??1000;
  const hasEnough=s.delivered+s.bag>=s.target;
  const reachable=reachableBerries(s);
  switch(a.kind){
    case 'eat':
      if(hasEnough&&s.energy>homeSteps+3)return -30;
      return s.energy<=p.reserveEnergy?190:-35;
    case 'deposit':return 200;
    case 'pickup':return hasEnough?-10:140;
    case 'drop':return 150;
    case 'wait':return s.lures.length||(s.guards.some(g=>g.eating>0)&&!reachable.length)?35:0;
    case 'move':
      if(a.objective==='safe')return dangerous(s,s.player)?240:8;
      if(a.objective==='home')return hasEnough||s.bag>=s.capacity||p.mode==='return'?175-a.distance*0.2:reachable.length?10:-15;
      if(a.objective==='lure')return 125-a.distance;
      if(a.objective==='berry')return hasEnough?-20:95-a.distance*1.3;
  }
  return -100;
}
export class HeuristicSelector implements Selector<GameState,GameAction,GamePolicy>{
  async evaluate(ctx:GameContext,cs:readonly GameCandidate[],signal:AbortSignal):Promise<ModelResult<Judgment>>{
    signal.throwIfAborted();const ranked=cs.map(c=>({c,score:heuristicScore(ctx,c)})).sort((a,b)=>b.score-a.score);
    const top=ranked[0];const none=!top||top.score<=0;
    const raw=ranked.map(x=>({id:x.c.id,weight:Math.exp(Math.max(-30,(x.score-(top?.score??0))/18)),score:x.score}));
    const noneWeight=none?6:0.005;const sum=raw.reduce((a,x)=>a+x.weight,noneWeight);
    const probabilities:Record<string,number>={},suitability:Record<string,number>={};
    for(const x of raw){probabilities[x.id]=x.weight/sum;suitability[x.id]=x.score>0?0.96:0.08;}
    return {output:{choice:none?null:top!.c.id,confidence:none?0.4:0.9,probabilities,
      abstainProbability:noneWeight/sum,suitability}};
  }
}
export class TemplatePlanner implements Planner<GameState,GameAction,GamePolicy>{
  constructor(private readonly adaptive=true){}
  async propose(ctx:GameContext,_reason:string,signal:AbortSignal):Promise<ModelResult<unknown>>{
    signal.throwIfAborted();const s=ctx.snapshot.state;
    let body:GamePolicy=structuredClone(ctx.policy.body);
    let explanation='固定策略不更新；本轮停止以便观察失败原因。';
    if(this.adaptive){
      if(s.bag>0&&s.guards.length&&ctx.policy.body.mode!=='lure'){
        body={mode:'lure',subgoal:'先用一颗浆果引开守卫，再采集并返回；不足五颗时保留下一次诱饵。',enabled:[...CAPABILITIES],reserveEnergy:22};
        explanation='离线预置修复：当前候选无法安全采集。启用已有 drop 能力并试行诱饵策略。这是规则模板，不是 LLM 生成。';
      } else if(s.delivered+s.bag>=s.target&&ctx.policy.body.mode!=='return'){
        body={...body,mode:'return',subgoal:'已有足够浆果，优先回家交付。'};
        explanation='离线预置修复：切换到交付子目标。';
      } else {
        explanation='离线策略库没有其他可用修复；不伪造新能力，交还控制权。';
      }
    }
    return {output:{baseVersion:ctx.policy.version,basedOnRevision:ctx.snapshot.revision,body,explanation}};
  }
}
export class GameArbiter implements Arbiter<GameState,GameAction,GamePolicy>{
  decide(ctx:GameContext,cs:readonly GameCandidate[],j:Judgment){
    if(j.choice===null)return {kind:'repair' as const,reason:'no_suitable_candidate'};
    if(!cs.some(c=>c.id===j.choice))return {kind:'stop' as const,reason:'invalid_candidate'};
    if((j.suitability[j.choice]??0)<0.5)return {kind:'repair' as const,reason:'no_suitable_candidate'};
    return {kind:'execute' as const,candidateId:j.choice};
  }
}
export type RunMode='adaptive'|'fixed'|'jev-template'|'live'|'program'|'rules-full'|'program-jev'|'program-live'|'reactive'|'reactive-off'|'reactive-record'|'reactive-jev'|'reactive-live';
export const isRemoteMode=(mode:RunMode):boolean=>['jev-template','live','program-jev','program-live','reactive-jev','reactive-live'].includes(mode);
export const isProgramMode=(mode:RunMode):boolean=>['program','rules-full','program-jev','program-live'].includes(mode);
export const MODE_LABELS:Record<RunMode,string>={reactive:'父子 G/S + 反应技能', 'reactive-off':'反应技能 · 经验关闭', 'reactive-record':'反应技能 · 只记录经验','reactive-jev':'Jev + 反应技能','reactive-live':'Jev + LLM 技能提案',adaptive:'G/S 离线规则演示',fixed:'固定策略 · 离线', 'jev-template':'Jev + 预置修复',live:'Jev + LLM（旧版配置）',program:'程序搜索 + 技能记忆', 'rules-full':'完整预置规则 · 无生成', 'program-jev':'Jev + 本地程序搜索', 'program-live':'Jev + LLM 程序生成'};
export class RemoteSelector implements Selector<GameState,GameAction,GamePolicy>{
  constructor(private readonly token:string){}
  async evaluate(ctx:GameContext,candidates:readonly GameCandidate[],signal:AbortSignal):Promise<ModelResult<Judgment>>{
    return remote('/api/select',{context:ctx,candidates},this.token,signal) as Promise<ModelResult<Judgment>>;
  }
}
export class RemotePlanner implements Planner<GameState,GameAction,GamePolicy>{
  constructor(private readonly token:string,private readonly endpoint='/api/plan'){}
  async propose(ctx:GameContext,reason:string,signal:AbortSignal):Promise<ModelResult<unknown>>{
    return remote(this.endpoint,{context:ctx,reason,repairProtocol:true},this.token,signal) as Promise<ModelResult<unknown>>;
  }
}
async function remote(url:string,data:unknown,token:string,signal:AbortSignal):Promise<unknown>{
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-gs-token':token},body:JSON.stringify(data),signal});
  const payload=await res.json() as {error?:string;rejection?:import('../../vendor/gs-engine-ts/src/types.js').Json;usage?:import('../../vendor/gs-engine-ts/src/types.js').Usage};if(!res.ok){if(res.status===422&&payload.rejection)throw new ProposalRejected(payload.rejection,payload.usage);throw new Error(payload.error??`服务端错误 ${res.status}`);}return payload;
}

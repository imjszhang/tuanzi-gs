## v0.5.4 AdaptiveGS — same-layer first

AdaptiveGS provisionally installs G-authored interfaces; S alone selects domain actions. Explicit read-only subproblems reuse the loop and return evidence to the original G, including bounded local failures. There is no default recursive approval chain. maxDepth=0 permits root adaptation while disabling child expansion. See the enclosing project docs/DESIGN-v0.5.4.md and tests/adaptation054*.test.mjs. No live-model results claimed.

The material below documents historical GSEngine APIs, retained for independent reference tests.
# Reference release v0.3

新增有界提案纠错、共享资源预算与单一执行租约。参见 `CHANGELOG-v0.3.md`。下方为基础 API 说明；游戏中的局部技能和实际父子调度位于应用 `src/skills`，不在这个通用包里硬编码。

# G/S Engine — TypeScript reference v0.2

一个与游戏、浏览器和模型厂商解耦的 Generate/Select 运行时。**这里交付的是运行机制与协议骨架，不是已经验证性能的智能 Agent。**

## v0.2 增量

新增可选 `Domain.assess` 诊断、`Domain.validateProposal` 新提案验证，以及有限程序契约 `program.ts`。详细变化见 `CHANGELOG-v0.2.md`。游戏中的搜索器和精确条件记忆属于上层适配器，不是此通用内核内置的学习能力。

## 运行

测试环境：Node.js 22.16.0、TypeScript 5.8.3。没有运行时 npm 依赖。

```bash
npm install
npm test
npm run demo
```

压缩包也包含预编译 `dist/`。不安装编译器，可以直接：

```bash
node --test tests/*.test.mjs
node examples/offline.mjs
```

`offline.mjs` 是脚本化的计数器测试环境，Selector / Planner 全部为 mock。它检验协议，不展示 AI 能力，不调用网络，也不产生模型费用。

## 文件

```text
src/types.ts             数据契约、环境/模型接口
src/engine.ts            串行 step、预算、执行与验证、策略更新
src/support.ts           运行时解析、示例仲裁器、内存事件日志
src/program.ts           有限程序解析与逐步前置状态检查
src/adapters/jev.ts      官方 Jev HTTP 协议适配器；没有隐藏重试
src/adapters/planner.ts  通用 JSON LLM 回调接口；需接入具体提供商
examples/fixture.mjs    故意简单且完全脚本化的测试环境
examples/offline.mjs    无网络运行示例
tests/                  内核与 HTTP mock 测试
DESIGN.zh-CN.md          实现设计和扩展边界
TEST-RESULTS.txt         本地编译与测试输出
```

## 核心 API

```typescript
const engine = new GSEngine({
  runId, goal, initialPolicy,
  domain, selector, planner, arbiter, journal,
  limits
});

const result = await engine.step(abortController.signal);
```

同一实例不能并发执行 `step()`。驱动程序在动作完成或环境就绪时调用下一步。不要以重叠的 `setInterval` 驱动模型请求。

`Domain<S,A,P>` 定义世界快照、当前候选实例化、权限与前置条件检查、动作执行、目标验收、执行反馈、策略结构解析和语义校验。它是受信任的应用代码，模型不能覆盖它。

`Selector` 返回 `Judgment`，不执行动作。`Arbiter` 将判断转成 execute/repair/pause/stop。`Planner` 返回未信任的 JSON 策略提案，不执行代码、不改根目标。

提案形状：

```json
{
  "baseVersion": 1,
  "basedOnRevision": "world-r10",
  "body": { "subgoal": "application-specific", "enabled": ["existing-capability"] },
  "explanation": "A short proposal justification; not a hidden thought trace."
}
```

`body` 的 Schema 与合法性由你的 Domain 定义。示例 body 只是测试域协议，不是通用游戏策略语言。运行时拒绝顶层额外字段，校验版本与环境状态，然后调用 `parsePolicy`、`validatePolicy` 和可选的 `validateProposal`。配置生效后，下一轮重新观察并重建候选。**校验通过只是允许试运行，不是证明策略更优。**

## Jev 接入

`JevSelector` 使用公开 HTTP 接口。需从服务器环境变量提供 API key，显式设置模型 ID，并提供用于脱敏/压缩上下文的 `encode`。

```typescript
const selector = new JevSelector({
  apiKey: process.env.TYPESAFE_API_KEY!, // 在应用启动时检查变量确实存在。
  model: "jev-1.13.0",
  encode: (ctx, candidates) => ({
    task: ctx.goal.description,
    policy: ctx.policy.body,
    observation: ctx.snapshot.state,
    recent: ctx.recent.map(t => ({
      action: t.candidate.description,
      facts: t.feedback.facts
    })),
    candidates: candidates.map(c => ({
      id: c.id, description: c.description, action: c.action
    }))
  })
});
```

每次一条 Choice + 每候选一条 Noul，同批独立评估；Noul 不引用另一道题尚未产生的答案。这只是保守参考方案，应测量额外 token 和质量收益，而不是认定每个任务都需要双重判断。

SDK 也可用 `@typesafe-ai/sdk`；替换适配器不会改变核心。官方 SDK 默认可能重试，采用 SDK 时必须显式控制重试并计入预算；这里的直接 HTTP 适配器不自动重试。

`JsonPlanner` 只有供应商无关的回调接口。接入你选定的生成模型后，返回 `{output: <解析后的不可信JSON>, usage?: ...}`。必须将可用能力、字段约束、当前规则、目标与失败证据一并提供；不能依赖模型看到未提供的世界知识。**没有进行 Jev 或任何 LLM 的真实 API 调用。**

## 已实现边界

- 单次串行决策；取消、I/O 超时与运行期限。
- 有效候选生成、执行前权限复核、显式拒绝与升级。
- 世界版本与策略版本校验；过期结果丢弃。
- 原子执行/幂等键接口契约；测试域实现原子版本检查和幂等。
- 策略 JSON 校验、受控切换、禁止改根目标和新增未授权能力。
- 调用数/动作数/循环数/修复次数/时间限制；调用前计数。
- 独立完成判定、执行反馈、有限历史、完整内存事件日志。
- 不确定执行结果暂停整次运行，不自动重试或恢复。

## 未实现与重要限制

1. 通用内核不包含游戏 UI、游戏搜索器或程序记忆；这些由配套团子项目提供。没有真实模型效果评测、在线训练、自动技能抽象或递归子运行调度。
2. `MemoryJournal` 不持久；没有崩溃恢复、跨进程锁、分布式事务、审批恢复或生产级对账。生产环境需持久记录动作意图，确认外部执行后再恢复。
3. 客户端取消不能保证远端副作用取消。当前代码暂停不确定运行；不提供强行恢复接口。不要新建实例盲目重试旧副作用。
4. `revision` 采用保守全局快照检查，适合回合制/事件驱动的验证环境。实时游戏不能将每个渲染帧号用作这个版本；应设计与动作相关的有效性条件，否则持续变化会使结果不断过期。
5. `Domain.execute` 是真正安全边界：只在上层检查状态存在 TOCTOU 风险。无法原子检查的网页/远端系统，应执行前就地校验，模糊结果回传 unknown。
6. `noProgressWindow` 和 `suitabilityFloor` 是领域参数。示例 0.7 并未经校准。短期没有奖励不必然说明失败，反馈应识别子目标进展。
7. 目前没有货币硬预算。记录已知 token、模型和可选实际成本；缺失成本不是零。实现美元上限需预留单次最坏成本、结算和失败调用核算，不能只在调用后相加。
8. 内核的 `modelCalls` 是 Selector/Planner 接口调用预算，不等同于外部计费请求数。离线实现也会消耗接口调用预算。应用需要另外记录实际 provider 尝试、重试和返回用量；不能把缺失费用记成零。
9. 原始事件可能含用户资料；实际部署需要脱敏、访问控制和保留策略。模型输出/网页文本不应获得修改权限、验收器或预算的能力。
10. 当前 Planner 每次提交一个提案。未来可以生成多个并做离线比较；当前“被接受”不表示在实测绩效上胜过旧策略。

## 文档依据（2026-09-23 核对）

- TypeSafe HTTP API: https://docs.typesafe.ai/api
- JavaScript / TypeScript SDK: https://docs.typesafe.ai/sdk/javascript
- Choice: https://docs.typesafe.ai/primitives/choice
- Noul: https://docs.typesafe.ai/primitives/noul
- Confidence: https://docs.typesafe.ai/confidence
- Models and version aliases: https://docs.typesafe.ai/models
- TypeScript narrowing: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
- Node AbortSignal: https://nodejs.org/api/globals.html

这些文档用于协议核对，不构成对 G/S 质量、速度或成本收益的实验证明。


## v0.4.2 additive recovery hooks

`Context.executionFeedback` is measured prior execution evidence, separate from retry-local `repairFeedback`. An optional `Domain.repairContext` supplies trusted, bounded evidence at the repair boundary. An optional `Domain.afterTransition` routes a recorded actual transition to pause/stop when host diagnosis requires it. `RepairBlocked` is an explicit non-retryable recovery stop, not malformed model JSON.

All selector answers, including abstention, are checked against a fresh snapshot before arbitration. The core does not automatically call another model or pick the second-ranked action when a selector abstains. Domain adapters own phase semantics and decide whether a problem is missing skill structure, a judgment block or an execution failure.

DecisionPacket may contain `taskContext`; schedule reports distinguish question organization from dispatch strategy. Old interfaces remain compatible. No production persistence or live-model performance is implied by these additions.

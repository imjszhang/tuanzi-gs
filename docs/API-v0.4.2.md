# G/S Lab v0.4.2：API 增量

路由、鉴权、控制版本与幂等协议沿用 [API-v0.4.1.md](API-v0.4.1.md)。默认本地服务仍为 127.0.0.1:4173。不要把本页当成新增的开放控制权限。

## 状态与原因

- 操作员 `pause`：决策边界暂停，可按既有控制权协议继续。
- 引擎 `paused` → 服务 `blocked`：根运行已在判断/执行边界结束；不能对同一个已终止引擎反复 start。需导出证据，修正条件后显式新建实验或从检查点分支。
- `decision_blocked:no_local_suitable_action`：下层模型没有推荐合法候选。
- `decision_blocked:parent_no_suitable_skill`：已有适用生成技能，但父层仍弃权。
- `duplicate_repair_no_new_evidence`：同一条件下重复行为结构被拒绝，不按提案格式错误重试。
- `repair_budget_exhausted`：仍有明确定义的原始预算，不再掩盖成通用“达到边界”。

## 可选 diagnostics 字段

HTTP 读取状态、CLI status/result、SSE 的 view 以及报告导出可见相同诊断。字段为结构化 JSON，不含服务 token 或 API key：

```text
diagnostics
  contextVersion
  pendingHalt: { reason, ... } | null
  latestFailure: ExecutionFailure | null
  failureCount
  budgets
```

以运行返回为准；不存在的失败为 null，不应补造。`ExecutionFailure` 含规范化技能结构/显示指纹、失败分类、实际步骤/资源变化、阶段、完整最后决策证据包及判断、world/revision、参数绑定、控制器、建议处理路线、是否新证据。上下文版本或实际信息改变后应作为新实验留痕。

判断记录新增 `judgment`；同时记录 `questionStrategy`（问题组织）和 `dispatchStrategy`（请求调度）。这两个维度在 direct 模式下可能分别为 direct 和 batch，含义是单题经批调度器发送，不是多题拆分。

## 外部 Agent 的推荐处理

1. 收到 blocked，停止自动重启、重复生成和扩大预算。
2. 读取诊断与最后模型答案，export 当前 run；人看到同一份状态。
3. 需要现场验证时先使用冻结子判断探针，用户明确授权每次真实请求。
4. 更改上下文/模型/环境后新建并标注实验，不能把新条件下的成功记在旧运行上。
5. 只有结构性执行失败进入修复时，传递 executionFeedback；与 proposal validation 的 repairFeedback 分开。

API 不提供强制动作、覆写 success、删除失败证据或任意代码执行。模型弃权不被视为执行权限；阈值与 none 的原语含义未改变。

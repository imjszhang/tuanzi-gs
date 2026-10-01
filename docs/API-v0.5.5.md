# G/S Lab v0.5.5：CLI / HTTP / Agent 接口

控制端点沿用v0.4.2；流式事件沿用v0.5.1；本版改变被测控制器的内部调整逻辑，不改变共享会话或写入权限。

| 操作 | 路由 |
|---|---|
| 本机bootstrap | GET /api/status |
| 能力/列表 | GET /api/lab/capabilities；GET /api/lab/runs |
| 创建实验 | POST /api/lab/runs |
| 权威快照 | GET /api/lab/runs/:id |
| 控制命令 | POST /api/lab/runs/:id/commands |
| 事件分页/续订 | GET .../events；GET .../stream |
| 结果/导出 | GET .../result；GET .../export |
| 检查点/分支 | .../checkpoints；.../forks |

详细commandId、控制版本、接管与token规则见API-v0.4.2.md；token仅用于本机可信操作者协同，不是公网认证。

## 当前自主配置

controller=adaptive, kind=game；backend=rule/jev/llm；generator=local/llm。真实模型必须allowLive=true、有显式预算与服务端凭据。旧hierarchy/program/rules为离线参考，禁止混入自主记忆或模型运行。

maxDepth范围0..3默认2，表示**明确子问题的最大嵌套深度**；0仍可运行根G及同层调整。maxGCalls默认12（1..32）；maxRevisions默认3（1..6）；maxFormatRepairs默认2（0..4）。本次没有增加默认根预算。

```
node bin/gs-lab.mjs capabilities
node bin/gs-lab.mjs create --kind game --controller adaptive --scenario guarded --backend rule --generator local --max-depth 0
node bin/gs-lab.mjs step RUN_ID
node bin/gs-lab.mjs start RUN_ID --wait
node bin/gs-lab.mjs pause RUN_ID
node bin/gs-lab.mjs events RUN_ID --follow
node bin/gs-lab.mjs export RUN_ID --out reports/run.json
```

## 运行语义

创建不运行；首次start/step先G。一个step至多一个实际动作，可以含同层修订、格式纠错和显式子问题。pause在该量子边界生效，cancel传播在途树，不能退款或撤销已发生的物理效果。网页读取、展开流、重连不触发模型请求。

G提交唯一暂行配置，不再经过默认元层审批。S返回none时当前G可以改方案，不能强制S返回已知答案。子问题没有执行权。局部深度失败返回父G，根预算/取消/过期/供应商失败不能绕过。

状态schema继续gs/lab-state/v1，产品version=0.5.5。initialization.policy=g-before-action/v054；ready指初始条件已装载，后续S仍可能无法行动。终局blocked不是操作员paused，不能透明恢复；需要保留证据并显式创建新实验。

## 观察新增字段

- diagnostics.controlMode=same-layer-first/v054；candidatePolicy=explicit-scope/v054。
- diagnostics.subproblems：子问题返回与未解决证据，模型结论始终未验证。
- 兼容字段metaCalls现在计子问题S；根动作S次数为sCalls-metaCalls。
- adaptation_committed的mode/status/worldAction区分暂行上下文与世界动作。
- subproblem_enter、subproblem_return、same_layer_resumed在同一事件序号流里。
- G账本与g_stream可带purpose=subproblem；推理内容仍只读，不作为事实传回G/S。
- latestValidation可带gs/decision-consistency/v054，明确JSON路径与声明矛盾；普通格式错误仍是gs/output-validation/v1。

所有请求和已发生的失败都计入同一个根账本。子任务返回answered不意味着策略成功，只有根环境验收决定任务完成。

## 操作员边界

Agent主持实验而不是替S选动作。不允许把参考路线、正确动作、参考模拟或优化位置以提示、标签、记忆、导出回填等方式送入G/S。程序化评估只能事后另写报告。旧日志、负向测试夹具不是自动学习输入。

多次实验必须标注变更条件，不能不断扩大额度或重跑同条件直到看见喜欢的答案再报告。凭据只保留服务端；下载导出前检查是否含业务私密信息。

## v0.5.5 additions

Current product version 0.5.5, core same-layer contracts remain v054. Optional create configuration: jevMaxRetries=2 (0..5), jevRetryBaseMs=500 (0..10000), jevRetryMaxMs=5000 (0..30000, >=base), jevAttemptTimeoutMs=8000 (100..25000). Commands unchanged.

s_retry event / view.transportRetry expose gs/s-retry/v1; ledger rows have logicalRequestId/attempt/maxAttempts/worldRevision/failureKind/providerStatus. Report requestAttempts remains logical batches; transportAttempts contains actual requests/questions/externalRequests. Host root ledger is authoritative for spending. No HTTP MCP route is added: local MCP uses stdio and the existing authenticated loopback HTTP API. Details in MCP-v0.5.5.md and RETRY-v0.5.5.md.

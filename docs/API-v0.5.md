# G/S Lab v0.5 API 增量与 Agent 操作

基础URL、认证、状态/事件、命令幂等与控制版本规则保留。完整端点表参见`API-v0.4.2.md`或`API.md`的历史协议，**v0.5差异以本文件为准**。

- `GET /api/status`本地bootstrap token，API不提供宽泛CORS。token不放URL。
- `GET /api/lab/capabilities`返回新controller及额度。
- `POST /api/lab/runs`创建。`create`不调用模型。
- `GET /api/lab/runs/:id`唯一权威状态。
- `POST /api/lab/runs/:id/commands`命令。
- `GET .../events`、`.../stream`分页/SSE，可按序号续读。
- `GET .../result`、`.../export`；`.../checkpoints`和`.../forks`。

## 自主配置

```json
{
  "requestId": "autonomous-001",
  "actor": {"id":"agent:experiment", "kind":"agent", "label":"自主调整实验"},
  "config": {
    "kind":"game", "controller":"adaptive", "scenario":"guarded",
    "backend":"rule", "generator":"local", "strategy":"direct",
    "maxRequests":80, "maxGCalls":8, "maxDepth":2, "maxRevisions":3,
    "maxActions":180, "deadlineMs":600000, "experience":"use"
  }
}
```

上例是离线机制夹具。模型版改backend=jev/generator=llm，并显式allowLive=true；服务端必须就绪。backend=llm也可用于同协议选择器对照，但不是快速Jev。

G额度1..32，默认12；递归深度1..3，默认2；每层修订1..6，默认3。根请求账本包含动作S、元层S、G；问题计数只计结构化S问题。程序自己的内存/CPU和日志序列化成本仍体现在整局耗时，不伪装免费。

## 返回证据

Lab状态版本为0.5.0；旧导出仍可只读查看。
`diagnostics.schema=gs/adaptive-diagnostics/v05`含：phase/depth/policyVersion/sCalls/gCalls/metaCalls/actualActions/program/adaptations/assistance/budgets/provenance。

重要事件：s_requested、s_answered、g_requested、g_proposed、meta_enter、meta_return、adaptation_committed、adaptation_rejected、feedback_review_required、action_receipt、transition。
`adaptation_committed`包括before/after和提案值；不是世界执行成功。

G/S全输入输出在自主trace.requests中按角色/深度记录。供应商请求不含Authorization头或密钥。真实模型、离线规则夹具、测试mock不能仅凭config判断，必须读取实际账本source/kind。

## 生命周期与干预

`step`最多一个物理动作，但可以包含有界内部G/S修订。`pause`等待该量子结束；取消向所有层传播。none进入内部修订，只有额度/深度等终止原因导致最终blocked/stopped。终止运行不能透明续跑；操作员paused才可继续。

世界改变后过期输出不得执行。外部干预仍只允许注册的地图工具且必须留痕。不能强制下一动作、上传任意代码、修改根目标、注入上下文/记忆/评估结果。

## 分支与隔离

memory=inherit仅在同一自主/参考类别内允许。自主记忆只含自身实际试行的决策程序；旧reference catalogue/book/experience不能进入adaptive。
新的实网分支需重新allowLive和maxRequests。新分支额度与阶段重新开始，不是调用栈恢复，也不是统计独立样本。

## 旧路由

`/api/select`、`/api/plan`、`/api/program`、`/api/reactive-select`、`/api/reactive-plan`均410。历史控制器只允许离线backend=rule,generator=local。没有自动迁移或降级。

## CLI

```bash
node bin/gs-lab.mjs create --kind game --controller adaptive --scenario guarded --backend rule --generator local --strategy direct --max-g-calls 4 --max-depth 2
node bin/gs-lab.mjs step RUN_ID
node bin/gs-lab.mjs start RUN_ID --wait
node bin/gs-lab.mjs status RUN_ID
node bin/gs-lab.mjs events RUN_ID --follow
node bin/gs-lab.mjs export RUN_ID --out reports/run.json
```

完整配置可由--config传入，但未知字段仍被拒绝。帮助`node bin/gs-lab.mjs help`。

## v0.5.3 additive startup semantics

New adaptive game runs execute an initial_environment_review G phase on first start/step, before action-level S. No calls on create or observer reads. Existing command semantics (one quantum, at most one action) and idempotency remain. New diagnostics.initialization and initialization_* events track pending/reviewing/ready/failed/skipped-terminal, reviewCount and reviewedRevision. G ledger purpose=initialization; output repairs preserve originalCause. All quotas still shared. Fork is a new session and reviews its own starting snapshot. These additions do not turn old imported reports into live runs.

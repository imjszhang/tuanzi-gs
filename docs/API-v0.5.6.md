# G/S Lab v0.5.6：CLI / HTTP 增量

控制路由、命令幂等、控制权、重试与本地 MCP 继承 [API v0.5.5](API-v0.5.5.md)、[MCP v0.5.5](MCP-v0.5.5.md) 和 [RETRY v0.5.5](RETRY-v0.5.5.md)。产品版本为 `0.5.6`；状态、导出与能力 schema 仍分别为 `gs/lab-state/v1`、`gs/lab-export/v1`、`gs/lab-capabilities/v1`。

## 配置与能力

`maxGCalls` 现支持 `1..256`，默认 `12`；CLI 对应 `--max-g-calls`。其他预算与重试规则不因这个上限变化而取消。

`capabilities.deadlockReferee` 描述自动启用的裁判：

```json
{
  "policy": "sound-static/v1",
  "scope": "game/adaptive host boundaries",
  "observerOnly": true,
  "modelFeedback": false,
  "complete": false,
  "event": "deadlock_referee"
}
```

仅 `kind=game, controller=adaptive` 使用该规则，没有新增裁判控制命令。创建事件 `run_created.data` 会包含 `deadlockPolicy` 与 `observerOnly: true`。

## 观察记录

首次执行前和动作之后由宿主检查；未检查前 `state.referee` 不存在，导出 `evaluation.referee` 为 `null`。完成检查后，二者保存最近一次记录：

| 字段 | 含义 |
| --- | --- |
| `schema` | `gs/deadlock-referee/v1` |
| `policy` | `sound-static/v1` |
| `worldRevision` | 被检查世界的版本字符串 |
| `verdict` | `proven-deadlock` 或 `not-proven` |
| `reason` | 命中的充分条件，或未证明/暂缓原因 |
| `proof` | 仅已证明时存在，含 `rule` 与 `facts` |
| `observerOnly` | 固定为 `true` |

已证明原因：`insufficient_total_resources`、`home_disconnected`、`stationary_resource_lock`。未证明原因：`no_static_proof`、`pending_interventions`、`already_terminal`。`not-proven` 一律不能解读为任务可完成。

记录发生变化时产生外层事件 `type=deadlock_referee`，记录位于 `data.assessment`，沿用既有事件序号和分页方式。它不是 `engine` 事件。自主游戏导出另含 `evaluation.deadlockPolicy`；裁判证据不写入原始引擎轨迹或自主记忆。

## 外层终局

已证明死局时，权威快照中的外层字段为：

```json
{
  "status": "failed",
  "reason": "deadlock_proven:<rule>",
  "outcome": {
    "kind": "done",
    "outcome": "failed",
    "reason": "deadlock_proven:<rule>",
    "source": "environment-referee"
  }
}
```

读取方应以外层 `status/reason/outcome.source` 判断裁判终局；原始引擎结果可能尚未终结，保持原样供审计。常规成功、能量/回合耗尽、取消及供应商故障维持既有处理优先级。

先执行到期的计划干预；还有未来干预时返回 `not-proven / pending_interventions`。交互干预或新增计划会清除过期裁判记录，下次执行边界再检查。创建、读取、观看和导出本身均不重判或调用模型。

所有上述证据只用于外部观察。不得将判据、证明或由此推导的提示回填 G/S 输入、候选、反馈或继承记忆。

## G 单次生成超时

`gTimeoutMs` 默认 600000（10 分钟），范围 100..3600000 ms；CLI `--g-timeout-ms`，网页高级配置和 MCP config 同步支持。只影响自主 G 的初始化、常规调整及格式纠错，S 的独立判断与 Jev 访问超时保持不变。该值在创建时固定并随配置导出；整局墙钟与取消始终优先，不会因新请求重置。历史导出缺失此字段时，其旧版单次上限为120000ms。流关闭/传输异常继续按原来的错误处理；没有增加 G 网络重试。

## 长推理流的传输大小

G 的 SSE 响应不再以累计4MiB流量终止。传输字节仍计入审计，但每个独立消息处理后释放协议缓存；单行/单帧各保留4MiB限制。非流式JSON整包、最终内容及公开推理文本仍按原来的独立长度限制验证。G超时、整局截止和取消仍生效；部分输出永不作为有效提案。此次调整不增加模型调用或重试，也不修改模型输入。

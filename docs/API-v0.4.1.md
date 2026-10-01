# G/S 实验控制 API v1

## 服务与认证

默认 `http://127.0.0.1:4173`。只监听本机。CLI 和网页先 GET `/api/status`，取得本地随机 token，后续 `/api/lab/*` 请求携带 `X-GS-Token`。

浏览器请求仅允许本机同源；不提供宽泛 CORS。CLI 无 Origin 时允许携带 token。token 不放 URL，避免浏览历史与 referrer 泄漏。actor 只用于同一可信用户的并发协调、溯源；不是多租户身份认证。

错误：`{"error":{"code":"STALE_CONTROL","message":"Expected 1"}}`。400 结构错误，401 未认证，403 跨源，409 版本/控制冲突，413 过大，429 容量限制，503 未配置提供商。

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/lab/capabilities` | 支持的任务、组织、后端就绪、默认配置与上限 |
| GET | `/api/lab/runs` | 当前服务持有的会话列表（不扫描磁盘旧归档） |
| POST | `/api/lab/runs` | 创建会话，返回 runId / viewerUrl / snapshot |
| GET | `/api/lab/runs/:id` | 当前权威 LabView |
| POST | `/api/lab/runs/:id/commands` | 串行控制命令 |
| GET | `/api/lab/runs/:id/events?after=0&limit=100` | 按 seq 分页；nextCursor / hasMore |
| GET | `/api/lab/runs/:id/stream?after=SEQ` | SSE，事件名 lab，id 为 seq |
| GET | `/api/lab/runs/:id/result` | complete + state + 请求账本；终局附 engine trace |
| GET | `/api/lab/runs/:id/export` | 完整 gs/lab-export/v1 JSON |
| GET | `/api/lab/runs/:id/checkpoints` | 不可变检查点列表 |
| POST | `/api/lab/runs/:id/forks` | 从指定检查点创建新试验 |

不存在可上传任意代码或强制下一动作的接口。输入中未知字段会被拒绝。

## 创建

```json
{
  "requestId": "experiment-energy-001",
  "actor": {"id": "agent:research", "kind": "agent", "label": "实验 Agent"},
  "config": {
    "kind": "judgment",
    "task": "energy",
    "strategy": "batch",
    "backend": "rule",
    "maxRequests": 512,
    "deadlineMs": 120000,
    "orderSeed": 441
  }
}
```

相同 requestId 和规范化内容重复提交，不新建实例；内容不同返回 409。主游戏改为 `kind=game`，`scenario=guarded`，`controller=hierarchy`。默认不共享技能或经验。

`config.interventions` 示例：

```json
[{"afterAction":3,"tool":"wall","point":{"x":3,"y":8}}]
```

目标和物理权限由注册任务决定，不接受模型自定义验收器。create 只分配会话，不调用模型，也不启动游戏时钟。

## 命令

```json
{
  "commandId":"one-step-001",
  "expectedControlVersion":0,
  "actor":{"id":"agent:research","kind":"agent","label":"实验 Agent"},
  "action":"step"
}
```

返回 `{commandId,accepted:true,replayed:false,state}`。step 等待一个决策量子完成；start 只提交持续运行意图，不阻塞到整局完成。所有新控制命令递增 controlVersion，后台物理步骤不会使它自动递增。

同 commandId 的重试要求请求完全相同（包括原来的 expectedControlVersion）；返回原始回执并置 replayed=true。想要最新状态再 GET。服务进程重启后幂等账本不恢复。

控制命令：

- `start`：进入自动运行。
- `step`：推进一轮；不能与 running 或 in-flight step 并发。
- `pause`：取消后续调度，等待当前量子结束，不取消当前副作用。
- `cancel`：合作式取消，在确认当前结果后终止；不回滚已执行动作。
- `takeover`：更换 owner，暂停后续调度，记录 from/to；旧 owner 的新写命令失败。
- `intervene`：增加 `tool`、`point`、`expectedWorldRevision`；只在静止边界执行。编辑失败也保留请求和真实返回，不假装成功。
- `schedule`：增加未来 `afterAction`、`tool`、`point`；静止边界注册。
- `checkpoint`：可选 label；返回 checkpointId。不得在执行中抓取不一致状态。

状态：ready / stepping / running / pausing / paused / cancelling；终局为 succeeded / failed / blocked / cancelled / stopped / fault。**paused 是宿主的人为暂停；blocked 是引擎自身暂停且不可透明继续。**

## 分支

```json
{
  "requestId":"branch-direct-001",
  "actor":{"id":"agent:research","kind":"agent","label":"实验 Agent"},
  "checkpointId":"initial",
  "memory":"none",
  "config":{"strategy":"direct"}
}
```

新 run 拷贝检查点世界，使用新的控制器阶段和预算。lineage 记录来源、memory 和 freshBudgets。它不是恢复父引擎调用栈，不是统计独立样本。`memory=inherit` 明确继承已有技能与经验。已有世界剩余物理回合不会被重置以绕过世界预算。

实网分支不得默认继承支付许可，须在 config 再提供 allowLive=true 与 maxRequests。

## 事件与网页一致性

每个 LabEvent 包含 runId、严格递增的 seq、at、type、data。`state` 事件携带完整快照；`engine` 事件保留源父/子 runId。命令、接管、干预和检查点是独立事件。

SSE 示例：

```text
id: 31
event: lab
data: {"runId":"run-...","seq":31,"type":"state","at":"...","data":{...}}

```

支持 Last-Event-ID，优先于 after。客户端不应重新应用 seq 小于等于本地已见值的事件。读取当前快照后以 lastSeq 订阅，不丢掉期间的新事件。慢读者超过发送缓存阈值会断开，使用事件序号重连；不取消实验。

GET events 分页最多 1000 项；after 超过本 run 最新序号返回 409，不伪装成另一个实验。默认单服务最多 16 个流、32 个会话；满额不会静默删除活跃会话。

## 时间、结果与持久性

clock 从第一次 step（或 start 后首次推进）开始，后续人工暂停计入 deadline。`elapsedMs` 是运行墙钟，`engineWorkMs` 是累计 await 引擎工作的时长（含等待，不是 CPU profiler）。回放速度不影响这些测量。

导出包含 config、initial、lineage、controls、events、checkpoints、script、请求账本、底层 trace 和评价注记。服务终局自动归档；保存结果通过状态包装的 archive 字段报告。活跃崩溃恢复、跨设备同步、防篡改签名和公网认证未实现。

API schema 的 TypeScript 来源是 `src/lab/types.ts`；这些约束由运行时解析器强制执行，而不是只依赖类型声明。

### 预算单位

`maxSearchNodes` 对父子技能模式限制根搜索/绑定模拟工作计数，对旧完整计划模式限制整局 beam search 累计展开节点（跨提案尝试累积）。判断夹具和完整规则没有这种多步生成搜索，其单步模拟事实计算另行统计。不要把不同控制器的“节点”视为统一的 FLOPs；应同时比较实际耗时。模型请求与问题数上限用于真正的判断后端/生成器调用，不把纯规则控制器的旧 `modelCalls` 计数当成外部 API。

# v0.4.1 设计：共享实验控制面

## 一个实验，一份权威状态

```text
外部 Agent ─CLI/HTTP─┐
                    ├─ ExperimentManager ─ LabRun ─ 原 G/S 与 GameWorld
网页的人工命令 ──────┘                       │
网页观测与回放 ← HTTP 快照 + SSE ← LabEvent 序号流
```

浏览器 observer bundle 只复用 WorldRenderer 和基础显示函数，不创建 GSEngine。旧 `play.html` 保持独立离线试玩。服务的 `/lab` 不将旧页面状态当成共享实例。

## 分层

- `src/lab/types.ts`：版本化配置、actor、命令、LabView 与解析器。
- `src/lab/session.ts`：复用已有判断实验、SkillSession、GameSession；提供统一的计量及模型入口。
- `src/lab/manager.ts`：惰性实例化、串行决策、版本/owner、幂等、暂停取消、脚本、检查点、分支、事件。
- `server/lab/http.mjs`：授权、输入大小、REST/SSE、终局归档。
- `bin/gs-lab.mjs`：客户端；CLI 不运行第二份游戏。
- `src/lab/viewer.ts`：只观察与发命令；同一 runId。

## 保持决策算法

v0.4 的批量 `runExperiment()` 改为包装 `createExperimentSession()` 的逐步接口；旧函数签名和结果格式保持，原基准仍可复跑。父子引擎、判断图、世界物理和任务验收器没有为 CLI 重写。

补正一处审计元数据：通过 v0.4 判断图接入的真实模型，也被记录为 provider，而不只检查早期 providers.select 接口。默认规则路径不变。

## 控制与安全边界

每个 run 最多一个异步决策量子。owner + controlVersion 协调不同客户端；世界 revision 保护编辑。相同命令签名重试返回旧结果，不重新执行。

pause 是调度暂停，不向运行中的引擎谎称动作被撤销；cancel 才发取消信号。控制者更换会暂停下一轮，允许当前一轮收尾。失败/unknown 根暂停不能直接 start，需要显式处理后分支。

actor ID 由同一可信用户客户端声明，不能作为跨用户隔离。随机本机 token 不写 URL/报告/浏览器候选事实。服务只监听 loopback，无开放 CORS。远程访问不在本次安全边界内。

## 实验定义与干预

根任务和物理规则固定。脚本在物理动作边界应用，知识观察不算物理动作。原始脚本与后续追加/交互编辑分开记录。操作者能观察审计世界，不能通过接口直接提交下一步团子动作。

检查点在静止边界抓取；分支是新试验，只复制世界和显式选择的记录。既不暗中共享冷启动经验，也不宣称恢复活动子运行的指针和执行租约。分支具有相同根任务，不允许偷换目标。

## 计量与时钟

运行级统计区分：宿主决策量子、物理动作、后端调用、独立问题、外部请求尝试和底层搜索。外部请求使用与旧代理相同的服务总预算。合成延迟仅在 rule 后端启用。

第一次推进前等待不限时；第一次推进后墙钟期限一直前进（包括用户暂停）。独立 engineWorkMs 反映 await 引擎推进的时间。网页动画/回放完全不参与运行调度。

## 事件、断线与持久边界

浏览器读取 snapshot.lastSeq 后订阅 SSE。已保存事件按 ID 续读；断开浏览器只关闭订阅，不取消 run。慢订阅者断开后可重连，不让其阻塞正常实验。

内存事件上限与 run 数量有界。终局 JSON 写到 `.gs-lab/exports`，可以在网页导入只读回放。没有数据库、跨进程执行锁、远端副作用对账或活动崩溃恢复；重新启动服务不会重新执行未确认动作。

## 明确未做

MCP/远端多租户认证、任意工具调用与代码注入、持久恢复、实时独立物理时钟、自动统计实验设计、自动分形/认知结论、真实 Jev 或 LLM 效果评估。本版本是在同一引擎外增加可验证操作面，不是智能能力升级。

## 采用的基础协议文档

- MDN Server-sent events: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- Node HTTP: https://nodejs.org/api/http.html

协议用于单向事件通知与 HTTP 控制。实际运行兼容性由随包 Node/浏览器测试范围说明，不等于所有浏览器或生产部署保证。


旧完整计划参考控制器新增可选累计展开预算；默认旧接口行为保持不变，只有共享服务传入 maxSearchNodes 时启用更明确的整局限制。

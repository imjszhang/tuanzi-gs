# 团子 / G/S Lab v0.5.1

**S 可以信息不全、可以弃权或犯错；G 基于允许的更广观测和 S 的实际输入、选择及执行反馈，重新组织它的上下文、选项与局部任务。** 调整方案也交给 S 选择，必要时递归调整这个上层判断。

## v0.5.1：实时观察 G 的生成

概览右侧「G/S 正在做什么」内新增「生成过程」。G 请求开始后，服务端把实际收到的推理/内容片段推送到同一个 runId；点击「展开」分别查看两个通道，在「判断过程」查看本局 G 历史。

只显示接口已经公开返回的文本（reasoning_content / reasoning 与 content），不制造隐藏推理。未公开推理会明确标注。文本先显示、完整提案后校验；不会执行一半 JSON，也不会把推理通道送回 S 或自身记忆。旧参考解隔离不变。

默认向 G 请求 `stream: true`。不支持该参数的服务商，可在 `.env` 设置 `LLM_STREAM=false`，重启后整包显示；不会在一次失败后偷偷发第二次付费请求。若请求流式但服务商直接返回 JSON，会标成「整包返回 · 非流式」。这版只支持 Chat Completions 兼容协议，不自动改用 Responses / Anthropic 原生协议。

文档：`docs/RELEASE-v0.5.1.md`、`docs/STREAMING-v0.5.1.md`、`docs/VALIDATION-v0.5.1.md`。

## 先启动

需要 Node.js 22+。已经附带编译文件，不需要先安装依赖：

```bash
npm start
```

打开 `http://127.0.0.1:4173/lab`。外部 Agent 和网页访问服务端同一个 runId。

这是一次运行机制与信息边界升级，不是已完成的真实模型性能验证。**没有调用真实 Jev / LLM。** 默认本地后端是“合法动作轮换 + 公开上下文扩展”的协议夹具，不是会解题的替代模型，不保证通关。

## 三条明确分开的路径

| 入口 | 用途 | 允许的信息 |
|---|---|---|
| `kind=game, controller=adaptive` | v0.5 自主 G/S | 公开规则、允许观测、自身模型输出和实际反馈 |
| `controller=hierarchy/program/rules` | 历史离线参考 | 可能含手写战术、搜索、规则模拟，**仅离线** |
| `kind=judgment` | 固定任务的 S 组织对照 | 既有中立事实包；没有 G 自主调整 |

**禁止把离线参考结果、完整解法样例、参考评分、成功轨迹或优化站位送入自主 G/S。** 新路径不调用规则模拟进行方案成功准入、不调用 path/BFS、lureSite、bindPlacement 或参考技能库；程序只保持当前动作合法性与世界物理。G 可以自行推理并选择坐标或条件，但没有参考答案工具。

`/` 和 `play.html` 只保留历史离线试玩，明确标为参考辅助；完整 v0.5 自主闭环在 `/lab`。旧的 `/api/plan`、`/api/reactive-plan` 等带参考辅助的实网端点现返回 410，不会静默迁移成另一种实验。

## 外部 Agent 操作

```bash
node bin/gs-lab.mjs capabilities
node bin/gs-lab.mjs create --kind game --controller adaptive --scenario guarded --strategy direct --backend rule --generator local --max-g-calls 4 --max-depth 2
# 将 RUN_ID 替换为上一步返回值；人打开返回的 viewerUrl
node bin/gs-lab.mjs step RUN_ID
node bin/gs-lab.mjs start RUN_ID
node bin/gs-lab.mjs status RUN_ID
node bin/gs-lab.mjs events RUN_ID --follow
node bin/gs-lab.mjs export RUN_ID --out reports/my-run.json
```

一个 `step` 现在是一个**至多产生一次物理动作的决策量子**，其中可能包含多次有界的 S/G 调整。`pause` 等待当前量子结束；`cancel` 传播到所有递归调用，迟到结果不能写世界。G/S 判断和修订不会偷偷推进物理回合。

真实模型只在服务端配置并显式授权后使用：

```bash
# 先配置自己的 .env；此命令本次未运行
node bin/gs-lab.mjs create --kind game --controller adaptive --scenario guarded --strategy direct --backend jev --generator llm --allow-live --max-requests 80 --max-g-calls 8 --max-depth 2 --deadline-ms 600000
```

`maxRequests` 包括实际 S 批请求和 G 请求，递归不会重置它；另有进程级 `MAX_SERVER_CALLS`。这不是金额硬预算。未知的供应商成本保持未知。

## 验证

```bash
npm install                 # 仅修改 TypeScript 源码、需要本地编译器时
npm run check               # build + 当前代码测试
npm run test:autonomous     # v0.5 定向回归
npm run audit:isolation     # 代码边界审计 + 文件指纹；不是恶意进程沙箱证明
npm run bench:v05           # 明确标注的控制流夹具 + 本地非求解器实跑
npm run test:browser:v05    # Python Playwright + Chromium；见验证说明中的环境限制
```

仅在终局导出以后计算参考结果：

```bash
node scripts/evaluate-reference-v05.mjs reports/my-run.json reports/my-run-reference.json
```

该脚本独立读取冻结报告并另写结果，不向运行时回传。参考解不宣称最优；存在干预时标记不具有同条件可比性。**不要将其结果粘贴到 G 提示词、记忆、候选或修复输入。**

## 文档

- `docs/RELEASE-v0.5.md`：改动范围、迁移和限制。
- `docs/DESIGN-v0.5.md`：G/S 自主调整与信息隔离契约。
- `docs/API-v0.5.md`、`docs/AGENT_INTERFACE.md`、`AGENTS.md`：Agent 操作。
- `docs/VALIDATION-v0.5.md`：实际测试结果，不等同真实模型通关。
- `tests/legacy-v04/README.md`：旧实网协议测试的迁移说明。

服务仅供同一台机器上的可信用户；token/actor 不构成公网多租户认证。关闭网页不终止实验；重启服务会丢失内存活动会话。终局导出可只读回放，不会恢复旧调用栈。

# 团子 / G/S Lab v0.5.6

外部 Agent 通过 CLI、HTTP 或本地 MCP 主持实验，人通过同一个 `runId` 的网页观察。G 根据允许的信息与 S 的实际表现调整决策条件；S 选择动作，也可以弃权。自主运行不读取参考解。

本版加入[独立死局裁判](docs/DEADLOCK-REFEREE.md)：在能够证明根任务已不可完成时提前判失败。判据与证明仅供观察者查看，不进入 G/S 输入、反馈、候选或记忆；未证实死局不代表可解。具体更新见[发布说明](docs/RELEASE-v0.5.6.md)。

## 启动

需要 Node.js 22+。项目附编译文件，直接启动：

```bash
npm start
```

观测台：`http://127.0.0.1:4173/lab`。原本地试玩位于 `/`，仅作历史离线体验；自主实验在共享服务端运行。

```bash
node bin/gs-lab.mjs capabilities
node bin/gs-lab.mjs create --actor agent:operator --kind game --controller adaptive --scenario guarded --backend rule --generator local --max-depth 0
node bin/gs-lab.mjs step RUN_ID --actor agent:operator
node bin/gs-lab.mjs events RUN_ID --follow
node bin/gs-lab.mjs export RUN_ID --out reports/my-run.json
```

`rule/local` 是动作轮换与上下文扩展的协议夹具，不是求解器，也不是 Jev/LLM。真实模型调用需要服务端凭据、用户明确授权、`allowLive` 和预先确定的预算。`maxGCalls` 可设为 1–256，默认仍为 12；不能在运行中扩大预算。

本地 MCP：`node bin/gs-lab-mcp.mjs --allow-control`。MCP 是外部实验接口，不作为团子的工具或参考答案来源，详见 [MCP 协议](docs/MCP-v0.5.5.md)。

## 决策机制

默认顺序是 **开局 G → 结构与声明检查 → 同层暂行装载 → 动作 S → 真实反馈 → 必要时 G 再调整**。只有 G 明确提出只读子问题才展开深度；`maxDepth=0` 关闭子问题，仍保留同层调整。

固定阶段白名单与快照候选有各自生命周期，不能静默扩大。程序检查声明矛盾，但不提供正确路线。Jev 短暂传输错误有界重试，正常弃权和无效完整答案不作为网络错误重试。本版尚未加入空输出后的普通 G 重新生成恢复。

## 开发和验证

```bash
npm install
npm run check
npm run audit:isolation
npm run test:deadlock
npm run schema:adaptation
```

浏览器端到端入口为 `npm run test:browser`，需要 Python Playwright 与 Chromium。本次版本整理没有重跑浏览器套件。测试中的显式控制器和微型成功局用于验证机制，不能当作模型通关证据。本版测试范围、历史局面离线复核和未运行项见[验证记录](docs/VALIDATION-v0.5.6.md)。

## 文档

- [v0.5.6 更新与兼容性](docs/RELEASE-v0.5.6.md)
- [v0.5.6 CLI / HTTP 增量](docs/API-v0.5.6.md)
- [当前外部 Agent 约束](AGENTS.md) · [v0.5.6 操作说明](docs/AGENT-v0.5.6.md)
- [死局裁判的判据与隔离](docs/DEADLOCK-REFEREE.md)
- [同层调整与候选生命周期](docs/DESIGN-v0.5.4.md)
- [Jev 重试策略](docs/RETRY-v0.5.5.md) · [本地 MCP](docs/MCP-v0.5.5.md)
- [流式观察协议](docs/STREAMING-v0.5.1.md)

历史文档与实验归档按原版本保留；新增停止规则不会改写旧实验结论。

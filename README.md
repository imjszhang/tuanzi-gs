# G/S Lab v0.5.5 · Jev 有界重试 + 本地 MCP

启动：`npm start`，观测台 `/lab`。本地 MCP：`node bin/gs-lab-mcp.mjs --allow-control`。详见 [MCP](docs/MCP-v0.5.5.md)、[重试策略](docs/RETRY-v0.5.5.md)、[验证](docs/VALIDATION-v0.5.5.md)。只新增传输恢复和外部实验接口，不用重试掩盖语义错误，不把参考解送入自主 G/S。

---

# 团子 / G/S Lab v0.5.4

外部Agent通过CLI/HTTP主持实验，人通过同一个runId的网页观察。G根据允许的更广信息和S实际表现调整决策条件；S快速选择、允许出错与弃权。自主运行不读取参考解。

## 本版：先让同层调整进入试行

默认顺序是 **开局G → 结构/条件检查 → 同层装载 → 动作S → 真实反馈 → 必要时G再调整**。不再给每份修订增加一个审批层。

只有G提出明确的只读子问题时才展开深度。子问题返回结果或未解决原因，父G继续原问题；深度失败不自动等于根预算耗尽。`maxDepth=0`可关闭子问题而保留同层G/S。

固定阶段候选与快照候选区分。程序检查明确的声明矛盾，不提供正确路线；过期候选不能静默扩大。流式推理只用于观察，不进入判断事实或记忆。

## 启动

需要Node.js 22+。发行包已经编译，启动不必先安装依赖：

```bash
npm start
```

网页：`http://127.0.0.1:4173/lab`。原本地试玩在`/`，只作历史离线体验；新的自主协议在共享服务端运行。

```bash
node bin/gs-lab.mjs capabilities
node bin/gs-lab.mjs create --kind game --controller adaptive --scenario guarded --backend rule --generator local --max-depth 0
node bin/gs-lab.mjs step RUN_ID
node bin/gs-lab.mjs events RUN_ID --follow
node bin/gs-lab.mjs export RUN_ID --out reports/my-run.json
```

rule/local是动作轮换与上下文扩展的**协议夹具，不是求解器**，不会伪装成Jev。真实模型需要自己的.env和明确授权，示例命令见docs/RELEASE-v0.5.4.md；本次没有实网调用。

## 开发和验证

```bash
npm install                 # 仅需要安装本地TypeScript编译器时
npm run check
npm run test:adaptation
npm run bench:adaptation
npm run audit:isolation
npm run schema:adaptation
```

浏览器测试需Python Playwright及Chromium，`npm run test:browser:v054`。测试的成功微型局由显式控制器给出选择，不能当作模型通关或智能增长证据。默认本地四张地图的有限预算失败也保留。

## 文档

- [更新与迁移](docs/RELEASE-v0.5.4.md)
- [机制、候选生命周期与限制](docs/DESIGN-v0.5.4.md)
- [实际验证记录](docs/VALIDATION-v0.5.4.md)
- [CLI与HTTP](docs/API-v0.5.4.md)
- [外部Agent约束](AGENTS.md)
- [流式协议](docs/STREAMING-v0.5.1.md)

历史文档按版本保留，不覆盖它们的事实记录；当前行为以本版说明为准。参考控制器保持隔离，真实效果必须单独实测。

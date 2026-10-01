# 团子 / G/S Lab v0.4.2

**外部 Agent 主持实验，G/S 决定游戏行为，人通过网页观察同一场实验。**

这一版修复真实模型弃权后反复生成相同技能的恢复问题。子层现在收到注册的目标—阶段—即时任务上下文；弃权与物理技能失败分开记录；实际失败反馈送到真正需要修复的生成器；更换 ID 不能绕过同条件重复检测。保留 HTTP API、CLI、同一 runId 网页观测和原有游戏。

## 启动（Node.js 22+）

已包含编译文件，运行不需要安装 npm 依赖。

```bash
npm start
```

- Agent 观测台：`http://127.0.0.1:4173/lab`
- 原有本地试玩：`http://127.0.0.1:4173/`
- `play.html`：原有离线单文件试玩，不依赖服务；它不是共享实验会话。

### 让 Agent 操作

另开一个终端，在同一项目目录中：

```bash
node bin/gs-lab.mjs capabilities
node bin/gs-lab.mjs create --kind game --scenario guarded --strategy batch
# 返回 runId 和 viewerUrl。在网页打开 viewerUrl，以下替换 RUN_ID。
node bin/gs-lab.mjs step RUN_ID
node bin/gs-lab.mjs start RUN_ID
node bin/gs-lab.mjs status RUN_ID
node bin/gs-lab.mjs events RUN_ID --follow
node bin/gs-lab.mjs result RUN_ID
node bin/gs-lab.mjs export RUN_ID --out reports/my-run.json
```

命令默认输出 JSON。也可以 `npm run lab -- ...`；在安装/链接本地包后使用 `gs-lab ...`。CLI 只是服务客户端，**不会在终端另建一个游戏实例**。

### 一键外部 Agent 编排示例

```bash
npm run demo:agent
```

脚本通过 HTTP 分别创建 direct/batch/serial/dependent 四个独立冷启动实验，运行、等待、输出结果与查看地址。默认规则后端，10 ms 合成延迟，无真实模型调用。页面列出同一个服务中的全部会话；很快结束的实验可以回放，不通过人为放慢执行来夸大模型延迟。

## 保留的实验控制能力

- **两个实验范围**：判断实验（energy/fast/reserve/chain）；主世界（meadow/detour/guarded/remix），支持父子 G/S，以及程序搜索/完整规则离线对照。
- **唯一权威状态**：服务持有世界、引擎和日志；网页仅显示快照与事件。关闭标签页不取消实验。新网页可根据 runId 继续观察。
- **生命周期**：create/start/step/pause/cancel；暂停发生在决策量子边界，正在进行的一个量子可能完成。cancel 合作式终止，不能撤销已经发生的操作。
- **控制权与版本**：网页默认只读，接管会暂停并记录来源；旧控制者写入被拒绝。所有控制命令需要控制版本，编辑额外核对世界 revision。
- **幂等**：同一 commandId + 完全相同的请求只执行一次；相同 ID 改变请求返回 409。用于响应丢失后的明确重试，不做隐式重发。
- **干预与分支**：预设动作边界上的脚本、显式人工编辑、不可变检查点、冷分支/明确继承经验。分支是新试验，不是活动子引擎的透明恢复。
- **证据**：状态、命令、控制者、父子事件、请求、干预与结果导出 JSON。终局报告自动写入 `.gs-lab/exports`；保存失败会在 API 的 archive 字段报告。
- **真实模型保持显式授权**：配置服务端密钥，加 `--allow-live --max-requests N`。默认是 rule。未执行实网就没有模型性能结论。


## v0.4.2：遇到模型弃权时

若子层返回 none，服务将状态标为 `blocked`，原因例如 `decision_blocked:no_local_suitable_action`；它不是可直接继续的操作员暂停。网页“修复诊断”与 CLI 的 `diagnostics` 包含当前任务上下文、完整模型判断、最近失败及修复次数。系统不选概率第二名、不隐式用规则动作，也不在同一证据下再次请求相同技能。

当实际技能失败、仍有结构性修复空间时，生成器分别收到 `executionFeedback`（实际执行证据）和 `repairFeedback`（本次提案校验拒绝）。同样的局面与控制器下，仅改技能名字或 ID 不构成新方案。

**本版没有重跑真实 Jev/LLM。**发行修复通过受控替身与规则回归验证；新的上下文能否改善真实模型判断，必须另做实网实验。

## 核心注意事项

**人和 Agent 是同一台机器上的可信操作方，不是多租户用户。**服务仅监听 127.0.0.1。短期本地 token 保护接口；actor ID 是协作与溯源，不是不同人的安全凭据。不要直接暴露到公网。另一台机器上的 Agent 可通过受控 SSH 转发连接，不能简单改监听地址代替访问控制。

**墙钟期限从首次决策开始，包括之后的人工暂停。**`engineWorkMs` 另外统计引擎推进的耗时（包括模型等待，不等于 CPU 时间）。修改观看或回放速度不会修改执行时间。手动教学可显式设置更长的 `deadlineMs`，正式基准统一该配置。

**活跃会话不做崩溃恢复。**浏览器断线可重连；服务重启会失去内存中的会话和控制器。已保存终局 JSON 可以在观测台导入只读回放。没有承诺远端副作用 exactly-once 或持久化执行恢复。

## 文档与源码

- [v0.4.2 修复、迁移与实网复查](docs/RELEASE-v0.4.2.md)
- [v0.4.2 API 增量与弃权处理](docs/API-v0.4.2.md)
- [本版验证记录和限制](docs/VALIDATION-v0.4.2.md)

- [给外部 Agent 的操作手册](docs/AGENT_INTERFACE.md)
- [HTTP API 与 JSON 示例](docs/API-v0.4.1.md)
- [设计和限制](docs/DESIGN-v0.4.1.md)
- [验证范围](reports/v041/VALIDATION.md)
- `src/lab/`：配置/协议、会话适配器、统一管理器、网页观测器（TypeScript）
- `server/lab/http.mjs`：认证、HTTP、SSE、终局归档
- `bin/gs-lab.mjs`：CLI
- `examples/agent/compare.mjs`：外部 Agent 风格编排示例

## 开发与复验

```bash
npm install             # 仅在改源码、需要本地 TypeScript 时
npm run check           # 重建游戏/观测台/通用引擎，再运行全部代码测试
npm run test:lab        # 新控制面专项
npm run bench:v04       # 旧判断实验基准
npm run test:browser:041
npm run test:incident  # 35 项事故类型专项
npm run bench:incident # 离线重现，不调用模型
npm run probe:child    # 首步冻结包，默认 NOT_RUN
```

浏览器自动化额外需要 Python Playwright + Chromium。由于当前执行环境限制，交付的网页专项脚本采用真实本地 HTTP 的测试桥接；SSE 网络协议由 Node 集成测试独立验证。它不冒充真实 HTTP 页面导航实测。详细证据与限制见验证文档。

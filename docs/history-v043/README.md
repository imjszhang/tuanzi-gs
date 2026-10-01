# 团子 / G/S Lab v0.4.3

**Agent 主持实验，G/S 决定行为，人看同一场实验。** 本版重新组织界面，不更改 v0.4.2 的决策、恢复、预算或 API。

## 先打开这里

需要 Node.js 22+，解压进入本目录：

```bash
npm start
```

打开 **http://127.0.0.1:4173/lab**。已含编译文件，无需先 npm install。

先在实验列表打开一场实验；没有实验时点「新建实验」。默认就绪，不自动运行。详情页只有四个主入口：**概览、判断过程、诊断、配置**。当前实验的配置只读，新建草稿在独立对话框。

- 外部 Agent 创建后返回的 viewerUrl 直达同一个 runId；人可观察、按需接管。
- 模型弃权 `blocked` 不等于可继续的 `paused`，界面保留原始原因与证据。
- 回放的地图、指标和当前技能来自同一历史快照，回放不会执行动作。
- `/` 或 `play.html` 是本地体验；完整任务与判断实验分别在两个页签，不是共享服务会话。

## CLI 兼容

```bash
node bin/gs-lab.mjs capabilities
node bin/gs-lab.mjs create --kind game --scenario guarded --strategy batch
# 以下 RUN_ID 替换成创建回执中的 ID
node bin/gs-lab.mjs step RUN_ID
node bin/gs-lab.mjs start RUN_ID
node bin/gs-lab.mjs status RUN_ID
node bin/gs-lab.mjs events RUN_ID --follow
node bin/gs-lab.mjs export RUN_ID --out reports/my-run.json
```

默认规则后端；真实请求需要服务端 .env、用户明确授权、allowLive 与请求预算。未实测的模型效果保持 NOT_RUN。API/CLI 与底层状态协议沿用 v0.4.2，因此能力查询仍报告真实的运行时版本。

## 修改与验证

```bash
npm install
npm run check              # 构建 + 所有代码测试
npm run bench:v04          # 原有 52 组离线评估
npm run test:browser       # 当前 UI 与旧模式回归；另需 Python Playwright + Chromium
```

浏览器脚本默认系统 Chromium `/usr/bin/chromium`；可设置 CHROMIUM_PATH。它自动开启临时本机测试服务，mock provider 明确作为替身，无实网调用。浏览器内容装载和 API 传输夹具的验证限制见说明。

## 阅读顺序

1. `docs/RELEASE-v0.4.3.md`：界面变化、升级与已知限制。
2. `docs/VALIDATION-v0.4.3.md`：这次实际检查的范围与结果。
3. `AGENTS.md`、`docs/AGENT_INTERFACE.md`：外部 Agent 操作。
4. `docs/API-v0.4.2.md` 与 `docs/API-v0.4.1.md`：保持兼容的控制协议。

`.env`、`.gs-lab/exports` 和本地代码修改自行保留；解压到新目录审阅迁移，不覆盖工作树。仅限可信本机使用；无公网多租户认证、活动会话崩溃恢复或真实模型收益证明。

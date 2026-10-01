# G/S Lab v0.5.2 — G 输出契约与有界定点纠错

以交付的 v0.5.1 为基线。修复用户报告中 actionFrame 包装歧义、谓词字段错误反馈不精确，以及格式失败耗尽策略修订额度的问题。不重写世界，不接入参考答案，不以新版本代替真实模型复测。

## 使用

Node.js 22+，发行包包含编译文件。`npm start` 后打开 `http://127.0.0.1:4173/lab`。
建议解压到新目录再迁移自己的 `.env`；保留 `.gs-lab/exports` 与本地修改，不直接覆盖工作树。

```bash
node bin/gs-lab.mjs create --kind game --controller adaptive --scenario guarded \
  --backend jev --generator llm --strategy direct --allow-live \
  --max-requests 80 --max-g-calls 12 --max-depth 2 \
  --max-revisions 3 --max-format-repairs 2 --deadline-ms 600000 --seed 441
node bin/gs-lab.mjs start RUN_ID --wait --timeout 720000
node bin/gs-lab.mjs export RUN_ID --out reports/my-run.json
```

这里没有执行实网命令。需要用户自己的服务端凭据与显式授权。既有 thinking / reasoning_effort 与流式配置沿用；没有为了纠错静默换模型或关闭推理。

## 修订内容

1. `src/adaptive/schema.ts` 为运行时结构检查和 G 提示提供同一份结构定义。按 action / reframe 分别产生契约，去掉把 actionFrame 当成实际字段的含糊说明。`schemas/` 中可查看构建后导出的契约。
2. `InvalidAdaptation` 支持结构诊断：JSON Pointer 路径、错误类别、实际值摘要、允许值、是否达到最多 64 条错误的上限。独立错误一起报告；未知字段仍拒绝。
3. 新增 `gs/output-repair-request/v1`。格式错误时仅给 G 原始输出、最新错误、原始意图锚点和协议，不重复发送世界、S 历史与运行日志。原内容保留到既有 60,000 字符上限，不再在 10,000 字符处截断成残缺提案。
4. 格式纠错与有效修订分开。默认 `maxFormatRepairs=2`，表示每份新 G 输出额外最多两次格式纠错（范围 0–4）；不消耗 `maxRevisions`。所有 G 请求仍计入 `maxGCalls`、共享请求和时间预算；不存在免费或无限重试。
5. 增加 `kind=stage-update`：只更新当前阶段的明确字段，不必每次重写完整程序。需要当前 policyVersion / stageIndex；省略字段保持原值，已完成阶段与已用阶段动作不重置。
6. 添加有限的声明一致性提醒：例如要求正向 delivered 增量但未声明 deposit、显式候选子集为空、候选类别被自己的 kinds 排除。提醒只进入审计和元层候选，不代替策略评估、不自动增加动作。
7. 概览流式卡区分“策略生成 / 格式纠错”；诊断页显示无效结构、格式纠错、合法提案批次、有效修订尝试和已应用调整。原始错误路径可直接查看。CLI 账本新增可选 purpose 字段。

## 纠错边界

运行时不会自动去掉 actionFrame 后执行，也不会把 value.baitUsed 自动改成 delta.baitUsed。所有改写必须来自本次 G 返回，再过同一个解析器与 S 选择。

输出纠错要求保持原计划意图。机械检查会锁定原提案中已通过结构检查的阶段文本、坐标、动作和其他字段；错误谓词作为整体交还 G 修正。旧包装的识别仅用于前后比较，不作为可执行规范化。不可解析的原始 JSON 无法机械证明意图保持，审计明确标为未检查。它不是通用语义等价证明。

`output_format_repair_exhausted` 表示仍未提交合法提案，不应解释为“多种策略实测失败”。`adaptation_budget_exhausted` 保留用于有效修订循环。网络故障、取消、断流、过期结果不进入格式重试；流式半成品仍不能执行。

## 验收命令

```bash
npm run check
npm run test:revision
npm run bench:incident-format
npm run schema:adaptation
npm run audit:isolation
npm run test:browser:v052
```

本地查看格式纠错 UI 可用 `npm run demo:format`。这是显式 MOCK SSE 服务，默认端口 4197，不读取 .env、不调用真实模型，微型目标由测试回调给定。它不是果园通关演示。

## 仍然不保证

没有实网测量新契约的首次合法率、纠错率、成本或完整任务成功率。没有保证 G 的合法策略正确，也没有用参考控制器给策略准入。没有实现任意语义矛盾识别、隐式循环、策略最优性、跨崩溃恢复或生产公网认证。

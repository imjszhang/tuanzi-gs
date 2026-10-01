# G/S Lab v0.5.4 — 同层试行与可返回子问题

以v0.5.3发行包为基线。修复开局G生成后每次都需要更高一层S审批、子层深度耗尽直接终止根问题，以及固定候选范围把局部目标排除在外的问题。不是扩大预算，不是强制S接受G，不是恢复参考答案。

## 开始使用

需要Node.js 22+。已附编译文件，解压后无需先安装依赖：

```bash
cd tuanzi-gs
npm start
```

打开 `http://127.0.0.1:4173/lab`。建议解压到新目录，迁移自己的.env；保留旧导出与本地修改，不直接覆盖工作树。

原CLI命令继续使用。`maxDepth`新增允许0，表示关闭子问题，不是关闭G。

```bash
# 离线接口检查：本地动作轮换/上下文扩展，不是通关策略
node bin/gs-lab.mjs create --kind game --controller adaptive --scenario guarded \
  --backend rule --generator local --strategy direct --max-depth 0

# 配置自己的服务端密钥并明确授权后，才运行模型实验；本次未实网运行
node bin/gs-lab.mjs create --kind game --controller adaptive --scenario guarded \
  --backend jev --generator llm --strategy direct --allow-live \
  --max-requests 80 --max-g-calls 12 --max-depth 2 \
  --max-revisions 3 --max-format-repairs 2 --deadline-ms 600000 --seed 441
node bin/gs-lab.mjs start RUN_ID --wait --timeout 720000
node bin/gs-lab.mjs export RUN_ID --out reports/my-run.json
```

## 主要改变

1. G的一份合法决策条件直接在原层试行，实际动作仍须原层S选择与复核。没有自动的“选择修订”审批层。首次G保持，初始化ready只表示条件已提交。
2. S弃权或条件冲突返回原G，可换上下文，也可替换错误的方案。版本失配和声明冲突进入常规G调整，格式错误保留定点纠错。
3. G显式提出subproblem才展开子G/S。子问题只读、有限，返回候选解释或未解决证据；深度/本地额度失败不自动等于根任务失败。
4. 候选范围分清阶段动态类别、持续ID白名单、快照ID范围。过期范围先交G，不能自动扩大。明确的目标/范围矛盾被报告而非替写路线。
5. 流式和诊断UI显示同层试行、子问题返回、已用预算和精确条件错误。旧实验仍可只读观察，不伪造新的历史。

## 生成器兼容

`proposals`现在恰好一项：program、stage-update或显式subproblem。analysis子问题返回analysis或另一个subproblem。自定义mock/生成器若仍按旧版提交多个配置，需更新；系统不会偷偷选第一项。多项旧输出不会被自动合并或删除。格式纠错仍保护原意，不能将选择策略的变化伪装成格式修复；不能保持原意的返回会被明确拒绝。

旧式非空candidateIds且未声明scope仍视为持续阶段白名单，不改变旧含义。建议多步移动使用动态kinds，或者对一次快照的ID选择明确绑定revision。路径必须由G/S自行形成。

## 验证与边界

`npm run check`、`npm run test:adaptation`、`npm run bench:adaptation`、`npm run audit:isolation`。
浏览器检查需另有Python Playwright与Chromium：`npm run test:browser:v054`。
`npm run demo:adaptation`开启明确MOCK本地服务（默认4198），只测试接口，不读取.env，不请求真实模型；首个展示流暂停等待`/fixture-release/visible`放行。

详细实测次数和封包证据见VALIDATION-v0.5.4.md。任何微型任务成功均由测试控制器规定，不能视为真实Jev/LLM完成守卫果园。世界物理、根验收、参考算法及S供应商判断适配没有用于“补出答案”。

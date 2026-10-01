# G/S Lab v0.4.2：阶段上下文与证据驱动的恢复

## 本版解决的问题

依据用户提供的 `INCIDENT-guarded-jev-llm-2026-09-25.md`，v0.4.1 的真实运行出现：规则模拟通过，父层接受新技能，但子层面对四个移动候选弃权；零动作结束后，生成器拿到相同输入，提交相同结构的新 ID，直到修复预算耗尽。用户报告的两局原始导出 JSON 未提供，本次没有逐字回放其真实请求，也没有重新调用真实 Jev/LLM。

本版以干净的 v0.4.1 发行包为基线，修复这类控制流与证据问题，不增加模型预算、不绕过 none、不改变物理世界或根目标。

## 1. 子层的即时任务明确化

新增 `src/skills/context.ts`。每次子层决策包含注册的根目标、局部目标、阶段描述、即时目标、参数绑定、当前位置、目标站位、资源投放点、剩余步数和相关世界版本。

例如，“创造采集机会”中的 `place-resource` 不再只发送枚举 `access-open`：在到达站位前，即时任务是安全接近站位；到达后才是投放。问题说明明确：一个动作可以通过中间进展服务于阶段，不要求单步完成整个技能。

这些是技能与前置条件的语义，不是最佳动作 ID、规则评分或 oracle 答案。相同事实包同时用于规则与模型，候选仍保持中立顺序。上下文放在共享证据中一次，各独立题只引用它，不为每个候选复制全文。

上下文版本为 `gs/skill-task-context/v042`。涉及新上下文的经典选择问题为 `gs/select/v042`，判断图问题为 `gs/judgments/v042/{strategy}`。候选事实版本未变。

## 2. 弃权不是物理失败，更不是自动“缺少技能”

子层返回 none 时，记录 `decision_blocked:no_local_suitable_action`；父层已有可用 access 技能但仍弃权时，记录 `decision_blocked:parent_no_suitable_skill`。两种情况都在当前根运行中暂停，不把同一个问题升级成重复技能生成。

引擎返回 `paused`，实验服务映射为终止状态 `blocked`，区别于操作员可以继续的普通 `paused`。这次不是加一轮自动重问：新上下文在首次请求前已补齐；若仍无法判断，导出证据再决定是否进行新的受控实验。不会拿第二高概率动作执行，也不会切回规则假装模型成功。

同一快照版本校验现在覆盖选择器的所有输出，包含弃权。过期的 none 被丢弃为 stale，不会被记成当前技能失败。网络错误、取消与未知执行结果继续使用既有安全路径。

## 3. 实际执行反馈和提案校验反馈分离

新增通用 `Context.executionFeedback`、领域 `repairContext()` 和 `afterTransition()` 扩展。

- `executionFeedback`：最近实际运行的失败分类、技能结构、阶段、绑定、动作/资源变化、候选与真实判断、控制器身份和证据范围。
- `repairFeedback`：本次生成提案被结构或模拟校验拒绝的原因。

两者可同时传递，校验重试不会覆盖先前执行证据。仍然只有结构性失败且具备已授权修复空间时，才请求生成器。生成器输出经原来的权限与验收路径；最多提案次数和根修复预算不变。

## 4. 重复修复按结构与证据判定

`RecoveryJournal` 保存最多 16 条近期失败。行为规范化包含目标、启动条件、阶段规则、能力、特征、权重与步数预算，不包含标题、ID、来源或无行为意义的标签。

在同一世界、参数绑定、控制器及上下文版本下，相同行为结构会被拒绝，原因 `duplicate_repair_no_new_evidence`。零步失败还防止只改变数字阈值或预算冒充新结构。内部比较使用完整规范化字符串，短指纹仅用于显示。

这不是永久跨环境黑名单，也不是语义等价的通用证明。相关世界条件改变、控制器/问题上下文变更、真正不同的阶段结构可以形成新的实验；具体规则见测试。保守的零步判定仍需根据后续实测调整。

新增 `RepairBlocked` 明确表示“重复/不适当的修复停止”，不会被当成普通 JSON 校验问题反复重试。

## 5. 进展与经验归属

父层反馈区分 `dispatchCompleted`、`physicalChanged`、`physicalProgress`、`localGoalProgress`、`informationProgress` 与 `localSucceeded`。子调用结束不再自动等于任务推进。

持续弃权的受控案例中，首次阻塞产生新的诊断信息，但 `progress=false`、`actionSucceeded=false`，物理回合仍为 0。重复相同证据不会继续获得信息增量。

弃权记录为 `decision_blocked`，不污染“该技能在物理上失败/成功”的样本。真正发生的技能步数耗尽可以留下执行失败证据；根预算耗尽、未知执行、外部干预、取消不冒充正常尝试。新增经验编码前缀 `gs/skill-feedback/v042`，旧版统计留在存储中但不与新反馈语义混用。

## 6. CLI、HTTP 与网页一致显示原因

保留全部 v0.4.1 命令和端点，状态增加可选 `diagnostics`。网页主要状态显示原始 reason，新增“修复诊断”页签，显示修复次数/上限、最新阻塞、完整判断、任务上下文及证据。

`questionStrategy` 表示 direct/batch/serial/dependent 的问题组织；`dispatchStrategy` 表示实际 batch/serial 请求调度。旧 `.strategy` 保留兼容，但不能再单独把它解释成问题组织。失败报告也提供两条维度。

主游戏 `kind=game` 的目标来自游戏，配置中默认 `task=energy` 并非把主游戏换成补能夹具，观测台会标注这一点。测试替身也明确标注，不把 CLI 配置里的 backend=jev 当作实网执行证据。

## 离线回归的实际结果

| 受控实验 | 结果 | S/G 接口次数 | 物理动作 |
|---|---|---:|---:|
| 子层持续弃权 | 明确 decision_blocked | 3 / 1 | 0 |
| 生成后父层持续弃权 | 明确 parent decision_blocked | 2 / 1 | 0 |
| 同结构改 ID 再提案 | duplicate_repair_no_new_evidence | 见原始账本 | 2（原技能真实失败） |
| 使用规则、要求上下文完备 | 实际完成 5 颗交付，剩余能量 13 | 82 / 1 | 85 |

所有行真实外部请求为 0。最后一项使用明确的规则测试替身，不是模型读懂新增上下文的证据。报告中的旧 10 次 Jev + 3 次 LLM 是用户实网记录，不能与本地耗时拼成供应商速度对照。

## 安装和迁移

建议解压到新目录，Node.js 22+：

```sh
npm start
# http://127.0.0.1:4173/lab
```

已附编译文件，不需先 npm install。保留自己的 `.env`、`.gs-lab/exports` 与本地修改。发行包不包含密钥或活动会话；内存活动运行仍不能跨服务重启恢复。旧 JSON 继续只读回放。

用户报告提到的本地 `LLM_THINKING`、`LLM_REASONING_EFFORT` 和超时改动没有对应源文件提供，本补丁基于干净发行包，**没有擅自合并这些本地差异**。需要这些配置时请从自己的工作树审阅迁移，不能整目录覆盖后假定仍然生效。服务仅供可信本地使用，不是公网多租户服务。

## 实网复查：先隔离首个子判断

```sh
# 默认只写冻结请求包，不联网，不推进世界
npm run probe:child

# 本地服务和密钥已配置、明确授权后，单次 Jev 判断；不调用生成器
node scripts/probe-child-v042.mjs --live --variant=current --backend=jev --samples=1 --max-requests=1
```

若要比较旧形状，可用 `--variant=legacy`，建议独立文件记录。legacy 是重新构造旧形状，**不是用户原始请求逐字回放**；这是包级 A/B，目标说明、上下文与问题模板同时有版本变化，不是单字段因果实验。

探针只回答一次冻结状态上的选择；不执行动作、不证明完整通关。模型仍选择 none 应如实记录。当前版本能否改善真实 Jev 选择，需要这个实网检查以及后续完整任务测试；不能用增加修复次数掩盖失败。

完整事故配置仍可用原有 CLI 创建，例如：

```sh
node bin/gs-lab.mjs create --kind game --scenario guarded --controller hierarchy --strategy direct --backend jev --generator llm --allow-live --max-requests 80 --deadline-ms 600000 --actor agent:incident-v042
# 使用返回的 runId，打开 viewerUrl
node bin/gs-lab.mjs start RUN_ID --wait --timeout 620000 --actor agent:incident-v042
node bin/gs-lab.mjs export RUN_ID --out reports/incident-live-v042.json --actor agent:incident-v042
```

只在已有明确付费授权时运行后两类命令。本次构建没有执行它们。

## 仍未实现或未证明

没有真实模型质量/速度收益结论；没有自动多级认知诊断或生成判断图；没有变成任意语义技能求解器；没有跨服务崩溃恢复或货币硬预算。诊断与去重属于受控恢复机制，不是人类认知或自我进化的证明。

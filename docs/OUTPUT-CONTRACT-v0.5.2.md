# v0.5.2 输出协议、计量和实现边界

## 单一结构来源

`src/adaptive/schema.ts` 发出 object / array / string / integer / boolean / null、properties / required / additionalProperties、anyOf（带 kind 判别）、const / enum、数组/字符串/数值边界等所需的 JSON Schema 子集。运行时校验解释同一份定义。实现不声称支持任意 JSON Schema 关键词或所有草案。

服务器向模型提交的是 `outputContract.jsonSchema`，不是 actionFrame / Stage 类型说明列表。供应商参数仍保持原有 json_object（除非用户关闭原来的 JSON 模式）；这不是供应商原生严格约束解码。本版没有新增未经实网核实的 json_schema/provider 私有参数。

根对象唯一字段为 `proposals` 数组（1–3项）。action frame 允许：

- `kind=program` + `program`：完整决策程序，1–8个阶段。
- `kind=stage-update` + `expectedPolicyVersion` + `stageIndex` + `changes`：当前阶段的部分更新。

reframe frame 只允许 `kind=reframe`，修改元层题目、假设、公开规则、是否包含更广观察及现有修订候选子集。程序包与元包不能互相替代。

所有阶段 `until` 都是 ALL-of；`delta` 以本阶段起点为基准，`value` 是当前绝对状态。`baitUsed` / `eaten` 在本版仍为 delta 字段，不扩展到 value 来绕过事故检查。阶段顺序没有隐式重复；文字提到某动作并不会绕开 `kinds`。

## 输出修复而不是重新求解

正常 G 请求不削弱：仍包含实际 S frame / answer、允许的更广世界、公共规则、近期自己的反馈和记忆。

纠错请求另用 `gs/output-repair-request/v1`：

- frame 仅 kind / revision，绑定冻结状态；
- previousOutput 为最新失败输出；preserveFrom 为最初意图锚点；
- diagnostics 为路径化结构反馈，originalCause 保留最初触发原因；
- 不携带完整世界、参考结果、供应商推理文本或 S 历史。

正确返回仍是完整、规范的 proposals JSON，而非可执行代码或 JSON Patch。机械意图保持检查不能证明所有语义相同；原输出语法不可解析时会标注未检查。原始日志保留，不修改用户之前的运行报告。

## 计数与预算

`maxGCalls`：所有 G 请求，包括格式纠错（原默认12未增加）。
`maxRequests`：所有实际 S/G 请求；失败与重试均计入。
`maxFormatRepairs`：每份新 G 输出额外纠错最多2次，配置0–4。
`maxRevisions`：每层有效提案进入元层选择的循环次数；仍包含合法但重复、应用不成立等尝试，而不是只计成功。

诊断 `outputAccounting`：formatRepairs、invalidOutputs、validBatches、revisionAttempts、committedRevisions、actualActionTrials（实际动作数，不是独立任务样本数）。元层选择在第一次合法提案后才开始。物理执行仍仅由根层 S 选择的合法动作产生。

输出失败超过纠错上限：`output_format_repair_exhausted`。
当前 resolve 的共享生成上限：`adaptation_generation_budget_exhausted`。
整局 G 调用超限仍为 `root_g_budget_exhausted`。

## 局部阶段更新

更改仅限当前 stage 的白名单字段。替换后重新执行同一结构检查；不允许改根验收、权限、世界或系统预算。until 的 delta 起点与已用动作保留，不以修改文本重新获得阶段额度。若更新后的条件已经达成或额度已经用完，本决策量子不再执行额外动作，交还阶段检查。

自然语言的“吃一颗”与 kinds 是否匹配，并没有做通用语言证明；本版提醒限于声明字段能确定的关系。没有运行成功路径模拟。

## 只读 UI / HTTP / CLI

`LabConfig.maxFormatRepairs` 是可选输入（默认2），CLI 对应 `--max-format-repairs`，网页高级配置同名意义。旧创建命令继续有效。

G请求账本可选 `purpose=adaptation|output-repair`；`g_stream` 继续沿用 v1 并添加同样的 purpose，旧观察者可以忽略。输出修复展示与策略生成分开，但都由同一流式传输发出，不伪造推理，不额外调用模型解释。

新增 `adaptation_accounting`、`output_repair_integrity`、`proposal_warnings` 事件。`adaptation_rejected` 的 `category=output-format` 带 diagnostics。原API路由、控制权、幂等命令、取消和只读回放不变。

所有权限/世界/参考解边界继续采用 v0.5 的受信代码隔离。测试目录里的事故输出是负向回归夹具，不能作为运行上下文、模板或自学习输入。

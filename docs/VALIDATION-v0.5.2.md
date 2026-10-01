# G/S Lab v0.5.2 验证记录

## 范围

基于交付的 v0.5.1 完整包修订。没有读取用户的 .env、没有请求真实 Jev 或 LLM；供应商协议测试全部使用本机 HTTP/SSE 服务或显式回调。原始事故输出作为负向回归数据，不能被运行中的 G/S 读取为解题示例。

本版验证输出协议、定点纠错、局部修订、预算与 UI，不验证真实模型的首次合法率、纠错率、策略质量或守卫果园通关。实际模型结果仍是 NOT_RUN。

## 当前检查

| 检查 | 结果 | 证据 |
|---|---:|---|
| 全部代码测试 | 531/531，跳过0 | reports/v052/tests.log |
| 其中新增修订测试 | 43/43 | reports/v052/revision-tests.log |
| 新格式修复界面 | 21/21 | reports/v052/browser/browser-v052.json |
| 流式展示回归 | 36/36 | reports/v052/regression-1/browser-v051.json |
| 自主观测台回归 | 36/36 | reports/v052/regression-2/browser-v05.json |
| 旧技能/程序/判断实验 | 31+26+33，全部通过 | reports/v052/regression-3..5 |
| 浏览器总计 | 183/183 | reports/v052/gate-summary.json |
| 参考解隔离静态检查 | 20/20 | reports/v052/isolation-audit.json |
| 保护源码字节比较 | 24个相同 | reports/v052/protected-source.json |

Node.js 22.16.0、TypeScript 5.8.3、Chromium /usr/bin/chromium。编译依赖仍只有 TypeScript，运行发行包不需要安装依赖。全套代码测试约35.7秒，仅表示本测试环境耗时。

最终二次封包已完成：从发行候选 ZIP 解压到干净目录，重新构建、531/531 测试通过；739 个已有清单文件的哈希差异为0。之后仅追加封包证据、验证文字和修正后的 diff 标头，没有修改执行代码。差异补丁已对干净 v0.5.1 做 git apply --check。详细记录见 reports/v052/clean-package-gate.json；最终文件清单见根目录 SHA256SUMS.json。

## 事故数据回归

`npm run bench:incident-format` 读取测试目录中本次事故三份原始 G 的 content（不含提供商推理、密钥、参考解）。原始输出仍全部拒绝：

- 第一份：/actionFrame 不支持，并指出缺少 /proposals。
- 第二份：/proposals/0/actionFrame 等嵌套位置不支持，而不是只重复一个无路径字符串。
- 第三份：/proposals/0/program/stages/0/until/0/field 的 value.baitUsed 不在允许枚举内。

它不删除错误包装后执行，也不把 value 改成 delta。G 必须返回有效且保留既有意图的修正后输出。检查没有运行这些策略，没有调用模型。结果保存在 reports/v052/incident-format.json。

该脚本还测量新格式修复用户消息字符数，明显少于原来的整局重发消息。单位是 JavaScript 字符数，不是 token、费用或实网延迟，不能当作已测成本收益。

## 真正接通的机制

受控微型夹具从已经交付4/5且在小窝的状态开始。一次 G 输出连续出现两种包装错误，纠正后在 maxRevisions=1 的条件下仍可交给元层 S，再由根层 S 选择一个实际动作完成目标。3次 G 均计入根调用预算，格式错误计2，有效修订计1。

另有生产 server.mjs + CLI + 本机流式供应商链路：S弃权→G错误输出→紧凑格式纠错→元层S→根层S→一次真实等待动作。总计5次本机模拟供应商请求，账本区分 adaptation/output-repair。不是 Jev/LLM 的真实通关。

已检查：无限无效输出有界终止；零纠错额度；全树共享生成上限；无免费重试；取消、世界过期、网络故障不执行或自动重试；仅改当前阶段保留已用动作；无效元层输出也可定点纠正；原始锚点防止连续修复偷换策略；有效程序、旧流式及CLI命令兼容。

一致性检查只对声明能确定的关系提示，例如正向交付增量缺少 deposit。不会用参考控制器验证策略，不会自动补技能。自然语言是否与动作声明一致、跨阶段资源规划是否可行，仍需真实执行与后续G调整。

## 测试迁移和浏览器限制

旧核心测试的 invalid-output 断言按新的 compact repair 请求更新；旧服务版本断言从0.5.1更新为0.5.2。原文件归档在 tests/legacy-v04/ 的 .before-v052 文件中。未通过跳过测试来消除失败。

真实尝试 Chromium 原生本机 HTTP 导航时，环境返回 ERR_BLOCKED_BY_ADMINISTRATOR。浏览器检查使用实际构建页面字节、set_content 及连接本机实验服务的传输桥；原生 HTTP/SSE 协议通过 Node 集成测试。不是原生浏览器导航、Safari/Firefox或公网部署保证。流式截图和成功微型任务均显式标记为MOCK/协议夹具。

浏览器UI回归后最后追加了3项纯输出完整性/预算分类检查并完成全套代码回归；UI源码未再修改。封包重建的代码再运行相同全套测试。

## 明确限制

共享结构定义放入G请求，仍使用原有 json_object。没有启用或宣称供应商原生严格 JSON Schema 解码。运行时只实现自身发出的JSON Schema子集，不是通用标准实现。

格式修复对原提案中已通过结构检查的字段做保留比较，不构成通用语义等价证明。不可解析原JSON时显示“未能机械验证”；网络或流式中断不是可执行的候选。S仍能弃权，G仍可能始终生成错误或无效策略，最终受限停止是允许结果。

本版本没有更改游戏物理、原始根验收、参考算法、S判断适配、流式解码和HTTP控制协议。自主路径仍不提供参考路线、解题示例、规则评分或优化站位。宿主有完整文件权限，不是恶意进程安全沙箱。

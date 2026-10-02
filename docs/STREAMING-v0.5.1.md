# G/S v0.5.1：G 实时输出设计与协议

## 界面位置

保留实验列表和单局四页签。概览右侧「G/S 正在做什么」中嵌入「生成过程」，不新增第五栏，不自动弹窗。仅在本次实验已有 G 记录时出现；完成或失败后保留最近一次记录。

卡片在推理/内容两个通道之间切换，正文有固定高度，支持自动跟随与手动阅读。开始输出内容时，尚未主动切换或滚动的紧凑视图转向内容；用户阅读时不强制跳走。展开弹窗桌面并排显示推理与内容，手机纵向排列。判断过程页的「查看 G 生成历史」按请求选择，不把不同递归层混在一起。

状态区分：排队、连接、接收、结构检查、生成完成、结构不通过、失败、中断、本地无模型文本。生成完成只表示供应商响应结束且通过服务端结构检查，不表示上层 S 已选中、不表示已执行、更不表示策略正确。完整 G/S 结果继续查看原有决策事件与根验收。

## 数据流

```
G 的同一次 Chat Completions 请求（stream=true）
  → SSE reader：增量解码 UTF-8 / SSE
  → reasoning 与 content 分别累计
  → 去除已配置凭据的意外回显 / 合并极细片段
  → onProgress 回调（只读）
  → 当前 HostedSession 的 g_stream 事件
  → 同一个 runId 的 LabEvent 序号 / HTTP SSE
  → 网页生成面板 / CLI events / 终局导出

只有完整 content → JSON + 原 parsePatches → 原 G/S 修订选择过程
```

`generatorMessages()` 的系统/用户提示和输出语法不因流式展示而改变。不增加“输出内心独白”的指令，不调用第二个模型编造说明，不启用参考求解器，不把展示通道接回 S 上下文或自主记忆。S / Jev 的请求协议不变。提供商可见推理是未验证文本，不是可信事实。

## 兼容协议

仅支持 Chat Completions 兼容响应：
- 流式：`choices[0].delta.content` 与 `delta.reasoning_content`；兼容同类服务商的字符串 `delta.reasoning` 别名。
- 整包：对应 `choices[0].message` 下的字段。
- API 未公开推理：明确显示「本次接口未返回可见推理，不补写」。不推测隐藏推理，也不根据正文生成替代推理。
- 不处理 Responses API、Anthropic 原生事件、加密推理内容或任意厂商私有结构；不宣称通用支持所有 reasoning 格式。
- 推理开关沿用现有 `LLM_THINKING` / `LLM_REASONING_EFFORT`，仅显式配置时发送。开启 streaming 不等于开启 thinking。

当前核对的供应商文档：
- https://api-docs.deepseek.com/api/create-chat-completion/ （stream、delta、reasoning_content、finish_reason、usage）
- https://api-docs.deepseek.com/ （流式开关与兼容协议）
这些是协议参考，不是当前项目的实网性能验证。

## 配置与计量

```
LLM_STREAM=true
# 默认不发送 stream_options，避免不兼容；需要时明确启用：
LLM_STREAM_INCLUDE_USAGE=false
```

默认请求流式。服务商返回正常 JSON 而非 SSE 时，同一次响应整包展示，标记「整包返回 · 非流式」，不会假装打字机流式。若服务商拒绝 stream 参数，当前请求明确失败；不会自动重试。用户可设置 `LLM_STREAM=false` 后重启，再创建新的实验。

已知 token 用量来自服务商；兼容终止内容块中的 usage 和独立尾 usage 块。没有用量时保持 null，不以字符估算 token 或金额。首段文本延迟从开始请求到可展示的第一段文本，不是首 token 的服务商计时。G 连接排队、端到端延迟及整局计时仍由既有账本记录。卡片运行秒数与整局实时计数可由观察端时钟刷新，导出不使用动画/客户端估计作为评估值。

一次 G 仍只扣一次请求。文本片段、打开弹窗、重连、切换通道、复制、回放，都不消耗模型调用额度。每100ms合并细片段，达到4096字符先发送；首段尽快发出。浏览器文本刷新约60ms，画布不因每个流式片段重新更新。

## 增量事件（新增，不改旧 API / CLI 写接口）

外层仍为 `LabEvent`：

```json
{
  "runId": "run-...",
  "seq": 42,
  "type": "engine",
  "at": "2026-09-26T00:00:00.000Z",
  "data": {
    "sourceRunId": "hosted",
    "event": {
      "type": "g_stream",
      "data": {
        "schema": "gs/g-stream/v1",
        "streamId": "g-2",
        "requestIndex": 2,
        "depth": 0,
        "frameKind": "action",
        "cause": "selector_abstained",
        "revision": "1",
        "source": "configured-G/v05",
        "displayOnly": true,
        "kind": "delta",
        "channel": "content",
        "text": "..."
      }
    }
  }
}
```

`kind=status` 时提供 status、可选 model/mode/reason/firstTextMs/usage/finishReason。
完整事件结构以 TypeScript 的 `GenerationProgress` 与原 `EngineEvent` / `LabEvent` 为准。唯一关联键是 `(runId, streamId)`；`requestIndex` 是整场 S/G 共用账本序号，不是第几个 G。depth 表示 G 正在调整哪个层，root 为0。

客户端用外层严格递增 seq 去重续读，不能用供应商片段序号替代。新观察者先读到当前快照序号的历史，再续订流。只读回放按所选快照的 seq 截取，不用终局文本填充早期画面。当前世界回放粒度仍是完整状态快照，不宣称每个 token 都是一个可拖动关键帧。

## 失败与边界

- 仅收到合法 JSON 外观不足以执行：SSE 必须正常到 `[DONE]` 且有非截断结束标记。提前EOF、乱码、坏事件、超时、取消、工具调用/拒绝/length结束不能提交半成品。
- 完整收到但 JSON/语法不合法，沿用有界提案校正；这是原 G/S 行为，不是传输层隐藏重试。
- 局部已显示文本在失败/取消后保留并标记。取消后的迟到内容不再追加，不提交提案、不推进世界。
- v0.5.6 后续修复：SSE 不再限制整条流的累计原始字节数，`stream.bytes` 仍记录实际读取字节用于审计。单行与单个事件的数据缓存各最多4MiB，非流式 JSON 整包仍最多4MiB；内容60000字符、公开推理120000字符限制保持不变。大小检查不取决于网络如何合并或拆分数据包；注释/心跳不会累积成总流量故障。上限超出明确报错，不执行截断后的“残缺成功”。超时、取消、完整结束校验及宿主事件上限仍有效。
- 已配置的 LLM/TYPESAFE 密钥意外回显会屏蔽，包括跨文本片段拆开的密钥；没有读取或展示 Authorization 头。其它业务秘密无法自动识别，导出前应审核。
- 展示使用 textContent，不执行模型输出中的HTML/脚本。
- 旧报告没有增量记录，不补造过去的推理过程。旧schema仍可只读回放。活动状态仍不能跨服务重启恢复。
- 流式读取改变响应时机，但不改变根任务、G消息、决策语法或参考隔离。服务商是否在stream/nonstream下给出完全相同回答，不作保证，需要单独实测。

## 明确的本地演示

```
npm run demo:stream
# 默认 http://127.0.0.1:4196/lab
```

此命令只启动本机测试服务与本机模拟的SSE供应商，不读取.env，不调用真实模型。页面控制者、模型名与文本均标明 MOCK / 测试夹具。实验起点为微型验收状态（已交付4/5且在家），不是完整果园通关。选择一个实验接管后单步，保持生成中，可用下面的夹具专用命令放行尾包：

```
node -e "fetch('http://127.0.0.1:4196/fixture-release/visible').then(r=>r.text()).then(console.log)"
```

这些夹具端点不在生产 server.mjs 中。它们用于观察真实分块传输和UI更新，不是G独立求解的演示。

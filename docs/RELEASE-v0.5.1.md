# G/S Lab v0.5.1 — G 的实时生成观测

本版基于 v0.5 发行包。目标是把 G 调用的等待过程变为可观察的真实增量输出，不改变自主调整的目标、语法、候选生成或参考答案隔离。

## 主要变化

概览右侧当前 G/S 过程内新增生成卡片，推理与内容分开查看；可展开双栏/手机纵向详情。判断过程页增加 G 历史入口，不增加主导航层级。首段、内容、状态、错误与中断均来自真实事件。缺失的推理不补写。完成后仍可查看与复制。

服务端改为默认流式 Chat Completions；同一请求的片段经 HostedSession、LabEvent、既有HTTP SSE推送，Agent与网页仍访问同一runId。初步输出只用于观测，完整内容才进入原有JSON/权限检查、修订选择与执行反馈。推理通道不返回模型上下文或自主记忆。

传输处理UTF-8跨块、CRLF、多行SSE、DONE、尾用量、失败、长度限制与取消。固定100ms合并极细文本；不因每个增量更新整张游戏画布。断开网页不取消生成，重新连接从事件序号续读；不重发模型请求。失败/取消后保留已接收片段，原始结果仍明确失败或中断。

## 升级

Node.js 22+。解压新目录，迁移自己的.env，勿覆盖本地修改和.gs-lab/exports。

```
cd tuanzi-gs
npm start
# http://127.0.0.1:4173/lab
```

编译产物已附，运行无需先安装依赖。新配置：`LLM_STREAM=true`（默认），`LLM_STREAM_INCLUDE_USAGE=false`（默认不向不兼容供应商发送该选项）。不支持stream的供应商设置false再启动新实验；没有自动失败回退或重复付费请求。

原有 `LLM_THINKING`、`LLM_REASONING_EFFORT` 保留。接口必须实际公开返回 reasoning_content / reasoning 字符串才能展示；不能靠本版访问不可见内部推理。只支持Chat Completions兼容流，不支持Responses或Anthropic原生流。Jev判断端不改变。

包、UI、服务与Lab导出版本为0.5.1，原gs/lab-*/v1与adaptive v05契约保持兼容。底层通用AdaptiveGS版本仍为0.5.0，文件未改变。旧实验导出可读，新文本只属于新运行，不重建历史输出。

## 操作

继续使用原CLI create/start/step/status/export。`events RUN_ID --follow` 同时能读到 g_stream 片段。网页打开既有viewerUrl即可观察；不必新增API写命令。真实请求仍需凭据和显式allowLive、预算。

```
npm run test:stream
npm run test:browser:v051
npm run demo:stream   # 显式本地流式夹具，不读取.env、不调用模型
```

默认本地自主生成器不伪装流式LLM，只显示「本地生成器 · 无模型文本」。需要看分块界面使用明确的传输夹具，或已授权的真实G请求。

详见 `STREAMING-v0.5.1.md` 和 `VALIDATION-v0.5.1.md`。本次未调用真实Jev/LLM，不保证某家服务商部署与模型名当前可用，不声称提升求解智能或通关率。流式文本与导出可能含用户业务信息，仅供可信本机环境使用。

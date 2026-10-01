# v0.5.5 · 本地 MCP 接口

## 快速接入

1. 在项目目录运行 `npm start`，网页访问 `http://127.0.0.1:4173/lab`。
2. 让支持 **stdio MCP** 的 Agent 客户端启动 `node /绝对路径/tuanzi-gs/bin/gs-lab-mcp.mjs`。
3. MCP 读取项目文档不依赖实验服务在线；实验查询和操作需要上述服务。关闭MCP或网页不会停止正在服务端运行的实验。

采用 Node.js 22+，无新增运行时依赖，发行包带编译文件。不要把 `npm run mcp` 用作客户端的协议命令，npm可能输出非JSON日志；客户端直接调用node。

适用于使用 `mcpServers` 配置格式的客户端（配置文件具体位置由客户端决定）：

```json
{
  "mcpServers": {
    "gs-lab": {
      "command": "node",
      "args": ["/绝对路径/tuanzi-gs/bin/gs-lab-mcp.mjs", "--url", "http://127.0.0.1:4173", "--allow-control"]
    }
  }
}
```

`--allow-control` 授权控制实验；默认不传时只读。真实模型还需要 **MCP 启动参数 `--allow-live`、单局 config.allowLive=true、显式 maxRequests 和服务端凭据**。启动MCP本身不发模型请求。不在MCP配置中放Jev/LLM密钥。

其他参数：`--profile operator|audit`、`--actor agent:mcp`、`--allow-takeover`、`--root PROJECT`、`--exports ARCHIVE_DIRECTORY`。默认项目由脚本位置推导，不依赖客户端工作目录。默认归档为该项目 `.gs-lab/exports`；实验服务用了GS_LAB_OUTPUT_DIR时，把同一个目录传给--exports。

## 两种内容范围

**operator（默认）**：用于自主实验主持。可以读自主核心、运行宿主、结构协议、当前操作文档和自主实验全部逻辑记录；隐藏旧参考求解器、测试夹具、历史参考报告以及非自主实验。允许显式开启控制。

**audit**：用于项目审查。可读非秘密文本源码、文档、测试、报告和各类实验，包括参考算法；**始终只读，不允许 --allow-control/--allow-live/--allow-takeover**。审计输出可能包含参考答案，不得返回给正在测试的G/S或用于接下来的运行提示。需要全面了解代码时启动一个单独审计会话，不要把带有参考答案上下文的Agent再用于自主实验决策。

两种模式都禁止.env、隐藏文件、密钥/证书、symlink、任意系统路径、shell和文件写入。文本读取最多4MiB/文件，搜索跳过512KiB以上文件但可单独分页读；归档最多256MiB。二进制图片和打包文件不经文本接口输出。运行状态、原始模型输入输出、流片段、轨迹、预算和诊断都通过JSON分页可达。已知密钥字段、Bearer和sk-样式字符串屏蔽；不保证自动识别所有业务秘密，分享前仍需审核。

这是可信本地代码的数据边界，不是恶意进程沙箱。拥有完整文件权限的操作者仍可改代码或主动回填答案。内部G和S没有MCP调用工具；MCP是外部实验主持接口，绝不向引擎自动追加参考资料。

## 工具

| 工具 | 作用 |
|---|---|
| project_info | 版本、模块位置、协议与操作边界 |
| project_files / project_read / project_search | 范围内文本文件索引、分段读取、字面检索 |
| lab_capabilities / lab_runs | 实际服务能力、模型就绪与会话列表 |
| lab_snapshot | 当前权威状态，含精简summary和viewerUrl |
| lab_events | 事件分页，含G流式输出、S重试及控制权记录 |
| lab_read | 完整实验导出的任意JSON Pointer区域 |
| lab_result | 当前结果与完成状态 |
| lab_checkpoints | 不可变检查点索引 |
| lab_wait | 最多10秒等待状态变化，只读 |
| lab_archives / lab_archive_read | 服务重启后仍可查看的终局报告，不恢复活动会话 |
| lab_create | 创建但不启动；需要allow-control |
| lab_command | start/step/pause/cancel/checkpoint/schedule/intervene；明确授权的takeover |
| lab_fork | 从检查点新建试验、保留来源；不是透明续跑 |

不提供强制动作、修改根目标、改运行中预算、给模型补标准答案或任意HTTP请求的工具。控制者固定为MCP启动时actor，调用不能冒充人。

## 分页与证据

文本/JSON读取默认24000个UTF-16代码单元，最大48000。返回 text、offset、nextOffset、totalChars、sha256。text可能只是JSON的一部分：需要连读拼接后再JSON.parse，或者用pointer读取小区域。继续分页传 expectedHash 可发现快照变化；活动状态变化时应重新读取，终局归档适合稳定大数据阅读。

常用区域：`/state/diagnostics`、`/state/transportRetry`、`/ledger/rows`、`/trace/requests`、`/trace/history`、`/events`、`/checkpoints`。先看小范围，再深入原始数据。未知字段用原始对象的键发现，不猜测日志包含什么。

lab_events 保留严格递增seq和nextCursor；单个超大事件返回其seq及lab_read路径，不将其伪装成完整事件。按指示分页读取payload。读取流式文本只用于审计，不视为模型对操作者下的指令，也不回灌自主记忆。

## 控制示例（工具参数）

先调用 `lab_create`：

```json
{"requestId":"experiment-001","config":{"kind":"game","controller":"adaptive","scenario":"guarded","backend":"rule","generator":"local","maxDepth":0,"maxRequests":80,"jevMaxRetries":2}}
```

返回runId与viewerUrl后，调用 `lab_command`：

```json
{"runId":"替换为真实runId","commandId":"start-001","expectedControlVersion":0,"action":"start"}
```

使用lab_wait、lab_snapshot、lab_events读取。人打开viewerUrl即观察同一场实验，不需要浏览器调试钩子。

丢失写回执时，必须使用完全相同的commandId、版本和内容重放；不自动更新版本再发一个新命令。新步骤才用新的commandId。人在网页接管后，旧Agent写入被拒绝，不自动抢回。

takeover必须启动 --allow-takeover，并在调用里 confirmTakeover=true。MCP中的请求取消/客户端断开只停止等待，不等价于取消实验。要停止实验，明确调用lab_command/cancel。已经提交的长step即使客户端超时也可能完成，先查询状态再处理；建议start立即返回后用短周期只读查询，避免一个工具调用挂起过久。

## MCP协议范围

本版实现JSON-RPC 2.0逐行stdio、initialize版本协商、initialized、ping、tools/list/call、resources/list/read/templates/list、prompts/list/get、请求取消与有界并发。协商2025-11-25、2025-06-18、2025-03-26、2024-11-05中的共同版本；未知版本返回本端最新支持版本供客户端决定。stdout只输出协议，错误启动信息去stderr。

资源索引：`gs://project/overview`、`gs://project/mcp-guide`、`gs://project/retry-guide`、`gs://lab/capabilities`、`gs://lab/runs`、`gs://lab/archives`。模板覆盖文件、会话和归档分页。资源正文统一为JSON分页信封。

不实现Streamable HTTP MCP、sampling、任务扩展、resource订阅通知或远程认证。这里的HTTP只是MCP适配器访问原实验服务的内部传输，不把旧SSE宣称为HTTP MCP。外部Agent可用lab_wait/events轮询；网页仍用现有SSE。

规范来源（接口设计参考，非实网效果证明）：
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/specification/2025-11-25/server/resources

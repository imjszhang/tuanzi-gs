# G/S Lab v0.5.5 — Jev 传输恢复与本地 MCP

基于交付的 v0.5.4。保留开局先 G、同层调整、显式子问题、候选生命周期、格式纠错、流式输出、唯一 runId 和参考解隔离。本版没有调用真实 Jev 或 LLM，不替代真实模型任务评估。

## 升级与启动

解压到新目录，迁移自己的 `.env`、`.gs-lab/exports` 和本地源码修改。Node.js 22+，附编译文件；直接 `npm start` 后访问 `http://127.0.0.1:4173/lab`。没有新增运行时 npm 依赖。使用源码 diff 合并后执行 `npm run build`。

## Jev 短暂访问失败重试

默认首次失败后额外最多2次（总计3次），500ms指数退避基数、5000ms退避上限、50%–100%抖动，每次最多8000ms。HTTP Retry-After 不提前绕过；所有等待仍受当前判断的25秒上限与根墙钟限制。

共享服务中的动作S、子问题S和固定判断实验均使用相同机制。只重试明确的网络/超时与408、429、500、502、503、504；密钥错误、配置、非法完整答案、S正常none、取消和过期状态不重试。G调用与物理动作不新增重试。

旧创建命令自动启用默认值；新增配置/CLI：

```bash
node bin/gs-lab.mjs create --kind game --controller adaptive --scenario guarded \
  --backend jev --generator llm --allow-live --max-requests 80 --max-g-calls 12 \
  --max-depth 0 --max-revisions 3 --max-format-repairs 2 --deadline-ms 600000 \
  --jev-max-retries 2 --jev-attempt-timeout-ms 8000
```

这段实网命令需用户明确授权、自己的服务端配置。`--jev-max-retries 0` 可做无重试对照。退避参数为 `--jev-retry-base-ms` 和 `--jev-retry-max-ms`。一次S可有多次传输尝试，每次计入根请求/题数/时间账本，不会增加G修订次数或重复动作。重试耗尽仍明确停止，不无限等待。

网页概览右侧在G/S过程卡内显示等待重试/恢复/失败；详细记录包括逻辑请求ID、尝试序号、HTTP状态、等待和世界版本。CLI、MCP及导出读取同一记录。

## 本地 MCP

先启动实验服务，然后由Agent客户端启动：

```bash
node /absolute/path/tuanzi-gs/bin/gs-lab-mcp.mjs \
  --url http://127.0.0.1:4173 --allow-control
```

配置使用绝对脚本路径；stdout仅协议，直接调用node，不把npm启动日志送入MCP。默认只读；`--allow-control` 开启实验控制。真实模型还需启动参数 `--allow-live`、每场实验 `allowLive=true`、显式预算及服务端密钥。MCP配置不应放供应商密钥。

17个工具（只读模式14个）、6个资源入口、3个资源模板和2个只读操作提示：项目索引/分段阅读/搜索、模型就绪、实验列表、快照、G/S输入输出、流式与重试事件、诊断、账本、检查点、历史归档，以及明确授权的创建、控制、分支。

MCP是现有HTTP API的客户端，不另开世界。create返回runId与viewerUrl，人打开网页即观察同一场实验。关闭MCP不停止运行服务；MCP请求取消不等于取消已提交的实验操作。长实验用start后读取，不要求一个工具调用一直等待。

**operator**：可以开启实验操作；允许自主相关源码和自主实验，隐藏参考求解器、夹具和非自主实验。

**audit**：阅读更广的非秘密源码、测试、报告和参考结果，始终只读。单独审计会话中的参考答案不得回填运行中的G/S。两个配置示例位于 examples/mcp/。

所有模式禁止.env、凭据、符号链接、任意系统文件、shell执行和源码写入。无法自动识别一切业务秘密；审计输出不等于允许把参考答案当作下次运行上下文。保护是可信本地代码边界，不是操作系统沙箱。

## 协议与兼容边界

MCP实现stdio的JSON-RPC生命周期、工具、资源、模板、提示、取消和分页；不包含Streamable HTTP、sampling或订阅扩展。根据官方规范实现轻量适配，测试使用真实stdio子进程与自写协议客户端；没有使用官方SDK或验证所有第三方Agent宿主。

CLI与实验HTTP控制协议兼容；新字段为可选配置/观测扩展。G/S策略机制、游戏物理、G提示/输出结构未修改。历史报告仍只读，不因新增重试重跑或重写。

详细信息：MCP-v0.5.5.md、RETRY-v0.5.5.md、VALIDATION-v0.5.5.md。

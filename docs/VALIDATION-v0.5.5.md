# G/S Lab v0.5.5 验证记录

## 范围与真实性

以已交付 v0.5.4 为基线。没有读取用户的.env，没有调用真实Jev/LLM，也没有测得真实模型准确率、费用或果园通关表现。所有提供商都是本机HTTP服务或显式测试回调。新的重试属于传输恢复，MCP属于外部操作接口，不改变被测模型的语义任务。

## 当前结果

| 检查 | 结果 | 证据 |
|---|---:|---|
| 全部代码测试 | 673/673，跳过0 | reports/v055/tests.log |
| 新Jev重试测试 | 29/29 | reports/v055/retry-tests.log |
| MCP访问/控制/真实stdio协议测试 | 40/40 | reports/v055/mcp-tests.log |
| 新浏览器端到端 | 25/25 | reports/v055/browser/browser-v055.json |
| 原v054自主观测台回归 | 41/41 | reports/v055/regression-v054/browser-v054.json |
| 原技能/完整程序/判断实验界面 | 31+26+33全部通过 | reports/v055/browser-*.json |
| 浏览器合计 | 156/156 | reports/v055/browser-summary.json |
| 静态参考隔离检查 | 26/26 | reports/v055/isolation-audit.json |
| 核心保护源码 | 14文件与v054相同 | reports/v055/protected-source.json |

环境为Node.js 22.16.0、TypeScript 5.8.3、Chromium /usr/bin/chromium。完整测试耗时约73秒仅表示本机测试环境，不是模型性能。新增测试69项；旧两项版本断言从0.5.4更新为0.5.5，未删除旧行为测试。generic judgment调度仅扩展传输计数；游戏物理与AdaptiveGS主循环没有修改。

## 重试机制证据

覆盖HTTP408/429/500/502/503/504暂时错误，400/401/402/403/404/422不可重试；连接重置与证书错误分流；Retry-After秒/日期和等待上限；0/2额外重试；每次超时与根取消；退避时世界版本变化；根请求和题数约束；正常none不网络重试；原输入副本不变；失效回答不产生动作；每个尝试独立账本。

成功微型夹具起点已交付4/5并在小窝，由显式测试控制器选择交付；不是模型推理成绩。HTTP浏览器夹具则在完整守卫果园中让MOCK G配置wait，MOCK Jev首次503、第二次成功。真实MCP stdio客户端start，网页看到同runId等待重试，MCP pause后第二次响应放行，产生一次等待：G不重跑，世界只推进一次。该结果验证连线，不是自主解题。

重试等待期间能量与回合不变；失败后恢复包含2次Jev尝试和1次本地G调用。MOCK HTTP为了覆盖生产kind=jev分支记作外部传输尝试，但没有访问真实服务商，不可解释为真实费用。宿主预约尝试与供应商实际收费数也不保证一一相同。

## MCP证据与界限

用实际Node子进程和newline JSON-RPC客户端验证initialize/initialized、4种协议版本、ping、工具/资源/模板/提示发现、分页、畸形JSON恢复、初始化前拒绝、错误回执、权限工具可见性及没有服务时的项目阅读。

另通过真正HTTP ExperimentManager验证创建幂等、单步幂等、CLI/API同世界、控制版本冲突、人工接管保护、显式live权限、检查点分支、历史归档、取消只读等待、operator对参考lane的拒绝与audit只读。文本读取检查路径穿越、symlink、秘密文件、JSON Pointer、哈希分页、字面搜索与常见凭据屏蔽。

这是按官方协议构建的轻量stdio实现，不使用官方SDK。本环境未进行Claude Desktop/Cursor/Codex等第三方宿主配置测试，不声称所有MCP客户端或所有可选协议功能兼容。没有Streamable HTTP、sampling或远程鉴权。operator/audit模式也不能阻止拥有完整文件权限的恶意用户绕过代码。

## 浏览器方法

实际尝试原生localhost导航，Chromium返回ERR_BLOCKED_BY_ADMINISTRATOR。随后使用发行HTML/CSS/JS字节set_content，通过本机HTTP桥访问真实服务；网页事件流桥按真实seq读取原始HTTP事件分页。原生HTTP/SSE协议由既有Node集成测试覆盖。

这不是原生浏览器HTTP导航、所有浏览器或公网验证。截图标记MOCK；25项新增检查包含真实stdio MCP主持实验，而不是调用浏览器调试钩子来代替MCP。

初次测试曾发现两处测试夹具问题：大JSON分段被直接JSON.parse，以及页面状态先到而DOM尚未绘制。已改成按Pointer读取小区域/等待实际DOM；新建对话框的关闭定位改成明确选择第一个关闭按钮。没有放宽安全断言，最终上述全套均通过。早期失败日志保留，最终结论以tests.log及汇总文件为准。

## 封包与未验证项

发行候选已经在独立目录重新解压、重建并通过全部673项测试；970个清单文件的重建哈希差异为0。结果保存在reports/v055/clean-package-gate.json。之后仅追加验证说明、源码补丁和证据，不再修改执行代码。附源码补丁、文件SHA256清单。终版哈希文件是完整性检查，不是安全签名。

实网重试恢复率、服务商计费、真实模型质量和任务通关仍为NOT_RUN。重试耗尽、永久错误、根预算不足仍会明确停止；不保证任何网络故障都能恢复，也不恢复之前已终止的旧会话。活动会话依然不能跨服务重启恢复，但终局归档可通过MCP审计。私密业务内容需导出前人工审核。

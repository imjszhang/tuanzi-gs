# G/S Lab v0.5.2 API 增量

路由、控制版本、幂等、单步/开始/暂停/取消、SSE和导出方式沿用 docs/API-v0.5.md 与旧控制 API。增加以下可选配置：

`config.maxFormatRepairs`：整数0..4，默认2；每份新G输出最多追加的格式纠错请求。不消耗maxRevisions；每次仍消耗maxGCalls、共享maxRequests与墙钟预算。CLI为 `--max-format-repairs 2`。

状态 diagnostics 新增 outputAccounting 与 latestValidation。outputAccounting 的 actualActionTrials 是实际动作计数，不是独立样本数。ledger.rows 的G请求可选 purpose 为 adaptation 或 output-repair。g_stream 同步携带此用途，并继续沿用v1格式。

新的明确停止原因包括 output_format_repair_exhausted 和 adaptation_generation_budget_exhausted。旧 adaptation_budget_exhausted 只用于有效修订次数耗尽，不要把格式失败解释为策略实际失败。

自定义G返回协议、stage-update、schema及完整限制见 docs/OUTPUT-CONTRACT-v0.5.2.md。未经校验的JSON和格式纠错中间文本不获得执行权。修改格式和新增阶段仍必须由S选择，不能让实验主持Agent借此直接插入下一步物理动作。

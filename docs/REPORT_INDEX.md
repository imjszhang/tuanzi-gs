# v0.5.2 当前证据入口

以 reports/v052/gate-summary.json、clean-package-gate.json 和 docs/VALIDATION-v0.5.2.md 为准。531项代码测试、183项浏览器检查；所有真实供应商NOT_RUN。历史结果不代表本次模型性能。

# v0.5.1 当前证据入口

当前流式显示验证以 `reports/v051/` 与 `docs/VALIDATION-v0.5.1.md` 为准。
新界面36项、上版自主观测台36项和旧参考界面90项分别记录，不互相替代。
全部供应商由本地模拟HTTP或测试回调实现，真实模型 NOT_RUN。

以下是原版本证据，不能当成本次新增结果。

# v0.5 当前证据入口

当前验证以 `reports/v05/` 和 `docs/VALIDATION-v0.5.md` 为准。其他目录和以下旧索引是历史记录，不能作为当前真实模型结果。

# 当前发布：v0.4.3（UI）

先看 `reports/v043/GATE-v043.json` 和 `docs/VALIDATION-v0.4.3.md`。历史报告命名表示产生它的原始版本，不能混当本轮新结果。运行时保持 v0.4.2。

# 证据索引

- `reports/GATE-v021.json`：冻结 v0.2.1 时的阶段门，127 + 26。
- `reports/unit-v03-final.txt`：最终 v0.3 代码测试（包括旧用例）。
- `reports/browser-v03.json`：新界面逐项检查，31 项。
- `reports/browser-legacy-on-v03.json`：当前代码中的旧模式 UI 回归，26 项。
- `reports/benchmark-v03.json` 与 `trace-v03-*.json`：当前对照与轨迹。
- `reports/model-benchmark.json`：真实模型状态，本次 NOT_RUN。
- `reports/GATE-v03.json`：当前阶段门及干净目录复验。

带 v02/v021 的旧报告是历史资料，不是新功能证据。带 dev/first 的日志属于开发检查，不是最终阶段门。

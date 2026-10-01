# G/S Lab v0.5.3 — 自主实验开局环境研判

基于交付的 v0.5.2。新自主实验不再先让 S 用默认局部条件行动若干步，而是在第一次开始/单步时先运行 G，基于允许的初始环境建立 S 的决策条件。

## 使用

Node.js 22+；已附编译文件，启动无需先安装依赖。

```bash
cd tuanzi-gs
npm start
# 浏览器打开 http://127.0.0.1:4173/lab
```

无需新增开关，原来的 Agent CLI/HTTP 命令继续有效：

```bash
node bin/gs-lab.mjs create --kind game --controller adaptive --scenario guarded \
  --backend jev --generator llm --strategy direct --allow-live \
  --max-requests 80 --max-g-calls 12 --max-depth 2 \
  --max-revisions 3 --max-format-repairs 2 --deadline-ms 600000 --seed 441
node bin/gs-lab.mjs step RUN_ID
node bin/gs-lab.mjs start RUN_ID --wait --timeout 720000
node bin/gs-lab.mjs export RUN_ID --out reports/my-run.json
```

上述实网命令未在交付过程中运行。需自行配置服务端凭据和明确授权。create只创建会话，不扣模型额度；首次start/step才开始计时和调用G。

## 行为变化

1. 首次决策顺序：G环境研判 → 上层S选初始修订 → 动作层S判断 → 实际执行。即使初始有合法动作，也不跳过G。
2. 初始化复用现有格式纠错、递归、元层选择、版本核对和根预算。G不得直接行动，S保留none。
3. 已建立初始条件的会话，暂停继续/刷新/重连/幂等重放不再初始化；新分支会重新研判自己的起点。
4. 初始化失败不允许默认局部S或规则控制器悄悄接管。旧结果因世界变化失效时，先重新研判，再行动。
5. 起点已是终局则直接验收，无需额外G。
6. 流式卡和事件历史区分“开局环境研判”“策略生成”“格式纠错”；诊断暴露初始化状态与版本。

“一次初始化”不等于固定一次网络请求：格式失败或元层弃权仍可能产生受限的追加G/S计算，全部计费/计时。第一次单步可能在初始化完成后接着执行至多一个动作。

## 升级

建议解压到新目录，迁移自己的.env和本地代码修改，保留原实验导出。服务重启仍不恢复活动调用栈；新建实验使用新逻辑，历史报告保持只读。差异补丁不含重建产物，应用后执行 `npm run build`。

输出schema、字段级纠错、游戏物理、判断适配、参考隔离、底层HTTP控制协议均保留。`version=0.5.3`；自主/导出等协议命名空间维持兼容，增加可忽略的初始化元数据。

## 验证与演示

```bash
npm run check
npm run test:startup
npm run test:revision
npm run test:browser:v053
npm run audit:isolation
npm run demo:startup
```

`demo:startup` 默认端口4198，使用公开标识的本机SSE测试服务，不读取.env、不调用真实模型；只验证先G后S，不提供果园解法。流式尾包可在该专用夹具中通过 `/fixture-release/visible` 放行。该接口不属于生产服务。

详细机制见 `docs/INITIALIZATION-v0.5.3.md`，本轮实测范围见 `docs/VALIDATION-v0.5.3.md`。

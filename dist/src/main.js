import { mountWorkspaceNavigation } from './ui/workspace-navigation.js';
import { mountDecisionLab } from './ui/decision-lab.js';
import { ruleBackend } from './decision/pipeline.js';
import { remoteJudgments } from './decision/providers.js';
import { SkillSession } from './skills/runtime.js';
import { ReactiveCatalogue } from './skills/catalogue.js';
import { ExperienceTable } from './skills/experience.js';
import { remoteSkills } from './skills/providers.js';
import { compareHierarchy } from './skills/benchmark.js';
import { GOAL, INITIAL_POLICY, clone, same } from './game/types.js';
import { createWorld } from './game/world.js';
import { GameSession, comparePrograms } from './runtime/session.js';
import { MODE_LABELS, isRemoteMode, isProgramMode } from './runtime/controllers.js';
import { icon, escape } from './ui/icons.js';
import { SkillBook } from './planning/book.js';
import { describeAction } from './game/domain.js';
import { WorldRenderer } from './ui/renderer.js';
const $ = (id) => {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`Missing element: ${id}`);
    return el;
};
const app = $('app');
app.innerHTML = `
<header class="topbar">
  <div class="brand"><div class="brand-icon">${icon('leaf')}</div><div class="brand-word">团子<span class="brand-slash">/</span><small>G/S LAB</small></div></div>
  <div class="top-actions"><span class="top-label">一个可干预的 Agent 小世界</span>
    <button class="btn ghost" id="btn-connect" title="模型连接设置">${icon('settings')}<span class="btn-text">模型连接</span></button>
    <button class="btn ghost" id="btn-export" title="导出真实运行轨迹">${icon('download')}<span class="btn-text">导出轨迹</span></button>
    <button class="btn icon-only ghost" id="btn-help" aria-label="玩法与引擎说明">${icon('help')}</button>
  </div>
</header>
<main class="shell"><div class="notice" role="note">v0.5：此页仅保留历史离线参考。自主 G/S、Agent 控制与无参考解评估请访问本地服务 <a href="/lab">/lab</a>。</div>
  <section class="intro">
    <div><div class="eyebrow">完整任务体验 · 本地程序化基准</div><h1>别让团子饿死<span style="color:#99ac7b">。</span></h1><p>先固定事实，再改变判断的组织方式。比较能力，也计算代价。</p></div>
    <div class="status-pill" id="mode-pill"><i class="status-dot"></i><span id="mode-label">离线规则演示 · 无需密钥</span></div>
  </section>
  <div class="workspace">
    <section class="play-panel" aria-label="团子世界">
      <div class="mission-bar">
        <div class="mission-text"><div class="mission-icon">${icon('home')}</div><div><strong>五颗浆果，一条小命。</strong><small>把浆果带回小窝，别先把自己饿倒。</small></div></div>
        <div class="mission-stats">
          <div class="metric-energy"><div class="metric-label">${icon('bolt')}能量</div><div class="energy-value"><b id="energy">86</b><small>/ 100</small></div><div class="energy-track"><div class="energy-fill" id="energy-fill"></div></div></div>
          <div><div class="metric-label">${icon('bag')}背包 <span id="bag-count">0/3</span></div><div class="bag-slots" id="bag-slots"></div></div>
          <div><div class="metric-label">${icon('berry')}已交付</div><div class="delivered-value"><b id="delivered">0</b><span> / 5</span></div></div>
        </div>
      </div>
      <div class="map-heading">
        <div class="scene-switch" role="group" aria-label="选择关卡">
          <button class="scene active" data-scenario="meadow"><span class="scene-index">01</span>日常采集</button>
          <button class="scene" data-scenario="detour"><span class="scene-index">02</span>近路被堵</button>
          <button class="scene" data-scenario="guarded"><span class="scene-index">03</span>守卫果园</button>
          <button class="scene" data-scenario="remix"><span class="scene-index">04</span>镜像布局</button>
        </div>
        <div class="map-legend"><span><i class="legend-dot red"></i>浆果</span><span><i class="legend-dot tan"></i>守卫范围</span></div>
      </div>
      <div class="canvas-wrap">
        <canvas id="world" tabindex="0" role="img" aria-label="团子求生地图。可用下方工具编辑浆果、障碍与守卫。"></canvas>
        <div class="map-tag" id="map-status">${icon('eye')}世界就绪</div>
        <div class="map-tag map-turn mono" id="turn-label">TURN 000 / 180</div>
        <div class="map-float" id="map-hint">按下 <span>开始观察</span>，或先在地图上制造一点小麻烦。</div>
        <div class="canvas-overlay hidden" id="result-overlay"><div class="result-card" id="result-card"></div></div>
      </div>
      <div class="intervention-bar">
        <div class="toolset" role="group" aria-label="干预工具"><span class="tool-caption">干预世界</span>
          ${[['inspect', 'cursor', '观察'], ['berry', 'berry', '浆果'], ['wall', 'wall', '障碍'], ['guard', 'guard', '守卫'], ['erase', 'erase', '擦除']].map(([tool, i, label]) => `<button class="tool ${tool === 'inspect' ? 'active' : ''}" data-tool="${tool}" aria-pressed="${tool === 'inspect'}" title="${label}">${icon(i)}<span class="tool-label">${label}</span></button>`).join('')}
        </div>
        <div class="overlays"><label><input id="show-path" type="checkbox" checked>路径</label><label><input id="show-danger" type="checkbox" checked>危险区</label></div>
      </div>
      <div class="transport">
        <div class="transport-main">
          <button class="btn primary play-btn" id="btn-play">${icon('play')}开始观察</button>
          <button class="btn" id="btn-step" title="执行一个 G/S 决策周期；可能执行动作或更新策略">${icon('step')}单步</button>
          <select id="speed" aria-label="演示播放速度"><option value="1100">0.5×</option><option value="650" selected>1×</option><option value="300">2×</option><option value="120">4×</option></select>
          <button class="btn icon-only ghost" id="btn-reset" title="重置当前关卡" aria-label="重置当前关卡">${icon('reset')}</button>
        </div>
        <div class="transport-extra">
          <button class="btn ghost" id="btn-snapshot" title="保存当前世界与策略">${icon('save')}<span class="btn-text">存快照</span></button>
          <button class="btn ghost" id="btn-restore" title="恢复已保存的世界与策略">${icon('rewind')}<span class="btn-text">从这里重来</span></button>
          <button class="btn soft" id="btn-compare" title="从同一快照进行离线对照">${icon('compare')}对照</button>
        </div>
      </div>
    </section>
    <aside class="engine-panel" aria-label="G/S 引擎观测台">
      <div class="panel-title"><h2>${icon('code')}引擎观测台</h2><span class="muted small mono" id="engine-revision">REV 001</span></div>
      <div class="flow" aria-label="状态到行动的数据流"><span class="node" data-phase="observe">观察</span><span class="flow-arrow">→</span><span class="node" data-phase="generate">G 候选</span><span class="flow-arrow">→</span><span class="node" data-phase="select">S 判断</span><span class="flow-arrow">→</span><span class="node" data-phase="feedback">反馈</span></div>
      <section class="policy-section">
        <div class="section-label"><strong>当前策略</strong><span class="tag mono" id="policy-version">v1</span></div>
        <div class="policy-card" id="policy-card"><div class="policy-name"><span id="policy-name">${icon('leaf')}安全采集</span><span class="tag" id="policy-origin">初始配置</span></div><p class="policy-subgoal" id="policy-subgoal"></p><div class="capabilities" id="capabilities"></div><div class="policy-foot hidden" id="policy-foot"></div></div>
      </section>
      <section class="candidate-section">
        <div class="section-label"><strong>S · 可执行候选</strong><span id="candidate-cycle">等待第一轮</span></div>
        <div class="candidate-list" id="candidates"></div>
        <div class="candidate-note" id="candidate-note">离线启发式权重，非模型概率或胜率。<br>候选来自当前快照，执行前再次校验。</div>
      </section>
      <section class="feedback-card"><div class="section-label"><strong>执行后的事实</strong><span id="feedback-status">尚未执行</span></div><div class="feedback-fact" id="feedback-fact">还没有动作发生。世界只在行动时推进，暂停不会消耗能量。</div><div class="feedback-metrics" id="feedback-metrics"></div></section>
      <div class="engine-footer"><div class="engine-counts">
        <div><div class="count-value" id="count-s">0</div><div class="count-label">S 判断</div></div>
        <div><div class="count-value" id="count-g">0</div><div class="count-label">G 生成 / 修复</div></div>
        <div><div class="count-value" id="count-api">0</div><div class="count-label">远端请求</div></div>
      </div><p class="engine-honesty" id="honesty">当前使用<strong>规则选择器 + 预置修复模板</strong>。<br>未调用 Jev 或 LLM，不代表模型性能。</p></div>
    </aside>
  </div>
  <section class="hierarchy-panel" id="hierarchy-panel" aria-label="父子 G/S 运行">
    <div class="hierarchy-top"><div><div class="eyebrow">ONE ROOT BUDGET · ONE WORLD WRITER</div><h2>一个根任务，两个决策尺度。</h2></div><span class="tag" id="hierarchy-status">等待调度</span></div>
    <div class="hierarchy-grid"><div><span class="section-label">父 G/S · 根目标</span><strong>五颗浆果，安全交付</strong><p id="parent-choice">生成并选择局部技能，执行期间让出世界写权限。</p></div><div><span class="section-label">子 G/S · 局部目标</span><strong id="child-title">尚未启动</strong><p id="child-stage">子任务成功不等于整局成功。</p></div><div><span class="section-label">共享根预算</span><strong id="root-budget">0 / 180 个物理动作</strong><p id="experience-state">经验：参与选择 · 0 条统计</p></div></div>
    <div id="local-results" class="local-results">每个子运行结束后，在这里显示真实结果与控制权返回。</div>
  </section>
  <section class="audit-panel" id="decision-audit-panel" aria-label="判断来源与信息对齐">
    <div class="learning-heading"><div><div class="eyebrow">DECISION PROVENANCE · v0.4</div><h2>谁在做决定？依据是什么？</h2></div><button class="btn" id="btn-audit">${icon('download')}导出判断包</button></div>
    <div class="audit-grid"><div><span class="section-label">最近一次来源</span><strong id="decision-origin">尚未判断</strong><p id="decision-detail">共享事实、独立排序、明确拒绝。</p></div><div><span class="section-label">规则 / 模型 / 确定性</span><strong id="decision-counts">0 / 0 / 0</strong><p>这里统计判断来源，不把接口次数当成远端请求。</p></div><div><span class="section-label">验证范围</span><strong>模拟不等于模型实测</strong><p>生成技能的模拟控制器为 authored-reference。实际结果另绑定选择器、问题和事实版本。</p></div></div>
    <details><summary>查看最近决策的中立事实包与候选顺序</summary><pre id="audit-facts">尚无事实包。</pre></details>
  </section>
  <section class="learning-panel" aria-label="程序与技能实验台">
    <div class="learning-heading"><div><div class="eyebrow">FROM A PLAN TO A REACTIVE SKILL</div><h2>父层选技能，子层选动作，结果返回父层。</h2></div><button class="btn ghost" id="btn-book">${icon('save')}技能记录 <b id="book-count">0</b></button></div>
    <div class="learning-grid">
      <div class="program-preview"><div class="section-label"><strong>可执行程序，不是策略旁白</strong><span class="tag" id="program-stage">尚未生成</span></div>
        <div id="program-steps" class="program-steps"></div><div class="program-actions"><button class="btn tiny" id="btn-program">${icon('code')}查看程序 JSON</button><span id="program-scope" class="muted small">有限原语序列 · 每一步核对前置状态</span></div></div>
      <div class="learning-metrics"><div class="learning-stat"><strong id="stat-search">0</strong><span>新生成 / 搜索</span></div><div class="learning-stat"><strong id="stat-hit">0</strong><span>复用 / 重绑定</span></div><div class="learning-stat"><strong id="stat-expanded">0</strong><span>搜索与模拟检查</span></div><div class="learning-stat"><strong id="stat-skill">0</strong><span>已通过实际验收</span></div><p id="learning-note">先通过模拟，再等待实际任务验收。只复用精确条件相同的程序，不宣称泛化。</p></div>
    </div>
  </section>
  <section class="journal-panel" aria-label="运行事件">
    <div class="journal-head"><h2>${icon('clock')}发生了什么 <span class="muted small" id="journal-count">/ 真实事件流</span></h2>
      <div class="journal-buttons"><button class="journal-filter active" data-filter="all">全部</button><button class="journal-filter" data-filter="g">G 修复</button><button class="journal-filter" data-filter="action">动作</button><button class="btn tiny ghost" id="btn-replay">${icon('rewind')}回放</button><button class="btn tiny ghost" id="btn-raw" title="完整原始引擎事件">${icon('code')}</button></div>
    </div>
    <div class="journal-events" id="journal-events"></div>
  </section>
  <footer class="footer"><span><strong>G/S LAB v0.4.3</strong> · TypeScript · 事件驱动 · 本地模拟世界</span><span class="shortcuts"><kbd>Space</kbd> 开始 / 暂停　<kbd>→</kbd> 单步　<kbd>R</kbd> 重置</span><span>五颗浆果之外，还有一种新的办法。</span></footer>
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<dialog class="dialog" id="help-dialog"><div class="dialog-top"><h2>你不操纵团子。你改变它的处境。</h2><button class="btn icon-only ghost" data-close="help-dialog" aria-label="关闭">${icon('close')}</button></div>
<p>团子要把五颗浆果带回小窝。每个动作消耗一点能量；吃一颗浆果恢复 32 点。背包最多装三颗。你可以先观察，再封路、搬动食物、移动守卫。</p>
<div class="help-grid"><div class="help-card"><strong>${icon('leaf')}01 · 日常采集</strong><span>已有办法足够。轻量 G 实例化动作，S 选择；无需 G 修复。</span></div><div class="help-card"><strong>${icon('wall')}02 · 近路被堵</strong><span>程序重新寻路，不把普通绕路包装成大模型推理。</span></div><div class="help-card"><strong>${icon('guard')}03 · 守卫果园</strong><span>日常规则没有适合的动作时，有界搜索组合原语，生成带前置状态检查的有限程序。默认并非 LLM。</span></div><div class="help-card"><strong>${icon('compare')}同一局面，再来一次</strong><span>同一快照比较旧版修复、开局完整规则、程序搜索和技能复用。复用组来自冷启动组的成功记录。</span></div></div>
<h3>工具怎么用？</h3><p>浆果工具：点击空地新增；先点已有浆果、再点空地可搬动。障碍工具：在空地放墙。守卫工具：把唯一的守卫移到空地。擦除工具：清除玩家障碍、浆果或守卫。小窝、团子、天然岩石和湖泊受到保护。</p>
<div class="notice">守卫会追逐 9 格内的投放诱饵，吃到后停留 18 个回合。危险区阻止不安全移动；诱饵能力由程序实现，新程序可组合已有原语，不能改变世界规则、根目标或权限。自由编辑可能造出无解地图。</div>
<div class="dialog-actions"><button class="btn primary" data-close="help-dialog">开始实验 ${icon('arrow')}</button></div></dialog>
<dialog class="dialog" id="connect-dialog"><div class="dialog-top"><h2>模型连接</h2><button class="btn icon-only ghost" data-close="connect-dialog" aria-label="关闭">${icon('close')}</button></div>
<p>此页保留历史离线参考：含手写策略与搜索，不是 v0.5 自主实验。自主 G/S 请在本地服务 /lab 创建；旧实网入口已停用。</p><div class="connection-status" id="connection-status"></div>
<label class="setting" for="run-mode">下一轮运行方式</label><select class="setting" id="run-mode"><option value="reactive">v0.3 父子 G/S + 反应技能（离线，默认）</option><option value="reactive-off">v0.3 反应技能 · 经验关闭</option><option value="reactive-record">v0.3 反应技能 · 只记录经验</option><option value="reactive-jev">v0.3 Jev 判断 + 本地技能生成（已停用，请用 /lab）</option><option value="reactive-live">v0.3 Jev + LLM 技能提案（已停用，请用 /lab）</option><option value="program">v0.2.1 完整程序搜索 + 精确记忆（离线对照）</option><option value="rules-full">完整预置规则从开局启用（离线对照）</option><option value="program-jev">Jev 判断 + 本地程序搜索（已停用，请用 /lab）</option><option value="program-live">Jev 判断 + LLM 生成程序（已停用，请用 /lab）</option><option value="adaptive">G/S 离线：规则选择 + 预置修复</option><option value="fixed">固定策略：同一规则选择，不修复</option><option value="jev-template">Jev 判断 + 预置修复（已停用，请用 /lab）</option><option value="live">Jev 判断 + LLM 修复（已停用，请用 /lab）</option></select>
<label class="setting" for="decision-style">父子引擎的判断组织（v0.3 技能模式生效）</label><select class="setting" id="decision-style"><option value="batch">v0.4 独立拆分合批</option><option value="direct">v0.4 直接 Choice</option><option value="serial">v0.4 独立拆分逐题</option><option value="dependent">v0.4 先适用性，再选择</option><option value="classic">v0.3.1 原接口基线</option></select><p class="small muted">子层单一候选与父层继续调度仍走确定性路径。真实模式每批是一次请求，逐题可能显著增加成本。</p><div class="notice" id="connection-notice"></div>
<pre id="connection-env"># 在项目目录中创建 .env，仅保存在服务端
TYPESAFE_API_KEY=你的密钥
JEV_MODEL=jev-1.13.0
LLM_API_KEY=你的密钥
LLM_MODEL=你的模型名
LLM_URL=https://你的服务/v1/chat/completions

# 重启本地服务
npm start</pre>
<label class="checks"><input id="live-consent" type="checkbox"><span>我了解真实模式会向配置的模型服务发送游戏状态并可能产生费用。运行仍受调用次数与时间预算约束。</span></label>
<div class="dialog-actions"><button class="btn" data-close="connect-dialog">取消</button><button class="btn primary" id="apply-mode">应用并重开当前关卡</button></div></dialog>
<dialog class="dialog wide" id="compare-dialog"><div class="dialog-top"><h2>同一个世界，四种运行方式。</h2><button class="btn icon-only ghost" data-close="compare-dialog" aria-label="关闭">${icon('close')}</button></div>
<p id="compare-summary"></p><div class="comparison-grid" id="compare-results"></div><div class="notice warm">这是离线机制对照，不是模型基准。后三组具有相同的原语候选与权限；旧版组保留历史候选接口。技能复用组由冷启动组训练而来，不能当成独立测试样本；首次搜索成本显示在冷启动组中。对照不会写入你的技能库，也不请求外部模型。</div><div class="dialog-actions"><button class="btn" id="export-comparison">${icon('download')}导出对照结果</button><button class="btn primary" data-close="compare-dialog">回到实验</button></div></dialog>
<dialog class="dialog wide" id="replay-dialog"><div class="dialog-top"><h2>轨迹回放</h2><button class="btn icon-only ghost" data-close="replay-dialog" aria-label="关闭">${icon('close')}</button></div><p id="replay-description">只读回放，不会重新执行动作，也不会调用模型。</p><canvas class="replay-canvas" id="replay-canvas" role="img" aria-label="只读动作轨迹回放"></canvas><div class="replay-controls"><button class="btn icon-only" id="replay-play" aria-label="播放回放">${icon('play')}</button><input id="replay-range" type="range" min="0" max="0" value="0" aria-label="回放动作位置"><span class="replay-label mono" id="replay-position">0 / 0</span></div><p id="replay-fact"></p></dialog>
<dialog class="dialog wide" id="raw-dialog"><div class="dialog-top"><h2>运行时原始事件</h2><button class="btn icon-only ghost" data-close="raw-dialog" aria-label="关闭">${icon('close')}</button></div><p>真实事件记录。没有额外生成的“模型内心独白”。为避免界面卡顿，这里展示最近 30 个事件；导出包含全部事件与玩家干预。</p><pre class="raw-events" id="raw-events"></pre></dialog>
<dialog class="dialog wide" id="program-dialog"><div class="dialog-top"><h2>执行协议 · Plan / SkillSpec</h2><button class="btn icon-only ghost" data-close="program-dialog" aria-label="关闭">${icon('close')}</button></div><p>Plan 保存有限序列；SkillSpec 保存参数、已注册局部谓词和有限阶段。新模式只允许一层子 G/S，根预算共享。不存在任意代码执行或自定义成功标准。</p><pre id="program-json" class="raw-events"></pre><div class="dialog-actions"><button class="btn" id="export-program">${icon('download')}导出程序</button></div></dialog>
<dialog class="dialog wide" id="book-dialog"><div class="dialog-top"><h2>执行经验 · 计划记录 / 反应技能</h2><button class="btn icon-only ghost" data-close="book-dialog" aria-label="关闭">${icon('close')}</button></div><p>计划记录需要精确跟随且根任务成功；反应技能记录局部运行结果与测过的情境。参数重绑定不是坐标回放，测过两张地图也不代表适用于所有新环境。</p><div id="book-records"></div><p id="storage-note"></p><div class="dialog-actions"><button class="btn ghost" id="clear-book">清空记录</button><button class="btn" id="export-book">${icon('download')}导出技能库</button></div></dialog>

`;
let scenario = 'guarded', mode = 'reactive', tool = 'inspect';
let session, playing = false, busy = false, generation = 0, timer;
let speed = 650, latestCandidates = [], latestJudgment = null, selectedId = null;
let latestFeedback = null, latestExplanation = '', phase = 'observe', candidateCycle = 0;
let saved = null, pendingBerry = null;
let feed = [];
let filter = 'all', toastTimer, paintScheduled = false;
let decisionStyle = 'batch';
let backend = { available: false, jevReady: false, llmReady: false, token: '', jevModel: '' };
let comparisonRows = [];
let replayRenderer = null, replayTimer;
let replayTrace = null;
let replayFrames = [];
let localStore;
try {
    localStore = window.localStorage;
}
catch { }
const skillBook = new SkillBook(localStore);
const catalogue = new ReactiveCatalogue(localStore);
let experience = new ExperienceTable('use', localStore);
const isReactive = () => session instanceof SkillSession;
const newReactiveMode = (m) => m.startsWith('reactive');
let lastSearchStatus = '';
const renderer = new WorldRenderer($('world'), handleMapClick);
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3300); }
function showDialog(id) { pause(); $(id).showModal(); }
function addFeed(kind, title, turn, seq = 0) { feed.push({ kind, title, turn, seq }); if (feed.length > 600)
    feed = feed.slice(-600); }
function schedulePaint() { if (paintScheduled)
    return; paintScheduled = true; requestAnimationFrame(() => { paintScheduled = false; paint(); }); }
function onEvent(e) {
    switch (e.type) {
        case 'skill_generation_started':
            phase = 'repair';
            lastSearchStatus = '生成局部技能';
            addFeed('g', '已有技能不足：搜索有限阶段组合（原语规则由开发者提供）', session.world.snapshot().turn, e.seq);
            break;
        case 'skill_generated':
            lastSearchStatus = '局部模拟通过 · 试行';
            addFeed('g', '形成可反应的技能规范，根交付目标不变。', session.world.snapshot().turn, e.seq);
            break;
        case 'skill_started':
            addFeed('g', `启动子 G/S：${e.data.spec.title}；共享预算，单一执行权。`, session.world.snapshot().turn, e.seq);
            break;
        case 'skill_phase_changed':
            addFeed('g', `子技能切换阶段：${e.data.rule}`, session.world.snapshot().turn, e.seq);
            break;
        case 'reactive_skill_reused':
            lastSearchStatus = '同一技能 · 参数重绑定';
            addFeed('g', '重新绑定目标和当前路径，不重放旧坐标。', session.world.snapshot().turn, e.seq);
            break;
        case 'skill_summary': {
            const d = e.data;
            addFeed('g', `子运行返回：${d.localSucceeded ? '局部成功' : '未成功'} · ${d.outcome.steps} 步；根任务${d.rootSucceeded ? '完成' : '仍需继续'}。`, session.world.snapshot().turn, e.seq);
            break;
        }
        case 'hierarchy_policy_committed':
            lastSearchStatus = '技能加入当前候选';
            break;
        case 'proposal_rejected':
            addFeed('g', '提案被校验拒绝；错误反馈给生成器，仍受根预算限制。', session.world.snapshot().turn, e.seq);
            break;
        case 'observed':
            phase = 'observe';
            break;
        case 'candidates':
            latestCandidates = e.data.accepted;
            candidateCycle = e.cycle;
            latestJudgment = null;
            selectedId = null;
            phase = 'generate';
            break;
        case 'selector_requested':
            phase = 'select';
            break;
        case 'selector_answered': {
            latestJudgment = e.data.answer.output;
            selectedId = latestJudgment.choice;
            const c = latestCandidates.find(x => x.id === selectedId);
            addFeed('s', selectedId ? `S 选择：${c?.description ?? selectedId}` : 'S 不推荐当前候选，请求运行时处理', session.world.snapshot().turn, e.seq);
            break;
        }
        case 'repair_requested':
            phase = 'repair';
            addFeed('g', '现有办法不足：先查可用技能，再决定是否生成新程序', session.world.snapshot().turn, e.seq);
            break;
        case 'program_generation_started':
            lastSearchStatus = '正在生成';
            phase = 'repair';
            addFeed('g', `生成器开始：${e.data.source === 'llm' ? 'LLM 程序提案' : '有界原语搜索（离线）'}`, session.world.snapshot().turn, e.seq);
            break;
        case 'search_progress':
            lastSearchStatus = `搜索深度 ${e.data.depth}`;
            break;
        case 'program_verified':
            lastSearchStatus = '模拟通过 · 等待实际试行';
            addFeed('g', '有限程序通过模拟检查；尚未晋升为成功技能。', session.world.snapshot().turn, e.seq);
            break;
        case 'skill_reused':
            lastSearchStatus = '精确命中 · 已复检';
            addFeed('g', '命中已验证技能，重新检查通过；本轮不生成新程序。', session.world.snapshot().turn, e.seq);
            break;
        case 'skill_promoted':
            lastSearchStatus = '实际验收通过 · 已保存';
            addFeed('g', '根任务实际成功，程序已保存。重置相同局面可以复用。', session.world.snapshot().turn, e.seq);
            break;
        case 'health_alert':
            lastSearchStatus = '旧依据失效 / 检测到循环';
            addFeed('world', `运行诊断：${e.data.reason}；停止旧方案。`, session.world.snapshot().turn, e.seq);
            break;
        case 'policy_committed': {
            latestExplanation = e.data.explanation;
            latestJudgment = null;
            selectedId = null;
            latestCandidates = [];
            const v = e.data.next.version;
            phase = 'repair';
            addFeed('g', `策略 v${v} 已提交：${session.engine.currentPolicy.body.subgoal}`, session.world.snapshot().turn, e.seq);
            break;
        }
        case 'transition':
            latestFeedback = e.data;
            phase = 'feedback';
            addFeed('action', latestFeedback.after.state.lastFact, latestFeedback.after.state.turn, e.seq);
            break;
        case 'stale_result_discarded':
            addFeed('world', '世界已变化，过期判断已丢弃；下一轮重新观察。', session.world.snapshot().turn, e.seq);
            break;
        case 'run_finished':
            addFeed('world', '运行已结束，结果由环境验收器确认。', session.world.snapshot().turn, e.seq);
            break;
    }
    schedulePaint();
}
function resetWorld(world, policy = INITIAL_POLICY, keepSaved = true) {
    pause();
    generation++;
    const gen = generation;
    session?.cancel();
    busy = false;
    latestCandidates = [];
    latestJudgment = null;
    selectedId = null;
    latestFeedback = null;
    latestExplanation = '';
    candidateCycle = 0;
    phase = 'observe';
    pendingBerry = null;
    feed = [];
    lastSearchStatus = '';
    if (newReactiveMode(mode)) {
        const em = mode === 'reactive-off' ? 'off' : mode === 'reactive-record' ? 'record' : 'use';
        if (experience.mode !== em)
            experience = new ExperienceTable(em, localStore);
        session = new SkillSession(world, mode, e => { if (gen === generation)
            onEvent(e); }, { catalogue, experience, ...(isRemoteMode(mode) ? { providers: remoteSkills(backend.token, mode === 'reactive-live') } : {}), ...(decisionStyle !== 'classic' ? { decision: { strategy: decisionStyle, backend: isRemoteMode(mode) ? remoteJudgments(backend.token, 'jev') : ruleBackend() } } : {}) });
    }
    else
        session = new GameSession(world, mode, e => { if (gen === generation)
            onEvent(e); }, backend.token, policy, { book: skillBook });
    latestCandidates = session.domain.enumerate({ goal: GOAL, snapshot: { state: world, revision: String(world.revision), observedAt: Date.now() }, policy: session.engine.currentPolicy, recent: [] });
    if (!keepSaved)
        saved = { world: clone(world), policy: clone(policy) };
    renderer.setState(world, true);
    renderer.setCandidate(null);
    $('result-overlay').classList.add('hidden');
    addFeed('world', world.lastFact, world.turn);
    paint();
}
function loadScenario(next) { scenario = next; resetWorld(createWorld(next), INITIAL_POLICY, false); }
function pause() { playing = false; clearTimeout(timer); timer = undefined; if (document.getElementById('btn-play'))
    $('btn-play').innerHTML = `${icon('play')}继续观察`; }
async function stepOnce() {
    if (busy || session.finished)
        return;
    busy = true;
    const current = session;
    paintControls();
    try {
        await current.step();
    }
    catch (err) {
        if (current === session)
            toast(err instanceof Error ? err.message : String(err));
    }
    finally {
        if (current === session) {
            busy = false;
            paint();
            if (session.finished) {
                pause();
                paintResult();
            }
        }
    }
}
async function drive() { if (!playing || busy || session.finished)
    return; await stepOnce(); if (playing && !session.finished)
    timer = setTimeout(() => void drive(), speed); }
function togglePlay() {
    if (playing) {
        pause();
        paint();
        return;
    }
    if (session.finished) {
        toast('本轮已结束。重置关卡或恢复快照可开始新的一轮。');
        return;
    }
    if (busy) {
        toast('当前决策尚未返回。');
        return;
    }
    playing = true;
    paintControls();
    void drive();
}
function paintControls() {
    $('btn-play').innerHTML = playing ? `${icon('pause')}暂停运行` : `${icon('play')}${session?.world.snapshot().turn ? '继续观察' : '开始观察'}`;
    $('btn-step').disabled = busy || playing || !!session?.finished;
    $('btn-play').disabled = !!session?.finished;
    $('btn-snapshot').disabled = busy;
    $('btn-restore').disabled = !saved;
    $('btn-compare').disabled = busy;
    $('map-status').innerHTML = `${icon(playing ? 'leaf' : 'eye')}${busy ? (phase === 'repair' ? 'G · 修复策略' : 'S · 判断中') : playing ? '引擎运行中' : session?.finished ? '本轮已结束' : '已暂停 · 世界不耗能'}`;
}
function paint() {
    if (!session)
        return;
    const s = session.world.snapshot(), p = session.engine.currentPolicy;
    renderer.setState(s);
    renderer.setCandidate(latestCandidates.find(c => c.id === selectedId) ?? null);
    $('energy').textContent = String(s.energy);
    $('energy-fill').style.width = `${s.energy}%`;
    $('energy-fill').classList.toggle('low', s.energy < 26);
    $('bag-count').textContent = `${s.bag}/${s.capacity}`;
    $('bag-slots').innerHTML = Array.from({ length: s.capacity }, (_, i) => `<span class="bag-slot ${i < s.bag ? 'full' : ''}">${icon('berry')}</span>`).join('');
    $('delivered').textContent = String(s.delivered);
    $('turn-label').textContent = `TURN ${String(s.turn).padStart(3, '0')} / ${s.maxTurns}`;
    $('engine-revision').textContent = `REV ${String(s.revision).padStart(3, '0')}`;
    document.querySelectorAll('[data-scenario]').forEach(b => { b.classList.toggle('active', b.dataset.scenario === scenario); b.setAttribute('aria-pressed', String(b.dataset.scenario === scenario)); });
    $('policy-version').textContent = `v${p.version}`;
    const repaired = p.version > 1;
    $('policy-card').classList.toggle('repaired', repaired);
    $('policy-card').title = latestExplanation;
    $('policy-name').innerHTML = `${icon(p.body.mode === 'lure' ? 'spark' : p.body.mode === 'return' ? 'home' : 'leaf')}${{ forage: '安全采集', lure: '诱饵采集', return: '优先交付', program: '有限行动程序' }[p.body.mode]}`;
    $('policy-subgoal').textContent = p.body.subgoal;
    $('policy-origin').textContent = p.body.program ? (session.planning.source === 'memory' ? '技能复用' : session.planning.source === 'llm' ? 'LLM 程序' : '搜索程序') : repaired ? (mode === 'live' ? 'LLM 提案' : '预置模板') : '初始配置';
    $('policy-origin').classList.toggle('gold', repaired);
    const capNames = { move: '移动', pickup: '拾取', eat: '进食', deposit: '交付', wait: '等待', drop: '诱饵' };
    $('capabilities').innerHTML = Object.entries(capNames).map(([name, label]) => `<span class="cap ${p.body.enabled.includes(name) ? name === 'drop' && !isProgramMode(mode) ? 'new' : '' : 'disabled'}">${name === 'drop' && p.body.enabled.includes(name) && !isProgramMode(mode) ? '+ ' : ''}${label}</span>`).join('');
    $('policy-foot').classList.toggle('hidden', !repaired);
    $('policy-foot').textContent = p.body.program ? '程序正在真实执行，每一步核对依据。模拟通过不等于泛化能力。' : mode === 'live' ? '通过能力与版本校验，正在试行；不代表优于旧策略。' : '预置配置，不是模型发现或自我进化。';
    const ranked = latestCandidates.slice().sort((a, b) => (latestJudgment?.probabilities[b.id] ?? 0) - (latestJudgment?.probabilities[a.id] ?? 0));
    $('candidates').innerHTML = ranked.slice(0, 4).map((c, i) => {
        const prob = latestJudgment?.probabilities[c.id], picked = c.id === selectedId;
        return `<div class="candidate ${picked ? 'selected' : ''}" title="${escape(c.description)}"><div class="candidate-main"><div class="candidate-name"><span class="candidate-id">${picked ? '✓' : String(i + 1).padStart(2, '0')}</span><span class="text">${escape(c.description)}</span></div><span class="candidate-score">${prob === undefined ? '—' : Math.round(prob * 100) + '%'}</span></div><div class="candidate-track"><div class="candidate-bar" style="width:${prob === undefined ? 0 : prob * 100}%"></div></div></div>`;
    }).join('') || `<div class="candidate"><div class="candidate-name">策略已改变；下一轮重新生成候选。</div></div>`;
    $('candidate-cycle').textContent = candidateCycle ? `第 ${candidateCycle} 轮 · ${latestCandidates.length} 项` : '尚未评分';
    const offline = !isRemoteMode(mode);
    $('candidate-note').innerHTML = offline ? '离线启发式权重，非模型概率或胜率。<br>候选来自该轮快照，执行前再次校验。' : 'Jev 相对选项概率，不是动作成功率。<br>独立适用性判断与程序硬约束共同裁决。';
    if (latestFeedback) {
        $('feedback-fact').textContent = latestFeedback.after.state.lastFact;
        $('feedback-status').textContent = latestFeedback.feedback.progress ? '局部状态推进' : '暂未推进';
        const m = latestFeedback.feedback.metrics;
        $('feedback-metrics').innerHTML = Object.entries({ 能量: m.energyDelta, 交付: m.deliveredDelta, 背包: m.bagDelta }).filter(([, v]) => v !== 0).map(([k, v]) => `<span class="feedback-chip ${v > 0 ? 'good' : ''}">${k} ${v > 0 ? '+' : ''}${v}</span>`).join('');
    }
    else {
        $('feedback-fact').textContent = s.lastFact;
        $('feedback-status').textContent = '尚未执行';
        $('feedback-metrics').innerHTML = '';
    }
    const countS = session.events.filter(e => e.type === 'selector_requested' || (e.type === 'parent_event' && e.data.event?.type === 'selector_requested')).length, countG = isReactive() ? session.planning.searchRuns : session.events.filter(e => e.type === 'repair_requested').length;
    $('count-s').textContent = String(countS);
    $('count-g').textContent = String(countG);
    $('count-api').textContent = String(session.planning.providerG + session.planning.providerS);
    $('honesty').innerHTML = mode === 'rules-full' ? '当前为<strong>完整预置规则 · 不生成程序</strong>。<br>规则含诱饵选点，作为有能力的基线。' : isProgramMode(mode) ? (offline ? '当前为<strong>离线规则 S + 有界原语搜索 G</strong>。<br>复用会重新校验，不改模型权重。' : '真实模型接口模式；程序仍须受限校验。<br>失败不静默降级，未实测成本优势。') : offline ? `当前使用<strong>规则选择器${mode === 'adaptive' ? ' + 预置修复模板' : ' · 固定策略'}</strong>。<br>未调用 Jev 或 LLM，不代表模型性能。` : `当前使用<strong>${MODE_LABELS[mode]}</strong>。<br>远端请求不等于成功计费次数；金额未估算。`;
    if (session instanceof SkillSession) {
        $('policy-name').innerHTML = icon('spark') + '参数化反应技能';
        $('policy-origin').textContent = session.active ? session.active.spec.source : '父层调度';
        $('policy-foot').classList.remove('hidden');
        $('policy-foot').textContent = '局部谓词与阶段边界由程序检查；父子共享根预算。';
        $('honesty').innerHTML = offline ? '当前为<strong>规则选择 + 有限语法搜索</strong>。<br>规则与参数绑定知识是人工编写；未调用真实模型。' : '当前为真实模型判断 / 提案；失败不降级。<br>权限、根目标与子技能验收由程序决定。';
        $('candidate-note').innerHTML = offline ? '0 / 100% 仅为确定性选择标记，不是概率。<br>当前展示子 G/S 的合法原语候选。' : 'Jev 判断不是成功率；执行器独立检查。';
    }
    $('mode-label').textContent = MODE_LABELS[mode] + (offline ? ' · 离线' : ' · 真实请求');
    $('mode-pill').classList.toggle('live', !offline);
    document.querySelectorAll('[data-phase]').forEach(el => { const active = el.dataset.phase === phase || (phase === 'repair' && el.dataset.phase === 'generate'); el.classList.toggle('active', active); el.classList.toggle('repair', phase === 'repair' && active); });
    $('journal-count').textContent = `/ ${session.events.length} 个引擎事件`;
    const entries = feed.filter(e => filter === 'all' || filter === 'g' && e.kind === 'g' || filter === 'action' && e.kind === 'action').slice(-4).reverse();
    $('journal-events').innerHTML = entries.length ? entries.map(e => `<article class="journal-item"><div class="event-meta"><span class="event-badge ${e.kind === 'g' ? 'g' : e.kind === 'action' ? 'e' : ''}">${{ g: 'G', s: 'S', action: 'E', world: '↗' }[e.kind]}</span><span class="event-time mono">TURN ${String(e.turn).padStart(3, '0')}${e.seq ? ` · #${e.seq}` : ''}</span></div><div class="event-title" title="${escape(e.title)}">${escape(e.title)}</div></article>`).join('') : '<div class="journal-empty">还没有这类事件。切换到「守卫果园」可观察预置策略修复。</div>';
    paintDecisionAudit();
    paintHierarchy();
    paintLearning();
    paintControls();
}
function paintDecisionAudit() {
    const h = session instanceof SkillSession ? session : null;
    $('decision-audit-panel').classList.toggle('hidden', !h);
    if (!h)
        return;
    const records = h.decisions, last = records.at(-1);
    const resumes = h.events.filter(e => e.type === 'decision_origin').length;
    const labels = { 'authored-rule': '程序规则', 'deterministic-single': '单候选确定性', 'deterministic-resume': '父层继续调度', 'jev': 'Jev', 'configured-model': '已配置模型', 'test-provider': '测试替身' };
    $('decision-origin').textContent = last ? labels[last.source] ?? last.source : '尚未判断';
    $('decision-counts').textContent = `${records.filter(x => x.source === 'authored-rule').length} / ${records.filter(x => x.externalRequests > 0).length} / ${resumes + records.filter(x => x.source === 'deterministic-single').length}`;
    $('decision-detail').textContent = last ? `${last.packet.level === 'parent' ? '父层' : '子层'} · ${last.status} · ${last.latencyMs.toFixed(1)} ms · seed ${last.packet.orderSeed} · ${last.packet.candidates.length} 项` : '候选未按规则优先级排列；选择后仍需执行器复核。';
    $('audit-facts').textContent = last ? JSON.stringify(last.packet, null, 2) : '尚无事实包。';
}
function paintHierarchy() {
    const h = session instanceof SkillSession ? session : null;
    $('hierarchy-panel').classList.toggle('hidden', !h);
    if (!h)
        return;
    const active = h.active, b = h.budget.snapshot(), last = h.summaries.at(-1);
    $('hierarchy-status').textContent = active ? '子层持有执行权' : '父层持有控制权';
    $('child-title').textContent = active?.spec.title ?? '等待父层选择';
    $('child-stage').textContent = active ? `局部目标 ${active.spec.success} · 阶段 ${active.domain.frame.phase + 1}/${active.spec.phases.length} · ${active.runId.split('/').at(-1)}` : '一个技能结束，父层重新观察根任务。';
    const parent = h.events.filter(e => e.type === 'parent_candidates').at(-1)?.data;
    $('parent-choice').textContent = parent?.candidates?.length ? parent.candidates.map((c) => c.description).join(' / ') : '需要新技能时，父层请求受限生成。';
    $('root-budget').textContent = `${b.used.actions} / ${b.limits.actions} 物理动作 · ${b.used.providerCalls} 远端请求`;
    $('experience-state').textContent = `经验：${{ use: '参与选择', record: '只记录', off: '关闭' }[h.experience.mode]} · ${h.experience.list().length} 条统计 · ${b.used.searchNodes} 次计算检查`;
    $('local-results').innerHTML = h.summaries.slice(-4).map(x => `<span class="tag ${x.localSucceeded ? 'gold' : ''}">${escape(x.skillId.slice(-6))} · ${x.status === 'external_change' ? '受干预，不计晋升' : x.localSucceeded ? '局部成功' : '未成功'} · ${x.outcome.steps} 步${x.rootSucceeded ? ' · 根目标完成' : ''}</span>`).join('') || '局部成功不等于整局成功。子任务的结果、成本和失败原因会返回父层。';
}
function paintLearning() {
    if (session instanceof SkillSession) {
        const h = session, records = h.catalogue.list(), active = h.active, spec = active?.spec ?? records.at(-1)?.spec;
        $('stat-search').textContent = String(h.planning.searchRuns);
        $('stat-hit').textContent = String(h.planning.skillHits);
        $('stat-expanded').textContent = h.planning.expanded.toLocaleString();
        $('stat-skill').textContent = String(h.summaries.filter(x => x.status === 'success').length);
        $('book-count').textContent = String(records.length);
        $('program-stage').textContent = lastSearchStatus || '父子运行就绪';
        $('program-steps').innerHTML = spec ? spec.phases.map((p, i) => `<div class="program-line ${active?.domain.frame.phase === i ? 'current' : ''}"><span class="mono">${String(i + 1).padStart(2, '0')}</span><strong>${escape(p.rule)}</strong><small>直到 ${escape(p.until)}</small></div>`).join('') : '<div class="program-empty">技能不足时搜索有限阶段组合；移动、采集、放置和等待规则已由开发者注册。<br>子 G/S 每步重新观察、绑定目标并选择动作，不播放固定路线。</div>';
        $('program-scope').textContent = spec ? `${spec.id}@${spec.version} · ${spec.source} · 最多 ${spec.maxSteps} 个动作` : 'SkillSpec 参数和局部谓词，非完整坐标序列';
        $('btn-program').disabled = !spec;
        $('learning-note').textContent = '默认离线；阶段组合可生成，但语法、原语规则与绑定启发式是人工知识。精确计划可能更快；这里检验局部决策、重绑定和经验消费，不声称最优或自动进化。';
        return;
    }
    const p = session.engine.currentPolicy.body.program, stats = session.planning, records = skillBook.list(), verified = records.filter(x => x.status === 'verified').length;
    $('stat-search').textContent = String(stats.searchRuns);
    $('stat-hit').textContent = String(stats.skillHits);
    $('stat-expanded').textContent = stats.expanded.toLocaleString();
    $('stat-skill').textContent = String(verified);
    $('book-count').textContent = String(records.length);
    $('program-stage').textContent = lastSearchStatus || (p ? '程序在执行' : '日常选择');
    const i = p ? Math.max(0, session.world.snapshot().turn - p.startTurn) : 0;
    if (p) {
        const start = Math.min(i, Math.max(0, p.steps.length - 4));
        $('program-steps').innerHTML = p.steps.slice(start, start + 4).map((step, j) => `<div class="program-line ${start + j === i ? 'current' : ''}"><span class="mono">${String(start + j + 1).padStart(3, '0')}</span><strong>${escape(describeAction(step.action))}</strong><small>${start + j < i ? '已执行' : start + j === i ? '待检查执行' : '待执行'}</small></div>`).join('');
        $('program-scope').textContent = `${Math.min(i, p.steps.length)} / ${p.steps.length} 步 · ${p.id}`;
    }
    else {
        $('program-steps').innerHTML = '<div class="program-empty">已有日常规则先处理；只有无法继续或检测到循环，才查技能、生成程序。<br>守卫果园可观察完整的生成 → 校验 → 试行 → 保存。</div>';
        $('program-scope').textContent = '有限原语序列 · 不是自然语言策略旁白';
    }
    $('btn-program').disabled = !p;
    $('learning-note').textContent = stats.skillHits ? '本轮命中精确条件相同的已验证程序。仍重新模拟与逐步检查；没有新增搜索或修改模型权重。' : stats.searchRuns ? `本轮搜索 ${Math.round(stats.searchMs)} ms，生成的程序不依赖诱饵模式分支。成功仅限当前任务，不是最优性或泛化证明。` : '旧策略切换不是生成；本版的程序保存也不是通用技能发现。下方对照同时保留完整规则基线。';
}
function selectedProgram() { return session instanceof SkillSession ? (session.active?.spec ?? session.catalogue.list().at(-1)?.spec ?? null) : session.engine.currentPolicy.body.program ?? null; }
function showProgram() { showDialog('program-dialog'); $('program-json').textContent = JSON.stringify(selectedProgram(), null, 2); }
function showBook() {
    showDialog('book-dialog');
    if (session instanceof SkillSession) {
        const h = session, records = h.catalogue.list();
        $('book-records').innerHTML = records.map(x => `<article class="skill-record"><strong>${escape(x.spec.title)} · ${escape(x.status)}</strong><p class="mono">${escape(x.spec.id)}@${x.spec.version} · ${escape(x.source)}</p><p>局部实测成功 ${x.successes} · 失败 ${x.failures} · 干预/中断 ${x.interruptions}</p><p>测过的情境：${escape(x.contexts.join('、') || '尚无')}；不是全环境可靠性证明。</p></article>`).join('') || '<p>暂无生成技能记录。先运行守卫果园。</p>';
        $('book-records').innerHTML += `<p>经验模式：${h.experience.mode}；实际统计 ${h.experience.list().length} 条。只记录模式不影响排名。</p>`;
        $('storage-note').textContent = h.catalogue.persistenceError ?? h.experience.persistenceError ?? (localStore ? '记录保存在本浏览器；无法存储时只在内存使用。' : '当前浏览器未提供存储，仅在本页内存使用；请导出记录。');
        $('clear-book').disabled = busy || playing;
        return;
    }
    const records = skillBook.list();
    $('book-records').innerHTML = records.length ? records.slice().reverse().map(x => `<article class="skill-record"><div><strong>${escape(x.title)}</strong><span class="tag">${{ trial: '试行中', verified: '实际验证', quarantined: '已隔离', retired: '已替换' }[x.status]}</span></div><p class="mono">${escape(x.id)} · ${x.program.steps.length} 步 · ${escape(x.source)}</p><p>实际成功 ${x.successes} · 失败 ${x.failures} · 复用 ${x.uses} · 中断/失效 ${x.invalidations}</p><p>${escape(x.lastEvidence)}</p></article>`).join('') : '<p>还没有程序记录。先让团子完成守卫果园；只有实际成功才可以自动复用。</p>';
    $('storage-note').textContent = skillBook.persistenceError ?? '保存在当前浏览器的本地存储中。单文件持久化是否可用取决于浏览器；导出可保存记录。';
    $('clear-book').disabled = busy || playing;
}
function paintResult() {
    const r = session.lastResult;
    if (!r || !session.finished)
        return;
    const s = session.world.snapshot();
    const success = r.kind === 'done' && r.outcome === 'succeeded';
    const title = success ? '五颗浆果，平安到家。' : r.kind === 'done' ? (s.energy <= 0 ? '团子的能量用完了。' : '本局行动预算用完了。') : '当前运行已停下。';
    const reasons = { 'decision_blocked:no_local_suitable_action': '子层判断受阻：没有选择合适动作。任务上下文和弃权结果已记录；未自动改选规则或重复生成。', 'decision_blocked:parent_no_suitable_skill': '父层判断受阻：已有候选被拒绝，未证明需要新技能。', 'duplicate_repair_no_new_evidence': '检测到同样条件下的重复技能结构；仅更换名字不会重试。', planner_proposed_no_change: '现有策略库没有可用的新方案。你可以修改世界，或恢复快照重新实验。', repair_budget_exhausted: '策略修复预算已经用完，没有继续调用模型。', cycle_budget_exhausted: '达到决策周期上限。' };
    const reason = 'reason' in r ? r.reason : '';
    const detail = success ? `经过 ${s.turn} 个动作，交付 ${s.delivered} 颗浆果，剩余 ${s.energy} 点能量。` :
        r.kind === 'done' ? (s.energy <= 0 ? '食物既是任务物品，也是生存资源。换一个起点，再试一次。' : '在 180 个动作内未完成交付。查看轨迹，或从不同策略重新开始。') : reasons[reason] ?? `运行时原因：${reason}。没有静默切换成规则或继续执行。`;
    $('result-card').classList.toggle('error', !success);
    $('result-card').innerHTML = `<div class="result-icon">${icon(success ? 'check' : 'leaf')}</div><h2>${title}</h2><p>${escape(detail)}</p><button class="btn primary" id="result-replay">${icon('rewind')}看看它怎么做到的</button><button class="btn" id="result-close">查看地图</button>`;
    if (!success)
        $('result-replay').innerHTML = `${icon('rewind')}回看发生了什么`;
    $('result-overlay').classList.remove('hidden');
    $('result-close').onclick = () => $('result-overlay').classList.add('hidden');
    $('result-replay').onclick = () => openReplay(session.export());
}
function setTool(next) {
    tool = next;
    pendingBerry = null;
    renderer.setTool(tool);
    document.querySelectorAll('[data-tool]').forEach(b => { b.classList.toggle('active', b.dataset.tool === tool); b.setAttribute('aria-pressed', String(b.dataset.tool === tool)); });
    const hint = { inspect: '观察模式 · 你改变处境，不直接操纵团子。', berry: '点击空地放浆果；先点已有浆果、再点空地可以搬动。', wall: '点击空地放置障碍。下一轮根据新世界重新寻路。', guard: '点击空地移动守卫；它会追逐投放的诱饵。', erase: '点击移除障碍、浆果或守卫。天然地形不可擦除。' };
    $('map-hint').textContent = hint[tool];
}
function handleMapClick(p) {
    if (session.finished && tool !== 'inspect') {
        toast('本轮已结束；先重置或恢复快照，再编辑世界。');
        return;
    }
    const s = session.world.snapshot();
    if (tool === 'inspect') {
        const content = same(p, s.player) ? `团子：能量 ${s.energy}，背包 ${s.bag}` : same(p, s.home) ? `小窝：已交付 ${s.delivered}/5` : s.berries.some(b => same(b, p)) ? '浆果：可拾取，进食恢复 32 点能量' : s.guards.some(g => same(g, p)) ? '守卫：会追逐投放的浆果诱饵' : s.walls.some(w => same(w, p)) ? '玩家障碍：可以擦除' : s.terrain[p.y * s.width + p.x] === 'water' ? '湖泊：不可通行' : s.terrain[p.y * s.width + p.x] === 'rock' ? '天然岩石：不可通行' : '空地：可用工具放置浆果、障碍或移动守卫';
        toast(`(${p.x}, ${p.y}) ${content}`);
        return;
    }
    if (tool === 'berry') {
        const b = s.berries.find(x => same(x, p));
        if (b) {
            pendingBerry = { id: b.id, point: p };
            toast('已选中这颗浆果，再点击一块空地搬过去。');
            return;
        }
        if (pendingBerry) {
            if (!s.berries.some(x => x.id === pendingBerry.id)) {
                pendingBerry = null;
                toast('原来的浆果已经被取走了。');
                return;
            }
            const result = session.edit('berry', p);
            if (result.ok) {
                session.edit('erase', pendingBerry.point);
                addFeed('world', `玩家将浆果搬到 (${p.x}, ${p.y})`, s.turn);
                pendingBerry = null;
            }
            toast(result.ok ? '浆果已搬动。当前决策若已过期，会被引擎丢弃。' : result.message);
            paint();
            return;
        }
    }
    const result = session.edit(tool, p);
    if (result.ok)
        addFeed('world', result.message, s.turn);
    toast(result.message);
    paint();
}
function snapshot() { if (busy)
    return; pause(); saved = { world: session.world.snapshot(), policy: session.engine.currentPolicy }; toast(`已保存第 ${saved.world.turn} 回合的世界和策略 v${saved.policy.version}。`); paint(); }
function restore() { if (!saved)
    return; resetWorld(clone(saved.world), clone(saved.policy)); toast('已恢复快照；这是新的运行，旧轨迹不会混入。'); }
function download(name, data) { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function compare() {
    if (busy)
        return;
    pause();
    showDialog('compare-dialog');
    $('compare-results').innerHTML = '<p>正在用同一快照运行四组离线方案……</p>';
    const base = saved?.world ?? session.world.snapshot();
    $('compare-summary').textContent = `同一初始快照（第 ${base.turn} 回合）、根目标与物理权限。候选抽象不同，不是固定候选的模型比较。复用组继承冷启动经验，不是独立样本。`;
    // Let the dialog paint; the experiment itself has no artificial inference delay.
    await new Promise(r => setTimeout(r, 40));
    try {
        comparisonRows = await (isReactive() ? compareHierarchy(base) : comparePrograms(base));
        $('compare-results').innerHTML = comparisonRows.map((r, i) => `<section class="comparison-card"><h3>${escape(r.label)}</h3><div class="comparison-big">${r.delivered}<small> / 5</small></div><div class="comparison-outcome">${escape(r.outcome)}</div><div class="comparison-row"><span>新增行动步数</span><strong>${r.turns - base.turn}</strong></div><div class="comparison-row"><span>剩余能量</span><strong>${r.energy}</strong></div><div class="comparison-row"><span>S 判断</span><strong>${r.selects}</strong></div><div class="comparison-row"><span>已提交策略修复</span><strong>${r.repairs}</strong></div><div class="comparison-row"><span>新搜索 / 技能命中</span><strong>${r.trace.planning.searchRuns} / ${r.trace.planning.skillHits}</strong></div><div class="comparison-row"><span>生成耗时 / 计算检查</span><strong>${Math.round(r.trace.planning.searchMs)} ms / ${r.trace.planning.expanded}</strong></div><div class="comparison-row"><span>外部模型调用</span><strong>0</strong></div><button class="btn" data-replay-row="${i}">${icon('rewind')}回放这条轨迹</button></section>`).join('');
        document.querySelectorAll('[data-replay-row]').forEach(b => b.onclick = () => { const row = comparisonRows[Number(b.dataset.replayRow)]; if (row)
            openReplay(row.trace); });
    }
    catch (err) {
        $('compare-results').textContent = err instanceof Error ? err.message : String(err);
    }
}
function openReplay(trace) {
    pause();
    replayTrace = trace;
    replayFrames = trace.events.filter(e => e.type === 'transition').map(e => e.data);
    $('replay-dialog').showModal();
    replayRenderer?.dispose();
    replayRenderer = new WorldRenderer($('replay-canvas'));
    const range = $('replay-range');
    range.max = String(replayFrames.length);
    range.value = '0';
    $('replay-description').textContent = `${MODE_LABELS[trace.mode]} · 只读世界快照回放，不重新执行、不产生新模型调用。玩家干预以动作执行后的快照呈现，完整干预记录见导出。`;
    updateReplay();
}
function updateReplay() {
    if (!replayTrace)
        return;
    const i = Number($('replay-range').value);
    const f = replayFrames[i - 1];
    replayRenderer?.setState(f?.after.state ?? replayTrace.initialWorld, true);
    $('replay-position').textContent = `${i} / ${replayFrames.length}`;
    $('replay-fact').textContent = f ? `动作 ${i} · ${f.candidate.description} → ${f.after.state.lastFact}` : '初始世界快照。拖动滑块查看每一次行动后的实际状态。';
}
function stopReplay() { clearTimeout(replayTimer); replayTimer = undefined; $('replay-play').innerHTML = icon('play'); }
function playReplay() {
    if (replayTimer) {
        stopReplay();
        return;
    }
    if (!replayFrames.length)
        return;
    const range = $('replay-range');
    if (Number(range.value) >= replayFrames.length)
        range.value = '0';
    $('replay-play').innerHTML = icon('pause');
    const advance = () => { const next = Number(range.value) + 1; range.value = String(next); updateReplay(); if (next >= replayFrames.length) {
        stopReplay();
        return;
    } replayTimer = setTimeout(advance, 280); };
    replayTimer = setTimeout(advance, 20);
}
async function refreshBackend() {
    if (location.protocol === 'file:')
        return;
    try {
        const r = await fetch('/api/status');
        if (r.ok) {
            const x = await r.json();
            backend = { ...x, available: true };
        }
    }
    catch { /* Static hosting intentionally remains offline. */ }
}
function connect() {
    $('decision-style').value = decisionStyle;
    showDialog('connect-dialog');
    $('run-mode').value = mode;
    $('connection-status').innerHTML = `<span class="tag">${backend.available ? '本地代理已连接' : '单文件 / 静态模式'}</span><span class="tag">Jev：${backend.jevReady ? '已配置' : '未配置'}</span><span class="tag">LLM：${backend.llmReady ? '已配置' : '未配置'}</span>`;
    $('connection-notice').textContent = backend.available ? '密钥仅从服务端 .env 读取，不在浏览器输入，不写进轨迹。修改配置后重启服务。' : '当前版本完全本地运行。真实模型模式需打开完整项目，运行 npm start，并通过本地网页访问。';
    const sel = $('run-mode');
    for (const opt of sel.options) {
        if (opt.value === 'jev-template' || opt.value === 'program-jev' || opt.value === 'reactive-jev')
            opt.disabled = true;
        if (opt.value === 'live' || opt.value === 'program-live' || opt.value === 'reactive-live')
            opt.disabled = true;
    }
}
function applyMode() {
    decisionStyle = $('decision-style').value;
    const selected = $('run-mode').value;
    if (isRemoteMode(selected)) {
        toast('旧参考辅助实网路径已停用。请访问本地 /lab，选择自主 G/S。');
        return;
    }
    if (isRemoteMode(selected)) {
        if (!backend.jevReady || ((selected === 'live' || selected === 'program-live' || selected === 'reactive-live') && !backend.llmReady)) {
            toast('服务端模型配置尚未完成。');
            return;
        }
        if (!$('live-consent').checked) {
            toast('请先确认真实模型请求及费用说明。');
            return;
        }
    }
    mode = selected;
    $('connect-dialog').close();
    loadScenario(scenario);
    toast(`已切换：${MODE_LABELS[mode]}`);
}
$('btn-play').onclick = togglePlay;
$('btn-step').onclick = () => void stepOnce();
$('btn-reset').onclick = () => loadScenario(scenario);
$('btn-snapshot').onclick = snapshot;
$('btn-restore').onclick = restore;
$('btn-compare').onclick = () => void compare();
$('btn-program').onclick = showProgram;
$('btn-book').onclick = showBook;
$('export-program').onclick = () => download('tuanzi-program.json', selectedProgram());
$('export-book').onclick = () => download('tuanzi-skills.json', session instanceof SkillSession ? { catalogue: catalogue.export(), experience: experience.export() } : skillBook.export());
$('clear-book').onclick = () => { if (session instanceof SkillSession) {
    catalogue.clear();
    experience.clear();
}
else
    skillBook.clear(); showBookAfterClear(); paintLearning(); };
function showBookAfterClear() { $('book-records').innerHTML = '<p>已清空技能记录。重新开始同一关卡将不读取旧技能。</p>'; }
$('btn-help').onclick = () => showDialog('help-dialog');
$('btn-connect').onclick = connect;
$('apply-mode').onclick = applyMode;
$('btn-export').onclick = () => download(`tuanzi-trace-${scenario}-${Date.now()}.json`, session.export());
$('btn-replay').onclick = () => openReplay(session.export());
$('replay-play').onclick = playReplay;
$('replay-range').oninput = () => { stopReplay(); updateReplay(); };
$('export-comparison').onclick = () => download('tuanzi-offline-comparison.json', { note: 'Same world, root goal and permissions; different control abstractions. Warm row inherits evidence. Offline, not a model benchmark.', rows: comparisonRows });
$('btn-raw').onclick = () => { $('raw-events').textContent = JSON.stringify(session.events.slice(-30), null, 2); showDialog('raw-dialog'); };
$('speed').onchange = e => { speed = Number(e.target.value); };
for (const id of ['show-path', 'show-danger'])
    $(id).onchange = () => renderer.setOverlay($('show-path').checked, $('show-danger').checked);
document.querySelectorAll('[data-scenario]').forEach(b => b.onclick = () => loadScenario(b.dataset.scenario));
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === b)); paint(); });
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());
$('replay-dialog').addEventListener('close', () => { stopReplay(); replayRenderer?.dispose(); replayRenderer = null; });
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) {
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        d.close();
} }));
window.addEventListener('keydown', e => {
    if (document.body.dataset.localScope === 'judgment' || document.querySelector('dialog[open]') || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName))
        return;
    if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
    }
    else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (!playing)
            void stepOnce();
    }
    else if (e.key.toLowerCase() === 'r') {
        loadScenario(scenario);
    }
});
// Stable read-only hooks for browser smoke tests and local debugging, never exposing provider keys.
Object.defineProperty(window, 'tuanziLab', { value: {
        snapshot: () => session.world.snapshot(), events: () => clone(session.events), exportTrace: () => session.export(),
        skills: () => session instanceof SkillSession ? catalogue.export() : skillBook.export(), clearSkills: () => { if (session instanceof SkillSession) {
            catalogue.clear();
            experience.clear();
        }
        else
            skillBook.clear(); }, compare: () => isReactive() ? compareHierarchy(saved?.world ?? session.initial) : comparePrograms(saved?.world ?? session.initial),
        setMode: (next) => { if (!Object.keys(MODE_LABELS).includes(next) || isRemoteMode(next))
            throw Error('Offline helper only'); mode = next; loadScenario(scenario); },
        hierarchy: () => session instanceof SkillSession ? session.export().hierarchy : null,
        edit: (tool, p) => { const r = session.edit(tool, p); paint(); return r; },
        loadScenario: (id) => loadScenario(id), step: async () => { pause(); await stepOnce(); return session.lastResult; },
        runOfflineToEnd: async () => { if (isRemoteMode(mode))
            throw new Error('This helper cannot run paid calls.'); pause(); for (let i = 0; i < 220 && !session.finished; i++)
            await stepOnce(); return session.export(); }
    }, writable: false });
$('btn-audit').onclick = () => { if (session instanceof SkillSession)
    download('gs-decision-audit-v04.json', session.export().decisionAudit); };
const decisionLab = mountDecisionLab(document.querySelector('main.shell'), () => backend, pause);
Object.defineProperty(window, 'gsDecisionLab', { value: decisionLab, writable: false });
loadScenario('guarded');
void refreshBackend().then(() => decisionLab.refresh());
mountWorkspaceNavigation();

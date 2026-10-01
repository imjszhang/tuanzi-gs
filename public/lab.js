/* G/S v0.5.5 shared-run observer. */
(()=>{'use strict';const modules={"src/lab/viewer.js":{deps:{"./generation-panel.js":"src/lab/generation-panel.js","../ui/renderer.js":"src/ui/renderer.js","./viewer-layout.js":"src/lab/viewer-layout.js","./presentation.js":"src/lab/presentation.js"},factory:function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const generation_panel_js_1 = require("./generation-panel.js");
/** v0.5 observation client. No GSEngine, strategy mutation, simulation or model calls. */
const renderer_js_1 = require("../ui/renderer.js");
const viewer_layout_js_1 = require("./viewer-layout.js");
const presentation_js_1 = require("./presentation.js");
const $ = (id) => {
    const el = document.getElementById(id);
    if (!el)
        throw Error(`Missing viewer element: ${id}`);
    return el;
};
const val = (id) => $(id).value;
const checked = (id) => $(id).checked;
const hide = (id, hidden) => $(id).classList.toggle('hidden', hidden);
const text = (id, v) => { $(id).textContent = String(v ?? ''); };
const html = (id, v) => {
    if ($(id).innerHTML !== v)
        $(id).innerHTML = v;
};
function uid() {
    if (typeof crypto.randomUUID === 'function')
        return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
let actorId;
try {
    actorId = sessionStorage.getItem('gs-lab-viewer-id') ?? `human:${uid()}`;
    sessionStorage.setItem('gs-lab-viewer-id', actorId);
}
catch {
    actorId = `human:${uid()}`;
}
const actor = { id: actorId, kind: 'human', label: '网页操作员' };
let token = '', cap = null, state = null, events = [], cursor = 0, streamAbort = null, generation = 0;
let connected = false, pending = false, listing = true, replaying = false, imported = false, frames = [], frameIndex = 0, report = null, tab = 'overview', decisionIndex = -1;
let runs = [], checkpoints = [], lastSync = '', historyComplete = true, selectedId = null;
let paintTimer;
const rawRefs = new Map();
let refCount = 0;
$('lab-app').innerHTML = viewer_layout_js_1.layout;
const renderer = new renderer_js_1.WorldRenderer($('world'));
const generationPanel = new generation_panel_js_1.GenerationPanel(() => openDialog('generation-dialog'), toast);
let generationPaint;
function paintGeneration() {
    const s = current();
    if (!s || listing)
        return;
    generationPanel.update(s.runId, events, replaying ? s.lastSeq : cursor, { replay: replaying || imported, connected });
    if (!replaying && !imported && connected && s.startedAt && !s.endedAt) {
        text('elapsed', (0, presentation_js_1.duration)(Math.max(s.elapsedMs, Date.now() - Date.parse(s.startedAt))));
        $('elapsed').title = '观察端时钟估计；导出与评估仍以服务端记录为准。';
    }
}
function queueGeneration() {
    if (generationPaint !== undefined)
        return;
    generationPaint = setTimeout(() => { generationPaint = undefined; paintGeneration(); }, 60);
}
const current = () => replaying ? frames[frameIndex] ?? state : state;
function badge(s) { return `<span class="badge ${(0, presentation_js_1.terminal)(s.status) ? s.status === 'succeeded' ? 'success' : 'warning' : ['running', 'stepping'].includes(s.status) ? 'active' : ''}">${(0, presentation_js_1.esc)(presentation_js_1.STATUS[s.status] ?? s.status)}</span>`; }
function factsGrid(rows) { return `<dl class="facts-grid">${rows.map(([k, v]) => `<div><dt>${(0, presentation_js_1.esc)(k)}</dt><dd>${(0, presentation_js_1.esc)(v ?? '未记录')}</dd></div>`).join('')}</dl>`; }
function rawButton(title, value) { const id = `raw-${++refCount}`; rawRefs.set(id, { title, value }); return `<button class="text-button" data-evidence="${id}">${(0, presentation_js_1.esc)(title)} ↗</button>`; }
let toastTimer;
function toast(message) { text('toast', message); hide('toast', false); clearTimeout(toastTimer); toastTimer = setTimeout(() => hide('toast', true), 6500); }
const dialogTriggers = new Map();
function openDialog(id) {
    const d = $(id);
    if (d.open)
        return;
    dialogTriggers.set(id, document.activeElement);
    d.showModal();
    const target = d.querySelector('input:not([type="radio"]):not([type="checkbox"]),select,button');
    target?.focus();
}
function closeDialog(id) { $(id).close(); }
for (const d of document.querySelectorAll('dialog'))
    d.addEventListener('close', () => {
        const trigger = dialogTriggers.get(d.id);
        if (trigger?.isConnected && trigger.getClientRects().length)
            trigger.focus();
    });
document.addEventListener('click', e => {
    const target = e.target;
    const close = target.closest('[data-close]');
    if (close) {
        closeDialog(close.dataset.close);
        return;
    }
    const raw = target.closest('[data-evidence]');
    if (raw) {
        const entry = rawRefs.get(raw.dataset.evidence);
        if (entry) {
            text('evidence-title', entry.title);
            text('evidence-json', JSON.stringify(entry.value, null, 2));
            openDialog('evidence-dialog');
        }
    }
    const run = target.closest('[data-run]');
    if (run)
        void openRun(run.dataset.run).catch(error => toast(String(error)));
    const step = target.closest('[data-seq]');
    if (step) {
        const ev = events.find(x => x.seq === Number(step.dataset.seq));
        if (ev) {
            text('evidence-title', `事件 #${ev.seq}`);
            text('evidence-json', JSON.stringify(ev, null, 2));
            openDialog('evidence-dialog');
        }
    }
});
async function api(path, body) {
    const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-gs-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await r.json();
    if (!r.ok)
        throw Error(`${(0, presentation_js_1.rec)(data.error).code ?? r.status}: ${(0, presentation_js_1.rec)(data.error).message ?? data.error}`);
    return data;
}
const path = (id = state?.runId) => `/api/lab/runs/${encodeURIComponent(id ?? '')}`;
function setConnection(ok, label) {
    connected = ok;
    text('connection', label);
    $('connection-dot').classList.toggle('offline', !ok);
    if (!listing)
        queuePaint();
}
function queuePaint() {
    if (paintTimer !== undefined)
        return;
    paintTimer = setTimeout(() => {
        paintTimer = undefined;
        if (!listing)
            render();
    }, 60);
}
function setTab(next, updateUrl = true) {
    if (!['overview', 'decision', 'diagnostics', 'config'].includes(next))
        next = 'overview';
    tab = next;
    for (const b of document.querySelectorAll('[data-tab]')) {
        const on = b.dataset.tab === tab;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        hide('panel-' + b.dataset.tab, !on);
    }
    if (!listing)
        render();
    if (updateUrl && !imported && state)
        history.replaceState(null, '', `/lab?run=${encodeURIComponent(state.runId)}${tab === 'overview' ? '' : `&tab=${tab}`}`);
}
for (const b of document.querySelectorAll('[data-tab]')) {
    b.onclick = () => setTab(b.dataset.tab);
    b.onkeydown = e => {
        const tabs = [...document.querySelectorAll('[data-tab]')];
        let i = tabs.indexOf(b);
        if (e.key === 'ArrowRight')
            i = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft')
            i = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home')
            i = 0;
        else if (e.key === 'End')
            i = tabs.length - 1;
        else
            return;
        e.preventDefault();
        tabs[i].focus();
        setTab(tabs[i].dataset.tab);
    };
}
function showList(push = true) {
    if ($('generation-dialog').open)
        closeDialog('generation-dialog');
    generation++;
    streamAbort?.abort();
    streamAbort = null;
    listing = true;
    replaying = false;
    imported = false;
    selectedId = null;
    hide('list-page', false);
    hide('run-page', true);
    if (push)
        history.pushState(null, '', '/lab');
    void refreshRuns().catch(e => toast(String(e)));
}
$('brand-home').onclick = e => { e.preventDefault(); showList(); };
$('home').onclick = () => showList();
$('back-list').onclick = () => showList();
function renderList() {
    const q = val('run-search').trim().toLowerCase(), filter = val('status-filter');
    const filtered = runs.filter(r => (`${(0, presentation_js_1.titleOf)(r.config)} ${r.owner.label} ${r.runId} ${r.config.strategy}`.toLowerCase().includes(q)) && (filter === 'all' || filter === 'active' && !(0, presentation_js_1.terminal)(r.status) || filter === 'succeeded' && r.status === 'succeeded' || filter === 'attention' && ['blocked', 'failed', 'stopped', 'fault'].includes(r.status) || filter === 'ended' && (0, presentation_js_1.terminal)(r.status)));
    text('list-count', `${filtered.length} 场实验`);
    html('run-list', filtered.length ? filtered.map(r => `<button class="run-row" data-run="${(0, presentation_js_1.esc)(r.runId)}"><span class="run-name"><span class="run-icon">${r.config.kind === 'game' ? '◈' : '⌘'}</span><span><strong>${(0, presentation_js_1.esc)((0, presentation_js_1.titleOf)(r.config))}</strong><small>${r.config.kind === 'game' ? '完整任务' : '判断组合'} · ${(0, presentation_js_1.esc)(presentation_js_1.STRATEGIES[r.config.strategy])}<span class="run-id-small">${(0, presentation_js_1.esc)(r.runId.slice(0, 15))}…</span></small></span></span><span>${badge(r)}</span><span class="row-model">${(0, presentation_js_1.esc)({ rule: r.config.controller === 'adaptive' ? '离线动作轮换夹具' : '程序化参考', jev: 'Jev', llm: 'LLM' }[r.config.backend])}${r.config.generator === 'llm' ? ' + LLM 生成' : ''}<small>${(0, presentation_js_1.esc)(r.config.backend === 'rule' && r.config.generator === 'local' ? '无实网配置' : '实际用量见实验详情')}</small></span><span class="row-owner">${(0, presentation_js_1.esc)(r.owner.label || r.owner.id)}<small>${(0, presentation_js_1.esc)(new Date(r.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))}</small></span><span class="row-arrow">↗</span></button>`).join('') : `<div class="empty-state"><span class="empty-symbol">◎</span><h2>${q || filter !== 'all' ? '没有匹配的实验' : '从一场实验开始'}</h2><p>${q || filter !== 'all' ? '调整筛选，或创建新的实验。' : '点击右上角「新建实验」，也可以让外部 Agent 从 CLI 创建。'}</p><button class="primary" id="empty-create">＋ 新建实验</button></div>`);
    document.getElementById('empty-create')?.addEventListener('click', () => beginCreate());
}
// The DOM helper is intentionally strict elsewhere; the empty state is optional.
async function refreshRuns() {
    if (!token)
        return;
    const data = await api('/api/lab/runs');
    runs = (0, presentation_js_1.list)(data.runs).reverse();
    renderList();
}
$('run-search').oninput = renderList;
$('status-filter').onchange = renderList;
$('refresh').onclick = () => void refreshRuns().catch(e => toast(String(e)));
async function historyUntil(id, limitSeq) {
    const all = [];
    let after = 0;
    historyComplete = true;
    while (after < limitSeq) {
        const data = await api(`${path(id)}/events?after=${after}&limit=1000`);
        const page = (0, presentation_js_1.list)(data.events);
        if (!page.length)
            break;
        for (const e of page)
            if (e.seq <= limitSeq)
                all.push(e);
        const next = Number(data.nextCursor ?? page.at(-1).seq);
        if (next <= after)
            break;
        after = next;
        if (!data.hasMore)
            break;
        if (all.length > 40000) {
            historyComplete = false;
            break;
        }
    }
    return all;
}
async function openRun(id, push = true) {
    if ($('generation-dialog').open)
        closeDialog('generation-dialog');
    const g = ++generation;
    streamAbort?.abort();
    pending = false;
    const next = await api(path(id));
    if (g !== generation)
        return;
    if (!(0, presentation_js_1.isView)(next))
        throw Error('服务端未返回有效的实验快照');
    state = next;
    selectedId = id;
    listing = false;
    imported = false;
    replaying = false;
    report = null;
    frames = [];
    decisionIndex = -1;
    cursor = next.lastSeq;
    events = await historyUntil(id, cursor);
    if (g !== generation)
        return;
    hide('list-page', true);
    hide('run-page', false);
    hide('replay-bar', true);
    lastSync = new Date().toISOString();
    if (push)
        history.pushState(null, '', `/lab?run=${encodeURIComponent(id)}`);
    setTab('overview', false);
    streamAbort = new AbortController();
    void stream(id, g, streamAbort.signal);
    void refreshRuns().catch(() => { });
    $('title').setAttribute('tabindex', '-1');
    $('title').focus({ preventScroll: true });
}
async function stream(id, g, signal) {
    while (!signal.aborted && g === generation) {
        try {
            const response = await fetch(`${path(id)}/stream?after=${cursor}`, { headers: { 'x-gs-token': token }, signal });
            if (!response.ok || !response.body)
                throw Error('事件流未连接');
            if (signal.aborted || g !== generation)
                return;
            setConnection(true, '实时已连接');
            const reader = response.body.getReader(), decoder = new TextDecoder();
            let buffer = '';
            try {
                while (!signal.aborted) {
                    const r = await reader.read();
                    if (r.done)
                        break;
                    buffer += decoder.decode(r.value, { stream: true });
                    if (buffer.length > 16 * 1024 * 1024)
                        throw Error('事件超过界面接收上限');
                    let i;
                    while ((i = buffer.indexOf('\n\n')) >= 0) {
                        const piece = buffer.slice(0, i);
                        buffer = buffer.slice(i + 2);
                        const raw = piece.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
                        if (!raw)
                            continue;
                        const e = JSON.parse(raw);
                        if (signal.aborted || g !== generation)
                            return;
                        if (e.runId !== id || e.seq <= cursor)
                            continue;
                        cursor = e.seq;
                        events.push(e);
                        if (events.length > 40000) {
                            events = events.slice(-40000);
                            historyComplete = false;
                        }
                        lastSync = e.at;
                        if (e.type === 'state' && (0, presentation_js_1.isView)(e.data)) { // Never let a late HTTP command response regress an SSE snapshot.
                            if (!state || e.data.lastSeq >= state.lastSeq)
                                state = e.data;
                        }
                        if ((0, presentation_js_1.unwrap)(e).type === 'g_stream')
                            queueGeneration();
                        else
                            queuePaint();
                    }
                }
            }
            finally {
                try {
                    await reader.cancel();
                }
                catch { /* already closed */ }
            }
            if (!signal.aborted)
                setConnection(false, '连接中断，正在续读');
        }
        catch (e) {
            if (signal.aborted || g !== generation)
                return;
            setConnection(false, '连接中断，正在续读');
        }
        if (!signal.aborted)
            await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
function render() {
    const s = current();
    if (!s)
        return;
    paintGeneration();
    $('run-page').dataset.runId = s.runId;
    rawRefs.clear();
    refCount = 0;
    text('title', (0, presentation_js_1.titleOf)(s.config));
    text('crumb-title', (0, presentation_js_1.titleOf)(s.config));
    text('goal', (0, presentation_js_1.goalOf)(s));
    text('run-status', (replaying ? '历史 · ' : '') + (imported ? '归档 · ' : '') + (presentation_js_1.STATUS[s.status] ?? s.status));
    $('run-status').className = `badge ${s.status === 'succeeded' ? 'success' : (0, presentation_js_1.terminal)(s.status) ? 'warning' : ['running', 'stepping'].includes(s.status) ? 'active' : ''}`;
    text('owner', `${s.owner.kind === 'agent' ? 'Agent 主持' : '人工主持'} · ${s.owner.label || s.owner.id}`);
    text('source-caption', (0, presentation_js_1.actualSource)(s));
    html('run-tags', `<span>${s.config.kind === 'game' ? '完整任务实验' : '判断组合实验'}</span><span>${s.config.controller === 'adaptive' ? '自主闭环 · 无参考解' : '历史参考 / 固定判断基准'}</span><span>${(0, presentation_js_1.esc)(presentation_js_1.STRATEGIES[s.config.strategy])}</span><span>配置：${(0, presentation_js_1.esc)(s.config.backend === 'rule' ? '程序规则' : s.config.backend.toUpperCase())}${s.config.generator === 'llm' ? ' + LLM 生成' : ''}</span><span>${s.owner.id === actor.id ? '你拥有控制权' : '当前仅观察'}</span>${s.interventions.length ? `<span class="tag-warning">${s.interventions.length} 条环境干预</span>` : ''}`);
    hide('stale-banner', connected || imported || replaying);
    text('stale-banner', `连接已中断，下面是最后确认的快照（${lastSync ? new Date(lastSync).toLocaleTimeString('zh-CN') : '时间未记录'}）。世界可能仍在服务端运行；重连后从事件序号继续。`);
    hide('diagnostic-dot', !['blocked', 'failed', 'fault', 'stopped'].includes(s.status));
    const a = (0, presentation_js_1.actionsFor)(state ?? s, actor.id, { replay: replaying, imported, connected, pending });
    for (const id of ['start', 'step', 'pause', 'takeover']) {
        hide(id, !a.visible.includes(id));
        $(id).disabled = !a.enabled[id];
    }
    text('start', s.status === 'paused' ? '继续运行' : '开始运行');
    for (const id of ['cancel', 'checkpoint', 'edit'])
        $(id).disabled = !(a.enabled[id === 'edit' ? (val('edit-when') === 'scheduled' ? 'schedule' : 'intervene') : id]);
    hide('cancel', !a.own || a.done || replaying || imported);
    hide('intervene-open', !a.own || a.done || replaying || imported);
    $('intervene-open').disabled = !a.quiet || !connected || pending;
    $('fork-open').disabled = imported || replaying || !connected || pending;
    $('fork').disabled = imported || !connected || pending;
    $('config-copy').disabled = !connected || !cap;
    $('clone-config').disabled = !connected || !cap;
    $('replay').disabled = pending || (!imported && !connected);
    text('replay', replaying ? '选择回放时刻' : '回放');
    text('operation-note', imported ? '当前是离线归档。只读查看和导出，不向服务端发出写入。' : replaying ? '回放期间所有实验写操作不可用。返回实时后再操作。' : !a.own ? '当前由其他操作员控制。接管会暂停后续调度并留下记录。' : '所有操作由服务端校验版本、权限和执行边界。');
    text('progress', `${s.world.delivered} / ${s.world.target}`);
    text('progress-note', (0, presentation_js_1.terminal)(s.status) ? (s.status === 'succeeded' ? '根验收通过' : '尚未获得根任务成功') : '局部成功不等于整局完成');
    text('energy', `${s.world.energy} / ${s.world.maxEnergy}`);
    text('bag-note', `背包 ${s.world.bag} / ${s.world.capacity} · 已执行 ${s.physicalActions} 步`);
    text('external', s.externalRequests);
    const simulated = (0, presentation_js_1.actualSource)(s).includes('测试替身');
    text('external-label', simulated ? '提供商路径计数 · 测试替身' : '实际外部请求');
    text('request-note', simulated ? '原始账本计数，不是实网性能证据' : `${s.requests} 次判断 / 生成请求（含本地）`);
    text('elapsed', (0, presentation_js_1.duration)(!replaying && !imported && connected && s.startedAt && !s.endedAt ? Math.max(s.elapsedMs, Date.now() - Date.parse(s.startedAt)) : s.elapsedMs));
    $('elapsed').title = !replaying && !imported && connected && s.startedAt && !s.endedAt ? '观察端时钟估计；导出与评估仍以服务端记录为准。' : '服务端记录的运行时长';
    text('elapsed-note', `整局上限 ${(0, presentation_js_1.duration)(s.config.deadlineMs)}`);
    const st = (0, presentation_js_1.statusCopy)(s);
    const showStatus = (0, presentation_js_1.terminal)(s.status) || ['pausing', 'cancelling'].includes(s.status);
    $('stop-detail').className = `status-summary ${st.tone}${showStatus ? '' : ' hidden'}`;
    text('status-title', st.title);
    text('status-body', st.body);
    text('status-reason', s.reason ?? '');
    hide('status-reason', !s.reason);
    text('status-detail', s.status === 'succeeded' ? '回看任务过程 →' : '查看原因与证据 →');
    renderer.setState(s.world, replaying);
    text('world-mode', replaying ? '所选时刻 · 只读' : '服务端唯一世界');
    text('world-label', `物理回合 ${s.world.turn} · 背包 ${s.world.bag}/${s.world.capacity}`);
    text('sequence-label', `事件 #${s.lastSeq} / 世界 v${s.worldRevision}`);
    const retry = (0, presentation_js_1.rec)(s.transportRetry), hasRetry = retry.state === 'waiting' || Number(retry.attempt) > 1 || retry.state === 'failed' || retry.state === 'aborted';
    hide('retry-card', !hasRetry);
    text('retry-title', retry.state === 'waiting' ? 'Jev 访问暂时失败 · 等待重试' : retry.state === 'attempting' ? '正在重新访问 Jev' : retry.state === 'recovered' ? 'Jev 访问已恢复' : retry.state === 'aborted' ? '重试已中断' : 'Jev 访问未恢复');
    text('retry-detail', `尝试 ${retry.attempt ?? 0} / ${retry.maxAttempts ?? 0} · ${retry.state === 'waiting' ? `退避 ${retry.delayMs} ms · ` : ''}${retry.providerStatus ? `HTTP ${retry.providerStatus} · ` : ''}世界不推进；每次请求单独计账。${retry.reason ?? ''}`);
    const f = (0, presentation_js_1.flowOf)(s);
    text('root-goal', (0, presentation_js_1.goalOf)(s));
    text('current-skill', f.skill);
    text('current-phase', f.phase);
    text('immediate-task', f.immediate);
    text('process-status-note', f.detail);
    const latest = events.filter(e => e.seq <= s.lastSeq).at(-1);
    const name = latest ? (0, presentation_js_1.unwrap)(latest).type : '';
    const working = s.busy ? (0, presentation_js_1.rec)(s.diagnostics).phase === 'initializing' ? 'G 正在研判初始环境' : (0, presentation_js_1.rec)(s.diagnostics).phase === 'format-repairing' ? '正在修正输出结构' : (0, presentation_js_1.rec)(s.diagnostics).phase === 'adapting' ? 'G 正在调整判断条件' : ['skill_generation_started', 'repair_requested'].includes(name) ? '正在生成或验证技能' : '正在推进决策量子' : presentation_js_1.STATUS[s.status] ?? s.status;
    text('process-status-title', working);
    $('process-pulse').classList.toggle('working', s.busy && !replaying);
    text('process-level', s.config.controller === 'adaptive' && s.config.kind === 'game' ? `G/S 层级 ${(0, presentation_js_1.rec)(s.diagnostics).depth ?? 0}` : (0, presentation_js_1.rec)(s.activeSkill).spec ? '子 G/S 活跃' : s.config.kind === 'judgment' ? '固定任务' : '父层 / 已返回');
    const keys = (0, presentation_js_1.keyEvents)(events, s.lastSeq);
    html('activity', keys.slice(-5).reverse().map(e => `<button class="timeline-item ${e.tone}" data-seq="${e.seq}"><span class="timeline-dot"></span><span><b>${(0, presentation_js_1.esc)(e.title)}</b><small>${(0, presentation_js_1.esc)(e.detail)}</small></span><time>#${e.seq}</time><span aria-hidden="true">↗</span></button>`).join('') || '<div class="empty-note">尚未开始。首个决策之后，这里会出现可追溯的关键过程。</div>');
    if (tab === 'decision')
        renderDecisions(s);
    if (tab === 'diagnostics')
        renderDiagnostics(s);
    if (tab === 'config')
        renderConfig(s);
    if (replaying) {
        text('replay-position', `${frameIndex + 1} / ${frames.length}`);
        text('replay-caption', `状态 #${s.lastSeq} · ${s.world.turn} 回合 · 所有面板与指标均来自此时刻`);
        hide('live', imported);
        $('replay-prev').disabled = frameIndex === 0;
        $('replay-next').disabled = frameIndex >= frames.length - 1;
    }
}
function renderDecisions(s) {
    const ds = (0, presentation_js_1.decisionsFrom)(events, s);
    const selected = decisionIndex >= 0 ? Math.min(decisionIndex, ds.length - 1) : ds.length - 1;
    html('decision-select', ds.map((d, i) => `<option value="${i}" ${i === selected ? 'selected' : ''}>${i + 1} · ${(0, presentation_js_1.rec)(d.packet).level === 'parent' ? '父层技能选择' : (0, presentation_js_1.rec)(d.packet).level === 'child' ? '子层动作判断' : '任务判断'} · ${d.status === 'abstained' ? '不执行' : d.status === 'error' ? '请求错误' : d.status === 'unreported' ? '已记录输入' : d.choice ? '已选出候选' : '返回'} · ${(0, presentation_js_1.esc)((0, presentation_js_1.sourceLabel)(d.source))}</option>`).join('') || '<option>尚无判断记录</option>');
    const d = ds[selected];
    if (!d) {
        html('decision-content', '<div class="empty-state small-empty"><h3>尚未发生判断</h3><p>开始实验后，问题、候选与返回结果会在这里呈现。</p></div>');
    }
    else {
        const p = (0, presentation_js_1.rec)(d.packet), judgment = (0, presentation_js_1.rec)(d.judgment), cs = (0, presentation_js_1.list)(p.candidates), prob = (0, presentation_js_1.rec)(judgment.probabilities), chosen = d.choice;
        const context = (0, presentation_js_1.rec)(p.taskContext ?? (0, presentation_js_1.rec)(p.projection).taskContext);
        const result = d.status === 'error' ? '判断请求失败' : d.status === 'abstained' ? '返回「不执行」' : chosen ? '已选择候选' : '返回值未在此记录中提供';
        html('decision-content', `<div class="decision-summary"><span class="subtle-tag">${(0, presentation_js_1.esc)((0, presentation_js_1.sourceLabel)(d.source))}</span><h3>${(0, presentation_js_1.esc)(p.goal ?? '当前任务判断')}</h3><p>${(0, presentation_js_1.esc)(result)}${d.latencyMs !== undefined ? ' · ' + (0, presentation_js_1.esc)((0, presentation_js_1.duration)(d.latencyMs)) : ''}</p></div>${factsGrid([['问题版本', p.questionVersion], ['状态 / 策略版本', `${p.snapshotRevision ?? '—'} / ${p.policyVersion ?? '—'}`], ['独立问题', d.questions], ['实际外部请求', d.externalRequests]])}
 ${context.immediateObjective ? `<div class="callout"><b>当前即时任务</b><p>${(0, presentation_js_1.esc)((0, presentation_js_1.rec)(context.immediateObjective).description)}</p></div>` : ''}
 <div class="section-heading"><h3>本次候选</h3><span class="muted">${cs.length} 个 · 保持记录中的顺序</span></div><div class="candidate-table">${cs.map(c => `<div class="candidate-row ${chosen === c.id ? 'chosen' : ''}"><span class="candidate-marker">${chosen === c.id ? '✓' : '·'}</span><div><b>${(0, presentation_js_1.esc)(c.description ?? c.id)}</b><small class="mono">${(0, presentation_js_1.esc)(c.id)}</small></div><span>${typeof prob[c.id] === 'number' ? prob[c.id].toFixed(3) : '未报告'}</span>${rawButton('候选事实与执行数据', c)}</div>`).join('')}</div><p class="field-help">数值为原始判断分布或确定性路由标记，不是任务成功率；“未报告”不补算为零。</p><div class="evidence-actions">${rawButton('本次完整判断', d)}${rawButton('本次输入事实', p)}</div>
 <details class="evidence-details"><summary>父子技能与局部结果</summary>${factsGrid([['当前技能', (0, presentation_js_1.rec)((0, presentation_js_1.rec)(s.activeSkill).spec).title ?? '无活跃子技能'], ['最近局部结果', (0, presentation_js_1.rec)(s.lastSkillResult).localSucceeded === true ? '局部成功' : (0, presentation_js_1.rec)(s.lastSkillResult).localSucceeded === false ? '未获局部成功' : '尚未记录']])}${rawButton('当前技能与最近实际结果', { active: s.activeSkill, last: s.lastSkillResult })}</details>`);
    }
    const keys = (0, presentation_js_1.keyEvents)(events, s.lastSeq);
    html('full-timeline', `${!historyComplete ? '<p class="callout warning">界面缓存不是完整历史；请导出报告获取全部事件。</p>' : ''}${keys.map(e => `<button class="timeline-item ${e.tone}" data-seq="${e.seq}"><span class="mono">#${e.seq}</span><span><b>${(0, presentation_js_1.esc)(e.title)}</b><small>${(0, presentation_js_1.esc)(e.detail)}</small></span><span>↗</span></button>`).join('')}${rawButton('全部原始事件（当前时刻以前）', events.filter(e => e.seq <= s.lastSeq))}`);
}
$('retry-inspect').onclick = () => { text('evidence-title', 'Jev 传输重试（不包含语义重问）'); text('evidence-json', JSON.stringify(events.filter(e => e.seq <= (current()?.lastSeq ?? 0) && ['s_retry', 'lab_request_finished'].includes((0, presentation_js_1.unwrap)(e).type)), null, 2)); openDialog('evidence-dialog'); };
$('decision-select').onchange = () => { decisionIndex = Number(val('decision-select')); render(); };
function renderDiagnostics(s) {
    if (s.config.controller === 'adaptive' && s.config.kind === 'game') {
        renderAdaptiveDiagnostics(s);
        return;
    }
    const d = (0, presentation_js_1.rec)(s.diagnostics), f = (0, presentation_js_1.rec)(d.latestFailure), rep = (0, presentation_js_1.rec)((0, presentation_js_1.rec)(d.budgets).repairs), st = (0, presentation_js_1.statusCopy)(s);
    const has = !!s.reason || Object.keys(f).length > 0;
    html('diagnostics-content', `<div class="diagnostic-verdict ${has ? 'warning' : ''}"><span class="overline">${has ? '当前诊断' : '暂无阻塞证据'}</span><h3>${(0, presentation_js_1.esc)(has ? st.title : '尚未记录需要处理的问题')}</h3><p>${(0, presentation_js_1.esc)(has ? st.body : '这不等于无缺陷；后续的失败、修复和干预会在这里记录。')}</p>${s.reason ? `<code>${(0, presentation_js_1.esc)(s.reason)}</code>` : ''}</div><div class="config-columns"><section class="surface"><h3>预算与执行</h3>${factsGrid([['物理动作', `${s.physicalActions} / ${s.config.maxActions}`], ['请求数', `${s.requests} / ${s.config.maxRequests}`], ['修复次数', rep.limit === undefined ? '本控制器未报告' : `${rep.used} / ${rep.limit}`], ['墙钟 / 上限', `${(0, presentation_js_1.duration)(s.elapsedMs)} / ${(0, presentation_js_1.duration)(s.config.deadlineMs)}`], ['引擎推进耗时', (0, presentation_js_1.duration)(s.engineWorkMs)], ['环境干预', s.interventions.length]])}</section><section class="surface"><h3>问题定位</h3>${factsGrid([['最近失败', f.reason ?? '未记录'], ['子技能实际动作', (0, presentation_js_1.rec)(f.outcome).steps], ['问题组织', presentation_js_1.STRATEGIES[s.config.strategy]], ['请求调度', s.config.strategy === 'serial' ? '逐题串行' : '合批接口（直接选择可能仅一题）'], ['原始状态', s.status], ['控制版本', s.controlVersion]])}</section></div><div class="evidence-actions">${rawButton('完整修复诊断', s.diagnostics ?? { note: '此控制器未提供技能恢复日志' })}${rawButton('最近一次判断', s.lastDecision)}${rawButton('环境干预记录', s.interventions)}${rawButton('运行时原始返回', s.outcome)}</div><p class="field-help">受阻的运行不能透明继续；更改条件应建立新分支。查看与导出不会自动请求模型。</p>`);
}
function renderAdaptiveDiagnostics(s) {
    const d = (0, presentation_js_1.rec)(s.diagnostics), b = (0, presentation_js_1.rec)(d.budgets), a = (0, presentation_js_1.rec)(d.outputAccounting), v = (0, presentation_js_1.rec)((0, presentation_js_1.rec)(d.latestValidation).diagnostics), issues = Array.isArray(v.issues) ? v.issues : [], changes = Array.isArray(d.adaptations) ? d.adaptations : [];
    html('diagnostics-content', `<div class="diagnostic-verdict"><span class="overline">自主调整 · 参考解隔离</span><h3>${(0, presentation_js_1.esc)(d.phase === 'initializing' ? 'G 正在了解初始环境 · 尚未执行物理动作' : d.phase === 'format-repairing' ? '正在修正 G 输出格式 · 尚未形成有效修订' : d.phase === 'adapting' ? 'G 正在重构 S 的决策条件' : s.reason ?? '允许局部判断不完整，由实际反馈驱动调整')}</h3><p>G 只读取公开规则、允许观测及这次运行自己的输入、选择与实际反馈。不读取示例解、参考评分、参考成功轨迹或优化站位。</p></div><div class="config-columns"><section class="surface"><h3>闭环计量</h3>${factsGrid([['开局 G 状态', { pending: '待启动', reviewing: '研判／装载中', ready: '初始条件已就绪', failed: '未完成', 'skipped-terminal': '起点已终局，跳过' }[(0, presentation_js_1.rec)(d.initialization).status] ?? '旧记录未提供'], ['开局研判轮数', (0, presentation_js_1.rec)(d.initialization).reviewCount ?? '—'], ['S 判断', d.sCalls ?? 0], ['其中子问题判断', d.metaCalls ?? 0], ['G 总请求（含纠错）', `${d.gCalls ?? 0} / ${b.gLimit ?? s.config.maxGCalls}`], ['输出格式纠错', a.formatRepairs ?? 0], ['无效结构返回', a.invalidOutputs ?? 0], ['合法提案批次', a.validBatches ?? 0], ['有效修订尝试', a.revisionAttempts ?? 0], ['已应用调整', changes.length], ['当前 / 子问题最大深度', `${d.depth ?? 0} / ${b.depthLimit ?? s.config.maxDepth}`], ['真实动作', s.physicalActions]])}</section><section class="surface"><h3>信息边界</h3>${factsGrid([['参考解读取', '禁止'], ['参考模拟准入', '未使用'], ['自动战术绑定', '未使用'], ['调整方式', d.controlMode ?? '历史记录'], ['候选生命周期', d.candidatePolicy ?? '历史记录'], ['G 陈述', '未验证假设'], ['S 弃权', '进入有界调整；不强制执行'], ['当前阶段', d.phase ?? '尚未开始']])}</section></div>${issues.length ? `<section class="surface" id="output-validation"><h3>最近协议／条件诊断 · 不提供正确路径</h3><p>错误指向 JSON 路径。后续纠错可能已通过，实际生效见上方计数与事件。</p>${issues.map((i) => `<div class="callout warning"><code>${(0, presentation_js_1.esc)(i.path || '/')}</code><small>${(0, presentation_js_1.esc)(i.code ?? '')}</small><p>${(0, presentation_js_1.esc)(i.code === 'fixed_scope_excludes_goal' ? '固定候选白名单排除了尚未到达的目标格。请由 G 修改条件；程序不会插入正确路线。' : i.code === 'candidate_scope_expired' ? '快照候选已过期，需要由 G 重新设定；不会自动扩大范围。' : i.message)}</p>${i.expected !== undefined ? `<small>允许 / 预期：${(0, presentation_js_1.esc)(JSON.stringify(i.expected))}</small>` : ''}</div>`).join('')}</section>` : ''}<div class="evidence-actions">${rawButton('Jev 最近传输与重试', s.transportRetry ?? null)}${rawButton('完整调整证据', d)}${rawButton('当前决策程序', d.program ?? null)}${rawButton('最近实际问题', d.latestIssue ?? null)}${rawButton('只读子问题返回记录', d.subproblems ?? [])}${rawButton('S 实际看到的输入和回答', s.lastDecision)}</div>${(0, presentation_js_1.list)(d.subproblems).length ? `<section class="surface" id="subproblem-results"><h3>子问题已返回原层</h3><p>深度边界只终止该分支。下列结果是模型判断或未解决记录，不是世界事实。</p>${(0, presentation_js_1.list)(d.subproblems).slice(-4).map((x) => `<details><summary>${(0, presentation_js_1.esc)((0, presentation_js_1.rec)(x.result).status === 'answered' ? '候选判断已返回' : '未解决，已返回')} · 深度 ${Number(x.depth ?? 0)} → ${Number(x.parentDepth ?? 0)}</summary><p>${(0, presentation_js_1.esc)((0, presentation_js_1.rec)(x.result).question ?? '')}</p><p>${(0, presentation_js_1.esc)((0, presentation_js_1.rec)(x.result).reason ?? '父层 G 使用该结果继续调整；不自动执行动作。')}</p>${rawButton('查看返回证据', x)}</details>`).join('')}</section>` : ''}<section class="surface"><h3>已提交的调整</h3>${changes.length ? changes.map((x, i) => `<details><summary>${i + 1} · 层级 ${Number(x.depth ?? 0)} · ${(0, presentation_js_1.esc)((0, presentation_js_1.rec)((0, presentation_js_1.rec)(x.patch).program).title ?? (0, presentation_js_1.rec)(x.patch).question ?? '调整')}</summary><p>只提交判断条件，世界动作仍须 S 选择。</p>${rawButton('前后上下文与选项', x)}</details>`).join('') : '<p>暂无已提交调整。生成提案不等于有效，根任务由实际交付与存活验收。</p>'}</section>`);
}
function renderConfig(s) {
    const c = s.config;
    html('config-content', `<div class="config-columns"><section class="surface"><h3>研究内容</h3>${factsGrid([['实验范围', c.kind === 'game' ? '完整任务' : '判断组合'], [c.kind === 'game' ? '地图' : '固定任务', (0, presentation_js_1.titleOf)(c)], ['根目标', (0, presentation_js_1.goalOf)(s)], ['控制器', c.kind === 'game' ? ({ adaptive: '自主 G/S · 参考解隔离', hierarchy: '旧父子技能 · 离线参考', program: '完整序列搜索', rules: '完整预置规则' }[c.controller]) : '固定任务 G/S'], ['判断组织', presentation_js_1.STRATEGIES[c.strategy]], ['经验使用', c.experience]])}</section><section class="surface"><h3>来源与资源</h3>${factsGrid([['配置的判断来源', c.backend], ['G 调整来源', c.kind === 'game' ? c.generator : '不适用'], ['实际请求记录', (0, presentation_js_1.actualSource)(s)], ['请求授权', c.allowLive ? '本局已明确授权' : '未授权真实模型'], ['请求 / 问题上限', `${c.maxRequests} / ${c.maxQuestions}`], ['整局截止', (0, presentation_js_1.duration)(c.deadlineMs)], ['顺序种子', c.orderSeed], ['合成延迟', `${c.delayMs} ms / 请求`]])}</section></div>${c.kind === 'game' ? '<p class="field-help">兼容配置中的 task 字段不改变主游戏目标；此处只显示实际生效的地图与根任务。</p>' : ''}
 <section class="surface lineage"><h3>运行身份与可复现性</h3>${factsGrid([['运行 ID', s.runId], ['控制者', `${s.owner.kind} · ${s.owner.id}`], ['创建于', s.createdAt], ['界面版本', '0.5.5'], ['运行时协议版本', s.version], ['资源初始可见', c.kind === 'judgment' ? (c.maskResources ? '需要读取' : '可见') : '主世界既定可见信息']])}<div class="evidence-actions">${rawButton('完整原始配置', c)}${rawButton('分支与经验来源', s.lineage)}${rawButton('受控干预脚本', c.interventions)}</div></section><p class="field-help">v0.5 自主路径不读取参考解；旧控制器仅作离线对照。判断重构不等于任务成功，实际世界结果独立验收。</p>`);
}
$('status-detail').onclick = () => setTab(state?.status === 'succeeded' ? 'decision' : 'diagnostics');
$('inspect-current').onclick = () => setTab('decision');
$('all-process').onclick = () => setTab('decision');
async function cmd(action, extras = {}) {
    if (!state || imported || replaying || pending || !connected)
        return;
    const id = state.runId, g = generation;
    pending = true;
    render();
    try {
        const result = await api(path(id) + '/commands', { commandId: uid(), expectedControlVersion: state.controlVersion, actor, action, ...extras });
        if (g !== generation || state?.runId !== id)
            return;
        if (!state || result.state.lastSeq >= state.lastSeq)
            state = result.state;
        render();
        if (result.checkpointId) {
            await refreshCheckpoints();
            $('checkpoint-list').value = result.checkpointId;
            checkpointSummary();
            toast('检查点已保存。');
        }
        void refreshRuns().catch(() => { });
        return result;
    }
    catch (error) {
        if (g === generation) {
            toast(String(error));
            try {
                const latest = await api(path(id));
                if (g === generation && (0, presentation_js_1.isView)(latest) && latest.lastSeq >= (state?.lastSeq ?? 0))
                    state = latest;
            }
            catch {
                setConnection(false, '服务连接不可用');
            }
        }
        return null;
    }
    finally {
        if (g === generation) {
            pending = false;
            render();
        }
    }
}
$('step').onclick = () => void cmd('step');
$('start').onclick = () => void cmd('start');
$('pause').onclick = () => void cmd('pause');
let confirmed;
function confirm(title, body, action) { text('confirm-title', title); text('confirm-body', body); confirmed = action; openDialog('confirm-dialog'); }
$('confirm-action').onclick = () => { closeDialog('confirm-dialog'); confirmed?.(); confirmed = undefined; };
$('takeover').onclick = () => confirm('接管并暂停这场实验？', '当前量子可能完成，之后由你控制。旧 Agent 的新写入会被拒绝；接管会记录到实验轨迹。', () => void cmd('takeover'));
$('cancel').onclick = () => { closeDialog('more-dialog'); confirm('取消本次实验？', '取消后不能继续本次运行。已执行的动作不会回滚，报告与原始证据仍可导出。', () => void cmd('cancel')); };
$('more-open').onclick = () => { render(); openDialog('more-dialog'); };
$('copy-id').onclick = async () => {
    if (!state)
        return;
    try {
        await navigator.clipboard.writeText(state.runId);
        toast('运行 ID 已复制。');
    }
    catch {
        text('evidence-title', '运行 ID');
        text('evidence-json', state.runId);
        openDialog('evidence-dialog');
    }
};
function errorIn(id, e) { text(id, e instanceof Error ? e.message : String(e)); hide(id, false); }
function beginCreate(c) {
    $('create-form').reset();
    hide('create-error', true);
    const base = (0, presentation_js_1.rec)(c ?? cap?.defaults);
    const kind = c?.kind ?? 'game';
    for (const radio of document.querySelectorAll('input[name="scope"]'))
        radio.checked = radio.value === kind;
    for (const [id, key] of [['scenario', 'scenario'], ['task', 'task'], ['strategy', 'strategy'], ['controller', 'controller'], ['backend', 'backend'], ['generator', 'generator'], ['experience', 'experience'], ['seed', 'orderSeed'], ['delay', 'delayMs'], ['requests', 'maxRequests'], ['deadline', 'deadlineMs'], ['max-questions', 'maxQuestions'], ['max-actions', 'maxActions'], ['max-steps', 'maxSteps'], ['max-search', 'maxSearchNodes'], ['jev-retries', 'jevMaxRetries'], ['jev-attempt-ms', 'jevAttemptTimeoutMs'], ['jev-backoff', 'jevRetryBaseMs'], ['jev-backoff-max', 'jevRetryMaxMs']]) {
        if (base[key] !== undefined)
            $(id).value = String(base[key]);
    }
    $('allow-live').checked = false;
    $('mask').checked = kind === 'judgment' && !!c?.maskResources;
    $('interventions').value = c?.interventions.length ? JSON.stringify(c.interventions, null, 2) : '';
    $('preset').value = c ? (c.backend === 'rule' && c.generator === 'local' ? 'offline' : c.backend === 'jev' && c.generator === 'local' ? 'jev' : c.backend === 'jev' && c.generator === 'llm' ? 'live' : 'custom') : 'offline';
    if (!c) {
        $('controller').value = 'adaptive';
        $('backend').value = 'rule';
        $('generator').value = 'local';
        $('strategy').value = 'direct';
    }
    $('max-g').value = String(c?.maxGCalls ?? 12);
    $('max-depth').value = String(c?.maxDepth ?? 2);
    $('max-revisions').value = String(c?.maxRevisions ?? 3);
    $('max-format-repairs').value = String(c?.maxFormatRepairs ?? 2);
    $('advanced-config').open = false;
    updateCreate(false);
    openDialog('create-dialog');
}
const scope = () => document.querySelector('input[name="scope"]:checked')?.value ?? 'game';
function updateCreate(fromPreset = false) {
    const game = scope() === 'game', preset = val('preset');
    if (fromPreset && preset !== 'custom') {
        $('backend').value = preset === 'offline' ? 'rule' : 'jev';
        $('generator').value = preset === 'live' && game ? 'llm' : 'local';
        $('controller').value = 'adaptive';
        $('allow-live').checked = false;
        if (preset !== 'offline' && Number(val('requests')) === 512)
            $('requests').value = '80';
    }
    $('deadline').max = game ? '3600000' : '120000';
    hide('game-fields', !game);
    hide('task-field', game);
    hide('controller-field', !game);
    hide('generator-field', !game);
    hide('mask-field', game);
    if (!game)
        $('generator').value = 'local';
    const reference = game && val('controller') !== 'adaptive';
    const localOption = $('backend').querySelector('option[value="rule"]');
    if (localOption)
        localOption.textContent = game && !reference ? '离线动作轮换夹具（非求解器）' : '程序化参考';
    if (reference) {
        $('backend').value = 'rule';
        $('generator').value = 'local';
        $('delay').value = '0';
    }
    $('backend').disabled = reference;
    $('generator').disabled = reference;
    const live = val('backend') !== 'rule' || (game && val('generator') === 'llm');
    hide('live-permission', !live);
    $('allow-live').required = live;
    if (val('backend') !== 'rule')
        $('delay').value = '0';
    $('delay').disabled = val('backend') !== 'rule' || reference;
    for (const id of ['backend', 'generator', 'preset']) {
        const select = $(id);
        for (const opt of select.options) {
            if (id === 'preset')
                opt.disabled = opt.value === 'jev' && !cap?.backends?.jev?.ready || opt.value === 'live' && (!game || !cap?.backends?.jev?.ready || !cap?.backends?.llm?.ready);
            else
                opt.disabled = opt.value !== 'rule' && opt.value !== 'local' && !cap?.backends?.[opt.value]?.ready;
        }
    }
    const ready = (!live) || ((val('backend') === 'rule' || cap?.backends?.[val('backend')]?.ready) && (val('generator') !== 'llm' || cap?.backends?.llm?.ready));
    $('create').disabled = !token || !ready;
    text('live-readiness', ready ? '使用服务端现有密钥。授权只适用于这一次新实验，不沿用原实验的支付许可。' : '所需模型尚未在服务端配置；请检查 .env，不能静默退回规则。');
    text('strategy-help', { direct: '一个整体选择问题。保留“不执行”，不强制从坏选项里选一个。', batch: '独立的适用性与优先级问题合并请求；合批不等于计算免费。', serial: '与合批使用相同问题，但逐题发出请求，可能增加等待与调用数。', dependent: '第二轮选择依赖第一轮实际返回的适用性判断。' }[val('strategy')]);
    text('create-summary', `${game ? '完整任务 · ' + (presentation_js_1.SCENARIOS[val('scenario')] ?? val('scenario')) : '判断组合 · ' + (presentation_js_1.TASKS[val('task')]?.title ?? val('task'))} / ${presentation_js_1.STRATEGIES[val('strategy')]} / ${live ? '真实模型配置' : game && val('controller') === 'adaptive' ? '离线机制夹具（非求解器）' : '程序化参考'}。创建后先保持就绪；原实验不会改变。`);
}
$('new-run').onclick = () => beginCreate();
$('config-copy').onclick = () => state && beginCreate(state.config);
$('clone-config').onclick = () => {
    closeDialog('more-dialog');
    if (state)
        beginCreate(state.config);
};
$('preset').onchange = () => updateCreate(true);
for (const el of document.querySelectorAll('input[name="scope"]'))
    el.onchange = () => updateCreate(true);
for (const id of ['controller', 'backend', 'generator', 'strategy', 'scenario', 'task', 'max-g', 'max-depth', 'max-revisions', 'max-format-repairs'])
    $(id).onchange = () => {
        if (['controller', 'backend', 'generator'].includes(id))
            $('preset').value = 'custom';
        updateCreate(false);
    };
$('create-form').addEventListener('invalid', e => { const el = e.target; el.closest('details')?.setAttribute('open', ''); }, true);
$('create-form').onsubmit = async (e) => {
    e.preventDefault();
    hide('create-error', true);
    try {
        const game = scope() === 'game';
        const interventions = val('interventions').trim() ? JSON.parse(val('interventions')) : [];
        if (!Array.isArray(interventions))
            throw Error('干预脚本必须是 JSON 数组。');
        const c = { kind: scope(), task: val('task'), scenario: val('scenario'), controller: val('controller'), strategy: val('strategy'), backend: val('backend'), generator: game ? val('generator') : 'local', experience: val('experience'), orderSeed: Number(val('seed')), delayMs: Number(val('delay')), maxRequests: Number(val('requests')), maxQuestions: Number(val('max-questions')), maxActions: Number(val('max-actions')), maxSteps: Number(val('max-steps')), maxSearchNodes: Number(val('max-search')), deadlineMs: Number(val('deadline')), maskResources: !game && checked('mask'), allowLive: checked('allow-live'), interventions };
        $('create').disabled = true;
        const created = await api('/api/lab/runs', { requestId: uid(), actor, config: { ...c, maxGCalls: Number(val('max-g')), maxDepth: Number(val('max-depth')), maxRevisions: Number(val('max-revisions')), maxFormatRepairs: Number(val('max-format-repairs')), jevMaxRetries: Number(val('jev-retries')), jevAttemptTimeoutMs: Number(val('jev-attempt-ms')), jevRetryBaseMs: Number(val('jev-backoff')), jevRetryMaxMs: Number(val('jev-backoff-max')) } });
        closeDialog('create-dialog');
        await openRun(created.runId);
        toast('实验已创建，尚未开始。');
    }
    catch (error) {
        errorIn('create-error', error);
    }
    finally {
        updateCreate(false);
    }
};
async function refreshCheckpoints() {
    if (!state || imported)
        return;
    const id = state.runId, data = await api(path(id) + '/checkpoints');
    if (state?.runId !== id || imported)
        return;
    checkpoints = (0, presentation_js_1.list)(data.checkpoints);
    html('checkpoint-list', checkpoints.map(c => `<option value="${(0, presentation_js_1.esc)(c.id)}">${(0, presentation_js_1.esc)(c.id === 'initial' ? '初始局面' : c.label + ' · 回合 ' + c.turn)}</option>`).join(''));
    checkpointSummary();
}
function checkpointSummary() { const cp = checkpoints.find(c => c.id === val('checkpoint-list')); text('checkpoint-summary', cp ? `${cp.id === 'initial' ? '初始快照' : cp.label} · 物理回合 ${cp.turn ?? '—'} · 世界版本 ${cp.worldRevision ?? '—'}。新实验重置控制器阶段与请求计数，不重置剩余物理世界预算。` : '读取检查点…'); }
$('checkpoint-list').onchange = checkpointSummary;
$('fork-open').onclick = async () => {
    if (!state)
        return;
    closeDialog('more-dialog');
    $('inherit').checked = false;
    $('fork-allow-live').checked = false;
    $('fork-strategy').value = state.config.strategy;
    $('fork-requests').value = String(state.config.maxRequests);
    hide('fork-live', state.config.backend === 'rule' && state.config.generator === 'local');
    hide('fork-error', true);
    try {
        await refreshCheckpoints();
        openDialog('fork-dialog');
    }
    catch (error) {
        toast(String(error));
    }
};
$('checkpoint').onclick = () => void cmd('checkpoint', { label: `网页检查点 · ${state?.decisionSteps ?? 0}` });
$('fork').onclick = async () => {
    if (!state || imported || replaying || pending)
        return;
    hide('fork-error', true);
    const c = state.config, live = c.backend !== 'rule' || c.generator === 'llm';
    if (live && !checked('fork-allow-live')) {
        errorIn('fork-error', '请为新分支重新授权真实请求，原授权不会自动继承。');
        return;
    }
    try {
        $('fork').disabled = true;
        const r = await api(path() + '/forks', { requestId: uid(), actor, checkpointId: val('checkpoint-list'), memory: checked('inherit') ? 'inherit' : 'none', config: { strategy: val('fork-strategy'), ...(live ? { allowLive: true, maxRequests: Number(val('fork-requests')) } : {}) } });
        closeDialog('fork-dialog');
        await openRun(r.runId);
        toast('已创建新分支；原实验未改变。');
    }
    catch (error) {
        errorIn('fork-error', error);
    }
    finally {
        render();
    }
};
$('intervene-open').onclick = () => { closeDialog('more-dialog'); hide('edit-error', true); openDialog('intervene-dialog'); render(); };
$('edit-when').onchange = () => { hide('after-field', val('edit-when') !== 'scheduled'); text('edit', val('edit-when') === 'scheduled' ? '登记未来干预' : '记录并应用'); render(); };
$('edit').onclick = async () => {
    if (!state)
        return;
    const x = Number(val('point-x')), y = Number(val('point-y'));
    if (!Number.isInteger(x) || x < 0 || x > 16 || !Number.isInteger(y) || y < 0 || y > 10) {
        errorIn('edit-error', '坐标必须在 X 0–16、Y 0–10 范围内。');
        return;
    }
    const scheduled = val('edit-when') === 'scheduled';
    const extras = { tool: val('tool'), point: { x, y }, ...(scheduled ? { afterAction: Number(val('after-action')) } : { expectedWorldRevision: state.worldRevision }) };
    const r = await cmd(scheduled ? 'schedule' : 'intervene', extras);
    if (r) {
        closeDialog('intervene-dialog');
        toast('操作已记录，请以事件中的实际结果为准。');
    }
};
function loadReplay(data) {
    const r = (0, presentation_js_1.rec)(data);
    if (r.schema !== 'gs/lab-export/v1' || !(0, presentation_js_1.isView)(r.state) || !Array.isArray(r.events))
        throw Error('请选择完整的 gs/lab-export/v1 报告。');
    frames = (0, presentation_js_1.replayStates)(r);
    if (!frames.length)
        throw Error('报告中没有可回放的完整状态；不能把终局指标套用到初始世界。');
    report = r;
    replaying = true;
    frameIndex = 0;
    decisionIndex = -1;
    $('replay-slider').max = String(frames.length - 1);
    $('replay-slider').value = '0';
    hide('replay-bar', false);
    setTab('overview', false);
    render();
}
$('replay').onclick = async () => {
    try {
        if (replaying) {
            $('replay-slider').focus();
            return;
        }
        const data = imported ? report : await api(path() + '/export');
        loadReplay(data);
    }
    catch (error) {
        toast(String(error));
    }
};
function moveReplay(i) { frameIndex = Math.max(0, Math.min(frames.length - 1, i)); $('replay-slider').value = String(frameIndex); decisionIndex = -1; render(); }
$('replay-slider').oninput = () => moveReplay(Number(val('replay-slider')));
$('replay-prev').onclick = () => moveReplay(frameIndex - 1);
$('replay-next').onclick = () => moveReplay(frameIndex + 1);
$('live').onclick = () => {
    if (imported)
        return;
    replaying = false;
    decisionIndex = -1;
    hide('replay-bar', true);
    render();
};
function download(data, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
$('export').onclick = async () => {
    try {
        download(imported ? report : await api(path() + '/export'), `${state?.runId ?? 'experiment'}.json`);
        closeDialog('more-dialog');
    }
    catch (error) {
        toast(String(error));
    }
};
$('import-open').onclick = () => $('import').click();
$('import').onchange = async () => {
    try {
        const file = $('import').files?.[0];
        if (!file)
            return;
        if (file.size > 64 * 1024 * 1024)
            throw Error('报告超过 64 MiB，请先缩小报告。');
        const data = JSON.parse(await file.text());
        if (data.schema !== 'gs/lab-export/v1' || !(0, presentation_js_1.isView)(data.state) || !Array.isArray(data.events) || data.events.length > 40000)
            throw Error('报告结构不兼容或事件数量过大，未加载。');
        const valid = data.events.every((e) => Number.isSafeInteger(e.seq) && e.runId === data.state.runId && typeof e.type === 'string');
        if (!valid)
            throw Error('报告事件身份或序号无效。');
        const safeFrames = (0, presentation_js_1.replayStates)(data);
        if (!safeFrames.length)
            throw Error('报告没有完整状态快照。');
        generation++;
        streamAbort?.abort();
        imported = true;
        listing = false;
        state = structuredClone(data.state);
        state.readOnly = true;
        events = data.events;
        cursor = state.lastSeq;
        hide('list-page', true);
        hide('run-page', false);
        loadReplay(data);
        history.pushState(null, '', '/lab#archive');
        setConnection(false, '离线报告 · 只读');
    }
    catch (error) {
        toast(String(error));
    }
    finally {
        $('import').value = '';
    }
};
for (const id of ['help-open', 'cli-help', 'limits-open'])
    $(id).onclick = () => openDialog('help-dialog');
window.addEventListener('popstate', () => {
    const query = new URL(location.href).searchParams, run = query.get('run');
    if (run) {
        void openRun(run, false).then(() => setTab(query.get('tab') ?? 'overview', false)).catch(e => toast(String(e)));
    }
    else
        showList(false);
});
Object.defineProperty(window, 'gsLabViewer', { value: { snapshot: () => structuredClone(state), cursor: () => cursor, readOnlyReplay: () => replaying, displayedSnapshot: () => structuredClone(current()), view: () => ({ tab, listing, imported, replaying, connected, frameIndex }), generation: () => generationPanel.snapshot() }, writable: false });
async function boot() {
    try {
        const r = await fetch('/api/status'), b = await r.json();
        token = b.token;
        if (typeof token !== 'string')
            throw Error('服务没有返回本地访问令牌');
        cap = await api('/api/lab/capabilities');
        setConnection(true, '本地服务已连接');
        await refreshRuns();
        const query = new URL(location.href).searchParams, run = query.get('run');
        if (run) {
            await openRun(run, false);
            setTab(query.get('tab') ?? 'overview', false);
        }
        setInterval(() => void refreshRuns().catch(() => {
            if (listing)
                setConnection(false, '未连接本地服务');
        }), 5000);
    }
    catch (error) {
        setConnection(false, '未连接本地服务');
        html('run-list', '<div class="empty-state"><span class="empty-symbol">◎</span><h2>连接你的实验服务</h2><p>请在完整项目中运行 npm start，再打开 http://127.0.0.1:4173/lab。<br>你也可以导入已导出的报告，只读查看完整过程。</p></div>');
        $('new-run').disabled = true;
        toast(String(error));
    }
}
setInterval(() => {
    if (!listing)
        paintGeneration();
}, 500);
void boot();

}},
"src/lab/generation-panel.js":{deps:{"./generation.js":"src/lab/generation.js"},factory:function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerationPanel = exports.generationDialog = exports.generationCard = void 0;
const generation_js_1 = require("./generation.js");
exports.generationCard = `<section id="generation-card" class="generation-card hidden" aria-label="G 的可见输出">
 <div class="generation-heading"><span class="generation-mark">G</span><div><h3>生成过程</h3><p id="generation-meta"></p></div><span id="generation-live" class="stream-indicator">●</span><button id="generation-expand" class="text-button" aria-haspopup="dialog">展开 ↗</button></div>
 <p id="generation-status" class="generation-status" role="status"></p>
 <div class="generation-switch" role="tablist" aria-label="输出类型"><button id="generation-reasoning-tab" role="tab" aria-selected="true" aria-controls="generation-preview" tabindex="0">推理</button><button id="generation-content-tab" role="tab" aria-selected="false" aria-controls="generation-preview" tabindex="-1">内容</button><span id="generation-count"></span></div>
 <pre id="generation-preview" class="stream-text compact" tabindex="0" role="tabpanel" aria-label="当前通道的可见输出"></pre>
 <div class="generation-foot"><small id="generation-mode"></small><button id="generation-follow" class="text-button">跟随最新 ↓</button></div>
 <p class="generation-disclaimer">仅显示接口实际返回的文本。流式草稿未生效，完整提案仍需校验与 S 选择。</p>
</section>`;
exports.generationDialog = `<dialog id="generation-dialog" class="generation-dialog" aria-labelledby="generation-title">
 <div class="dialog-head"><div><p class="overline">G / 生成输出 · 只读</p><h2 id="generation-title">查看生成过程</h2></div><button class="icon-button" data-close="generation-dialog" aria-label="关闭生成过程">×</button></div>
 <div class="dialog-body"><label for="generation-select">本场实验的 G 调用</label><select id="generation-select"></select>
 <div class="stream-detail-meta"><span id="generation-detail-status" role="status"></span><span id="generation-detail-metrics"></span></div>
 <p id="generation-detail-source" class="field-help"></p>
 <div class="stream-columns"><section><h3>推理 <span>服务商显式返回</span></h3><pre id="generation-reasoning" class="stream-text" tabindex="0" aria-label="服务商返回的推理"></pre></section><section><h3>内容 <span>生成的提案文本</span></h3><pre id="generation-content" class="stream-text" tabindex="0" aria-label="生成的内容"></pre></section></div>
 <p id="generation-detail-error" class="callout warning hidden"></p>
 <p class="field-help">文本不是已验证事实，也不是已执行动作。未公开的内部推理无法展示。失败或中断后保留已收到的片段，但不执行半成品。</p></div>
 <div class="dialog-footer"><span id="generation-reading-state">只读观察不会重试或产生模型调用。</span><button id="generation-detail-follow" class="quiet">跟随最新 ↓</button><button id="generation-copy" class="quiet">复制可见文本</button><button class="primary" data-close="generation-dialog">关闭</button></div>
</dialog>`;
const $ = (id) => document.getElementById(id);
const set = (id, v) => {
    const e = $(id), s = String(v ?? '');
    if (e.textContent !== s)
        e.textContent = s;
};
const show = (id, yes) => $(id).classList.toggle('hidden', !yes);
const modeLabel = (r) => r.mode === 'sse' ? '真实增量传输' : r.mode === 'buffered' ? '整包返回 · 非流式' : r.mode === 'local' ? '本地生成 · 非模型' : r.mode === 'requested-sse' ? '已请求流式响应' : '等待生成器响应';
const empty = (r, channel) => r.mode === 'local' ? '本地夹具没有模型推理或流式文本。' : channel === 'reasoning' ? (0, generation_js_1.generationActive)(r) ? '尚未收到可见推理；仅在接口公开返回时显示。' : '本次接口未返回可见推理，不补写。' : (0, generation_js_1.generationActive)(r) ? '等待内容输出；生成期间不会执行草稿。' : '没有收到内容输出。';
class GenerationPanel {
    open;
    toast;
    records = [];
    run = '';
    selected = null;
    latest = '';
    channel = 'reasoning';
    explicitChannel = false;
    reading = false;
    replay = false;
    connected = true;
    cacheKey = '';
    constructor(open, toast) {
        this.open = open;
        this.toast = toast;
        $('generation-expand').onclick = () => { this.selected = null; this.detail(); this.open(); };
        $('generation-history-open').onclick = () => { this.selected = null; this.detail(); this.open(); };
        $('generation-select').onchange = () => { this.selected = $('generation-select').value; this.resetScroll(); this.detail(); };
        for (const c of ['reasoning', 'content']) {
            const b = $('generation-' + c + '-tab');
            b.onclick = () => { this.channel = c; this.explicitChannel = true; this.resetScroll('generation-preview'); this.compact(); };
            b.onkeydown = e => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const other = c === 'content' ? 'reasoning' : 'content';
                    $('generation-' + other + '-tab').click();
                    $('generation-' + other + '-tab').focus();
                }
            };
        }
        for (const event of ['wheel', 'touchmove'])
            $('generation-preview').addEventListener(event, () => { this.explicitChannel = true; }, { passive: true });
        $('generation-follow').onclick = () => this.resetScroll('generation-preview');
        $('generation-detail-follow').onclick = () => { this.selected = null; this.resetScroll(); this.detail(); };
        $('generation-copy').onclick = async () => {
            const r = this.chosen();
            if (!r)
                return;
            const t = `${r.source} / ${r.model}\n${generation_js_1.GENERATION_STATUS[r.status]}\n\n[推理：接口返回]\n${r.reasoning || empty(r, 'reasoning')}\n\n[内容：未代表执行]\n${r.content}`;
            try {
                await navigator.clipboard.writeText(t);
                this.toast('已复制当前可见文本。');
            }
            catch {
                this.toast('浏览器未允许剪贴板，请在文本区域选择复制。');
            }
        };
    }
    resetScroll(id) {
        for (const key of id ? [id] : ['generation-preview', 'generation-reasoning', 'generation-content']) {
            const e = $(key);
            e.scrollTop = e.scrollHeight;
        }
        this.reading = false;
    }
    paintText(id, value) {
        const e = $(id);
        if (e.textContent === value)
            return;
        const follow = e.scrollHeight - e.scrollTop - e.clientHeight < 32;
        const pos = e.scrollTop;
        e.textContent = value;
        if (follow)
            e.scrollTop = e.scrollHeight;
        else {
            e.scrollTop = pos;
            this.reading = true;
        }
    }
    update(runId, events, through, { replay, connected }) {
        if (this.run !== runId) {
            this.run = runId;
            this.selected = null;
            this.latest = '';
            this.explicitChannel = false;
            this.channel = 'reasoning';
            this.cacheKey = '';
            this.records = [];
            this.resetScroll();
        }
        this.replay = replay;
        this.connected = connected;
        const key = `${runId}:${through}:${events.length}`;
        if (key !== this.cacheKey) {
            this.records = (0, generation_js_1.generationHistory)(events, through);
            this.cacheKey = key;
        }
        this.compact();
        show('generation-history-open', this.records.length > 0);
        set('generation-history-note', this.records.length ? `${this.records.length} 次 G 调用，按当前查看时刻截取；不会请求重算。` : '尚无流式记录。旧报告不补造生成过程。');
        if ($('generation-dialog').open)
            this.detail();
    }
    compact() {
        const r = this.records.at(-1);
        show('generation-card', !!r);
        if (!r)
            return;
        if (r.id !== this.latest) {
            this.latest = r.id;
            this.channel = r.reasoning ? 'reasoning' : 'content';
            this.explicitChannel = false;
            this.resetScroll('generation-preview');
        }
        if (!this.explicitChannel)
            this.channel = r.content ? 'content' : 'reasoning';
        const active = (0, generation_js_1.generationActive)(r);
        const status = this.replay ? '历史快照 · ' + generation_js_1.GENERATION_STATUS[r.status] : !this.connected && active ? '连接中断 · 显示最后收到的片段' : generation_js_1.GENERATION_STATUS[r.status];
        set('generation-meta', `第 ${r.requestIndex} 个请求 · ${(0, generation_js_1.generationPurpose)(r)} · 层 ${r.depth}`);
        set('generation-status', status);
        $('generation-live').classList.toggle('working', active && !this.replay && this.connected);
        set('generation-live', active && !this.replay ? '●' : ['failed', 'aborted', 'invalid'].includes(r.status) ? '!' : '✓');
        for (const c of ['reasoning', 'content']) {
            const e = $('generation-' + c + '-tab');
            e.setAttribute('aria-selected', String(this.channel === c));
            e.tabIndex = this.channel === c ? 0 : -1;
        }
        const text = r[this.channel];
        this.paintText('generation-preview', text || empty(r, this.channel));
        set('generation-count', `${Array.from(text).length.toLocaleString()} 字符`);
        const elapsed = Math.max(0, ((active && !this.replay && this.connected ? Date.now() : Date.parse(r.updatedAt)) - Date.parse(r.startedAt)) / 1000);
        set('generation-mode', `${modeLabel(r)} · ${elapsed.toFixed(1)} 秒${r.source.includes('mock') || r.source.includes('synthetic') ? ' · 测试替身' : ''}`);
        $('generation-card').dataset.streamId = r.id;
        $('generation-card').dataset.status = r.status;
    }
    chosen() { return this.records.find(r => r.id === this.selected) ?? this.records.at(-1); }
    detail() {
        const r = this.chosen();
        const select = $('generation-select');
        const signature = this.records.map(x => `${x.id}:${x.status}`).join('|');
        if (select.dataset.signature !== signature) {
            select.replaceChildren(...this.records.map(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = `请求 ${x.requestIndex} · ${(0, generation_js_1.generationPurpose)(x)} · 层 ${x.depth} · ${generation_js_1.GENERATION_STATUS[x.status]}`; return o; }));
            select.dataset.signature = signature;
        }
        if (!r) {
            select.replaceChildren();
            set('generation-detail-status', '当前时刻尚无 G 输出');
            set('generation-detail-source', '回放不会展示未来的生成内容。');
            set('generation-detail-metrics', '');
            this.paintText('generation-reasoning', '暂无记录');
            this.paintText('generation-content', '暂无记录');
            show('generation-detail-error', false);
            return;
        }
        select.value = r.id;
        set('generation-detail-status', `${this.replay ? '历史 · ' : ''}${generation_js_1.GENERATION_STATUS[r.status]}`);
        const end = Date.parse(r.updatedAt) - Date.parse(r.startedAt), u = r.usage;
        set('generation-detail-metrics', `记录跨度 ${(Math.max(0, end) / 1000).toFixed(1)} 秒 · 首段文本 ${r.firstTextMs === null ? '未记录' : Math.round(r.firstTextMs) + ' ms'}${u?.inputTokens !== undefined ? ` · token ${u.inputTokens} / ${u.outputTokens}` : ''}`);
        set('generation-detail-source', `${r.source}${r.model ? ' / ' + r.model : ''} · ${modeLabel(r)} · 世界 v${r.revision} · 触发：${r.cause || '未记录'}`);
        this.paintText('generation-reasoning', r.reasoning || empty(r, 'reasoning'));
        this.paintText('generation-content', r.content || empty(r, 'content'));
        show('generation-detail-error', !!r.reason);
        set('generation-detail-error', r.reason);
        set('generation-reading-state', this.reading ? '已保留阅读位置；点击「跟随最新」恢复自动滚动。' : '只读观察；生成完成不代表提案已选中或实际成功。');
    }
    snapshot() { return structuredClone(this.records); }
}
exports.GenerationPanel = GenerationPanel;

}},
"src/lab/generation.js":{deps:{},factory:function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generationActive = exports.generationPurpose = exports.GENERATION_STATUS = void 0;
exports.generationHistory = generationHistory;
const obj = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
exports.GENERATION_STATUS = { queued: '等待调用 G', connecting: '连接生成器', receiving: '接收生成内容', validating: '检查提案结构', complete: '生成完成 · 待装载与执行验证', invalid: '提案结构未通过', failed: '生成请求失败', aborted: '生成已中断', unavailable: '本地生成器 · 无模型文本' };
const generationPurpose = (r) => r.purpose === 'output-repair' || r.cause === 'output_format_invalid' ? '格式纠错' : r.purpose === 'initialization' || r.cause === 'initial_environment_review' ? '开局环境研判' : r.purpose === 'subproblem' ? '子问题研判' : '策略生成';
exports.generationPurpose = generationPurpose;
const generationActive = (r) => ['queued', 'connecting', 'receiving', 'validating'].includes(r.status);
exports.generationActive = generationActive;
/** Uses the event prefix only: replay cannot see text produced after its selected state. */
function generationHistory(events, through = Infinity) {
    const records = new Map(), seen = new Set();
    for (const event of events) {
        if (event.seq > through || seen.has(event.seq))
            continue;
        seen.add(event.seq);
        const outer = obj(event.data), e = event.type === 'engine' ? obj(outer.event) : { type: event.type, data: event.data };
        if (e.type !== 'g_stream')
            continue;
        const d = obj(e.data);
        if (typeof d.streamId !== 'string')
            continue;
        let r = records.get(d.streamId);
        if (!r) {
            r = { id: d.streamId, requestIndex: Number(d.requestIndex) || 0, depth: Number(d.depth) || 0, source: String(d.source ?? 'unknown'), ...(typeof d.purpose === 'string' ? { purpose: d.purpose } : {}), frameKind: String(d.frameKind ?? 'action'), cause: String(d.cause ?? ''), revision: String(d.revision ?? ''), status: 'queued', mode: 'unknown', model: '', reason: null, startedAt: event.at, updatedAt: event.at, firstTextMs: null, usage: null, reasoning: '', content: '', lastSeq: event.seq, partial: true };
            records.set(r.id, r);
        }
        r.updatedAt = event.at;
        r.lastSeq = event.seq;
        if (d.kind === 'delta' && (d.channel === 'reasoning' || d.channel === 'content') && typeof d.text === 'string') {
            const key = d.channel, max = key === 'reasoning' ? 120000 : 60000;
            r[key] = (r[key] + d.text).slice(0, max);
        }
        if (d.kind === 'status') {
            if (typeof d.status === 'string' && Object.hasOwn(exports.GENERATION_STATUS, d.status))
                r.status = d.status;
            if (typeof d.mode === 'string')
                r.mode = d.mode;
            if (typeof d.model === 'string')
                r.model = d.model;
            if (typeof d.reason === 'string')
                r.reason = d.reason;
            if (d.firstTextMs === null || typeof d.firstTextMs === 'number')
                r.firstTextMs = d.firstTextMs;
            if (d.usage !== undefined)
                r.usage = d.usage;
            r.partial = r.status !== 'complete';
        }
    }
    return [...records.values()];
}

}},
"src/ui/renderer.js":{deps:{"../game/world.js":"src/game/world.js"},factory:function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRenderer = void 0;
const world_js_1 = require("../game/world.js");
const W = 866, H = 578, T = 46, OX = (W - 17 * T) / 2, OY = (H - 11 * T) / 2;
const point = (p) => ({ x: OX + (p.x + .5) * T, y: OY + (p.y + .5) * T });
const rnd = (i) => { const s = Math.sin(i * 127.1 + 31.7) * 43758.5453; return s - Math.floor(s); };
class WorldRenderer {
    canvas;
    ctx;
    state;
    frame = 0;
    raf = 0;
    disposed = false;
    px = 0;
    py = 0;
    gx = 0;
    gy = 0;
    hover = null;
    tool = 'inspect';
    route = [];
    showPath = true;
    showDanger = true;
    observer;
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    constructor(canvas, onClick) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('浏览器不支持 Canvas 2D');
        this.ctx = ctx;
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(canvas);
        const coord = (e) => {
            const r = canvas.getBoundingClientRect();
            const scale = Math.min(r.width / W, r.height / H);
            return { x: Math.floor(((e.clientX - r.left - (r.width - W * scale) / 2) / scale - OX) / T), y: Math.floor(((e.clientY - r.top - (r.height - H * scale) / 2) / scale - OY) / T) };
        };
        canvas.addEventListener('pointermove', e => { const p = coord(e); this.hover = p.x >= 0 && p.y >= 0 && p.x < 17 && p.y < 11 ? p : null; });
        canvas.addEventListener('pointerleave', () => this.hover = null);
        canvas.addEventListener('pointerdown', e => {
            if (e.button !== 0)
                return;
            const p = coord(e);
            if (p.x >= 0 && p.y >= 0 && p.x < 17 && p.y < 11)
                onClick?.(p);
        });
        this.resize();
        this.loop();
    }
    setState(s, instant = false) {
        if (!this.state || instant) {
            this.px = s.player.x;
            this.py = s.player.y;
            this.gx = s.guards[0]?.x ?? 13;
            this.gy = s.guards[0]?.y ?? 4;
        }
        this.state = s;
    }
    setTool(t) { this.tool = t; this.canvas.style.cursor = t === 'inspect' ? 'default' : 'crosshair'; }
    setOverlay(route, danger) { this.showPath = route; this.showDanger = danger; }
    setCandidate(c) {
        const s = this.state;
        if (!s || !c) {
            this.route = [];
            return;
        }
        const a = c.action;
        if (a.kind !== 'move') {
            this.route = [];
            return;
        }
        const target = a.objective === 'home' ? s.home : a.objective === 'berry' ? s.berries.find(b => b.id === a.targetId) : a.objective === 'lure' ? (0, world_js_1.lureSite)(s)?.stand : null;
        this.route = target ? ((0, world_js_1.path)(s, s.player, target) ?? []) : [{ x: a.x, y: a.y }];
    }
    dispose() { this.disposed = true; cancelAnimationFrame(this.raf); this.observer.disconnect(); }
    resize() { const r = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2); this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr)); }
    rr(x, y, w, h, r, fill, stroke) {
        const c = this.ctx;
        c.beginPath();
        c.roundRect(x, y, w, h, r);
        c.fillStyle = fill;
        c.fill();
        if (stroke) {
            c.strokeStyle = stroke;
            c.lineWidth = 1;
            c.stroke();
        }
    }
    ellipse(x, y, rx, ry, fill) { const c = this.ctx; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
    text(t, x, y, size = 11, color = '#697760', weight = 500) { const c = this.ctx; c.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`; c.fillStyle = color; c.textAlign = 'center'; c.fillText(t, x, y); }
    loop = () => {
        if (this.disposed)
            return;
        this.frame++;
        this.draw();
        this.raf = requestAnimationFrame(this.loop);
    };
    draw() {
        const c = this.ctx, s = this.state;
        if (!s)
            return;
        const dw = this.canvas.width, dh = this.canvas.height, scale = Math.min(dw / W, dh / H);
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, dw, dh);
        c.translate((dw - W * scale) / 2, (dh - H * scale) / 2);
        c.scale(scale, scale);
        this.rr(0, 0, W, H, 0, '#f0f2e8');
        // A soft, handmade island rim; all decoration is deterministic and dependency-free.
        this.rr(OX - 10, OY - 9, 17 * T + 20, 11 * T + 22, 23, '#d5dcc2');
        this.rr(OX - 10, OY - 14, 17 * T + 20, 11 * T + 23, 23, '#e0e9cb');
        c.save();
        c.beginPath();
        c.roundRect(OX - 5, OY - 9, 17 * T + 10, 11 * T + 14, 19);
        c.clip();
        for (let y = 0; y < s.height; y++)
            for (let x = 0; x < s.width; x++) {
                const p = { x, y }, tile = s.terrain[y * s.width + x];
                const xx = OX + x * T, yy = OY + y * T;
                const value = rnd(y * 17 + x);
                this.rr(xx + .5, yy + .5, T - 1, T - 1, 5, value > .7 ? '#e1eaca' : value > .35 ? '#e5edd4' : '#e8efd9');
                if (tile === 'water') {
                    this.rr(xx - 1, yy - 1, T + 2, T + 2, 13, '#c0d9c4');
                    this.rr(xx + 2, yy + 2, T - 4, T - 4, 11, '#a9d2c8');
                    c.strokeStyle = '#d3e8da';
                    c.lineWidth = 1.6;
                    const drift = this.reduced ? 0 : Math.sin(this.frame * .022 + x) * 2;
                    for (let k = 0; k < 2; k++) {
                        c.beginPath();
                        c.moveTo(xx + 12 + drift, yy + 16 + k * 12);
                        c.quadraticCurveTo(xx + 21 + drift, yy + 18 + k * 12, xx + 29 + drift, yy + 16 + k * 12);
                        c.stroke();
                    }
                }
                else if (tile === 'grass' && value > .25) {
                    const tx = xx + 9 + value * 26, ty = yy + 13 + rnd(x * 113 + y) * 23;
                    c.strokeStyle = value > .8 ? '#a7bb8c' : '#c3d3a8';
                    c.lineWidth = 1.2;
                    c.beginPath();
                    c.moveTo(tx, ty);
                    c.lineTo(tx - 2, ty - 4);
                    c.moveTo(tx + 2, ty);
                    c.lineTo(tx + 3, ty - 5);
                    c.stroke();
                    if (value > .94) {
                        this.ellipse(tx + 10, ty - 9, 2, 2, '#f8efd0');
                        this.ellipse(tx + 13, ty - 8, 2, 2, '#faf7e8');
                    }
                }
                if (this.showDanger && (0, world_js_1.dangerous)(s, p) && tile === 'grass')
                    this.rr(xx + 2, yy + 2, T - 4, T - 4, 6, 'rgba(195,129,105,.13)');
            }
        // Trace only the current bound action's planned route, not a fabricated model thought.
        if (this.showPath && this.route.length) {
            c.strokeStyle = '#809b6b';
            c.lineWidth = 2.2;
            c.setLineDash([3, 7]);
            c.lineCap = 'round';
            c.beginPath();
            const p0 = point(s.player);
            c.moveTo(p0.x, p0.y);
            for (const p of this.route) {
                const q = point(p);
                c.lineTo(q.x, q.y);
            }
            c.stroke();
            c.setLineDash([]);
            const end = point(this.route[this.route.length - 1]);
            c.strokeStyle = '#688b57';
            c.lineWidth = 1.5;
            c.beginPath();
            c.arc(end.x, end.y, 15, 0, Math.PI * 2);
            c.stroke();
        }
        c.restore();
        this.text('松  林  小  径', OX + 165, OY + 25, 11, '#8b9b76');
        this.text('守 卫 果 园', point({ x: 13, y: 1 }).x, point({ x: 13, y: 1 }).y + 4, 10, '#a0846b');
        // World props sorted by depth.
        for (let y = 0; y < s.height; y++)
            for (let x = 0; x < s.width; x++) {
                const p = point({ x, y });
                if (s.terrain[y * s.width + x] === 'rock')
                    this.rock(p.x, p.y, x + y);
            }
        for (const w of s.walls) {
            const p = point(w);
            this.wall(p.x, p.y);
        }
        const h = point(s.home);
        this.home(h.x, h.y);
        for (const b of s.berries) {
            const p = point(b);
            this.berry(p.x, p.y);
        }
        for (const l of s.lures) {
            const p = point(l);
            const r = 17 + (this.reduced ? 0 : Math.sin(this.frame * .05) * 3);
            c.strokeStyle = 'rgba(192,122,69,.36)';
            c.lineWidth = 1.2;
            c.setLineDash([2, 4]);
            c.beginPath();
            c.arc(p.x, p.y, r, 0, Math.PI * 2);
            c.stroke();
            c.setLineDash([]);
            this.berry(p.x, p.y, true);
        }
        const g = s.guards[0];
        if (g) {
            this.gx += (g.x - this.gx) * (this.reduced ? 1 : .18);
            this.gy += (g.y - this.gy) * (this.reduced ? 1 : .18);
            const gp = point({ x: this.gx, y: this.gy });
            this.guard(gp.x, gp.y, g.eating > 0);
        }
        this.px += (s.player.x - this.px) * (this.reduced ? 1 : .19);
        this.py += (s.player.y - this.py) * (this.reduced ? 1 : .19);
        const player = point({ x: this.px, y: this.py });
        this.tuanzi(player.x, player.y, s.energy, s.bag);
        if (this.hover && this.tool !== 'inspect') {
            const p = this.hover;
            const xx = OX + p.x * T, yy = OY + p.y * T;
            this.rr(xx + 1, yy + 1, T - 2, T - 2, 7, 'rgba(255,255,255,.32)', '#4d7457');
            this.text({ berry: '＋', wall: '▦', guard: '◇', erase: '×' }[this.tool], xx + T / 2, yy + T / 2 + 6, 22, '#496849', 600);
        }
        // Fixed coordinate ticks make interventions easy to reproduce.
        for (let x = 0; x < 17; x++)
            this.text(String(x), OX + (x + .5) * T, OY + 11 * T + 22, 9, '#9ca78e');
        for (let y = 0; y < 11; y++)
            this.text(String(y), OX - 20, OY + (y + .5) * T + 3, 9, '#9ca78e');
    }
    berry(x, y, lure = false) {
        const c = this.ctx;
        this.ellipse(x, y + 9, lure ? 11 : 16, 5, 'rgba(78,107,58,.13)');
        if (!lure) {
            this.ellipse(x - 7, y + 1, 9, 9, '#96b075');
            this.ellipse(x + 5, y - 2, 11, 10, '#789959');
            this.ellipse(x + 1, y + 5, 12, 7, '#8ca667');
        }
        const b = lure ? [[0, 1]] : [[-6, -2], [4, -5], [7, 4], [-3, 6]];
        for (const [dx, dy] of b) {
            this.ellipse(x + dx, y + dy, 4.8, 5.2, '#cc6470');
            this.ellipse(x + dx - 1.2, y + dy - 1.5, 1.2, 1.3, '#f4b7b5');
        }
        c.strokeStyle = '#638050';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x, y - 4);
        c.quadraticCurveTo(x + 1, y - 9, x + 5, y - 11);
        c.stroke();
    }
    rock(x, y, seed) {
        const c = this.ctx;
        this.ellipse(x, y + 12, 19, 6, 'rgba(105,120,90,.15)');
        c.beginPath();
        c.moveTo(x - 18, y + 6);
        c.lineTo(x - 13, y - 9);
        c.lineTo(x + 2, y - 15);
        c.lineTo(x + 15, y - 7);
        c.lineTo(x + 19, y + 8);
        c.lineTo(x + 6, y + 12);
        c.lineTo(x - 12, y + 11);
        c.closePath();
        c.fillStyle = '#a6b4a0';
        c.fill();
        c.beginPath();
        c.moveTo(x - 13, y - 9);
        c.lineTo(x + 2, y - 15);
        c.lineTo(x + 5, y - 1);
        c.lineTo(x - 4, y + 7);
        c.lineTo(x - 18, y + 6);
        c.closePath();
        c.fillStyle = '#c2cdb7';
        c.fill();
        if (seed % 2 === 0) {
            this.ellipse(x + 11, y + 6, 7, 3, '#8eaa70');
            this.ellipse(x + 6, y + 9, 6, 3, '#97b578');
        }
    }
    wall(x, y) {
        this.ellipse(x, y + 13, 21, 5, 'rgba(117,106,83,.16)');
        this.rr(x - 20, y - 11, 40, 23, 5, '#ab9277');
        this.rr(x - 20, y - 15, 40, 22, 5, '#d0b695', '#bea78b');
        const c = this.ctx;
        c.strokeStyle = '#b59b7d';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x - 19, y - 4);
        c.lineTo(x + 19, y - 4);
        c.moveTo(x - 3, y - 15);
        c.lineTo(x - 3, y - 4);
        c.moveTo(x + 8, y - 4);
        c.lineTo(x + 8, y + 6);
        c.stroke();
    }
    home(x, y) {
        const c = this.ctx;
        this.ellipse(x, y + 18, 29, 8, 'rgba(104,103,72,.13)');
        this.rr(x - 23, y - 9, 46, 31, 5, '#f1ddb5', '#cbb791');
        c.beginPath();
        c.moveTo(x - 29, y - 8);
        c.lineTo(x, y - 34);
        c.lineTo(x + 29, y - 8);
        c.lineTo(x + 24, y - 4);
        c.lineTo(x, y - 24);
        c.lineTo(x - 24, y - 4);
        c.closePath();
        c.fillStyle = '#bd7156';
        c.fill();
        this.rr(x - 7, y + 2, 14, 21, 7, '#967858');
        this.rr(x + 12, y - 1, 7, 9, 2, '#edecce', '#c6b693');
        this.rr(x - 20, y - 1, 7, 9, 2, '#edecce', '#c6b693');
        this.ellipse(x + 26, y + 14, 8, 8, '#8fba74');
        this.ellipse(x - 29, y + 16, 8, 6, '#8fac72');
        this.text('小窝', x, y + 40, 10, '#6a7959', 600);
    }
    guard(x, y, eating) {
        const c = this.ctx;
        const bob = this.reduced ? 0 : Math.sin(this.frame * .034) * .7;
        this.ellipse(x, y + 14, 20, 6, 'rgba(98,83,58,.18)');
        c.save();
        c.translate(0, bob);
        c.beginPath();
        c.moveTo(x - 19, y - 10);
        c.lineTo(x - 21, y - 29);
        c.lineTo(x - 6, y - 19);
        c.lineTo(x + 8, y - 19);
        c.lineTo(x + 21, y - 29);
        c.lineTo(x + 18, y - 8);
        c.closePath();
        c.fillStyle = '#8d735b';
        c.fill();
        this.ellipse(x, y - 4, 21, 21, '#8d735b');
        this.ellipse(x, y + 5, 16, 10, '#d8b68c');
        if (eating) {
            c.strokeStyle = '#473e34';
            c.lineWidth = 2;
            for (const dx of [-8, 8]) {
                c.beginPath();
                c.arc(x + dx, y - 5, 3, Math.PI, Math.PI * 2);
                c.stroke();
            }
        }
        else {
            this.ellipse(x - 8, y - 6, 2.4, 3, '#3b3930');
            this.ellipse(x + 8, y - 6, 2.4, 3, '#3b3930');
        }
        this.ellipse(x, y + 1, 3, 2.5, '#514639');
        if (eating) {
            this.text('z z', x + 29, y - 28, 12, '#a69069', 600);
        }
        c.restore();
        this.text(eating ? '守卫 · 进食中' : '守卫', x, y + 33, 9, '#977e66');
    }
    tuanzi(x, y, energy, bag) {
        const c = this.ctx, bob = this.reduced ? 0 : Math.sin(this.frame * .04) * 1.3;
        this.ellipse(x, y + 15, 19, 6, 'rgba(98,111,72,.20)');
        c.save();
        c.translate(0, bob);
        this.rr(x + 10, y - 7, 13, 20, 5, '#c69e69');
        this.rr(x + 13, y - 6, 8, 12, 3, '#dbb784');
        this.ellipse(x - 8, y + 13, 7, 5, '#f4ecd8');
        this.ellipse(x + 8, y + 13, 7, 5, '#f4ecd8');
        c.shadowColor = 'rgba(140,130,96,.16)';
        c.shadowBlur = 5;
        c.shadowOffsetY = 2;
        this.ellipse(x, y - 2, 21, 21, '#fff9eb');
        c.shadowColor = 'transparent';
        this.ellipse(x - 13, y + 4, 5.2, 3, '#edb9a7');
        this.ellipse(x + 13, y + 4, 5.2, 3, '#edb9a7');
        if (energy > 0) {
            this.ellipse(x - 7, y, 2.2, 3, '#3c4636');
            this.ellipse(x + 7, y, 2.2, 3, '#3c4636');
        }
        else {
            c.strokeStyle = '#3c4636';
            c.lineWidth = 1.5;
            for (const d of [-7, 7]) {
                c.beginPath();
                c.moveTo(x + d - 2, y - 2);
                c.lineTo(x + d + 2, y + 2);
                c.moveTo(x + d - 2, y + 2);
                c.lineTo(x + d + 2, y - 2);
                c.stroke();
            }
        }
        c.strokeStyle = '#6b715b';
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(x, y + 4, 3, .2, Math.PI - .2);
        c.stroke();
        c.strokeStyle = '#78965b';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, y - 22);
        c.quadraticCurveTo(x + 1, y - 28, x + 4, y - 32);
        c.stroke();
        c.save();
        c.translate(x + 7, y - 30);
        c.rotate(-.45);
        this.ellipse(0, 0, 8, 3.8, '#95b671');
        c.restore();
        c.save();
        c.translate(x - 4, y - 27);
        c.rotate(.4);
        this.ellipse(0, 0, 6, 3, '#759756');
        c.restore();
        if (bag > 0) {
            this.ellipse(x + 25, y - 12, 8, 8, '#4e6d48');
            this.text(String(bag), x + 25, y - 8.5, 9, '#ffffff', 600);
        }
        c.restore();
        this.text('团子', x, y + 34, 10, '#597250', 650);
    }
}
exports.WorldRenderer = WorldRenderer;

}},
"src/game/world.js":{deps:{"./types.js":"src/game/types.js"},factory:function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameWorld = exports.DIRECTIONS = void 0;
exports.inside = inside;
exports.walkable = walkable;
exports.dangerous = dangerous;
exports.path = path;
exports.reachableBerries = reachableBerries;
exports.lureSite = lureSite;
exports.createWorld = createWorld;
exports.applyAction = applyAction;
const types_js_1 = require("./types.js");
exports.DIRECTIONS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
function inside(s, p) {
    return Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < s.width && p.y < s.height;
}
function walkable(s, p) {
    return inside(s, p) && s.terrain[p.y * s.width + p.x] === 'grass' && !s.walls.some(w => (0, types_js_1.same)(w, p));
}
function dangerous(s, p) {
    return s.guards.some(g => (0, types_js_1.dist)(g, p) <= (g.eating > 0 ? 0 : 2));
}
/** Deterministic BFS, no model calls. The start may be threatened after an edit. */
function path(s, start, goal, safe = true) {
    if (!walkable(s, goal) || (safe && dangerous(s, goal)))
        return null;
    if ((0, types_js_1.same)(start, goal))
        return [];
    const queue = [start];
    const prev = new Map([[(0, types_js_1.key)(start), null]]);
    for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        for (const d of exports.DIRECTIONS) {
            const n = { x: p.x + d.x, y: p.y + d.y };
            if (!walkable(s, n) || prev.has((0, types_js_1.key)(n)) || (safe && dangerous(s, n)))
                continue;
            prev.set((0, types_js_1.key)(n), p);
            queue.push(n);
            if ((0, types_js_1.same)(n, goal)) {
                const result = [];
                let at = n;
                while (!(0, types_js_1.same)(at, start)) {
                    result.unshift(at);
                    at = prev.get((0, types_js_1.key)(at));
                }
                return result;
            }
        }
    }
    return null;
}
function reachableBerries(s) {
    return s.berries.map(berry => ({ berry, route: path(s, s.player, berry) }))
        .filter((x) => x.route !== null)
        .sort((a, b) => a.route.length - b.route.length || a.berry.id.localeCompare(b.berry.id));
}
/** A drop location is calculated from known physics, not a hidden skill. */
function lureSite(s) {
    if (!s.guards.length || s.lures.length || s.guards.some(g => g.eating > 0))
        return null;
    const guard = s.guards.slice().sort((a, b) => (0, types_js_1.dist)(s.player, a) - (0, types_js_1.dist)(s.player, b))[0];
    let best;
    for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
            const drop = { x, y };
            const dg = (0, types_js_1.dist)(drop, guard);
            if (!walkable(s, drop) || dangerous(s, drop) || (0, types_js_1.same)(drop, s.home) || dg < 4 || dg > 7 || !path(s, guard, drop, false))
                continue;
            for (const d of exports.DIRECTIONS) {
                const stand = { x: x + d.x, y: y + d.y };
                const route = path(s, s.player, stand);
                if (!route || (0, types_js_1.same)(stand, drop))
                    continue;
                const foodDistance = s.berries.length ? Math.min(...s.berries.map(b => (0, types_js_1.dist)(b, drop))) : 0;
                const score = foodDistance * 2 - route.length * 0.7 - dg * 0.15;
                if (!best || score > best.score)
                    best = { drop, stand, route, score };
            }
        }
    return best ? { drop: best.drop, stand: best.stand, route: best.route } : null;
}
function createWorld(scenario = 'meadow') {
    if (scenario === 'remix') {
        const base = createWorld('guarded');
        const flip = (p) => ({ ...p, x: base.width - 1 - p.x });
        base.terrain = Array.from({ length: base.height }, (_, y) => base.terrain.slice(y * base.width, (y + 1) * base.width).reverse()).flat();
        base.home = flip(base.home);
        base.player = flip(base.player);
        base.walls = base.walls.map(flip);
        base.berries = base.berries.map(b => ({ ...b, ...flip(b) }));
        base.guards = base.guards.map(g => ({ ...g, ...flip(g), anchor: flip(g.anchor) }));
        base.scenario = 'remix';
        base.lastFact = '镜像布局：规则不变，坐标与道路改变。旧技能仅精确匹配，不能直接套用。';
        return base;
    }
    const width = 17, height = 11;
    const s = { width, height, revision: 1, turn: 0, maxTurns: 180, terrain: Array(width * height).fill('grass'),
        walls: [], berries: [], guards: [], lures: [], home: { x: 2, y: 8 }, player: { x: 3, y: 8 }, energy: 86, maxEnergy: 100,
        bag: 0, capacity: 3, delivered: 0, target: 5, scenario, attacks: 0, baitUsed: 0, eaten: 0,
        lastFact: '团子准备出发。暂停时，世界不会消耗能量。' };
    const water = [{ x: 7, y: 1 }, { x: 8, y: 1 }, { x: 7, y: 2 }, { x: 8, y: 2 }, { x: 9, y: 2 }, { x: 7, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 4 }];
    const rocks = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 15, y: 8 }, { x: 15, y: 9 }, { x: 14, y: 9 }, { x: 5, y: 4 }, { x: 5, y: 5 }, { x: 10, y: 8 }];
    for (const p of water)
        s.terrain[p.y * width + p.x] = 'water';
    for (const p of rocks)
        s.terrain[p.y * width + p.x] = 'rock';
    const grove = [{ x: 12, y: 3 }, { x: 13, y: 3 }, { x: 14, y: 3 }, { x: 12, y: 4 }, { x: 14, y: 4 }, { x: 12, y: 5 }, { x: 13, y: 5 }, { x: 14, y: 5 }];
    const safe = [{ x: 4, y: 7 }, { x: 4, y: 6 }, { x: 3, y: 4 }, { x: 2, y: 3 }, { x: 6, y: 7 }, { x: 7, y: 8 }, { x: 9, y: 6 }];
    const fruit = scenario === 'guarded' ? grove : [...safe, ...grove];
    s.berries = fruit.map((p, i) => ({ ...p, id: `berry-${i + 1}` }));
    s.guards = [{ id: 'guard-1', x: 13, y: 4, anchor: { x: 13, y: 4 }, eating: 0 }];
    if (scenario === 'guarded') {
        s.player = { x: 8, y: 7 };
        s.bag = 1;
        s.energy = 98;
        s.lastFact = '果园被守卫挡住，背包留有一颗浆果。可切换程序搜索或完整预置规则作对照。';
    }
    if (scenario === 'detour') {
        s.walls = [{ x: 4, y: 7 }, { x: 4, y: 8 }, { x: 4, y: 9 }, { x: 4, y: 6 }];
        s.berries = s.berries.filter(b => !s.walls.some(w => (0, types_js_1.same)(w, b)));
        s.lastFact = '原来的近路被挡住了。普通绕路由 BFS 处理，不需要策略修复。';
    }
    return s;
}
class GameWorld {
    value;
    constructor(initial = createWorld()) { this.value = (0, types_js_1.clone)(initial); }
    snapshot() { return (0, types_js_1.clone)(this.value); }
    /** Only the domain executor calls transact. JS synchronous mutation is atomic here. */
    transact(expectedRevision, apply) {
        if (String(this.value.revision) !== expectedRevision)
            return false;
        apply(this.value);
        this.value.revision++;
        return true;
    }
    edit(tool, p) {
        const s = this.value;
        if (tool === 'inspect')
            return { ok: false, message: '选择一种干预工具，然后点击地图。' };
        if (!inside(s, p) || s.terrain[p.y * s.width + p.x] !== 'grass')
            return { ok: false, message: '湖水与天然岩石不可编辑。' };
        if ((0, types_js_1.same)(p, s.home) || (0, types_js_1.same)(p, s.player))
            return { ok: false, message: '小窝和团子所在格受到保护。' };
        const existingGuard = s.guards.find(g => (0, types_js_1.same)(g, p));
        if (tool === 'berry') {
            if (s.walls.some(w => (0, types_js_1.same)(w, p)) || existingGuard || s.berries.some(b => (0, types_js_1.same)(b, p)))
                return { ok: false, message: '这一格已经被占用。' };
            s.berries.push({ ...p, id: `edit-berry-${s.revision}` });
        }
        else if (tool === 'wall') {
            if (s.walls.some(w => (0, types_js_1.same)(w, p)) || existingGuard || s.berries.some(b => (0, types_js_1.same)(b, p)))
                return { ok: false, message: '请先用橡皮擦清空这一格。' };
            s.walls.push({ ...p });
        }
        else if (tool === 'guard') {
            if (s.walls.some(w => (0, types_js_1.same)(w, p)) || s.berries.some(b => (0, types_js_1.same)(b, p)) || (0, types_js_1.dist)(s.player, p) < 3)
                return { ok: false, message: '守卫需要一块离团子至少三格的空地。' };
            // Exactly one guard in v0.1; moving it clears distraction state.
            s.guards = [{ id: 'guard-1', ...p, anchor: { ...p }, eating: 0 }];
            s.lures = [];
        }
        else {
            const count = s.walls.length + s.berries.length + s.guards.length + s.lures.length;
            s.walls = s.walls.filter(x => !(0, types_js_1.same)(x, p));
            s.berries = s.berries.filter(x => !(0, types_js_1.same)(x, p));
            s.guards = s.guards.filter(x => !(0, types_js_1.same)(x, p));
            s.lures = s.lures.filter(x => !(0, types_js_1.same)(x, p));
            if (count === s.walls.length + s.berries.length + s.guards.length + s.lures.length)
                return { ok: false, message: '这里已经是空地。' };
        }
        s.revision++;
        s.lastFact = `玩家干预：${{ berry: '放置浆果', wall: '放置障碍', guard: '移动守卫', erase: '清空格子' }[tool]} (${p.x}, ${p.y})。`;
        return { ok: true, message: s.lastFact };
    }
}
exports.GameWorld = GameWorld;
/** One action = one world tick. Animation is deliberately not part of the simulation. */
function applyAction(s, a) {
    const facts = [];
    switch (a.kind) {
        case 'move':
            s.player = { x: a.x, y: a.y };
            facts.push(`移动到 (${a.x}, ${a.y})`);
            break;
        case 'pickup':
            s.berries = s.berries.filter(b => b.id !== a.berryId);
            s.bag++;
            facts.push('拾取一颗浆果');
            break;
        case 'eat':
            s.bag--;
            s.energy = Math.min(s.maxEnergy, s.energy + 32);
            s.eaten++;
            facts.push('吃掉一颗浆果，恢复 32 点能量');
            break;
        case 'deposit':
            s.bag -= a.amount;
            s.delivered += a.amount;
            facts.push(`向小窝交付 ${a.amount} 颗浆果`);
            break;
        case 'drop':
            s.bag--;
            s.baitUsed++;
            s.lures.push({ x: a.x, y: a.y, id: `lure-${s.turn}`, ttl: 36 });
            facts.push('放下一颗浆果作为诱饵');
            break;
        case 'wait':
            facts.push('等待一个回合');
            break;
    }
    s.turn++;
    s.energy = Math.max(0, s.energy - 1);
    for (const guard of s.guards) {
        if (guard.eating > 0) {
            guard.eating--;
            continue;
        }
        const lure = s.lures.filter(l => (0, types_js_1.dist)(guard, l) <= 9).sort((a, b) => (0, types_js_1.dist)(guard, a) - (0, types_js_1.dist)(guard, b))[0];
        const target = lure ?? guard.anchor;
        const route = path(s, guard, target, false);
        if (route?.length) {
            guard.x = route[0].x;
            guard.y = route[0].y;
        }
        if (lure && (0, types_js_1.same)(guard, lure)) {
            guard.eating = 18;
            s.lures = s.lures.filter(l => l.id !== lure.id);
            facts.push('守卫被诱饵引开，开始进食');
        }
        if (guard.eating === 0 && (0, types_js_1.dist)(guard, s.player) <= 1) {
            s.energy = Math.max(0, s.energy - 14);
            s.attacks++;
            facts.push('守卫靠近，损失 14 点能量');
        }
    }
    s.lures = s.lures.map(l => ({ ...l, ttl: l.ttl - 1 })).filter(l => l.ttl > 0);
    s.lastFact = facts.join('；') + '。';
}

}},
"src/game/types.js":{deps:{},factory:function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.key = exports.dist = exports.same = exports.clone = exports.GOAL = exports.INITIAL_POLICY = exports.CAPABILITIES = void 0;
exports.CAPABILITIES = ['move', 'pickup', 'eat', 'deposit', 'drop', 'wait'];
exports.INITIAL_POLICY = {
    id: 'tuanzi-foraging', version: 1,
    body: { mode: 'forage', subgoal: '采集可安全接近的浆果，分批带回小窝。',
        enabled: ['move', 'pickup', 'eat', 'deposit', 'wait'], reserveEnergy: 24 }
};
exports.GOAL = {
    id: 'five-berries', description: '在能量耗尽前，把 5 颗浆果带回小窝。使用世界已有能力；采集后必须回家交付。',
    verifierId: 'world:delivered>=5&&energy>0'
};
const clone = (x) => structuredClone(x);
exports.clone = clone;
const same = (a, b) => a.x === b.x && a.y === b.y;
exports.same = same;
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
exports.dist = dist;
const key = (p) => `${p.x},${p.y}`;
exports.key = key;

}},
"src/lab/viewer-layout.js":{deps:{"./generation-panel.js":"src/lab/generation-panel.js"},factory:function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.layout = void 0;
const generation_panel_js_1 = require("./generation-panel.js");
/** All mutation controls are contextual; creation fields are never current-run fields. */
exports.layout = `
<a class="skip-link" href="#main-content">跳到实验内容</a>
<header class="site-header"><a href="/lab" id="brand-home" class="brand" aria-label="团子实验室，返回实验列表"><span class="brand-mark">g/s</span><span><b>团子实验室</b><small>G/S 决策与实验观测</small></span></a>
<nav class="top-nav" aria-label="主要导航"><button id="home" class="nav-link active">实验</button><button id="help-open" class="nav-link">使用说明</button><a href="/" class="nav-link secondary-link">本地试玩 ↗</a></nav>
<div class="header-end"><span class="connection-pill"><i id="connection-dot"></i><span id="connection">连接服务中</span></span><span class="version">v0.5.5</span><button id="new-run" class="primary">＋ 新建实验</button></div></header>
<main id="main-content" tabindex="-1" class="container">
<section id="list-page" aria-labelledby="list-title">
 <div class="page-intro"><div><p class="overline">实验工作区</p><h1 id="list-title">每一场实验，都有据可查。</h1><p class="lead">Agent 主持实验，你在这里观察目标、决策和结果。</p></div><div class="intro-note"><span class="note-dot"></span><p>网页只观察同一个服务端会话。<br>打开页面不会创建副本或调用模型。</p></div></div>
 <div class="list-tools"><div class="search-field"><span aria-hidden="true">⌕</span><input id="run-search" type="search" placeholder="搜索名称、任务或运行 ID" aria-label="搜索实验"></div><select id="status-filter" aria-label="筛选实验状态"><option value="all">全部状态</option><option value="active">进行中 / 可继续</option><option value="succeeded">已完成</option><option value="attention">需要检查</option><option value="ended">已结束</option></select><span id="list-count" class="muted"></span><div class="spacer"></div><button id="import-open" class="quiet">导入报告</button><button id="refresh" class="quiet">刷新列表</button></div>
 <div class="list-table-heading" aria-hidden="true"><span>实验 / 研究内容</span><span>状态</span><span>配置的判断方式</span><span>控制者 / 时间</span><span></span></div>
 <div id="run-list" class="run-list" aria-live="polite"><div class="empty-state"><span class="empty-symbol">◎</span><h2>正在读取实验列表</h2><p>请先启动本地服务 npm start。</p></div></div>
 <div class="list-bottom"><p>也可以从终端创建，随后打开返回的 viewerUrl。</p><button id="cli-help" class="text-button">查看 Agent 操作入口 →</button></div>
</section>
<section id="run-page" class="hidden" aria-labelledby="title">
 <div class="breadcrumbs"><button id="back-list" class="text-button">实验列表</button><span>/</span><span id="crumb-title">当前实验</span><span class="spacer"></span><button id="copy-id" class="text-button mono">复制运行 ID</button></div>
 <div class="run-heading"><div><div class="title-line"><h1 id="title">当前实验</h1><span id="run-status" class="badge">准备就绪</span></div><p id="goal" class="goal"></p></div><div class="run-heading-meta"><div id="owner" class="owner"></div><p id="source-caption"></p></div></div>
 <div id="run-tags" class="run-tags"></div>
 <div id="stale-banner" class="callout warning hidden" role="status"></div>
 <div class="run-navigation"><div class="tabs" role="tablist" aria-label="实验信息"><button id="tab-overview" data-tab="overview" role="tab" aria-selected="true" aria-controls="panel-overview" tabindex="0">概览</button><button id="tab-decision" data-tab="decision" role="tab" aria-selected="false" aria-controls="panel-decision" tabindex="-1">判断过程</button><button id="tab-diagnostics" data-tab="diagnostics" role="tab" aria-selected="false" aria-controls="panel-diagnostics" tabindex="-1">诊断 <span id="diagnostic-dot" class="small-dot hidden"></span></button><button id="tab-config" data-tab="config" role="tab" aria-selected="false" aria-controls="panel-config" tabindex="-1">配置</button></div>
 <div id="toolbar" class="toolbar"><button id="takeover" class="quiet hidden">接管并暂停</button><button id="step" class="quiet hidden">单步</button><button id="start" class="primary hidden">开始运行</button><button id="pause" class="primary hidden">暂停运行</button><button id="replay" class="quiet">回放</button><button id="more-open" class="quiet" aria-label="更多实验操作">更多 ···</button></div></div>
 <div id="replay-bar" class="replay-bar hidden"><div><b>只读回放</b><small id="replay-caption">地图、过程与指标均来自所选时刻</small></div><button id="replay-prev" class="icon-button" aria-label="上一条状态">‹</button><input id="replay-slider" type="range" min="0" max="0" value="0" aria-label="选择回放时刻"><button id="replay-next" class="icon-button" aria-label="下一条状态">›</button><span id="replay-position" class="mono"></span><button id="live" class="quiet">返回实时</button></div>
 <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
  <div class="metrics"><div><small>任务进展</small><strong id="progress">—</strong><span id="progress-note">以根任务验收为准</span></div><div><small>能量 / 背包</small><strong id="energy">—</strong><span id="bag-note">—</span></div><div><small id="external-label">实际外部请求</small><strong id="external">—</strong><span id="request-note">—</span></div><div><small>整局墙钟</small><strong id="elapsed">—</strong><span id="elapsed-note">—</span></div></div>
  <div id="stop-detail" class="status-summary hidden" role="status"><div><h2 id="status-title"></h2><p id="status-body"></p><code id="status-reason"></code></div><button id="status-detail" class="quiet">查看这次判断 →</button></div>
  <div class="overview-grid"><section class="world-panel"><div class="section-heading"><h2>实验世界</h2><span id="world-mode" class="subtle-tag">服务端快照</span></div><div class="world-scene"><canvas id="world" aria-label="当前实验世界快照" role="img"></canvas></div><div class="scene-footer"><span id="world-label"></span><span id="sequence-label" class="mono"></span></div></section>
  <section class="process-panel"><div class="section-heading"><h2>G/S 正在做什么</h2><span class="subtle-tag" id="process-level">父 / 子</span></div><div class="goal-ladder"><div class="ladder-row"><span class="ladder-node root">根</span><div><small>根目标</small><p id="root-goal"></p></div></div><div class="ladder-row"><span class="ladder-node">S</span><div><small>当前技能</small><h3 id="current-skill"></h3><p id="current-phase" class="muted"></p></div></div><div class="ladder-row last"><span class="ladder-node">→</span><div><small>眼前任务</small><p id="immediate-task"></p></div></div></div><div class="process-status"><i id="process-pulse"></i><div><strong id="process-status-title">等待执行</strong><p id="process-status-note"></p></div></div><div id="retry-card" class="callout warning hidden" role="status"><strong id="retry-title"></strong><p id="retry-detail"></p><button id="retry-inspect" class="text-button">查看重试记录 →</button></div>${generation_panel_js_1.generationCard}<button id="inspect-current" class="text-button">查看候选与选择依据 →</button><p class="process-boundary">状态说明来自运行事件，不是模型内心独白。</p></section></div>
  <section class="timeline-section"><div class="section-heading"><div><h2>最近的关键过程</h2><p>从原始事件聚合；展开后可核对证据。</p></div><button id="all-process" class="text-button">查看完整过程 →</button></div><div id="activity" class="key-timeline"></div></section>
 </div>
 <section id="panel-decision" role="tabpanel" aria-labelledby="tab-decision" class="hidden"><div class="section-intro"><h2>从问题到行动</h2><p>候选、模型返回和执行许可是不同环节。所有数值按原始记录展示，不解释为任务胜率。</p></div><div class="generation-history-bar"><span id="generation-history-note">尚无流式记录。</span><button id="generation-history-open" class="quiet hidden">查看 G 生成历史 ↗</button></div><label for="decision-select">选择一次判断</label><select id="decision-select"></select><div id="decision-content"></div><details class="evidence-details"><summary>完整事件时间线与原始证据</summary><div id="full-timeline" class="full-timeline"></div></details></section>
 <section id="panel-diagnostics" role="tabpanel" aria-labelledby="tab-diagnostics" class="hidden"><div class="section-intro"><h2>诊断与执行边界</h2><p>先定位原因，再检查证据；诊断操作不会自动重试模型或恢复终止运行。</p></div><div id="diagnostics-content"></div></section>
 <section id="panel-config" role="tabpanel" aria-labelledby="tab-config" class="hidden"><div class="section-intro row"><div><h2>当前实验的实际配置</h2><p>只读。要修改条件，请创建新的实验，原运行不会改变。</p></div><button id="config-copy" class="quiet">以此配置新建</button></div><div id="config-content"></div></section>
</section>
</main>
<footer class="site-footer"><span>G/S Lab · 外部 Agent 主持实验，被测引擎决定行动。</span><span>仅限可信本地使用 · <button id="limits-open" class="text-button">查看运行边界</button></span></footer>
<input type="file" id="import" class="hidden" accept=".json,application/json" aria-label="导入只读实验报告">
${generation_panel_js_1.generationDialog}
<dialog id="create-dialog" aria-labelledby="create-title"><div class="dialog-head"><div><p class="overline">新的实验 · 不影响当前运行</p><h2 id="create-title">你要评估什么？</h2></div><button class="icon-button" data-close="create-dialog" aria-label="关闭新建实验">×</button></div>
<form id="create-form"><div class="dialog-body"><div class="scope-choices"><label class="scope-card"><input type="radio" name="scope" value="game" checked><b>完整任务</b><span>观察技能调用、世界变化与任务结果</span></label><label class="scope-card"><input type="radio" name="scope" value="judgment"><b>判断组合</b><span>同一份事实，比较不同判断组织</span></label></div>
<div class="form-grid"><div id="game-fields"><label for="scenario">地图</label><select id="scenario"><option value="guarded">守卫果园</option><option value="meadow">日常采集</option><option value="detour">近路被堵</option><option value="remix">镜像布局</option></select></div><div id="task-field" class="hidden"><label for="task">固定任务</label><select id="task"><option value="energy">为下一程补能</option><option value="fast">尽快交付</option><option value="reserve">交付并保留两颗</option><option value="chain">采集—返家—交付</option></select></div><div><label for="preset">判断与生成配置</label><select id="preset"><option value="offline">离线闭环夹具 · 不保证通关</option><option value="jev">Jev 判断 · 仅上下文扩展夹具</option><option value="live">Jev + LLM 自主调整</option><option value="custom">自定义组合</option></select></div><div><label for="strategy">判断组织</label><select id="strategy"><option value="direct">直接选择 · 一个 Choice</option><option value="batch">独立判断 · 合批请求</option><option value="serial">独立判断 · 逐题请求</option><option value="dependent">先适用性，再选择</option></select></div></div><p id="strategy-help" class="field-help"></p>
<details id="advanced-config" class="evidence-details"><summary>高级配置 · 控制器、来源和预算</summary><div class="form-grid"><div id="controller-field"><label for="controller">决策控制器</label><select id="controller"><option value="adaptive">自主 G/S · 无参考解</option><option value="hierarchy">旧父子技能 · 离线参考辅助</option><option value="program">完整序列搜索 · 离线参考</option><option value="rules">完整预置规则 · 离线参考</option></select></div><div><label for="backend">判断来源</label><select id="backend"><option value="rule">程序化参考</option><option value="jev">Jev · 真实请求</option><option value="llm">LLM · 真实请求</option></select></div><div id="generator-field"><label for="generator">G 生成 / 调整来源</label><select id="generator"><option value="local">本地上下文扩展夹具</option><option value="llm">LLM 决策条件提案</option></select></div><div><label for="experience">经验使用</label><select id="experience"><option value="use">记录并参与选择</option><option value="record">只记录</option><option value="off">关闭</option></select></div><div><label for="seed">候选顺序种子</label><input id="seed" type="number" min="0" max="2147483647" value="441" required></div><div><label for="delay">合成延迟 / 请求（ms）</label><input id="delay" type="number" min="0" max="1000" value="0" required></div><div><label for="requests">请求上限</label><input id="requests" type="number" min="1" max="512" value="512" required></div><div><label for="deadline">整局截止（ms）</label><input id="deadline" type="number" min="1" max="3600000" value="120000" required></div><div><label for="max-questions">独立问题上限</label><input id="max-questions" type="number" min="1" max="8192" value="8192" required></div><div><label for="max-actions">物理动作上限</label><input id="max-actions" type="number" min="1" max="180" value="180" required></div><div><label for="max-steps">决策周期上限</label><input id="max-steps" type="number" min="1" max="1000" value="400" required></div><div><label for="max-search">搜索工作上限</label><input id="max-search" type="number" min="1" max="500000" value="150000" required></div></div><div class="form-grid"><div><label for="max-g">G 总调用上限（含格式纠错）</label><input id="max-g" type="number" min="1" max="32" value="12"></div><div><label for="max-depth">调整子问题最大深度（0关闭）</label><input id="max-depth" type="number" min="0" max="3" value="2"></div><div><label for="max-revisions">每层有效修订上限</label><input id="max-revisions" type="number" min="1" max="6" value="3"></div><div><label for="max-format-repairs">单份输出格式纠错上限</label><input id="max-format-repairs" type="number" min="0" max="4" value="2"></div></div><div class="form-grid"><div><label for="jev-retries">Jev 额外网络重试（0关闭）</label><input id="jev-retries" type="number" min="0" max="5" value="2"></div><div><label for="jev-attempt-ms">Jev 单次访问上限（ms）</label><input id="jev-attempt-ms" type="number" min="100" max="25000" value="8000"></div><div><label for="jev-backoff">重试退避基数（ms）</label><input id="jev-backoff" type="number" min="0" max="10000" value="500"></div><div><label for="jev-backoff-max">退避上限（ms）</label><input id="jev-backoff-max" type="number" min="0" max="30000" value="5000"></div></div><p class="field-help">只重试暂时的访问错误，不重试 none 或错误决策。每次尝试仍占请求／时间预算，不重放世界动作。</p><label id="mask-field" class="checkbox"><input id="mask" type="checkbox">初始资源未观测 · 仅判断实验</label><label for="interventions">受控干预脚本（JSON 数组，可留空）</label><textarea id="interventions" rows="3" spellcheck="false" placeholder='[{"afterAction":3,"tool":"wall","point":{"x":3,"y":8}}]'></textarea><p class="field-help">正式对照使用相同脚本。操作员暂停占用整局墙钟；合成延迟仅适用于规则后端。判断夹具当前截止上限为 120,000 ms，完整任务为 3,600,000 ms。</p></details>
<div id="live-permission" class="callout warning hidden"><strong>此配置会在运行后产生真实模型请求</strong><p id="live-readiness"></p><label class="checkbox"><input id="allow-live" type="checkbox">我明确允许这场实验在上述请求预算内使用已配置模型</label></div>
<div id="create-summary" class="creation-summary"></div><p id="create-error" class="inline-error hidden" role="alert"></p></div><div class="dialog-footer"><span>只创建，不自动开始或付费。</span><button type="button" class="quiet" data-close="create-dialog">取消</button><button type="submit" id="create" class="primary">创建实验</button></div></form></dialog>
<dialog id="more-dialog" class="compact-dialog" aria-labelledby="more-title"><div class="dialog-head"><h2 id="more-title">实验操作</h2><button class="icon-button" data-close="more-dialog" aria-label="关闭实验操作">×</button></div><div class="dialog-body action-list"><button id="export" class="action-choice"><b>导出完整报告</b><span>配置、事件、诊断与实际轨迹</span></button><button id="clone-config" class="action-choice"><b>以此配置新建</b><span>全新起点；不会复制当前内存或调用栈</span></button><button id="fork-open" class="action-choice"><b>检查点与新分支</b><span>明确选择起点、经验继承和新预算</span></button><button id="intervene-open" class="action-choice"><b>受控环境干预</b><span>仅控制者在静止边界操作，始终留痕</span></button><button id="cancel" class="action-choice danger"><b>取消本次实验</b><span>不可继续；已发生的动作不会回滚</span></button><p id="operation-note" class="field-help"></p></div></dialog>
<dialog id="fork-dialog" aria-labelledby="fork-title"><div class="dialog-head"><h2 id="fork-title">从检查点创建新实验</h2><button class="icon-button" data-close="fork-dialog" aria-label="关闭检查点对话框">×</button></div><div class="dialog-body"><p>这不是恢复调用栈。新实验使用独立控制器与计数器；原实验保持不变。</p><button id="checkpoint" class="quiet">保存当前检查点</button><label for="checkpoint-list">新实验起点</label><select id="checkpoint-list"><option value="initial">初始局面</option></select><div id="checkpoint-summary" class="creation-summary"></div><label class="checkbox"><input id="inherit" type="checkbox">继承已有技能与经验（结果不属于独立样本）</label><label for="fork-strategy">新实验的判断组织</label><select id="fork-strategy"><option value="direct">直接选择</option><option value="batch">独立判断 · 合批</option><option value="serial">独立判断 · 逐题</option><option value="dependent">先适用性，再选择</option></select><div id="fork-live" class="callout warning hidden"><label for="fork-requests">新分支请求上限</label><input id="fork-requests" type="number" min="1" max="512" value="80"><label class="checkbox"><input id="fork-allow-live" type="checkbox">明确授权这个新分支使用真实模型</label></div><p class="field-help">其余配置来自当前实验，不读取新建对话框的草稿。剩余世界物理回合不会重置。</p><p id="fork-error" class="inline-error hidden" role="alert"></p></div><div class="dialog-footer"><button class="quiet" data-close="fork-dialog">取消</button><button id="fork" class="primary">创建新分支</button></div></dialog>
<dialog id="intervene-dialog" class="compact-dialog" aria-labelledby="intervene-title"><div class="dialog-head"><h2 id="intervene-title">受控环境干预</h2><button class="icon-button" data-close="intervene-dialog" aria-label="关闭干预">×</button></div><div class="dialog-body"><p>只在静止边界修改世界。不能指定团子的下一步动作，也不能修改验收标准。</p><label for="tool">操作</label><select id="tool"><option value="wall">增加障碍</option><option value="berry">移动 / 添加浆果</option><option value="guard">移动守卫</option><option value="erase">擦除对象</option></select><div class="form-grid"><div><label for="point-x">X（0–16）</label><input id="point-x" type="number" min="0" max="16" value="3"></div><div><label for="point-y">Y（0–10）</label><input id="point-y" type="number" min="0" max="10" value="8"></div></div><label for="edit-when">执行时机</label><select id="edit-when"><option value="now">现在应用</option><option value="scheduled">未来物理动作边界</option></select><div id="after-field" class="hidden"><label for="after-action">本局完成多少个物理动作后</label><input id="after-action" type="number" min="1" max="180" value="3"></div><p id="edit-error" class="inline-error hidden" role="alert"></p></div><div class="dialog-footer"><button class="quiet" data-close="intervene-dialog">取消</button><button id="edit" class="primary">记录并应用</button></div></dialog>
<dialog id="evidence-dialog" class="wide-dialog" aria-labelledby="evidence-title"><div class="dialog-head"><div><p class="overline">只读 · 原始记录</p><h2 id="evidence-title">查看证据</h2></div><button class="icon-button" data-close="evidence-dialog" aria-label="关闭证据">×</button></div><div class="dialog-body"><pre id="evidence-json" class="code"></pre></div></dialog>
<dialog id="confirm-dialog" class="compact-dialog" aria-labelledby="confirm-title"><div class="dialog-head"><h2 id="confirm-title"></h2><button class="icon-button" data-close="confirm-dialog" aria-label="关闭确认">×</button></div><div class="dialog-body"><p id="confirm-body"></p></div><div class="dialog-footer"><button class="quiet" data-close="confirm-dialog">返回</button><button id="confirm-action" class="primary">确认</button></div></dialog>
<dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-head"><h2 id="help-title">一场实验，三个阅读层次</h2><button class="icon-button" data-close="help-dialog" aria-label="关闭使用说明">×</button></div><div class="dialog-body help-content"><h3>01 · 概览</h3><p>先看目标和状态，再看世界与 G/S 当前任务。界面中的控制者是主持实验的人或 Agent，不是替团子选择动作的模型。</p><h3>02 · 判断过程</h3><p>逐次展开问题、候选、返回结果与执行记录。不把局部目标成功当作整个实验成功。</p><h3>03 · 诊断与配置</h3><p>原始错误、预算、修复证据和完整 JSON 都保留。配置只读；修改条件会创建新实验。</p><h3>外部 Agent 操作入口</h3><pre class="code">node bin/gs-lab.mjs create --kind game --scenario guarded
node bin/gs-lab.mjs step RUN_ID
node bin/gs-lab.mjs start RUN_ID
node bin/gs-lab.mjs export RUN_ID --out report.json</pre><p>打开 create 返回的 viewerUrl，即观察同一个 runId。关闭网页不结束实验；重启服务会丢失内存中的活动运行。</p><h3>本地 MCP</h3><pre class="code">node bin/gs-lab-mcp.mjs --allow-control</pre><p>MCP 使用 stdio，连接同一实验服务。项目说明、状态、事件、请求账本与终局归档可分页读取；配置示例见 docs/MCP-v0.5.5.md。audit 模式可查看参考源码与报告，但只读，不得回填到 G/S。</p><h3>可信本地环境</h3><p>服务不用于公网多租户部署。真实请求需要服务端凭据与单局授权。测试替身、规则运行和真实模型记录分别标识；本次 UI 升级未进行实网模型评测。</p></div></dialog>
<div id="toast" class="hidden" role="status"></div>`;

}},
"src/lab/presentation.js":{deps:{},factory:function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.goalOf = exports.titleOf = exports.esc = exports.list = exports.rec = exports.terminal = exports.PHASES = exports.CONTRACTS = exports.STRATEGIES = exports.TASKS = exports.SCENARIOS = exports.STATUS = void 0;
exports.duration = duration;
exports.actualSource = actualSource;
exports.sourceLabel = sourceLabel;
exports.reasonText = reasonText;
exports.statusCopy = statusCopy;
exports.actionsFor = actionsFor;
exports.flowOf = flowOf;
exports.unwrap = unwrap;
exports.keyEvents = keyEvents;
exports.decisionsFrom = decisionsFrom;
exports.replayStates = replayStates;
exports.isView = isView;
exports.STATUS = {
    ready: '准备就绪', running: '运行中', stepping: '单步推进中', pausing: '正在等待决策边界', paused: '已暂停',
    cancelling: '正在取消', succeeded: '任务完成', failed: '任务失败', blocked: '决策受阻', cancelled: '已取消', stopped: '已停止', fault: '运行故障'
};
exports.SCENARIOS = { guarded: '守卫果园', meadow: '日常采集', detour: '近路被堵', remix: '镜像布局' };
exports.TASKS = {
    fast: { title: '尽快交付', description: '尽快完成第 5 颗浆果交付，并保持存活。' },
    reserve: { title: '交付并保留两颗', description: '完成第 5 颗交付时，背包至少保留 2 颗浆果。' },
    energy: { title: '为下一程补能', description: '完成第 5 颗交付时，能量至少为 35。' },
    chain: { title: '采集—返家—交付', description: '完成两颗额外交付，背包保留至少 1 颗，能量至少为 20。' }
};
exports.STRATEGIES = { direct: '直接选择', batch: '独立判断 · 合批', serial: '独立判断 · 逐题', dependent: '适用性 → 再选择' };
exports.CONTRACTS = { 'access-open': '创造安全采集机会', 'acquired-one': '采集一颗浆果', deposited: '返回并交付', 'energy-restored': '补充能量' };
exports.PHASES = { 'place-resource': '接近站位并放置资源', 'wait-access': '等待采集机会', 'gather': '获取目标浆果', 'consume': '食用浆果', 'acquire': '获取目标浆果', 'collect': '获取目标浆果', 'deliver': '返回并交付', 'restore': '补充能量', 'go-home': '返回小窝', 'eat': '食用浆果' };
const terminal = (status) => ['succeeded', 'failed', 'blocked', 'cancelled', 'stopped', 'fault'].includes(status);
exports.terminal = terminal;
const rec = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
exports.rec = rec;
const list = (v) => Array.isArray(v) ? v : [];
exports.list = list;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
exports.esc = esc;
const titleOf = (c) => c.kind === 'game' ? (exports.SCENARIOS[c.scenario] ?? c.scenario) : (exports.TASKS[c.task]?.title ?? c.task);
exports.titleOf = titleOf;
const goalOf = (s) => s.config.kind === 'game' ? `保持存活，把 ${s.world.target} 颗浆果带回小窝。` : (exports.TASKS[s.config.task]?.description ?? '以注册任务契约验收。');
exports.goalOf = goalOf;
function duration(ms) {
    if (!Number.isFinite(ms))
        return '—';
    return ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} 秒` : `${Math.floor(ms / 60000)} 分 ${Math.floor(ms % 60000 / 1000)} 秒`;
}
function actualSource(s) {
    const d = (0, exports.rec)(s.lastDecision), src = String(d.source ?? '');
    if (src === 'mock' || src === 'test-provider' || String(d.selectorIdentity ?? '').includes('test'))
        return '测试替身 · 不代表真实模型';
    if (s.externalRequests > 0)
        return `${s.externalRequests} 次真实外部请求 · 含判断 / 生成`;
    if (s.config.backend !== 'rule' || s.config.generator === 'llm')
        return '已配置模型 · 尚无真实外部请求';
    return s.config.kind === 'game' && s.config.controller === 'adaptive' ? '离线动作轮换 / 上下文扩展夹具 · 非求解器' : '程序化运行 · 无真实外部请求';
}
function sourceLabel(source) { return { 'authored-rule': '程序规则', rule: '程序规则', mock: '测试替身', 'test-provider': '测试替身', 'deterministic-single': '单候选确定性路径', 'deterministic-continue': '继续调度当前技能', jev: 'Jev 判断', 'configured-model': '配置的模型', 'configured-provider': '配置的模型' }[String(source)] ?? String(source ?? '来源未报告'); }
function reasonText(reason) {
    if (!reason)
        return '';
    const known = [
        ['decision_blocked:no_local_suitable_action', '子层未选出适用动作'], ['decision_blocked:parent_no_suitable_skill', '父层未选出适用技能'],
        ['duplicate_repair_no_new_evidence', '已停止重复修复：没有新的行为结构或证据'], ['repair_budget_exhausted', '技能修复预算已耗尽'],
        ['wall_clock_deadline', '实验已达到整局时间上限'], ['host_step_or_action_budget', '实验已达到步骤或动作预算'], ['no_local_suitable_action', '局部选择器未选出动作'],
        ['operator_pause_at_boundary', '操作员暂停了后续调度'], ['controller_changed', '控制权已转移，实验停在决策边界'], ['operator_cancel', '操作员已取消实验'],
        ['execution_outcome_unknown', '动作结果尚未确认，需要核对执行证据'], ['event_budget_exhausted', '事件记录已达到本局上限'], ['output_format_repair_exhausted', '生成输出格式纠错额度耗尽，尚未形成可试行修订'], ['adaptation_generation_budget_exhausted', '本次 G 总调用上限已达到'], ['adaptation_depth_exhausted', '调整深度达到上限'], ['adaptation_budget_exhausted', '本次调整预算耗尽'], ['root_g_budget_exhausted', '整局 G 请求预算耗尽'], ['duplicate_decision_no_change', '调整没有改变实际判断条件']
    ];
    return known.find(([prefix]) => reason.includes(prefix))?.[1] ?? '运行已到达需要检查的边界';
}
function statusCopy(s) {
    const diagnostic = (0, exports.rec)(s.diagnostics);
    if (s.config.kind === 'game' && s.config.controller === 'adaptive' && !(0, exports.terminal)(s.status) && s.busy)
        return { title: diagnostic.phase === 'initializing' ? 'G 正在了解初始环境' : diagnostic.phase === 'format-repairing' ? 'G 正在修正输出格式（不是策略重试）' : diagnostic.phase === 'investigating' ? '正在处理只读子问题' : diagnostic.phase === 'adapting' ? 'G 正在调整 S 的判断条件' : 'S 正在进行局部判断', body: `当前层级 ${diagnostic.depth ?? 0}；G 已调用 ${diagnostic.gCalls ?? 0} 次。参考解不进入运行上下文。`, tone: 'active' };
    const blocked = (0, exports.terminal)(s.status) && s.status !== 'succeeded';
    if (s.status === 'succeeded')
        return { title: '根任务已完成', body: `验收器确认本局成功。实际执行 ${s.physicalActions} 个物理动作，剩余能量 ${s.world.energy}。${s.interventions.length ? '本局有环境干预，比较时需保留该条件。' : '局部技能结果可在判断过程中逐项查证。'}`, tone: 'success' };
    if (blocked)
        return { title: reasonText(s.reason) || exports.STATUS[s.status], body: s.status === 'blocked' ? `本局已停止自动尝试，不能作为普通暂停继续。已执行 ${s.physicalActions} 个物理动作；查看最后一次判断，或从检查点创建新实验。` : s.status === 'cancelled' ? '已经发生的动作不会回滚。可以查看轨迹或创建新的对照实验。' : '世界和结果保持在实际停止位置。请查看诊断中的原始原因和预算，再决定是否新建实验。', tone: s.status === 'cancelled' ? 'neutral' : 'warning' };
    if (s.status === 'paused')
        return { title: '实验已暂停', body: '尚未结束。拥有控制权的操作员可以继续或单步；人工暂停仍计入整局墙钟期限。', tone: 'neutral' };
    if (s.status === 'ready')
        return { title: '准备就绪，尚未开始', body: s.config.kind === 'game' && s.config.controller === 'adaptive' ? '开始或单步后，先由 G 研判当前环境并形成初始决策条件，再由 S 选择动作。创建或观看页面不会触发请求。' : '配置已经固定。开始或单步之后才启动实验计时；观看页面不会触发模型请求。', tone: 'neutral' };
    if (s.status === 'pausing' || s.status === 'cancelling')
        return { title: exports.STATUS[s.status], body: '已在途的决策量子可能完成；程序不会擅自回滚动作或开始下一轮。', tone: 'neutral' };
    return { title: exports.STATUS[s.status] ?? s.status, body: '下面显示服务端的真实进度。关闭网页不会停止实验。', tone: 'active' };
}
function actionsFor(s, actorId, opts = {}) {
    const own = s.owner.id === actorId, done = (0, exports.terminal)(s.status), quiet = !s.busy && !['running', 'stepping', 'pausing', 'cancelling'].includes(s.status);
    const writable = !opts.replay && !opts.imported && opts.connected !== false && !opts.pending;
    const enabled = { start: writable && own && !done && quiet, step: writable && own && !done && quiet, pause: writable && own && !done && !quiet, cancel: writable && own && !done, takeover: writable && !own && !done, checkpoint: writable && own && quiet, intervene: writable && own && !done && quiet, schedule: writable && own && !done && quiet };
    const visible = opts.imported || opts.replay ? [] : done ? [] : !own ? ['takeover'] : quiet ? ['start', 'step'] : ['pause'];
    return { own, done, quiet, enabled, visible: visible };
}
function flowOf(s) {
    if (s.config.kind === 'game' && s.config.controller === 'adaptive') {
        const d = (0, exports.rec)(s.diagnostics), p = (0, exports.rec)(d.program), active = (0, exports.rec)(s.activeSkill), stage = (0, exports.list)(p.stages)[Number(active.phase) || 0];
        return { skill: String(p.title ?? '自主 G/S · 尚无策略'), phase: (0, exports.terminal)(s.status) ? reasonText(s.reason) || '任务结束' : `${{ ready: '待启动', initializing: '开局环境研判', selecting: '选择判断', adapting: '同层调整', investigating: '只读子问题', 'format-repairing': '输出格式纠错', acting: '执行动作', finished: '运行结束' }[d.phase ?? 'ready'] ?? d.phase} · 子问题深度 ${d.depth ?? 0}`, immediate: String((0, exports.rec)(d.initialization).status === 'pending' ? '等待启动：先由 G 研判初始环境，形成 S 的首轮决策条件。' : (0, exports.rec)(d.initialization).status === 'reviewing' ? 'G 正在研判允许的初始环境，形成供 S 使用的首轮上下文与选项。' : stage?.question ?? '先由 G 研判初始环境并建立决策条件；随后根据实际反馈持续调整。'), detail: '生成内容是待验证假设。当前 S 仍保留不执行选项，任务结果只由真实世界验收。' };
    }
    const active = (0, exports.rec)(s.activeSkill), spec = (0, exports.rec)(active.spec), latest = (0, exports.rec)(s.lastDecision), packet = (0, exports.rec)(latest.packet ?? latest), projection = (0, exports.rec)(packet.projection);
    const task = (0, exports.rec)(projection.taskContext ?? projection.context ?? packet.taskContext);
    if (Object.keys(spec).length) {
        const phase = (0, exports.list)(spec.phases)[Number(active.phase) || 0];
        return { skill: String(spec.title ?? exports.CONTRACTS[String(spec.success)] ?? '局部技能'), phase: phase ? `${Number(active.phase) + 1} / ${(0, exports.list)(spec.phases).length} · ${exports.PHASES[phase.rule] ?? phase.rule}` : '等待下一阶段', immediate: String(task.immediateTask ?? task.immediateGoal ?? (0, exports.rec)(task.immediateObjective).description ?? '按当前阶段生成并检查可执行候选。'), detail: '局部目标完成后返回父层，不代表整局已经完成。' };
    }
    const failure = (0, exports.rec)((0, exports.rec)(s.diagnostics).latestFailure), context = (0, exports.rec)(failure.taskContext), last = (0, exports.rec)(s.lastSkillResult);
    if (s.status === 'blocked')
        return { skill: exports.CONTRACTS[String((0, exports.rec)(failure.spec).success)] ?? String(last.skillId ? '最近的局部技能' : '当前技能判断'), phase: reasonText(s.reason), immediate: '查看该次候选、问题上下文与选择器返回结果。', detail: '系统没有改选第二名，也没有隐式切换到规则控制器。' };
    if (s.config.kind === 'judgment')
        return { skill: '固定任务判断', phase: exports.STRATEGIES[s.config.strategy] ?? s.config.strategy, immediate: (0, exports.terminal)(s.status) ? '本次实验已结束，可查看判断与结果。' : '按同一份事实比较当前动作候选。', detail: '问题组织改变，根任务和动作权限不变。' };
    if (active.program || active.mode)
        return { skill: '程序 / 规则控制器', phase: active.subgoal ?? '执行既有策略', immediate: '具体策略与完整证据在判断过程内展开。', detail: '这是参考控制器，不冒充模型执行。' };
    return { skill: (0, exports.terminal)(s.status) ? '本次根任务已结束' : '父层 · 选择局部技能', phase: '等待技能选择', immediate: s.status === 'ready' ? '开始后形成当前可调用的技能候选。' : '上一个子任务已返回；父层根据新状态继续选择。', detail: s.status === 'ready' ? '尚未产生判断证据。' : '局部结果在下方关键过程中保留。' };
}
function unwrap(e) {
    let t = e.type, d = (0, exports.rec)(e.data);
    if (t === 'engine') {
        const ev = (0, exports.rec)(d.event);
        t = String(ev.type ?? 'engine');
        d = (0, exports.rec)(ev.data);
    }
    for (let i = 0; i < 4 && ['parent_event', 'child_event'].includes(t); i++) {
        const ev = (0, exports.rec)(d.event);
        if (!ev.type)
            break;
        t = String(ev.type);
        d = (0, exports.rec)(ev.data);
    }
    return { type: t, data: d };
}
function keyEvents(events, through = Infinity) {
    const out = [];
    const seen = new Set();
    for (const e of events) {
        if (e.seq > through)
            continue;
        const { type: t, data: d } = unwrap(e);
        let title = '', detail = '', tone = 'normal';
        if (t === 'initialization_started') {
            title = '开始开局环境研判';
            detail = '先 G、后 S；使用当前允许观测，不读取参考解。';
        }
        else if (t === 'initialization_ready') {
            title = '初始决策条件已就绪';
            detail = d.policy === 'g-before-action/v054' ? '初始条件已装载为同层试行；实际动作仍由 S 选择，尚不代表成功。' : '初始条件已按当时的运行协议提交；实际结果仍需执行验证。';
        }
        else if (t === 'initialization_invalidated') {
            title = '初始环境已变化，需要重新研判';
            detail = '未应用过期判断，已消耗预算不重置。';
            tone = 'warning';
        }
        else if (t === 'initialization_failed') {
            title = '初始化未完成';
            detail = String(d.reason ?? '未获得可用初始决策条件');
            tone = 'warning';
        }
        else if (t === 'initialization_skipped') {
            title = '起点已是终局，跳过初始化';
            detail = '独立根验收已确定结果，没有多余模型请求。';
        }
        else if (t === 'g_requested') {
            title = d.schema === 'gs/output-repair-request/v1' ? 'G 正在定点修正输出结构' : d.cause === 'initial_environment_review' ? 'G 开始研判初始环境' : 'G 开始调整判断条件';
            detail = `层级 ${d.depth ?? 0} · ${d.cause ?? '处理实际反馈'} · 不使用参考解`;
        }
        else if (t === 'adaptation_committed') {
            title = '新的判断条件已应用';
            detail = d.mode === 'same-layer-first/v054' ? `层级 ${d.depth ?? 0} · 同层试行，上下文 / 候选发生变化，尚不代表实际成功` : `层级 ${d.depth ?? 0} · 历史修订提交，不代表实际成功`;
        }
        else if (t === 'subproblem_enter') {
            title = '展开明确的子问题';
            detail = `深度 ${d.depth ?? 0} · ${(0, exports.rec)(d.task).question ?? ''} · 不操作世界`;
        }
        else if (t === 'subproblem_return') {
            title = (0, exports.rec)(d.result).status === 'answered' ? '子问题返回候选判断' : '子问题未解决，返回原层';
            detail = `${(0, exports.rec)(d.result).reason ?? (0, exports.rec)(d.result).question ?? ''} · 已用预算保留`;
            tone = (0, exports.rec)(d.result).status === 'answered' ? 'normal' : 'warning';
        }
        else if (t === 'same_layer_resumed') {
            title = '原层 G 继续调整';
            detail = '携带子问题结果和失败证据；可改上下文，也可换办法。';
        }
        else if (t === 'meta_enter') {
            title = '展开上层 G/S';
            detail = `层级 ${d.depth ?? 0} · 比较 ${d.candidates ?? 0} 个调整候选`;
        }
        else if (t === 'meta_return') {
            title = '上层返回选择结果';
            detail = `层级 ${d.depth ?? 0} · ${d.result ?? ''}`;
        }
        else if (t === 'proposal_warnings') {
            title = '提案存在声明一致性提醒';
            detail = '仅依声明字段检查，不是参考解评分；候选仍交给 S。';
            tone = 'warning';
        }
        else if (t === 'adaptation_rejected') {
            title = d.category === 'output-format' ? '输出结构未通过（未消耗有效修订额度）' : '调整未被接受';
            detail = String(d.reason ?? '结构或等价性检查');
            tone = 'warning';
        }
        else if (t === 'feedback_review_required') {
            title = '实际反馈触发重新审视';
            detail = String(d.kind ?? '待核查问题');
            tone = 'warning';
        }
        else if (t === 'local_goal_completed') {
            title = '生成的局部目标已达成';
            detail = '来自实际状态检查，不等于根任务成功';
        }
        else if (t === 'run_created') {
            title = '实验已创建';
            detail = '配置固定，尚未执行。';
        }
        else if (t === 'control_transferred') {
            title = '控制权转移';
            detail = `${(0, exports.rec)(d.from).label ?? (0, exports.rec)(d.from).id ?? '原控制者'} → ${(0, exports.rec)(d.to).label ?? (0, exports.rec)(d.to).id ?? '新控制者'}`;
        }
        else if (t === 'command') {
            const a = String(d.action);
            if (!['start', 'pause', 'cancel', 'step'].includes(a))
                continue;
            title = { start: '开始连续运行', pause: '请求在决策边界暂停', cancel: '请求取消', step: '推进一次决策量子' }[a];
            detail = String((0, exports.rec)(d.actor).label ?? (0, exports.rec)(d.actor).id ?? '操作员');
        }
        else if (t === 'skill_generation_started') {
            title = '生成器开始提出技能';
            detail = d.source === 'llm' ? '来源：配置的 LLM' : '来源：本地有限语法搜索';
        }
        else if (t === 'skill_generated') {
            title = '新技能进入试行';
            detail = `${(0, exports.rec)(d.spec).title ?? '局部技能'}；模拟通过不等于实际成功。`;
        }
        else if (t === 'skill_started') {
            title = '父层调用局部技能';
            detail = String((0, exports.rec)(d.spec).title ?? (0, exports.rec)(d.spec).id ?? '技能');
        }
        else if (t === 'skill_summary') {
            title = d.localSucceeded ? '局部目标已完成' : '局部技能已返回';
            detail = `${d.rootSucceeded ? '根任务也已完成' : '根任务仍由独立验收器判断'} · ${(0, exports.rec)(d.outcome).steps ?? 0} 个物理动作${d.reason ? ' · ' + d.reason : ''}`;
            tone = d.localSucceeded ? 'success' : 'warning';
        }
        else if (t === 'decision_audit') {
            title = d.status === 'abstained' ? '选择器返回「不执行」' : d.status === 'error' ? '判断请求出现错误' : '一次判断已返回';
            detail = `${sourceLabel(d.source)} · ${d.choice ?? d.error ?? '未选择候选'}`;
            tone = d.status === 'selected' ? 'normal' : 'warning';
        }
        else if (t === 'transition' && (0, exports.rec)(d.candidate).action?.kind !== 'callSkill' && (0, exports.rec)((0, exports.rec)(d.candidate).action).kind) {
            title = '执行一个物理动作';
            detail = String((0, exports.rec)(d.candidate).description ?? (0, exports.rec)((0, exports.rec)(d.candidate).action).kind);
        }
        else if (t === 'intervention') {
            title = (0, exports.rec)(d.result).ok ? '环境干预已应用' : '环境干预未生效';
            detail = `${d.tool ?? ''} · ${(0, exports.rec)(d.result).message ?? ''}`;
            tone = 'warning';
        }
        else if (t === 'intervention_scheduled') {
            title = '已登记受控干预';
            detail = '实际执行结果另行记录。';
        }
        else if (t === 'checkpoint_created') {
            title = '已保存检查点';
            detail = String(d.label ?? d.id ?? '');
        }
        else if (t === 'proposal_rejected') {
            title = '提案未通过验证';
            detail = String((0, exports.rec)(d.feedback).reason ?? (0, exports.rec)(d.rejection).reason ?? d.reason ?? '展开原始记录查看具体原因');
            tone = 'warning';
        }
        else if (t === 'run_ended') {
            title = exports.STATUS[String(d.status)] ?? '本次实验结束';
            detail = reasonText(d.reason ?? null) || '根验收结果已记录。';
            tone = d.status === 'succeeded' ? 'success' : 'warning';
        }
        if (!title)
            continue;
        const key = `${t}:${JSON.stringify(d)}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({ seq: e.seq, at: e.at, title, detail, tone, raw: e });
    }
    return out;
}
function decisionsFrom(events, s) {
    const found = [];
    const seen = new Set();
    for (const e of events) {
        if (e.seq > s.lastSeq)
            continue;
        const { type, data } = unwrap(e);
        if (type === 'decision_audit') {
            const key = String((0, exports.rec)(data.packet).id ?? JSON.stringify(data));
            if (!seen.has(key)) {
                seen.add(key);
                found.push({ ...data, eventSeq: e.seq });
            }
        }
    }
    const d = (0, exports.rec)(s.lastDecision);
    if (Object.keys(d).length) {
        const p = (0, exports.rec)(d.packet ?? d), key = String(p.id ?? JSON.stringify(d));
        if (!seen.has(key)) {
            if (d.packet)
                found.push(d);
            else {
                const schedule = (0, exports.rec)(s.lastSkillResult);
                let answer;
                if (schedule.snapshotKey === p.id) {
                    for (const e of events) {
                        if (e.seq > s.lastSeq)
                            break;
                        const u = unwrap(e);
                        if (u.type === 'selector_answered' && (0, exports.rec)(u.data.answer).output)
                            answer = (0, exports.rec)((0, exports.rec)(u.data.answer).output);
                    }
                }
                const backend = String((0, exports.rec)((0, exports.list)(schedule.batches)[0]).backend ?? '');
                found.push({ packet: d, status: answer ? (answer.choice ? 'selected' : 'abstained') : 'unreported', choice: answer?.choice, judgment: answer, latencyMs: schedule.elapsedMs, questions: schedule.questions, externalRequests: schedule.externalRequests, source: backend.includes('rule') ? 'authored-rule' : backend.includes('MOCK') ? 'test-provider' : schedule.externalRequests > 0 ? 'configured-model' : '记录来源见原始请求', selectorIdentity: backend, schedule });
            }
        }
    }
    return found;
}
function replayStates(report) {
    const r = (0, exports.rec)(report);
    const frames = [];
    for (const e of (0, exports.list)(r.events)) {
        if (e.type === 'state' && isView(e.data))
            frames.push(structuredClone(e.data));
    }
    if (!frames.length && isView(r.state))
        frames.push(structuredClone(r.state));
    return frames.sort((a, b) => a.lastSeq - b.lastSeq);
}
function isView(raw) { const r = (0, exports.rec)(raw), w = (0, exports.rec)(r.world), c = (0, exports.rec)(r.config), o = (0, exports.rec)(r.owner); return r.schema === 'gs/lab-state/v1' && typeof r.runId === 'string' && Number.isSafeInteger(r.lastSeq) && r.lastSeq >= 0 && typeof r.status === 'string' && ['game', 'judgment'].includes(c.kind) && typeof o.id === 'string' && w.width === 17 && w.height === 11 && Array.isArray(w.terrain) && w.terrain.length === 187 && ['player', 'home'].every(k => Number.isInteger((0, exports.rec)(w[k]).x) && Number.isInteger((0, exports.rec)(w[k]).y)) && ['walls', 'berries', 'guards', 'lures'].every(k => Array.isArray(w[k]) && w[k].length <= 187) && Number.isFinite(w.energy) && Number.isFinite(w.turn); }

}}};const cache=Object.create(null);function load(id){if(cache[id])return cache[id].exports;const d=modules[id],m={exports:{}};cache[id]=m;d.factory(m,m.exports,n=>load(d.deps[n]));return m.exports;}load("src/lab/viewer.js");})();

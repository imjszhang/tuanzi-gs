const obj = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
export const GENERATION_STATUS = { queued: '等待调用 G', connecting: '连接生成器', receiving: '接收生成内容', validating: '检查提案结构', complete: '生成完成 · 待装载与执行验证', invalid: '提案结构未通过', failed: '生成请求失败', aborted: '生成已中断', unavailable: '本地生成器 · 无模型文本' };
export const generationPurpose = (r) => r.purpose === 'output-repair' || r.cause === 'output_format_invalid' ? '格式纠错' : r.purpose === 'initialization' || r.cause === 'initial_environment_review' ? '开局环境研判' : r.purpose === 'subproblem' ? '子问题研判' : '策略生成';
export const generationActive = (r) => ['queued', 'connecting', 'receiving', 'validating'].includes(r.status);
/** Uses the event prefix only: replay cannot see text produced after its selected state. */
export function generationHistory(events, through = Infinity) {
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
            if (typeof d.status === 'string' && Object.hasOwn(GENERATION_STATUS, d.status))
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

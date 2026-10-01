/** Credentials never enter this module or the decision packet. One call = one attempt. */
export function remoteJudgments(token, kind) {
    return { id: kind + '/configured', kind, async ask(input, signal) {
            const r = await fetch('/api/judgment', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gs-token': token }, body: JSON.stringify({ backend: kind, ...input }), signal });
            const data = await r.json();
            if (!r.ok)
                throw Object.assign(Error(data.error ?? `Judgment bridge HTTP ${r.status}`), data.usage ? { usage: data.usage } : {});
            return data;
        } };
}

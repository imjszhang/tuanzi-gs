import { path, dangerous, lureSite } from '../game/world.js';
const W = 866, H = 578, T = 46, OX = (W - 17 * T) / 2, OY = (H - 11 * T) / 2;
const point = (p) => ({ x: OX + (p.x + .5) * T, y: OY + (p.y + .5) * T });
const rnd = (i) => { const s = Math.sin(i * 127.1 + 31.7) * 43758.5453; return s - Math.floor(s); };
export class WorldRenderer {
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
        canvas.addEventListener('pointerdown', e => { if (e.button !== 0)
            return; const p = coord(e); if (p.x >= 0 && p.y >= 0 && p.x < 17 && p.y < 11)
            onClick?.(p); });
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
        const target = a.objective === 'home' ? s.home : a.objective === 'berry' ? s.berries.find(b => b.id === a.targetId) : a.objective === 'lure' ? lureSite(s)?.stand : null;
        this.route = target ? (path(s, s.player, target) ?? []) : [{ x: a.x, y: a.y }];
    }
    dispose() { this.disposed = true; cancelAnimationFrame(this.raf); this.observer.disconnect(); }
    resize() { const r = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2); this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr)); }
    rr(x, y, w, h, r, fill, stroke) { const c = this.ctx; c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = 1;
        c.stroke();
    } }
    ellipse(x, y, rx, ry, fill) { const c = this.ctx; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
    text(t, x, y, size = 11, color = '#697760', weight = 500) { const c = this.ctx; c.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`; c.fillStyle = color; c.textAlign = 'center'; c.fillText(t, x, y); }
    loop = () => { if (this.disposed)
        return; this.frame++; this.draw(); this.raf = requestAnimationFrame(this.loop); };
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
                if (this.showDanger && dangerous(s, p) && tile === 'grass')
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

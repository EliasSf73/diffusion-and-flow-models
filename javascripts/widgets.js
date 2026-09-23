/* Interactive illustrations for the slide deck. Plain canvas, no dependencies.
   Usage in a slide:  <div data-widget="coins"></div>   (options via data-* attributes) */
(function () {
  "use strict";
  window.__errs = [];
  window.addEventListener("error", (e) => window.__errs.push(e.message + " @" + e.lineno));

  const COL = { navy: "#1f2a44", orange: "#c2410c", teal: "#0f766e", grey: "#9ca3af", light: "#dbe7f6", ink: "#4b5563", gold: "#f2c46d", silver: "#cfd3da" };
  const FONT = '"Inter Tight","Helvetica Neue",Arial,sans-serif';

  /* ---------- helpers ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  function Phi(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
  function spiralAt(theta) { const r = 0.15 * theta; return [r * Math.cos(theta), r * Math.sin(theta)]; }
  function G(z1, z2) { const th = 3 * Math.PI * Phi(z1), p = spiralAt(th); let tx = Math.cos(th) - th * Math.sin(th), ty = Math.sin(th) + th * Math.cos(th); const n = Math.hypot(tx, ty) || 1; return [p[0] + 0.06 * z2 * (-ty / n), p[1] + 0.06 * z2 * (tx / n)]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function mk(host, W, H) {
    const cv = document.createElement("canvas"), dpr = Math.max(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    cv.className = "wcanvas"; cv.setAttribute("data-prevent-swipe", ""); host.appendChild(cv);
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr); return { cv, ctx, W, H };
  }
  function pos(cv, W, H, e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  function drag(cv, W, H, onMove) {
    let down = false;
    cv.addEventListener("pointerdown", (e) => { down = true; cv.setPointerCapture(e.pointerId); onMove(pos(cv, W, H, e), "down"); e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => { if (down) onMove(pos(cv, W, H, e), "move"); });
    ["pointerup", "pointercancel"].forEach((t) => cv.addEventListener(t, () => { down = false; }));
    cv.style.cursor = "grab"; cv.style.touchAction = "none";
  }
  function bar(host) { const b = document.createElement("div"); b.className = "wbar"; host.appendChild(b); return b; }
  function button(b, label, fn, cls) { const el = document.createElement("button"); el.type = "button"; el.textContent = label; if (cls) el.className = cls; el.addEventListener("click", () => { fn(el); el.blur(); }); b.appendChild(el); return el; }
  function slider(b, label, min, max, step, val, fn, fmt) {
    const wrap = document.createElement("label"), inp = document.createElement("input"), out = document.createElement("span");
    inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val; out.className = "wval";
    const show = () => { out.textContent = (fmt || ((v) => (+v).toFixed(2)))(inp.value); };
    inp.addEventListener("input", () => { show(); fn(+inp.value); });
    ["pointerup", "change"].forEach((t) => inp.addEventListener(t, () => inp.blur()));
    wrap.append(label + " ", inp, out); b.appendChild(wrap); show();
    return { set(v) { inp.value = v; show(); }, el: wrap };
  }
  function active(host) { const s = host.closest("section"); return !s || s.classList.contains("present") || document.documentElement.classList.contains("print-pdf") || /print-pdf/.test(location.search); }
  function loop(host, step) { let first = true; function f(ts) { if (!host.isConnected) return; if (first || active(host)) { step(ts); first = false; } requestAnimationFrame(f); } requestAnimationFrame(f); }
  function text(ctx, s, x, y, o) { o = o || {}; ctx.font = (o.weight || 500) + " " + Math.round((o.size || 15) * (window.WIDGET_TEXT_SCALE || 1.2)) + "px " + FONT; ctx.fillStyle = o.color || COL.navy; ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "alphabetic"; ctx.fillText(s, x, y); }
  function dot(ctx, x, y, r, c, a) { ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }
  function panel(ctx, x, y, w, h) { ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = COL.navy; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h); }

  const W = {};

  /* ---------- 1. cloud morph: forward noising, or flow from noise to data ---------- */
  W.morph = function (host) {
    const mode = host.dataset.mode || "forward", auto = host.dataset.auto === "1";
    const Wd = +(host.dataset.w || 760), Hd = +(host.dataset.h || 370), { ctx } = mk(host, Wd, Hd);
    const r = rng(7), N = +(host.dataset.n || 1600), X = [], E = [], sc = Hd / (auto ? 4.4 : 6.0), cx = Wd / 2, cy = Hd / 2;
    for (let i = 0; i < N; i++) { const p = spiralAt(3 * Math.PI * r()); X.push([p[0] * 1.35 + 0.04 * gauss(r), p[1] * 1.35 + 0.04 * gauss(r)]); E.push([gauss(r), gauss(r)]); }
    const marked = []; for (let i = 0; i < 14; i++) marked.push(Math.floor(r() * N));
    let t = mode === "flow" ? 0 : 0, target = null, sl;
    function place(i, tt) {
      if (mode === "flow") return [lerp(E[i][0], X[i][0], tt), lerp(E[i][1], X[i][1], tt)];
      const a = Math.cos(tt * Math.PI / 2), s = Math.sin(tt * Math.PI / 2); return [a * X[i][0] + s * E[i][0], a * X[i][1] + s * E[i][1]];
    }
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); if (!auto) panel(ctx, 0.5, 0.5, Wd - 1, Hd - 1);
      const dataLike = mode === "flow" ? t : 1 - t;
      ctx.save(); ctx.beginPath(); ctx.rect(1, 1, Wd - 2, Hd - 2); ctx.clip();
      ctx.fillStyle = dataLike > 0.97 ? COL.navy : COL.ink; ctx.globalAlpha = lerp(0.35, 0.6, dataLike);
      for (let i = 0; i < N; i++) { const p = place(i, t); ctx.fillRect(cx + p[0] * sc - 1.1, cy - p[1] * sc - 1.1, 2.2, 2.2); }
      ctx.globalAlpha = 1; ctx.restore();
      if (mode === "flow") {
        ctx.strokeStyle = COL.orange; ctx.lineWidth = 1.2;
        marked.forEach((i) => { const a = place(i, 0), b = place(i, t); ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.moveTo(cx + a[0] * sc, cy - a[1] * sc); ctx.lineTo(cx + b[0] * sc, cy - b[1] * sc); ctx.stroke(); ctx.globalAlpha = 1; dot(ctx, cx + b[0] * sc, cy - b[1] * sc, 4, COL.orange); });
      }
      if (!auto) {
        if (mode === "flow") { text(ctx, "t = " + t.toFixed(2), 14, 26, { weight: 600 }); text(ctx, t < 0.02 ? "noise" : t > 0.98 ? "data" : "travelling…", 14, 48, { color: COL.ink, size: 14 }); }
        else { text(ctx, "signal × " + Math.cos(t * Math.PI / 2).toFixed(2) + "     noise × " + Math.sin(t * Math.PI / 2).toFixed(2), 14, 26, { weight: 600 }); text(ctx, t < 0.02 ? "data" : t > 0.98 ? "pure noise" : "a bit more noise…", 14, 48, { color: COL.ink, size: 14 }); }
      }
    }
    if (!auto) {
      const b = bar(host);
      if (mode === "flow") { button(b, "▶ release the particles", () => { t = 0; target = 1; }); button(b, "reset", () => { target = null; t = 0; sl.set(0); draw(); }); }
      else { button(b, "▶ add noise", () => { target = 1; }); button(b, "◀ rewind", () => { target = 0; }); }
      sl = slider(b, mode === "flow" ? "time" : "noise level", 0, 1, 0.01, 0, (v) => { target = null; t = v; draw(); });
    }
    let last = 0;
    loop(host, (ts) => {
      const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
      if (auto) { t = 0.5 - 0.5 * Math.cos(ts / 3200); draw(); return; }
      if (target !== null) { const sp = 0.32 * dt * (target > t ? 1 : -1); t = clamp(t + sp, 0, 1); if (Math.abs(t - target) < 0.004) { t = target; target = null; } sl.set(t); draw(); }
    });
    draw();
  };

  /* ---------- 2. coins: sand pushed forward, and repeated tosses ---------- */
  W.coins = function (host) {
    const Wd = 1120, Hd = 420, { ctx } = mk(host, Wd, Hd), r = rng(11);
    const OUT = [{ n: "HH", x: 150, y: 165, v: 2 }, { n: "HT", x: 330, y: 165, v: 1 }, { n: "TH", x: 150, y: 310, v: 1 }, { n: "TT", x: 330, y: 310, v: 0 }];
    const lineY = 335, TX = [700, 850, 1000], PER = 24;
    const slot = (k, cx0, base, cols, gap) => ({ x: cx0 + ((k % cols) - (cols - 1) / 2) * gap, y: base - Math.floor(k / cols) * gap });
    let sand = [], pourAt = null, mode = "sand", toss = [], counts = [0, 0, 0], queue = [], flash = [-1e9, -1e9, -1e9, -1e9], now = 0;
    function reset() {
      sand = []; const used = [0, 0, 0];
      OUT.forEach((o, oi) => { for (let k = 0; k < PER; k++) { const s = slot(k, o.x, o.y - 40, 8, 9); sand.push({ sx: s.x, sy: s.y, v: o.v, delay: r() * 1.4 + oi * 0.15 }); } });
      sand.slice().sort((a, b) => a.delay - b.delay).forEach((g) => { const d = slot(used[g.v]++, TX[g.v], lineY - 12, 8, 9); g.tx = d.x; g.ty = d.y; });
      pourAt = null; toss = []; counts = [0, 0, 0]; queue = [];
    }
    function arc(g, p) { const e = ease(p), mx = (g.sx + g.tx) / 2, my = Math.min(g.sy, g.ty) - 150; const u = 1 - e; return [u * u * g.sx + 2 * u * e * mx + e * e * g.tx, u * u * g.sy + 2 * u * e * my + e * e * g.ty]; }
    function coin(x, y, face) { ctx.fillStyle = face === "H" ? COL.gold : COL.silver; ctx.strokeStyle = COL.navy; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 17, 0, 6.2832); ctx.fill(); ctx.stroke(); text(ctx, face, x, y + 1, { align: "center", base: "middle", weight: 700, size: 16 }); }
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd);
      ctx.fillStyle = COL.light; ctx.strokeStyle = COL.navy; ctx.lineWidth = 1.5; ctx.fillRect(40, 60, 400, 310); ctx.strokeRect(40, 60, 400, 310);
      text(ctx, "outcomes Ω", 52, 84, { size: 15 }); text(ctx, "X = number of heads", 850, 40, { align: "center", size: 17, weight: 600 });
      ctx.strokeStyle = "rgba(194,65,12,0.25)"; ctx.lineWidth = 1.5;
      OUT.forEach((o) => { ctx.beginPath(); ctx.moveTo(o.x + 45, o.y); ctx.quadraticCurveTo((o.x + TX[o.v]) / 2, o.y - 170, TX[o.v], lineY - 6); ctx.stroke(); });
      OUT.forEach((o, i) => { if (now - flash[i] < 350) { ctx.strokeStyle = COL.orange; ctx.lineWidth = 3; ctx.strokeRect(o.x - 48, o.y - 27, 96, 54); } coin(o.x - 20, o.y, o.n[0]); coin(o.x + 20, o.y, o.n[1]); });
      ctx.strokeStyle = COL.navy; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(620, lineY); ctx.lineTo(1085, lineY); ctx.stroke();
      TX.forEach((x, v) => { ctx.beginPath(); ctx.moveTo(x, lineY - 7); ctx.lineTo(x, lineY + 7); ctx.stroke(); text(ctx, String(v), x, lineY + 30, { align: "center", size: 18, weight: 600 }); });
      const tau = pourAt === null ? -1 : (now - pourAt) / 1000, landed = [0, 0, 0];
      sand.forEach((g) => { const p = tau < 0 ? 0 : clamp((tau - g.delay) / 1.1, 0, 1), q = p === 0 ? [g.sx, g.sy] : arc(g, p); if (p === 1) landed[g.v]++; dot(ctx, q[0], q[1], 3.6, COL.navy, mode === "toss" ? 0.18 : 0.9); });
      toss.forEach((g) => { const p = clamp((now - g.t0) / 650, 0, 1), q = arc(g, p); dot(ctx, q[0], q[1], 3.1, COL.orange, 0.95); });
      if (mode === "sand") { const tot = PER * 4; TX.forEach((x, v) => text(ctx, (landed[v] / tot).toFixed(2) + " kg", x, lineY + 54, { align: "center", color: COL.ink, size: 15 })); text(ctx, "one kilogram of sand, a quarter on each outcome", 240, 395, { align: "center", color: COL.ink, size: 14 }); }
      else { const n = counts[0] + counts[1] + counts[2]; TX.forEach((x, v) => text(ctx, n ? (counts[v] / n).toFixed(2) : "–", x, lineY + 54, { align: "center", color: COL.orange, size: 15, weight: 600 })); text(ctx, n + " tosses      exact: 0.25   0.50   0.25", 850, 72, { align: "center", color: COL.ink, size: 14 }); }
    }
    function launch() { const oi = Math.floor(r() * 4), o = OUT[oi], d = slot(counts[o.v]++, TX[o.v], lineY - 12, 10, 7.2); flash[oi] = now; toss.push({ sx: o.x, sy: o.y - 30, tx: d.x, ty: d.y, t0: now }); }
    const b = bar(host);
    button(b, "pour the sand →", () => { mode = "sand"; toss = []; counts = [0, 0, 0]; queue = []; pourAt = now; });
    button(b, "toss once", () => { if (mode !== "toss") { mode = "toss"; pourAt = null; } queue.push(now); });
    button(b, "toss × 100", () => { if (mode !== "toss") { mode = "toss"; pourAt = null; } for (let i = 0; i < 100; i++) queue.push(now + i * 28); });
    button(b, "reset", () => { mode = "sand"; reset(); });
    reset();
    loop(host, (ts) => { now = ts; while (queue.length && queue[0] <= now && counts[0] + counts[1] + counts[2] < 420) { queue.shift(); launch(); } draw(); });
  };

  /* ---------- 3. preimage: drag a region in data space, see which seeds land in it ---------- */
  W.preimage = function (host) {
    const Wd = 1120, Hd = 440, { cv, ctx } = mk(host, Wd, Hd), r = rng(3), N = 3200, Z = [], X = [], two = host.dataset.two === "1";
    for (let i = 0; i < N; i++) { const z = [gauss(r), gauss(r)]; Z.push(z); X.push(G(z[0], z[1])); }
    const L = { x: 20, y: 40, w: 500, h: 385, s: 58 }, R = { x: 600, y: 40, w: 500, h: 385, s: 112 };
    const toL = (p) => [L.x + L.w / 2 + p[0] * L.s, L.y + L.h / 2 - p[1] * L.s], toR = (p) => [R.x + R.w / 2 + p[0] * R.s, R.y + R.h / 2 + 8 - p[1] * R.s];
    const disks = two ? [{ c: [-0.47, 0.0], col: COL.orange, name: "B₁" }, { c: [0.94, 0.0], col: COL.teal, name: "B₂" }] : [{ c: [-0.47, 0.0], col: COL.orange, name: "B" }];
    const rad = 0.22; let grabbed = 0;
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); panel(ctx, L.x, L.y, L.w, L.h); panel(ctx, R.x, R.y, R.w, R.h);
      text(ctx, "outcomes: noise seeds z", L.x + L.w / 2, 26, { align: "center", weight: 600, size: 16 }); text(ctx, "values: x = G(z)      drag the " + (two ? "circles" : "circle"), R.x + R.w / 2, 26, { align: "center", weight: 600, size: 16 });
      const hit = new Uint8Array(N), counts = disks.map(() => 0); let both = 0, any = 0;
      for (let i = 0; i < N; i++) { let m = 0; disks.forEach((d, j) => { if (Math.hypot(X[i][0] - d.c[0], X[i][1] - d.c[1]) < rad) { m |= (1 << j); counts[j]++; } }); hit[i] = m; if (m) any++; if (m === 3) both++; }
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
        if ((hit[i] > 0) !== (pass === 1)) continue;
        const col = hit[i] === 3 ? COL.navy : hit[i] === 2 ? COL.teal : hit[i] === 1 ? COL.orange : COL.grey, rr = pass ? 2.6 : 1.5, al = pass ? 0.95 : 0.45;
        const a = toL(Z[i]), b2 = toR(X[i]);
        if (a[0] > L.x + 2 && a[0] < L.x + L.w - 2 && a[1] > L.y + 2 && a[1] < L.y + L.h - 2) dot(ctx, a[0], a[1], rr, col, al);
        dot(ctx, b2[0], b2[1], rr, col, al);
      }
      disks.forEach((d) => { const cc = toR(d.c); ctx.strokeStyle = d.col; ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.arc(cc[0], cc[1], rad * R.s, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); text(ctx, d.name, cc[0], cc[1] - rad * R.s - 8, { align: "center", color: d.col, weight: 700, size: 17 }); });
      text(ctx, "G", 560, 225, { align: "center", color: COL.navy, weight: 700, size: 22 }); ctx.strokeStyle = COL.navy; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(532, 240); ctx.lineTo(588, 240); ctx.lineTo(580, 234); ctx.moveTo(588, 240); ctx.lineTo(580, 246); ctx.stroke();
      if (!two) {
        text(ctx, "seeds that land in B: " + counts[0] + " of " + N, L.x + 12, L.y + L.h - 14, { color: COL.orange, weight: 600, size: 15 });
        text(ctx, "P(X ∈ B) ≈ " + (counts[0] / N).toFixed(3), R.x + 12, R.y + R.h - 14, { color: COL.orange, weight: 700, size: 17 });
      } else {
        text(ctx, "orange seeds: " + counts[0] + "     teal seeds: " + counts[1] + "     in both: " + both, L.x + 12, L.y + L.h - 14, { color: COL.navy, weight: 600, size: 15 });
        text(ctx, "P(X ∈ B₁) ≈ " + (counts[0] / N).toFixed(3) + "     P(X ∈ B₂) ≈ " + (counts[1] / N).toFixed(3), R.x + 12, R.y + R.h - 38, { color: COL.navy, weight: 600, size: 15 });
        text(ctx, "P(X ∈ B₁ or B₂) ≈ " + (any / N).toFixed(3) + (both === 0 ? "   = sum of the two" : "   < sum: the disks overlap"), R.x + 12, R.y + R.h - 14, { color: both === 0 ? COL.teal : COL.orange, weight: 700, size: 15 });
      }
    }
    drag(cv, Wd, Hd, (p, phase) => {
      if (p.x < R.x) return;
      const q = [(p.x - R.x - R.w / 2) / R.s, -(p.y - R.y - R.h / 2 - 8) / R.s];
      if (phase === "down") { let best = 1e9; disks.forEach((d, j) => { const dd = Math.hypot(q[0] - d.c[0], q[1] - d.c[1]); if (dd < best) { best = dd; grabbed = j; } }); }
      disks[grabbed].c = [clamp(q[0], -2.0, 2.0), clamp(q[1], -1.5, 1.6)]; draw();
    });
    draw();
  };

  /* ---------- 4. channel: the noisy bit as areas; slice and rescale ---------- */
  W.channel = function (host) {
    const Wd = 1120, Hd = 432, { cv, ctx } = mk(host, Wd, Hd); let prior = +(host.dataset.prior || 0.5), flip = 0.2, obs = null;
    const S = 330, ox = 70, oy = 30;
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd);
      const w0 = (1 - prior) * S, w1 = prior * S;
      const cells = [{ x: 0, y: 0, w: w0, h: flip, X: 0, Y: 1 }, { x: 0, y: flip, w: w0, h: 1 - flip, X: 0, Y: 0 }, { x: w0, y: 0, w: w1, h: 1 - flip, X: 1, Y: 1 }, { x: w0, y: 1 - flip, w: w1, h: flip, X: 1, Y: 0 }];
      cells.forEach((c) => { const p = (c.w / S) * c.h, on = obs === null || obs === c.Y; ctx.globalAlpha = on ? 0.85 : 0.12; ctx.fillStyle = c.Y ? COL.orange : COL.teal; ctx.fillRect(ox + c.x, oy + c.y * S, c.w, c.h * S); ctx.globalAlpha = 1; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(ox + c.x, oy + c.y * S, c.w, c.h * S); if (c.w > 46 && c.h * S > 22) text(ctx, p.toFixed(2), ox + c.x + c.w / 2, oy + c.y * S + c.h * S / 2, { align: "center", base: "middle", color: on ? "#fff" : COL.grey, weight: 700, size: 17 }); c.p = p; });
      ctx.strokeStyle = COL.navy; ctx.lineWidth = 1.5; ctx.strokeRect(ox, oy, S, S);
      if (w0 > 40) text(ctx, "sent X = 0", ox + w0 / 2, oy + S + 22, { align: "center", size: 14 }); if (w1 > 40) text(ctx, "sent X = 1", ox + w0 + w1 / 2, oy + S + 22, { align: "center", size: 14 });
      text(ctx, "width: how often sent", ox + S / 2, oy + S + 44, { align: "center", color: COL.ink, size: 12 }); text(ctx, "height: what the wire does", ox + S / 2, oy + S + 62, { align: "center", color: COL.ink, size: 12 });
      const py = [cells[1].p + cells[3].p, cells[0].p + cells[2].p], x0 = 470;
      dot(ctx, x0 + 8, 46, 8, COL.teal); text(ctx, "arrives as Y = 0      total area  P(Y=0) = " + py[0].toFixed(2), x0 + 26, 52, { size: 16 });
      dot(ctx, x0 + 8, 80, 8, COL.orange); text(ctx, "arrives as Y = 1      total area  P(Y=1) = " + py[1].toFixed(2), x0 + 26, 86, { size: 16 });
      if (obs === null) { text(ctx, "Click an observation below.", x0, 160, { size: 17, color: COL.ink }); text(ctx, "Conditioning keeps one colour and rescales it to total 1.", x0, 188, { size: 17, color: COL.ink }); }
      else {
        const a = obs ? cells[0].p : cells[1].p, b2 = obs ? cells[2].p : cells[3].p, tot = a + b2, bw = 590, by = 190, bh = 62, col = obs ? COL.orange : COL.teal;
        text(ctx, "We observed Y = " + obs + ".  Keep that colour, divide by its total " + tot.toFixed(2) + ":", x0, 160, { size: 17, weight: 600 });
        ctx.fillStyle = col; ctx.globalAlpha = 0.45; ctx.fillRect(x0, by, bw * a / tot, bh); ctx.globalAlpha = 0.95; ctx.fillRect(x0 + bw * a / tot, by, bw * b2 / tot, bh); ctx.globalAlpha = 1; ctx.strokeStyle = COL.navy; ctx.strokeRect(x0, by, bw, bh);
        ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x0 + bw * a / tot, by); ctx.lineTo(x0 + bw * a / tot, by + bh); ctx.stroke();
        text(ctx, "P(X=0 | Y=" + obs + ") = " + a.toFixed(2) + " / " + tot.toFixed(2) + " = " + (a / tot).toFixed(2), x0, by + bh + 30, { size: 17 });
        text(ctx, "P(X=1 | Y=" + obs + ") = " + b2.toFixed(2) + " / " + tot.toFixed(2) + " = " + (b2 / tot).toFixed(2), x0, by + bh + 58, { size: 17, weight: 700, color: col });
        const guess = b2 > a ? 1 : 0; text(ctx, "best guess of the sent bit: " + guess + (guess !== obs ? "     (not what the wire said!)" : ""), x0, by + bh + 96, { size: 17, color: guess !== obs ? COL.orange : COL.ink, weight: guess !== obs ? 700 : 500 });
      }
    }
    const b = bar(host);
    button(b, "observe Y = 0", () => { obs = 0; draw(); }); button(b, "observe Y = 1", () => { obs = 1; draw(); }); button(b, "no observation", () => { obs = null; draw(); });
    slider(b, "P(X = 1)", 0.05, 0.95, 0.01, prior, (v) => { prior = v; draw(); }); slider(b, "flip probability", 0.0, 0.5, 0.01, flip, (v) => { flip = v; draw(); });
    draw();
  };

  /* ---------- 5. slice: drag the observed value through the joint ---------- */
  W.slice = function (host) {
    const Wd = 1120, Hd = 440, { cv, ctx } = mk(host, Wd, Hd), r = rng(5), N = 7000; let kind = host.dataset.kind || "gauss", sigma = kind === "two" ? 0.6 : 0.8, y0 = kind === "two" ? 0.5 : 1.5, curve = host.dataset.curve === "1";
    const Xg = [], Xt = [], E = []; for (let i = 0; i < N; i++) { Xg.push(gauss(r)); Xt.push(r() < 0.5 ? -1 : 1); E.push(gauss(r)); }
    const P = { x: 50, y: 12, w: 420, h: 420, s: 420 / 6.6 }, Hh = { x: 560, y: 60, w: 530, h: 210 }, half = 0.09, lim = 3.3;
    const X = () => (kind === "two" ? Xt : Xg), px = (x) => P.x + P.w / 2 + x * P.s, py = (y) => P.y + P.h / 2 - y * P.s, hx = (x) => Hh.x + Hh.w / 2 + x * (Hh.w / (2 * lim));
    function meanAt(y) { const xs = X(); let s = 0, k = 0; for (let i = 0; i < N; i++) if (Math.abs(xs[i] + sigma * E[i] - y) < half) { s += xs[i]; k++; } return k > 10 ? s / k : null; }
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); panel(ctx, P.x, P.y, P.w, P.h); const xs = X();
      ctx.fillStyle = "rgba(194,65,12,0.22)"; ctx.fillRect(P.x, py(y0 + half), P.w, 2 * half * P.s);
      const bins = new Float64Array(44), all = new Float64Array(44); let s = 0, k = 0;
      for (let i = 0; i < N; i++) { const y = xs[i] + sigma * E[i], jit = kind === "two" ? 0.05 * E[(i * 7) % N] : 0, inb = Math.abs(y - y0) < half, bi = Math.floor((xs[i] + lim) / (2 * lim) * 44); if (bi >= 0 && bi < 44) { all[bi]++; if (inb) bins[bi]++; } if (inb) { s += xs[i]; k++; } if (Math.abs(y) < lim && Math.abs(xs[i]) < lim) dot(ctx, px(xs[i] + jit), py(y), inb ? 2.4 : 1.3, inb ? COL.orange : COL.navy, inb ? 0.95 : 0.22); }
      ctx.strokeStyle = COL.orange; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.x, py(y0)); ctx.lineTo(P.x + P.w, py(y0)); ctx.stroke();
      ctx.setLineDash([6, 5]); ctx.strokeStyle = COL.grey; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(px(-lim), py(-lim)); ctx.lineTo(px(lim), py(lim)); ctx.stroke(); ctx.setLineDash([]);
      if (curve) { ctx.strokeStyle = COL.orange; ctx.lineWidth = 3; ctx.beginPath(); let st = false; for (let y = -3.0; y <= 3.0; y += 0.12) { const m = meanAt(y); if (m === null) continue; if (!st) { ctx.moveTo(px(m), py(y)); st = true; } else ctx.lineTo(px(m), py(y)); } ctx.stroke(); }
      const m = k ? s / k : 0; if (k) { ctx.save(); ctx.translate(px(m), py(y0)); ctx.rotate(Math.PI / 4); ctx.fillStyle = COL.orange; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.fillRect(-7, -7, 14, 14); ctx.strokeRect(-7, -7, 14, 14); ctx.restore(); }
      text(ctx, "clean value x", P.x + P.w / 2, P.y + P.h - 8, { align: "center", size: 13, color: COL.ink }); ctx.save(); ctx.translate(P.x - 14, P.y + P.h / 2); ctx.rotate(-Math.PI / 2); text(ctx, "noisy value y      drag the line ↕", 0, 0, { align: "center", size: 13, color: COL.ink }); ctx.restore();
      text(ctx, "y = " + y0.toFixed(2), P.x + 8, py(y0) - 8, { color: COL.orange, weight: 700, size: 15 });
      panel(ctx, Hh.x, Hh.y, Hh.w, Hh.h); text(ctx, "clean values inside the slice, rescaled", Hh.x, Hh.y - 12, { weight: 600, size: 16 });
      const mb = Math.max.apply(null, bins) || 1, ma = Math.max.apply(null, all) || 1, bw = Hh.w / 44;
      for (let j = 0; j < 44; j++) { ctx.fillStyle = "rgba(31,42,68,0.13)"; const ha = all[j] / ma * (Hh.h - 60); ctx.fillRect(Hh.x + j * bw, Hh.y + Hh.h - ha, bw - 1, ha); ctx.fillStyle = "rgba(194,65,12,0.8)"; const hb = bins[j] / mb * (Hh.h - 20); ctx.fillRect(Hh.x + j * bw, Hh.y + Hh.h - hb, bw - 1, hb); }
      if (k) { ctx.strokeStyle = COL.navy; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(hx(m), Hh.y); ctx.lineTo(hx(m), Hh.y + Hh.h); ctx.stroke(); ctx.setLineDash([]); }
      [-3, -2, -1, 0, 1, 2, 3].forEach((v) => text(ctx, String(v), hx(v), Hh.y + Hh.h + 18, { align: "center", size: 12, color: COL.ink }));
      text(ctx, "grey: before observing   ·   orange: after observing y   (" + k + " pts)", Hh.x, Hh.y + Hh.h + 42, { size: 12, color: COL.ink });
      text(ctx, "mean of the slice:   E[X | Y ≈ " + y0.toFixed(2) + "] = " + (k ? m.toFixed(2) : "–"), Hh.x, Hh.y + Hh.h + 78, { size: 18, weight: 700, color: COL.orange });
      if (kind === "gauss") text(ctx, "formula  y / (1 + σ²) = " + (y0 / (1 + sigma * sigma)).toFixed(2), Hh.x, Hh.y + Hh.h + 106, { size: 14, color: COL.navy });
      else text(ctx, "clean value is −1 or +1: the guess slides between", Hh.x, Hh.y + Hh.h + 106, { size: 14, color: COL.navy });
    }
    drag(cv, Wd, Hd, (p) => { if (p.x > P.x + P.w + 30) return; y0 = clamp(-(p.y - P.y - P.h / 2) / P.s, -3.0, 3.0); draw(); });
    const b = bar(host);
    button(b, curve ? "hide the curve of slice means" : "show every slice's mean", (el) => { curve = !curve; el.textContent = curve ? "hide the curve of slice means" : "show every slice's mean"; draw(); });
    button(b, kind === "two" ? "switch to Gaussian clean value" : "switch to two clean values (±1)", (el) => { kind = kind === "two" ? "gauss" : "two"; el.textContent = kind === "two" ? "switch to Gaussian clean value" : "switch to two clean values (±1)"; draw(); });
    slider(b, "noise σ", 0.1, 2.0, 0.05, sigma, (v) => { sigma = v; draw(); });
    draw();
  };

  /* ---------- 6. balance: expectation as the balance point ---------- */
  W.balance = function (host) {
    const Wd = 1120, Hd = 400, { cv, ctx } = mk(host, Wd, Hd); let kind = "bern", par = 0.3, f = 0.62, ang = 0, snap = false, ps;
    const bx0 = 170, bx1 = 950, by = 250;
    const range = () => (kind === "bern" ? [-0.35, 1.35] : kind === "heads" ? [-0.5, 2.5] : [0, 3.2]);
    const mean = () => (kind === "bern" ? par : kind === "heads" ? 1 : 1 / par);
    const toPx = (v) => { const R = range(); return bx0 + (v - R[0]) / (R[1] - R[0]) * (bx1 - bx0); }, toV = (x) => { const R = range(); return R[0] + (x - bx0) / (bx1 - bx0) * (R[1] - R[0]); };
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); const R = range(), m = mean(), fx = toPx(f), bal = Math.abs(f - m) < 0.012 * (R[1] - R[0]);
      ctx.save(); ctx.translate(fx, by); ctx.rotate(ang); ctx.translate(-fx, -by);
      ctx.fillStyle = COL.navy; ctx.fillRect(bx0 - 20, by - 5, bx1 - bx0 + 40, 10);
      if (kind === "exp") { ctx.beginPath(); ctx.moveTo(toPx(0), by - 5); for (let v = 0; v <= R[1]; v += 0.02) ctx.lineTo(toPx(v), by - 5 - 175 * Math.exp(-par * v)); ctx.lineTo(toPx(R[1]), by - 5); ctx.closePath(); ctx.fillStyle = "rgba(31,42,68,0.8)"; ctx.fill(); }
      else { const pm = kind === "bern" ? [[0, 1 - par], [1, par]] : [[0, 0.25], [1, 0.5], [2, 0.25]]; pm.forEach((q) => { const h = q[1] * 230; ctx.fillStyle = "rgba(31,42,68,0.85)"; ctx.fillRect(toPx(q[0]) - 26, by - 5 - h, 52, h); text(ctx, q[1].toFixed(2), toPx(q[0]), by - 12 - h, { align: "center", size: 15, weight: 600 }); }); }
      const ticks = kind === "bern" ? [0, 1] : kind === "heads" ? [0, 1, 2] : [0, 1, 2, 3]; ticks.forEach((v) => text(ctx, String(v), toPx(v), by + 28, { align: "center", size: 17, weight: 600 }));
      ctx.restore();
      ctx.fillStyle = bal ? COL.teal : COL.orange; ctx.beginPath(); ctx.moveTo(fx, by + 6); ctx.lineTo(fx - 26, by + 62); ctx.lineTo(fx + 26, by + 62); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = COL.grey; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(100, by + 63); ctx.lineTo(1020, by + 63); ctx.stroke();
      text(ctx, "fulcrum at " + f.toFixed(2) + (bal ? "      balanced:  E[X] = " + m.toFixed(2) : "      drag the triangle until the beam is level"), Wd / 2, by + 105, { align: "center", size: 19, weight: 700, color: bal ? COL.teal : COL.orange });
      const name = kind === "bern" ? "Bernoulli:  p(1) = θ = " + par.toFixed(2) : kind === "heads" ? "number of heads in two tosses" : "Exponential:  p(x) = λ e^(−λx),   λ = " + par.toFixed(1);
      text(ctx, name, Wd / 2, 26, { align: "center", size: 17, weight: 600 });
    }
    drag(cv, Wd, Hd, (p) => { const R = range(); snap = false; f = clamp(toV(p.x), R[0], R[1]); });
    const b = bar(host);
    const setKind = (k2, p2) => { kind = k2; par = p2; const R = range(); f = R[0] + 0.72 * (R[1] - R[0]); ang = 0; ps.el.style.visibility = k2 === "heads" ? "hidden" : "visible"; ps.set(k2 === "exp" ? (p2 - 0.5) / 3.5 : p2); };
    button(b, "Bernoulli", () => setKind("bern", 0.3)); button(b, "number of heads", () => setKind("heads", 0)); button(b, "exponential", () => setKind("exp", 2));
    ps = slider(b, "parameter", 0.05, 0.95, 0.01, 0.3, (v) => { par = kind === "exp" ? 0.5 + 3.5 * v : v; }, () => (kind === "exp" ? "λ = " + par.toFixed(1) : "θ = " + par.toFixed(2)));
    button(b, "snap to E[X]", () => { snap = true; });
    loop(host, () => { const R = range(), m = mean(); if (snap) { f = lerp(f, m, 0.12); if (Math.abs(f - m) < 0.002) { f = m; snap = false; } } const tgt = clamp((m - f) / (R[1] - R[0]) * 1.6, -0.2, 0.2); ang = lerp(ang, tgt, 0.12); draw(); });
    draw();
  };

  /* ---------- 7. variance: add noise again and again ---------- */
  W.variance = function (host) {
    const Wd = 1120, Hd = 400, { ctx } = mk(host, Wd, Hd), r = rng(9), N = 9000, s = 0.6; let x, x0, k, hist, how;
    function reset() { x = new Float64Array(N); for (let i = 0; i < N; i++) x[i] = (r() < 0.5 ? -0.95 : 0.95) + 0.312 * gauss(r); x0 = Float64Array.from(x); k = 0; hist = [1.0]; how = ""; draw(); }
    function stats(a) { let m = 0, v = 0; for (let i = 0; i < N; i++) m += a[i]; m /= N; for (let i = 0; i < N; i++) v += (a[i] - m) * (a[i] - m); return [m, v / N]; }
    function bins(a) { const B = new Float64Array(120); for (let i = 0; i < N; i++) { const j = Math.floor((a[i] + 6) / 12 * 120); if (j >= 0 && j < 120) B[j]++; } return B; }
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); const X0 = 40, Y0 = 300, Wp = 1040, top = Math.max.apply(null, bins(x0)), B = bins(x), B0 = bins(x0), bw = Wp / 120, st = stats(x), sd = Math.sqrt(st[1]);
      for (let j = 0; j < 120; j++) { ctx.fillStyle = "rgba(194,65,12,0.75)"; const h = B[j] / top * 215; ctx.fillRect(X0 + j * bw, Y0 - h, bw - 0.6, h); }
      ctx.strokeStyle = COL.navy; ctx.lineWidth = 1.6; ctx.beginPath(); for (let j = 0; j < 120; j++) { const h = B0[j] / top * 215; ctx.lineTo(X0 + j * bw, Y0 - h); ctx.lineTo(X0 + (j + 1) * bw, Y0 - h); } ctx.stroke();
      ctx.strokeStyle = COL.navy; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X0 + Wp, Y0); ctx.stroke(); for (let v = -6; v <= 6; v += 2) text(ctx, String(v), X0 + (v + 6) / 12 * Wp, Y0 + 20, { align: "center", size: 13, color: COL.ink });
      const c0 = X0 + Wp / 2, px = Wp / 12; ctx.strokeStyle = COL.orange; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c0 - sd * px, Y0 + 38); ctx.lineTo(c0 + sd * px, Y0 + 38); ctx.stroke(); text(ctx, "± one standard deviation", c0, Y0 + 60, { align: "center", size: 13, color: COL.orange });
      text(ctx, "navy outline: the clean data      orange: after " + k + " noising step" + (k === 1 ? "" : "s") + how, X0, 24, { size: 16, weight: 600 });
      text(ctx, "variance so far:  " + hist.map((v) => v.toFixed(2)).join("  →  "), X0, 52, { size: 17, weight: 700, color: COL.orange });
    }
    function step(vp) { const a = vp ? Math.sqrt(1 - s * s) : 1; for (let i = 0; i < N; i++) x[i] = a * x[i] + s * gauss(r); k++; hist.push(stats(x)[1]); if (hist.length > 9) hist.shift(); how = vp ? "   (shrink, then add)" : "   (plain adding)"; draw(); }
    const b = bar(host);
    button(b, "add noise:   x + σ ε", () => step(false)); button(b, "shrink, then add noise:   √(1−σ²) x + σ ε", () => step(true)); button(b, "reset", reset);
    reset();
  };

  /* ---------- mount ---------- */
  function mountAll() { document.querySelectorAll("[data-widget]").forEach((h) => { if (h.dataset.mounted) return; h.dataset.mounted = "1"; try { (W[h.dataset.widget] || (() => { h.textContent = "unknown widget " + h.dataset.widget; }))(h); } catch (e) { window.__errs.push(h.dataset.widget + ": " + e.message); } }); }
  window.DeckWidgets = { mountAll };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll); else mountAll();
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(mountAll);
})();

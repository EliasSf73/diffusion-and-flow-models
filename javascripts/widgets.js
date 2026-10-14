/* Interactive illustrations for the slide deck. Plain canvas, no dependencies.
   Usage in a slide:  <div data-widget="coins"></div>   (options via data-* attributes) */
(function () {
  "use strict";
  window.__errs = [];
  const BASE = (document.currentScript || {}).src || "";
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

  /* ---------- 8. elbo: move the guess q, watch the bound and the gap ---------- */
  W.elbo = function (host) {
    const Wd = 1120, Hd = 440, { ctx } = mk(host, Wd, Hd), w = 1.0, s = 0.8; let x = 1.5, m = 0.0, sd = 1.0, sm, ss;
    const L = { x: 40, y: 92, w: 600, h: 282 }, zlo = -3.2, zhi = 4.2, ymax = 0.95;
    const zx = (z) => L.x + (z - zlo) / (zhi - zlo) * L.w, dy = (d) => L.y + L.h - Math.min(d, ymax) / ymax * L.h;
    const pdf = (z, mu, v) => Math.exp(-(z - mu) * (z - mu) / (2 * v)) / Math.sqrt(2 * Math.PI * v);
    function vals() {
      const vx = w * w + s * s, logpx = -0.5 * Math.log(2 * Math.PI * vx) - x * x / (2 * vx), pm = w * x / vx, pv = s * s / vx, v = sd * sd;
      const rec = -0.5 * Math.log(2 * Math.PI * s * s) - ((x - w * m) * (x - w * m) + w * w * v) / (2 * s * s), klp = 0.5 * (v + m * m - 1 - Math.log(v));
      const gap = 0.5 * (Math.log(pv / v) + (v + (m - pm) * (m - pm)) / pv - 1);
      return { logpx, pm, pv, rec, klp, elbo: rec - klp, gap };
    }
    function curve(mu, v, col, lw, fill, dash) {
      ctx.beginPath(); for (let i = 0; i <= 300; i++) { const z = zlo + (zhi - zlo) * i / 300, X = zx(z), Y = dy(pdf(z, mu, v)); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
      if (fill) { ctx.lineTo(zx(zhi), dy(0)); ctx.lineTo(zx(zlo), dy(0)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
      ctx.setLineDash(dash || []); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]);
    }
    function draw() {
      const V = vals(); ctx.clearRect(0, 0, Wd, Hd); panel(ctx, L.x, L.y, L.w, L.h);
      ctx.save(); ctx.beginPath(); ctx.rect(L.x, L.y, L.w, L.h); ctx.clip();
      curve(0, 1, COL.grey, 1.8, null, [6, 5]); curve(V.pm, V.pv, COL.navy, 2.2, "rgba(31,42,68,0.14)"); curve(m, sd * sd, COL.orange, 3);
      ctx.restore();
      for (let z = -3; z <= 4; z++) text(ctx, String(z), zx(z), L.y + L.h + 18, { align: "center", size: 12, color: COL.ink });
      text(ctx, "latent z", L.x + L.w / 2, L.y + L.h + 38, { align: "center", size: 12, color: COL.ink });
      text(ctx, "we observed x = " + x.toFixed(2), L.x, 26, { weight: 700, size: 15 });
      const leg = (x0, y0, col, dash, lw, label, wt) => { ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 30, y0); ctx.stroke(); ctx.setLineDash([]); text(ctx, label, x0 + 38, y0 + 5, { size: 12, color: col, weight: wt || 500 }); };
      leg(L.x, 54, COL.grey, [6, 5], 2, "prior p(z)"); leg(L.x + 190, 54, COL.navy, [], 2.2, "true posterior p(z | x)");
      leg(L.x, 76, COL.orange, [], 3, "proxy q(z) = N(" + m.toFixed(2) + ", " + sd.toFixed(2) + "²)", 700);
      // right: number line for log-likelihood, bound and gap
      const A = { x: 690, w: 400, y: 150 }, lo = -7, hi = -1, ax = (u) => A.x + (clamp(u, lo, hi) - lo) / (hi - lo) * A.w;
      text(ctx, "log p(x), the bound, and the gap", A.x, 60, { weight: 700, size: 15 });
      ctx.strokeStyle = COL.navy; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(A.x + A.w, A.y); ctx.stroke();
      for (let u = lo; u <= hi; u++) { ctx.beginPath(); ctx.moveTo(ax(u), A.y - 5); ctx.lineTo(ax(u), A.y + 5); ctx.stroke(); text(ctx, String(u), ax(u), A.y + 24, { align: "center", size: 12, color: COL.ink }); }
      ctx.strokeStyle = COL.navy; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax(V.logpx), A.y - 46); ctx.lineTo(ax(V.logpx), A.y + 8); ctx.stroke(); text(ctx, "log p(x)", ax(V.logpx), A.y - 52, { align: "center", size: 12, color: COL.navy, weight: 700 });
      ctx.fillStyle = "rgba(15,118,110,0.25)"; ctx.fillRect(ax(V.elbo), A.y - 26, ax(V.logpx) - ax(V.elbo), 20);
      dot(ctx, ax(V.elbo), A.y - 16, 9, COL.orange); text(ctx, V.elbo < lo ? "◀ ELBO" : "ELBO", ax(V.elbo), A.y - 34, { align: "center", size: 12, color: COL.orange, weight: 700 });
      let y = 222; const row = (label, val, col, wt) => { text(ctx, label, A.x, y, { size: 14, color: col, weight: wt || 500 }); text(ctx, val.toFixed(3), A.x + A.w, y, { size: 14, color: col, weight: 700, align: "right" }); y += 27; };
      row("reconstruction  E_q[log p(x|z)]", V.rec, COL.ink); row("−  KL( q ‖ prior )", -V.klp, COL.ink);
      ctx.strokeStyle = COL.grey; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A.x, y - 18); ctx.lineTo(A.x + A.w, y - 18); ctx.stroke(); y += 4;
      row("=  ELBO", V.elbo, COL.orange, 700); row("+  gap  KL( q ‖ true posterior )", V.gap, COL.teal, 700);
      ctx.beginPath(); ctx.moveTo(A.x, y - 18); ctx.lineTo(A.x + A.w, y - 18); ctx.stroke(); y += 4;
      row("=  log p(x)   (does not depend on q)", V.logpx, COL.navy, 700);
      if (V.gap < 0.002) text(ctx, "gap closed: q is the true posterior, the bound is tight", A.x, y + 6, { size: 13, color: COL.teal, weight: 700 });
    }
    const b = bar(host);
    sm = slider(b, "mean of q", -2, 3.5, 0.01, m, (v) => { m = v; draw(); }); ss = slider(b, "std of q", 0.15, 2, 0.01, sd, (v) => { sd = v; draw(); });
    slider(b, "observed x", -2.5, 2.5, 0.05, x, (v) => { x = v; draw(); });
    button(b, "set q to the true posterior", () => { const V = vals(); m = V.pm; sd = Math.sqrt(V.pv); sm.set(m); ss.set(sd); draw(); });
    button(b, "set q to the prior", () => { m = 0; sd = 1; sm.set(m); ss.set(sd); draw(); });
    draw();
  };

  /* ---------- 9. jensen: points on a curved function; f(average) vs average of f ---------- */
  W.jensen = function (host) {
    const Wd = 1120, Hd = 450, { cv, ctx } = mk(host, Wd, Hd);
    const MODES = {
      log: { f: Math.log, fp: (u) => 1 / u, lo: 0.15, hi: 6.2, flo: -2.1, fhi: 2.1, concave: true, name: "f(u) = log u", start: [1, 4] },
      sq: { f: (u) => u * u, fp: (u) => 2 * u, lo: -3, hi: 3, flo: -1, fhi: 9.5, concave: false, name: "f(u) = u²", start: [-1.5, 2.5] },
      exp: { f: Math.exp, fp: Math.exp, lo: -2.5, hi: 2.3, flo: -1, fhi: 10, concave: false, name: "f(u) = eᵘ", start: [-1.5, 2] },
    };
    const P = { x: 60, y: 28, w: 640, h: 340 };
    let mode = "log", M = MODES.log, us = M.start.slice(), tan = false, grab = 0, tanBtn;
    const X = (u) => P.x + (u - M.lo) / (M.hi - M.lo) * P.w, Y = (f) => P.y + P.h - (f - M.flo) / (M.fhi - M.flo) * P.h, U = (x) => M.lo + (x - P.x) / P.w * (M.hi - M.lo);
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); panel(ctx, P.x, P.y, P.w, P.h);
      const n = us.length, ub = us.reduce((a, b) => a + b, 0) / n, fs = us.map(M.f), fb = fs.reduce((a, b) => a + b, 0) / n, fub = M.f(ub);
      ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
      if (M.flo < 0 && M.fhi > 0) { ctx.strokeStyle = "rgba(31,42,68,0.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.x, Y(0)); ctx.lineTo(P.x + P.w, Y(0)); ctx.stroke(); }
      ctx.strokeStyle = COL.navy; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i <= 400; i++) { const u = M.lo + (M.hi - M.lo) * i / 400, yy = Y(M.f(u)); if (i) ctx.lineTo(X(u), yy); else ctx.moveTo(X(u), yy); } ctx.stroke();
      const srt = us.map((u) => [u, M.f(u)]).sort((a, b) => a[0] - b[0]);
      ctx.fillStyle = "rgba(194,65,12,0.10)"; ctx.strokeStyle = "rgba(194,65,12,0.7)"; ctx.lineWidth = 1.6; ctx.beginPath();
      srt.forEach((q, i) => { if (i) ctx.lineTo(X(q[0]), Y(q[1])); else ctx.moveTo(X(q[0]), Y(q[1])); }); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (tan) { const sl = M.fp(ub); ctx.setLineDash([8, 6]); ctx.strokeStyle = COL.teal; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(X(M.lo), Y(fub + sl * (M.lo - ub))); ctx.lineTo(X(M.hi), Y(fub + sl * (M.hi - ub))); ctx.stroke(); ctx.setLineDash([]); }
      us.forEach((u) => { ctx.setLineDash([3, 4]); ctx.strokeStyle = COL.grey; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(u), P.y + P.h); ctx.lineTo(X(u), Y(M.f(u))); ctx.stroke(); ctx.setLineDash([]); dot(ctx, X(u), Y(M.f(u)), 6, COL.navy); });
      ctx.setLineDash([3, 4]); ctx.strokeStyle = COL.orange; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X(ub), P.y + P.h); ctx.lineTo(X(ub), Math.min(Y(fb), Y(fub))); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = COL.teal; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(X(ub), Y(fb)); ctx.lineTo(X(ub), Y(fub)); ctx.stroke();
      dot(ctx, X(ub), Y(fub), 8, COL.navy); dot(ctx, X(ub), Y(fub), 4, "#fff");
      ctx.save(); ctx.translate(X(ub), Y(fb)); ctx.rotate(Math.PI / 4); ctx.fillStyle = COL.orange; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.fillRect(-8, -8, 16, 16); ctx.strokeRect(-8, -8, 16, 16); ctx.restore();
      ctx.restore();
      us.forEach((u, i) => { const x0 = X(u), y0 = P.y + P.h + 4; ctx.fillStyle = COL.navy; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - 9, y0 + 15); ctx.lineTo(x0 + 9, y0 + 15); ctx.closePath(); ctx.fill(); text(ctx, "u" + "₁₂₃₄₅₆"[i], x0, y0 + 32, { align: "center", size: 12, color: COL.navy }); });
      ctx.fillStyle = COL.orange; ctx.beginPath(); ctx.moveTo(X(ub), P.y + P.h + 4); ctx.lineTo(X(ub) - 7, P.y + P.h + 16); ctx.lineTo(X(ub) + 7, P.y + P.h + 16); ctx.closePath(); ctx.fill();
      text(ctx, "drag the ▲ handles under the plot", P.x + 6, P.y + P.h + 62, { size: 12, color: COL.ink });
      const R = 740; let y = 50; const line = (str, col, wt, sz) => { text(ctx, str, R, y, { size: sz || 14, color: col || COL.navy, weight: wt || 500 }); y += (sz || 14) * 1.95; };
      line(M.name + (M.concave ? "   (concave)" : "   (convex)"), COL.navy, 700, 15);
      line(n + " equally likely values of U", COL.ink);
      line("E[U] = average of the u's = " + ub.toFixed(3), COL.orange, 600);
      line("● f(E[U]) = " + fub.toFixed(3) + "    f of the average", COL.navy, 700);
      line("◆ E[f(U)] = " + fb.toFixed(3) + "    average of the f's", COL.orange, 700);
      line("gap = " + Math.abs(fub - fb).toFixed(3), COL.teal, 700);
      y += 6; line(M.concave ? "concave:   f(E[U])  ≥  E[f(U)]" : "convex:   f(E[U])  ≤  E[f(U)]", COL.navy, 700, 15);
      if (mode === "sq") line("here the gap is exactly the variance of U", COL.teal, 600, 13);
      if (mode === "log" && n === 2) { line("exponentiate both sides:", COL.ink, 500, 12); line("arithmetic mean " + ub.toFixed(2) + "  ≥  geometric mean " + Math.exp(fb).toFixed(2), COL.ink, 500, 12); }
      if (Math.abs(fub - fb) < 1e-3) line("all points coincide: equality", COL.teal, 700, 13);
    }
    drag(cv, Wd, Hd, (p, phase) => {
      if (phase === "down") { let best = 1e9; us.forEach((u, i) => { const d = Math.abs(X(u) - p.x); if (d < best) { best = d; grab = i; } }); if (best > 60 || p.x > P.x + P.w + 20) { grab = -1; return; } }
      if (grab < 0) return; us[grab] = clamp(U(p.x), M.lo + 0.03, M.hi - 0.03); draw();
    });
    const b = bar(host);
    const setMode = (k) => { mode = k; M = MODES[k]; us = M.start.slice(); draw(); };
    button(b, "f = log u", () => setMode("log")); button(b, "f = u²", () => setMode("sq")); button(b, "f = eᵘ", () => setMode("exp"));
    button(b, "+ point", () => { if (us.length < 6) { const k = us.length; us.push(M.lo + (M.hi - M.lo) * [0.5, 0.3, 0.82, 0.12, 0.65, 0.95][k % 6]); draw(); } });
    button(b, "− point", () => { if (us.length > 2) { us.pop(); draw(); } });
    tanBtn = button(b, "show the tangent line (the proof)", (el) => { tan = !tan; el.textContent = tan ? "hide the tangent line" : "show the tangent line (the proof)"; draw(); });
    draw();
  };

  /* ---------- 10. kl: a target p and a Gaussian guess q; both directions of KL ---------- */
  W.kl = function (host) {
    const Wd = 1120, Hd = 470, { ctx } = mk(host, Wd, Hd), N = 700, z0 = -7, z1 = 7, dz = (z1 - z0) / (N - 1);
    const Z = Array.from({ length: N }, (_, i) => z0 + i * dz), LN = (z, m, v) => -0.5 * Math.log(2 * Math.PI * v) - (z - m) * (z - m) / (2 * v);
    const lse = (a, b) => { const mx = Math.max(a, b); return mx + Math.log(Math.exp(a - mx) + Math.exp(b - mx)); };
    const only = host.dataset.only === "qp"; let target = "one", qm = -1.5, qs = 0.8, sm, ss;
    const logp = (z) => target === "one" ? LN(z, 1, 1) : lse(Math.log(0.5) + LN(z, -2, 0.25), Math.log(0.5) + LN(z, 2, 0.25));
    let LP = Z.map(logp);
    function kls(m, sd, step) { let a = 0, b = 0; const v = sd * sd; for (let i = 0; i < N; i += step) { const lq = LN(Z[i], m, v), lp = LP[i]; a += Math.exp(lq) * (lq - lp); b += Math.exp(lp) * (lp - lq); } return [a * dz * step, b * dz * step]; }
    const P1 = { x: 50, y: 52, w: 640, h: 220 }, P2 = { x: 50, y: 318, w: 640, h: 120 }, ymax = 0.95, X = (z) => P1.x + (z - z0) / (z1 - z0) * P1.w;
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); panel(ctx, P1.x, P1.y, P1.w, P1.h); panel(ctx, P2.x, P2.y, P2.w, P2.h);
      const v = qs * qs, LQ = Z.map((z) => LN(z, qm, v)), Y1 = (d) => P1.y + P1.h - Math.min(d, ymax) / ymax * P1.h;
      ctx.save(); ctx.beginPath(); ctx.rect(P1.x, P1.y, P1.w, P1.h); ctx.clip();
      ctx.beginPath(); Z.forEach((z, i) => { const yy = Y1(Math.exp(LP[i])); if (i) ctx.lineTo(X(z), yy); else ctx.moveTo(X(z), yy); }); ctx.lineTo(X(z1), Y1(0)); ctx.lineTo(X(z0), Y1(0)); ctx.closePath(); ctx.fillStyle = "rgba(31,42,68,0.16)"; ctx.fill();
      ctx.beginPath(); Z.forEach((z, i) => { const yy = Y1(Math.exp(LP[i])); if (i) ctx.lineTo(X(z), yy); else ctx.moveTo(X(z), yy); }); ctx.strokeStyle = COL.navy; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.beginPath(); Z.forEach((z, i) => { const yy = Y1(Math.exp(LQ[i])); if (i) ctx.lineTo(X(z), yy); else ctx.moveTo(X(z), yy); }); ctx.strokeStyle = COL.orange; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      const leg = (x0, col, lw, label) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, 30); ctx.lineTo(x0 + 28, 30); ctx.stroke(); text(ctx, label, x0 + 36, 35, { size: 12, color: col, weight: 600 }); };
      leg(P1.x, COL.navy, 2.2, target === "one" ? "target p = N(1, 1)" : "target p: two bumps at −2 and +2"); leg(P1.x + 330, COL.orange, 3, "proxy q = N(" + qm.toFixed(2) + ", " + qs.toFixed(2) + "²)");
      // integrand of KL(q||p)
      const I = Z.map((z, i) => Math.exp(LQ[i]) * (LQ[i] - LP[i])); let mx = 0.25; I.forEach((t) => { if (Math.abs(t) > mx) mx = Math.abs(t); });
      const y0 = P2.y + P2.h / 2, Y2 = (t) => y0 - t / mx * (P2.h / 2 - 6);
      ctx.save(); ctx.beginPath(); ctx.rect(P2.x, P2.y, P2.w, P2.h); ctx.clip();
      for (let i = 0; i < N - 1; i++) { ctx.fillStyle = I[i] >= 0 ? "rgba(194,65,12,0.55)" : "rgba(15,118,110,0.55)"; ctx.fillRect(X(Z[i]), Math.min(y0, Y2(I[i])), X(Z[i + 1]) - X(Z[i]) + 0.5, Math.abs(Y2(I[i]) - y0)); }
      ctx.strokeStyle = "rgba(31,42,68,0.4)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P2.x, y0); ctx.lineTo(P2.x + P2.w, y0); ctx.stroke(); ctx.restore();
      text(ctx, "q(z) · log( q(z) / p(z) ):  the area is KL(q ‖ p).  orange adds, teal subtracts", P2.x, P2.y - 9, { size: 12, color: COL.ink });
      for (let z = -6; z <= 6; z += 2) text(ctx, String(z), X(z), P2.y + P2.h + 17, { align: "center", size: 12, color: COL.ink });
      const k = kls(qm, qs, 1), R = 735; let y = 66; const line = (str, col, wt, sz) => { text(ctx, str, R, y, { size: sz || 14, color: col || COL.navy, weight: wt || 500 }); y += (sz || 14) * 1.9; };
      text(ctx, "KL( q ‖ p ) = " + k[0].toFixed(3), R, y, { size: 17, color: COL.orange, weight: 700 }); text(ctx, "average over q of log(q/p)", R, y + 24, { size: 11, color: COL.ink }); y += 70;
      if (!only) { text(ctx, "KL( p ‖ q ) = " + k[1].toFixed(3), R, y, { size: 17, color: COL.navy, weight: 700 }); text(ctx, "average over p of log(p/q)", R, y + 24, { size: 11, color: COL.ink }); y += 74; } else y += 6;
      if (target === "one") { const cf = (m1, v1, m2, v2) => 0.5 * (Math.log(v2 / v1) + (v1 + (m1 - m2) * (m1 - m2)) / v2 - 1); line(only ? "closed form (Gaussian formula):  " + cf(qm, v, 1, 1).toFixed(3) : "closed form:  " + cf(qm, v, 1, 1).toFixed(3) + "  and  " + cf(1, 1, qm, v).toFixed(3), COL.ink, 500, 12); }
      if (only) { line("never negative, and 0 only when q = p", COL.ink, 500, 12);
        if (target === "two") { y += 6; line("no Gaussian can match two bumps.", COL.navy, 600, 12); line("where q has mass and p has none,", COL.ink, 500, 12); line("log(q/p) is huge, so q avoids the valley", COL.ink, 500, 12); line("and settles on one bump: mode-seeking", COL.orange, 700, 12); } }
      else { line("both are ≥ 0, and 0 only when q = p", COL.ink, 500, 12); line("in general they are different numbers", COL.ink, 500, 12);
        if (target === "two") { y += 4; line("KL(q‖p) is happiest with q inside one bump", COL.orange, 600, 12); line("KL(p‖q) wants q to cover both bumps", COL.navy, 600, 12); } }
    }
    function minimise(dir) { let best = [1e9, qm, qs]; for (let m = -3.5; m <= 3.5001; m += 0.05) for (let sd = 0.2; sd <= 3.0001; sd += 0.025) { const k = kls(m, sd, 2)[dir]; if (k < best[0]) best = [k, m, sd]; } qm = best[1]; qs = best[2]; sm.set(qm); ss.set(qs); draw(); }
    const b = bar(host);
    button(b, "target: one bump", () => { target = "one"; LP = Z.map(logp); draw(); }); button(b, "target: two bumps", () => { target = "two"; LP = Z.map(logp); draw(); });
    sm = slider(b, "mean of q", -4, 4, 0.01, qm, (v) => { qm = v; draw(); }); ss = slider(b, "std of q", 0.2, 3, 0.01, qs, (v) => { qs = v; draw(); });
    button(b, "minimise KL(q ‖ p)", () => minimise(0)); if (!only) button(b, "minimise KL(p ‖ q)", () => minimise(1));
    draw();
  };

  /* ---------- 11. chain: the forward Markov chain, one step at a time ---------- */
  W.chain = function (host) {
    const Wd = 1120, Hd = 440, { ctx } = mk(host, Wd, Hd), r = rng(21), N = 1400, X0 = [], sc = 62;
    for (let i = 0; i < N; i++) { const q = spiralAt(3 * Math.PI * r()); X0.push([q[0] * 1.35 + 0.03 * gauss(r), q[1] * 1.35 + 0.03 * gauss(r)]); }
    const tracked = [40, 260, 480, 700, 920, 1140, 1330], P = { x: 30, y: 20, w: 560, h: 400 }, cx = P.x + P.w / 2, cy = P.y + P.h / 2;
    let X, t, beta = 0.05, paths, pending = 0, v0;
    const variance = () => { let mx = 0, my = 0, v = 0; X.forEach((q) => { mx += q[0]; my += q[1]; }); mx /= N; my /= N; X.forEach((q) => { v += (q[0] - mx) * (q[0] - mx) + (q[1] - my) * (q[1] - my); }); return v / (2 * N); };
    function reset() { X = X0.map((q) => q.slice()); t = 0; paths = tracked.map((i) => [X[i].slice()]); pending = 0; v0 = variance(); }
    function stepOnce() { const a = Math.sqrt(1 - beta), sd = Math.sqrt(beta); for (let i = 0; i < N; i++) { X[i][0] = a * X[i][0] + sd * gauss(r); X[i][1] = a * X[i][1] + sd * gauss(r); } t++; tracked.forEach((i, k) => { paths[k].push(X[i].slice()); if (paths[k].length > 60) paths[k].shift(); }); }
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); panel(ctx, P.x, P.y, P.w, P.h);
      ctx.save(); ctx.beginPath(); ctx.rect(P.x + 1, P.y + 1, P.w - 2, P.h - 2); ctx.clip();
      ctx.fillStyle = COL.navy; ctx.globalAlpha = 0.4; X.forEach((q) => ctx.fillRect(cx + q[0] * sc - 1.2, cy - q[1] * sc - 1.2, 2.4, 2.4)); ctx.globalAlpha = 1;
      paths.forEach((pa) => { ctx.strokeStyle = COL.orange; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.8; ctx.beginPath(); pa.forEach((q, i) => { if (i) ctx.lineTo(cx + q[0] * sc, cy - q[1] * sc); else ctx.moveTo(cx + q[0] * sc, cy - q[1] * sc); }); ctx.stroke(); ctx.globalAlpha = 1; const q = pa[pa.length - 1]; dot(ctx, cx + q[0] * sc, cy - q[1] * sc, 4.5, COL.orange); });
      ctx.restore();
      const R = 630; let y = 52; const line = (str, col, wt, sz) => { text(ctx, str, R, y, { size: sz || 14, color: col || COL.navy, weight: wt || 500 }); y += (sz || 14) * 2.0; };
      line("step  t = " + t, COL.navy, 700, 19);
      line("one step:   x  ←  √(1−β) · x  +  √β · ε", COL.navy, 600); line("with fresh noise ε every time,  β = " + beta.toFixed(3), COL.ink, 500, 12);
      y += 6; line("shrink factor per step:  √(1−β) = " + Math.sqrt(1 - beta).toFixed(4), COL.ink);
      line("original signal left after t steps:  " + Math.pow(1 - beta, t / 2).toFixed(3), COL.orange, 700);
      line("variance of the cloud:  " + variance().toFixed(3) + "   (started at " + v0.toFixed(3) + ")", COL.teal, 700);
      y += 6; line("the orange dots are seven particles and their recent paths", COL.ink, 500, 12);
      line("each step looks only at where the particle is now", COL.ink, 500, 12);
      if (Math.pow(1 - beta, t / 2) < 0.02) line("the cloud no longer remembers the spiral", COL.teal, 700, 13);
    }
    const b = bar(host);
    button(b, "one step", () => { pending += 1; }); button(b, "10 steps", () => { pending += 10; }); button(b, "100 steps", () => { pending += 100; });
    button(b, "reset", () => { reset(); draw(); });
    slider(b, "β (noise per step)", 0.005, 0.3, 0.005, beta, (v) => { beta = v; draw(); }, (v) => (+v).toFixed(3));
    reset();
    loop(host, () => { if (pending > 0) { const k = pending > 30 ? 3 : 1; for (let j = 0; j < k && pending > 0; j++) { stepOnce(); pending--; } draw(); } });
    draw();
  };

  /* ---------- 12. posterior: one step back, knowing the start ---------- */
  W.posterior = function (host) {
    const Wd = 1120, Hd = 450, { ctx } = mk(host, Wd, Hd), T = 10, be = [], al = [], ab = [];
    for (let i = 0; i < T; i++) { be.push(0.05 + (0.6 - 0.05) * i / (T - 1)); al.push(1 - be[i]); ab.push((i ? ab[i - 1] : 1) * al[i]); }
    let t = 6, x0 = 1.5, xt = 0.2; const P = { x: 40, y: 96, w: 610, h: 290 }, lo = -3.5, hi = 3.5;
    const X = (u) => P.x + (u - lo) / (hi - lo) * P.w, pdf = (u, m, v) => Math.exp(-(u - m) * (u - m) / (2 * v)) / Math.sqrt(2 * Math.PI * v);
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); panel(ctx, P.x, P.y, P.w, P.h);
      const a = al[t - 1], b = be[t - 1], abt = ab[t - 1], abp = ab[t - 2];
      const m1 = xt / Math.sqrt(a), v1 = b / a, m2 = Math.sqrt(abp) * x0, v2 = 1 - abp, v = 1 / (1 / v1 + 1 / v2), m = v * (m1 / v1 + m2 / v2);
      const wx = Math.sqrt(a) * (1 - abp) / (1 - abt), w0 = Math.sqrt(abp) * b / (1 - abt);
      const ymax = 1.15 * Math.max(pdf(0, 0, v), pdf(0, 0, v1), pdf(0, 0, v2)), Y = (d) => P.y + P.h - Math.min(d, ymax) / ymax * P.h;
      const curve = (mu, va, col, lw, fill, dash) => { ctx.beginPath(); for (let i = 0; i <= 400; i++) { const u = lo + (hi - lo) * i / 400; if (i) ctx.lineTo(X(u), Y(pdf(u, mu, va))); else ctx.moveTo(X(u), Y(pdf(u, mu, va))); } if (fill) { ctx.lineTo(X(hi), Y(0)); ctx.lineTo(X(lo), Y(0)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); } ctx.setLineDash(dash || []); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]); };
      ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
      curve(m2, v2, COL.navy, 2, null, [7, 5]); curve(m1, v1, COL.teal, 2.2); curve(m, v, COL.orange, 3, "rgba(194,65,12,0.16)");
      ctx.restore();
      for (let u = -3; u <= 3; u++) text(ctx, String(u), X(u), P.y + P.h + 18, { align: "center", size: 12, color: COL.ink });
      text(ctx, "x at step t−1", P.x + P.w / 2, P.y + P.h + 40, { align: "center", size: 12, color: COL.ink });
      const leg = (y0, col, dash, lw, label, wt) => { ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(P.x, y0); ctx.lineTo(P.x + 30, y0); ctx.stroke(); ctx.setLineDash([]); text(ctx, label, P.x + 38, y0 + 5, { size: 12, color: col, weight: wt || 500 }); };
      leg(26, COL.navy, [7, 5], 2, "what the start says:  centre √ᾱ·x₀ = " + m2.toFixed(2) + ",  variance " + v2.toFixed(3));
      leg(48, COL.teal, [], 2.2, "what the next point says:  centre x_t / √α = " + m1.toFixed(2) + ",  variance " + v1.toFixed(3));
      leg(70, COL.orange, [], 3, "both together:  centre " + m.toFixed(3) + ",  variance " + v.toFixed(4), 700);
      const R = 680; let y = 120; const line = (str, col, wt, sz) => { text(ctx, str, R, y, { size: sz || 14, color: col || COL.navy, weight: wt || 500 }); y += (sz || 14) * 2.0; };
      line("step t = " + t + "    (T = 10)", COL.navy, 700, 17);
      line("β = " + b.toFixed(3) + "    ᾱ now = " + abt.toFixed(3) + "    ᾱ before = " + abp.toFixed(3), COL.ink, 500, 11);
      y += 6; line("mean = " + wx.toFixed(3) + " · x_t  +  " + w0.toFixed(3) + " · x₀", COL.orange, 700);
      line("= " + wx.toFixed(3) + "·(" + xt.toFixed(2) + ") + " + w0.toFixed(3) + "·(" + x0.toFixed(2) + ") = " + m.toFixed(3), COL.orange, 500, 12);
      line("variance  β̃_t = " + v.toFixed(4), COL.orange, 700);
      line("smaller than either source alone:", COL.ink, 500, 12); line("1/" + v.toFixed(3) + " = 1/" + v1.toFixed(3) + " + 1/" + v2.toFixed(3), COL.ink, 500, 12);
    }
    const b = bar(host);
    slider(b, "step t", 2, T, 1, t, (v) => { t = v; draw(); }, (v) => String(+v)); slider(b, "noisy point x_t", -3, 3, 0.05, xt, (v) => { xt = v; draw(); }); slider(b, "data point x₀", -2, 2, 0.05, x0, (v) => { x0 = v; draw(); });
    draw();
  };

  /* ---------- 13. ddpm: a trained model on the spiral, played from noise to data ---------- */
  W.ddpm = function (host) {
    const Wd = 1120, Hd = 450, { ctx } = mk(host, Wd, Hd), P = { x: 30, y: 20, w: 560, h: 410 }, cx = P.x + P.w / 2, cy = P.y + P.h / 2, sc = 62;
    let usedLevel = 0, D = null, k = 0, playing = false, showData = false, showField = false, acc = 0, last = 0, sl; const tracked = [3, 47, 91, 135, 179, 223, 267, 311, 355, 399];
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); panel(ctx, P.x, P.y, P.w, P.h);
      if (!D) { text(ctx, "loading the trained model…", cx, cy, { align: "center", color: COL.ink }); return; }
      const T = D.T, tt = T - k, pts = D.traj[k];
      ctx.save(); ctx.beginPath(); ctx.rect(P.x + 1, P.y + 1, P.w - 2, P.h - 2); ctx.clip();
      if (showData) D.data.forEach((q) => dot(ctx, cx + q[0] * sc, cy - q[1] * sc, 2, COL.gold, 0.7));
      if (showField && tt >= 1) {
        let lev = D.levels[0]; D.levels.forEach((L) => { if (Math.abs(L - (tt - 1)) < Math.abs(lev - (tt - 1))) lev = L; }); const F = D.field[String(lev)]; usedLevel = lev + 1;
        ctx.lineWidth = 1.1; ctx.globalAlpha = 0.55;
        D.grid.forEach((g, j) => { let near = false; for (let i = 0; i < pts.length; i += 2) { const dx = pts[i][0] - g[0], dy = pts[i][1] - g[1]; if (dx * dx + dy * dy < 0.12) { near = true; break; } } if (!near) return;
          const x0 = cx + g[0] * sc, y0 = cy - g[1] * sc, x1 = cx + F[j][0] * sc, y1 = cy - F[j][1] * sc; ctx.strokeStyle = COL.teal; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); dot(ctx, x0, y0, 2, COL.teal, 0.75); dot(ctx, x1, y1, 3.2, COL.orange, 0.9); ctx.globalAlpha = 0.55; });
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = COL.navy; ctx.globalAlpha = showField ? 0.25 : 0.55; pts.forEach((q) => ctx.fillRect(cx + q[0] * sc - 1.4, cy - q[1] * sc - 1.4, 2.8, 2.8)); ctx.globalAlpha = 1;
      if (!showField) tracked.forEach((i) => { ctx.strokeStyle = COL.orange; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.75; ctx.beginPath(); const j0 = Math.max(0, k - 22); for (let j = j0; j <= k; j++) { const q = D.traj[j][i]; if (j > j0) ctx.lineTo(cx + q[0] * sc, cy - q[1] * sc); else ctx.moveTo(cx + q[0] * sc, cy - q[1] * sc); } ctx.stroke(); ctx.globalAlpha = 1; const q = pts[i]; dot(ctx, cx + q[0] * sc, cy - q[1] * sc, 4, COL.orange); });
      ctx.restore();
      const R = 630; let y = 52; const line = (str, col, wt, sz) => { text(ctx, str, R, y, { size: sz || 14, color: col || COL.navy, weight: wt || 500 }); y += (sz || 14) * 2.0; };
      line("reverse step " + k + " of " + T, COL.navy, 700, 19);
      line(tt >= 1 ? "the cloud is at noise level t = " + tt : "t = 0:  these are the samples", COL.navy, 600);
      if (tt >= 1) { const ab = D.abar[tt - 1]; line("signal × " + Math.sqrt(ab).toFixed(3) + "      noise × " + Math.sqrt(1 - ab).toFixed(3), COL.ink, 500, 13); }
      y += 4; line("each step: ask the network for the noise,", COL.ink, 500, 12); line("remove a little, un-shrink, add fresh noise", COL.ink, 500, 12);
      if (showField) { y += 4; line("each teal line starts at a noisy position and", COL.teal, 600, 12); line("ends (orange dot) at the network's guess of", COL.teal, 600, 12); line("the clean point behind it, at this noise level", COL.teal, 600, 12); if (tt >= 1) line("(guesses stored at 8 levels; showing t = " + usedLevel + ")", COL.ink, 500, 11); }
      else { y += 4; line("orange: ten particles and their recent paths", COL.orange, 600, 12); }
      if (showData) line("gold: the training data", "#a16207", 600, 12);
    }
    function init() {
      D = window.DDPM; const b = bar(host);
      button(b, "▶ generate", () => { if (k >= D.T) k = 0; playing = true; }); button(b, "reset", () => { playing = false; k = 0; sl.set(0); draw(); });
      sl = slider(b, "reverse step", 0, D.T, 1, 0, (v) => { playing = false; k = v; draw(); }, (v) => String(+v));
      button(b, "show the training data", (el) => { showData = !showData; el.textContent = showData ? "hide the training data" : "show the training data"; draw(); });
      button(b, "show the network's guess", (el) => { showField = !showField; el.textContent = showField ? "show the particles' paths" : "show the network's guess"; draw(); });
      loop(host, (ts) => { const dt = Math.min(100, ts - last || 0); last = ts; if (playing) { acc += dt; while (acc > 45 && playing) { acc -= 45; k++; if (k >= D.T) { k = D.T; playing = false; } } sl.set(k); draw(); } });
      draw();
    }
    draw();
    if (window.DDPM) init(); else { const sc2 = document.createElement("script"); sc2.src = new URL("data/ddpm_spiral.js", BASE || location.href).href; sc2.onload = init; sc2.onerror = () => { window.__errs.push("ddpm data failed to load"); }; document.head.appendChild(sc2); }
  };

  /* ---------- 14. chord: the picture behind "concave" and "convex" ---------- */
  W.chord = function (host) {
    const Wd = +(host.dataset.w || 1120), Hd = +(host.dataset.h || 430), compact = Wd < 800, { cv, ctx } = mk(host, Wd, Hd);
    const MODES = {
      log: { f: Math.log, lo: 0.15, hi: 6.2, flo: -2.1, fhi: 2.1, concave: true, name: "f(u) = log u", start: [1, 4] },
      exp: { f: Math.exp, lo: -2.5, hi: 2.3, flo: -1, fhi: 10, concave: false, name: "f(u) = eᵘ", start: [0, 2] },
      sq: { f: (u) => u * u, lo: -3, hi: 3, flo: -1, fhi: 9.5, concave: false, name: "f(u) = u²", start: [-1.5, 2.5] },
    };
    const P = compact ? { x: 16, y: 12, w: Wd - 32, h: Hd - 62 } : { x: 60, y: 24, w: 640, h: 330 };
    let mode = MODES[host.dataset.f] ? host.dataset.f : "log", M = MODES[mode], pts = M.start.slice(), lam = 0.5, grab = -1;
    const X = (u) => P.x + (u - M.lo) / (M.hi - M.lo) * P.w, Y = (v) => P.y + P.h - (v - M.flo) / (M.fhi - M.flo) * P.h, U = (x) => M.lo + (x - P.x) / P.w * (M.hi - M.lo);
    function draw() {
      ctx.clearRect(0, 0, Wd, Hd); panel(ctx, P.x, P.y, P.w, P.h);
      const a = pts[0], b = pts[1], fa = M.f(a), fb = M.f(b), m = lam * a + (1 - lam) * b, fm = M.f(m), ch = lam * fa + (1 - lam) * fb, lo = Math.min(a, b), hi = Math.max(a, b);
      ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
      if (M.flo < 0 && M.fhi > 0) { ctx.strokeStyle = "rgba(31,42,68,0.22)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.x, Y(0)); ctx.lineTo(P.x + P.w, Y(0)); ctx.stroke(); }
      ctx.beginPath(); for (let i = 0; i <= 120; i++) { const u = lo + (hi - lo) * i / 120; if (i) ctx.lineTo(X(u), Y(M.f(u))); else ctx.moveTo(X(u), Y(M.f(u))); } ctx.closePath(); ctx.fillStyle = "rgba(15,118,110,0.14)"; ctx.fill();   // between graph and chord
      ctx.strokeStyle = COL.navy; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i <= 400; i++) { const u = M.lo + (M.hi - M.lo) * i / 400; if (i) ctx.lineTo(X(u), Y(M.f(u))); else ctx.moveTo(X(u), Y(M.f(u))); } ctx.stroke();
      ctx.strokeStyle = COL.orange; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(X(a), Y(fa)); ctx.lineTo(X(b), Y(fb)); ctx.stroke();
      [[a, fa], [b, fb]].forEach((q) => { ctx.setLineDash([3, 4]); ctx.strokeStyle = COL.grey; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(q[0]), P.y + P.h); ctx.lineTo(X(q[0]), Y(q[1])); ctx.stroke(); ctx.setLineDash([]); dot(ctx, X(q[0]), Y(q[1]), 6, COL.navy); });
      ctx.setLineDash([3, 4]); ctx.strokeStyle = COL.orange; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(X(m), P.y + P.h); ctx.lineTo(X(m), Math.min(Y(fm), Y(ch))); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = COL.teal; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(X(m), Y(fm)); ctx.lineTo(X(m), Y(ch)); ctx.stroke();
      dot(ctx, X(m), Y(fm), 8, COL.navy); dot(ctx, X(m), Y(fm), 4, "#fff");
      ctx.save(); ctx.translate(X(m), Y(ch)); ctx.rotate(Math.PI / 4); ctx.fillStyle = COL.orange; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.fillRect(-7, -7, 14, 14); ctx.strokeRect(-7, -7, 14, 14); ctx.restore();
      ctx.restore();
      [[a, "a"], [b, "b"]].forEach((q) => { const x0 = X(q[0]), y0 = P.y + P.h + 4; ctx.fillStyle = COL.navy; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - 9, y0 + 15); ctx.lineTo(x0 + 9, y0 + 15); ctx.closePath(); ctx.fill(); text(ctx, q[1], x0, y0 + 32, { align: "center", size: 13, color: COL.navy, weight: 700 }); });
      ctx.fillStyle = COL.orange; ctx.beginPath(); ctx.moveTo(X(m), P.y + P.h + 4); ctx.lineTo(X(m) - 7, P.y + P.h + 16); ctx.lineTo(X(m) + 7, P.y + P.h + 16); ctx.closePath(); ctx.fill();
      const rel = Math.abs(fm - ch) < 5e-4 ? "=" : (fm > ch ? "≥" : "≤"), kind = M.concave ? "concave" : "convex";
      if (compact) {
        text(ctx, M.name + "  is " + kind, P.x + 12, P.y + 24, { weight: 700, size: 14 });
        text(ctx, "● graph " + fm.toFixed(3) + "   " + rel + "   ◆ chord " + ch.toFixed(3), P.x + 12, P.y + 46, { size: 12, color: COL.ink });
        return;
      }
      text(ctx, "drag a and b under the plot, and move the weight λ", P.x + 6, P.y + P.h + 62, { size: 12, color: COL.ink });
      const R = 740; let y = 52; const line = (str, col, wt, sz) => { text(ctx, str, R, y, { size: sz || 14, color: col || COL.navy, weight: wt || 500 }); y += (sz || 14) * 1.95; };
      line(M.name + "   (" + kind + ")", COL.navy, 700, 15);
      line("weights:  λ = " + lam.toFixed(2) + "   and   1 − λ = " + (1 - lam).toFixed(2), COL.ink);
      line("not negative, and they add up to 1", COL.ink, 500, 12);
      line("▲ weighted average of a and b:  " + m.toFixed(3), COL.orange, 600);
      line("● graph:  f(λa + (1−λ)b) = " + fm.toFixed(3), COL.navy, 700);
      line("◆ chord:  λ f(a) + (1−λ) f(b) = " + ch.toFixed(3), COL.orange, 700);
      y += 6; line(M.concave ? "concave:  graph  ≥  chord" : "convex:  graph  ≤  chord", COL.teal, 700, 15);
      if (rel === "=") line("at an endpoint, or when a = b, the two are equal", COL.ink, 500, 12);
    }
    drag(cv, Wd, Hd, (q, phase) => {
      if (phase === "down") { let best = 1e9; pts.forEach((u, i) => { const d = Math.abs(X(u) - q.x); if (d < best) { best = d; grab = i; } }); if (best > 70 || q.x > P.x + P.w + 20) { grab = -1; return; } }
      if (grab < 0) return; pts[grab] = clamp(U(q.x), M.lo + 0.03, M.hi - 0.03); draw();
    });
    const b = bar(host);
    if (!compact || host.dataset.toggle === "1") { const set = (k) => { mode = k; M = MODES[k]; pts = M.start.slice(); draw(); }; button(b, "f = log u", () => set("log")); button(b, "f = eᵘ", () => set("exp")); button(b, "f = u²", () => set("sq")); }
    slider(b, "weight λ", 0, 1, 0.01, lam, (v) => { lam = v; draw(); });
    draw();
  };

  /* ---------- mount ---------- */
  function mountAll() { document.querySelectorAll("[data-widget]").forEach((h) => { if (h.dataset.mounted) return; h.dataset.mounted = "1"; try { (W[h.dataset.widget] || (() => { h.textContent = "unknown widget " + h.dataset.widget; }))(h); } catch (e) { window.__errs.push(h.dataset.widget + ": " + e.message); } }); }
  window.DeckWidgets = { mountAll };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll); else mountAll();
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(mountAll);
})();

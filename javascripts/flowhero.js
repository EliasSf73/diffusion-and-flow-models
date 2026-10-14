/* Home-page animation: Gaussian noise carried to a target by an ODE or by an SDE with the same marginals.

   Path:    x_t = (1 - t) x0 + t x1,  x0 ~ N(0, I),  x1 = y_i + sigma * eps  (a mixture of small Gaussians)
   With s = 1 - t and var = s^2 + t^2 sigma^2, the marginal p_t is a mixture of N(t y_i, var I), and
     weights   w_i ∝ exp(-|x - t y_i|^2 / (2 var))
     velocity  v(x, t) = (s * sum w_i y_i - (s - t sigma^2) x) / var        (flow matching / probability-flow ODE)
     score     ∇log p_t(x) = (t * sum w_i y_i - x) / var
   ODE:  dx = v dt.
   SDE:  dx = (v + g^2/2 ∇log p_t) dt + g dW  has the same p_t for every t (the extra drift and the noise cancel
         in the Fokker–Planck equation). g(t) = G0 (1 - t), so the jitter dies out as the dots reach the data.

   Mount: <div class="flow-hero"></div>. Colours follow the Material palette (paper or slate). */
(function () {
  const SIGMA = 0.09, STEPS = 180, VIEW = 3.3, G0 = 1.1;
  const LOOKS = {
    paper: { bg: [251, 248, 241], palette: [[13, 138, 128], [36, 96, 205], [118, 82, 210], [196, 118, 18]] },
    slate: { bg: [23, 24, 27], palette: [[79, 209, 197], [90, 156, 255], [167, 139, 250], [224, 168, 74]] },
  };
  const SHAPES = [["spiral", "spiral"], ["moons", "two moons"], ["modes", "eight modes"]];

  const scheme = () => (document.body.getAttribute("data-md-color-scheme") === "slate" ? "slate" : "paper");

  function gauss() {
    let u = 0;
    while (u === 0) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  }

  function centres(shape, n) {
    const c = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      let x, y;
      if (shape === "spiral") {
        const s = 0.12 + 0.88 * u, a = 3.4 * Math.PI * s;
        x = 2.5 * s * Math.cos(a); y = 2.5 * s * Math.sin(a);
      } else if (shape === "moons") {
        const a = Math.PI * ((2 * u) % 1);
        if (u < 0.5) { x = Math.cos(a) - 0.5; y = Math.sin(a) - 0.25; } else { x = 0.5 - Math.cos(a); y = 0.25 - Math.sin(a); }
        x *= 1.75; y *= 1.75;
      } else {
        const a = ((i % 8) * Math.PI) / 4;
        x = 2.2 * Math.cos(a) + 0.13 * gauss(); y = 2.2 * Math.sin(a) + 0.13 * gauss();
      }
      c[2 * i] = x; c[2 * i + 1] = y;
    }
    return c;
  }

  function colourFor(x, y, palette) {
    const f = ((Math.atan2(y, x) / (2 * Math.PI) + 1) % 1) * palette.length;
    const i = Math.floor(f), t = f - i;
    const a = palette[i % palette.length], b = palette[(i + 1) % palette.length];
    return "rgb(" + [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t)).join(",") + ")";
  }

  function mount(root) {
    root.innerHTML =
      '<div class="fh-plate"><canvas class="fh-canvas"></canvas>' +
      '<div class="fh-top"><span>t = <b class="fh-t">0.00</b></span><span class="fh-mode">ODE: noise → spiral</span></div></div>' +
      '<div class="fh-bar"><span class="fh-group" data-g="mode"></span><span class="fh-group" data-g="shape"></span></div>';
    const canvas = root.querySelector("canvas"), ctx = canvas.getContext("2d");
    const tOut = root.querySelector(".fh-t"), modeOut = root.querySelector(".fh-mode");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.innerWidth < 700;
    const P = small ? 520 : 900, N = small ? 180 : 240;

    const x0 = new Float32Array(2 * P);
    const colours = { paper: [], slate: [] };
    for (let p = 0; p < P; p++) {
      x0[2 * p] = gauss(); x0[2 * p + 1] = gauss();
      for (const k of ["paper", "slate"]) colours[k].push(colourFor(x0[2 * p], x0[2 * p + 1], LOOKS[k].palette));
    }
    const traj = new Float32Array(2 * P * (STEPS + 1));
    const w = new Float32Array(N);
    let shapeIndex = 0, data = centres(SHAPES[0][0], N), mode = "ode";
    let step = 0, phase = "forward", frames = 0, visible = true, size = 0;

    function advance() {
      const t = step / STEPS, dt = 1 / STEPS, s = 1 - t;
      const v = s * s + t * t * SIGMA * SIGMA, inv = 1 / (2 * v), shrink = s - t * SIGMA * SIGMA;
      const g = G0 * s, sde = mode === "sde", from = 2 * P * step, to = from + 2 * P;
      for (let p = 0; p < P; p++) {
        const px = traj[from + 2 * p], py = traj[from + 2 * p + 1];
        let best = Infinity;
        for (let i = 0; i < N; i++) {
          const dx = px - t * data[2 * i], dy = py - t * data[2 * i + 1], d = dx * dx + dy * dy;
          w[i] = d; if (d < best) best = d;
        }
        let tot = 0, mx = 0, my = 0;
        for (let i = 0; i < N; i++) { const e = Math.exp(-(w[i] - best) * inv); tot += e; mx += e * data[2 * i]; my += e * data[2 * i + 1]; }
        mx /= tot; my /= tot;
        let vx = (s * mx - shrink * px) / v, vy = (s * my - shrink * py) / v;
        if (sde) {
          vx += 0.5 * g * g * (t * mx - px) / v; vy += 0.5 * g * g * (t * my - py) / v;
          const r = g * Math.sqrt(dt);
          traj[to + 2 * p] = px + dt * vx + r * gauss(); traj[to + 2 * p + 1] = py + dt * vy + r * gauss();
        } else {
          traj[to + 2 * p] = px + dt * vx; traj[to + 2 * p + 1] = py + dt * vy;
        }
      }
      step += 1;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = canvas.clientWidth;
      canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "rgb(" + LOOKS[scheme()].bg + ")"; ctx.fillRect(0, 0, size, size);
    }

    function draw(k, fade) {
      const sc = scheme(), dots = colours[sc];
      ctx.fillStyle = "rgba(" + LOOKS[sc].bg + "," + fade + ")"; ctx.fillRect(0, 0, size, size);
      const scale = size / (2 * VIEW), half = size / 2, r = size < 400 ? 1.4 : 1.8, base = 2 * P * k;
      for (let p = 0; p < P; p++) {
        ctx.fillStyle = dots[p];
        ctx.fillRect(half + traj[base + 2 * p] * scale - r / 2, half - traj[base + 2 * p + 1] * scale - r / 2, r, r);
      }
      tOut.textContent = (k / STEPS).toFixed(2);
    }

    function restart(newNoise) {
      if (newNoise) for (let q = 0; q < 2 * P; q++) x0[q] = gauss();
      traj.set(x0, 0); step = 0; phase = "forward"; frames = 0;
      modeOut.textContent = (mode === "ode" ? "ODE" : "SDE") + ": noise → " + SHAPES[shapeIndex][1];
      if (newNoise) for (let p = 0; p < P; p++) for (const k of ["paper", "slate"]) colours[k][p] = colourFor(x0[2 * p], x0[2 * p + 1], LOOKS[k].palette);
      if (reduced) { while (step < STEPS) advance(); draw(STEPS, 1); }
    }

    function frame() {
      requestAnimationFrame(frame);
      if (!visible || reduced) return;
      frames += 1;
      if (phase === "forward") {
        advance(); draw(step, 0.2);
        if (step === STEPS) { phase = "hold"; frames = 0; }
      } else if (phase === "hold") {
        draw(STEPS, frames > 30 ? 1 : 0.2);
        if (frames > 110) { phase = mode === "ode" ? "back" : "fade"; frames = 0; }
      } else if (phase === "back") {
        step = Math.max(0, step - 2); draw(step, 0.2);
        if (step === 0) { phase = "rest"; frames = 0; }
      } else if (phase === "fade") {
        ctx.fillStyle = "rgba(" + LOOKS[scheme()].bg + ",0.12)"; ctx.fillRect(0, 0, size, size);
        if (frames > 40) { phase = "rest"; frames = 0; }
      } else {
        if (mode === "ode") draw(0, frames > 25 ? 1 : 0.2);
        if (frames > 40) { shapeIndex = (shapeIndex + 1) % SHAPES.length; data = centres(SHAPES[shapeIndex][0], N); sync(); restart(mode === "sde"); }
      }
    }

    function sync() {
      root.querySelectorAll("button").forEach((b) => {
        const on = b.dataset.g === "mode" ? b.dataset.v === mode : Number(b.dataset.v) === shapeIndex;
        b.classList.toggle("on", on);
      });
    }

    const groups = { mode: [["ode", "ODE: one smooth path each"], ["sde", "SDE: random paths, same cloud"]], shape: SHAPES.map((s, i) => [String(i), s[1]]) };
    for (const [g, items] of Object.entries(groups)) {
      const holder = root.querySelector('.fh-group[data-g="' + g + '"]');
      for (const [v, label] of items) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = label; b.dataset.g = g; b.dataset.v = v;
        b.addEventListener("click", () => {
          if (g === "mode") mode = v; else { shapeIndex = Number(v); data = centres(SHAPES[shapeIndex][0], N); }
          sync(); restart(false);
        });
        holder.appendChild(b);
      }
    }

    resize(); sync(); restart(false);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
    window.addEventListener("resize", () => { resize(); if (reduced) draw(STEPS, 1); });
    new MutationObserver(() => { resize(); draw(step, 1); }).observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
    requestAnimationFrame(frame);
  }

  function init() { document.querySelectorAll(".flow-hero").forEach(mount); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

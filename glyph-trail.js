/**
 * Glyph Trail Component (Framer port)
 * Original: https://framer.com/m/Glyph-Trail-IibOD8.js@mcfjQvnnHs7ZBfjTsYps
 * Converted to high-performance zero-dependency Canvas module for Evntiqa
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GlyphTrail = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Threshold matrices (ordered multi-level dither) ----------
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const BAYER8 = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21
  ].map(v => (v + 0.5) / 64);

  // Shape generators
  const disc = r => (u, v) => u * u + v * v < r * r;
  const ring = (r, w) => (u, v, t) => {
    const d = Math.sqrt(u * u + v * v);
    return Math.abs(d - r) < Math.max(w, t);
  };
  const plus = (len, w = 0) => (u, v, t) => {
    const h = Math.max(w, t);
    return (Math.abs(u) < h && Math.abs(v) < len) || (Math.abs(v) < h && Math.abs(u) < len);
  };
  const cross = (len, w = 0) => (u, v, t) => {
    const h = Math.max(w, t) * 1.4;
    return Math.abs(u) < len && Math.abs(v) < len && (Math.abs(u - v) < h || Math.abs(u + v) < h);
  };
  const diamond = r => (u, v) => Math.abs(u) + Math.abs(v) < r;
  const square = r => (u, v) => Math.abs(u) < r && Math.abs(v) < r;
  const hollowSquare = (r, w = 0) => (u, v, t) =>
    Math.max(Math.abs(u), Math.abs(v)) < r && Math.max(Math.abs(u), Math.abs(v)) > r - Math.max(0.2, t * 2);
  const diagonal = w => (u, v, t) => Math.abs(u + v) < Math.max(w, t);
  const either = (...s) => (u, v, t) => s.some(f => f(u, v, t));

  // Ink glyph sets, lightest to darkest (level 0 = empty cell)
  const INK_SETS = {
    mixed: [disc(0.26), plus(0.6), cross(0.6), ring(0.58, 0.12), diamond(0.95), square(0.8)],
    circles: [disc(0.2), disc(0.34), disc(0.48), disc(0.62), disc(0.76), disc(0.92)],
    lines: [diagonal(0.1), diagonal(0.22), diagonal(0.36), diagonal(0.52), diagonal(0.7), diagonal(0.95)],
    crosses: [plus(0.3), plus(0.55), plus(0.8), plus(0.85, 0.2), plus(0.9, 0.34), plus(0.95, 0.5)]
  };

  // Trail glyph sets, faint to strong
  const TRAIL_SETS = {
    beads: [disc(0.22), ring(0.5, 0.12), disc(0.6), disc(0.85)],
    stars: [disc(0.2), plus(0.55), either(plus(0.75), cross(0.6)), either(plus(0.9, 0.14), cross(0.75, 0.1))],
    frames: [square(0.2), hollowSquare(0.55), hollowSquare(0.85), either(hollowSquare(0.9), square(0.4))]
  };

  function buildMasks(shapes, cell) {
    const t = 1.1 / cell;
    return shapes.map(shape => {
      const m = new Uint8Array(cell * cell);
      for (let y = 0; y < cell; y++) {
        const v = ((y + 0.5) / cell) * 2 - 1;
        for (let x = 0; x < cell; x++) {
          const u = ((x + 0.5) / cell) * 2 - 1;
          m[y * cell + x] = shape(u, v, t) ? 1 : 0;
        }
      }
      return m;
    });
  }

  // Color helper (packs RGBA into 32-bit uint)
  let colorCtx = null;
  function toPacked(color, fallback) {
    if (typeof document === 'undefined') return 0;
    if (!colorCtx) {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 1;
      colorCtx = c.getContext('2d', { willReadFrequently: true });
    }
    const ctx = colorCtx;
    if (!ctx) return 0;
    let value = (color || fallback || '').trim();
    if (!value || value === 'transparent' || value === 'rgba(0,0,0,0)') {
      return 0;
    }
    const varMatch = /^var\([^,]+,\s*(.+)\)$/.exec(value);
    if (varMatch) value = varMatch[1].trim();

    ctx.clearRect(0, 0, 1, 1);
    if (fallback) ctx.fillStyle = fallback;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  const DEFAULT_OPTIONS = {
    cellSize: 10,
    glyphs: 'mixed',
    colors: {
      background: 'transparent',
      ink: 'rgba(255, 255, 255, 0.08)',
      trail: '#C8F45C' // Evntiqa Signature Lime
    },
    pattern: '8',
    tone: {
      contrast: 1,
      brightness: 0,
      invert: false
    },
    trail: {
      radius: 60,
      strength: 0.85,
      duration: 1.6,
      spread: 0.2,
      shape: 'beads',
      touch: true
    },
    speed: 0.8
  };

  class GlyphTrailInstance {
    constructor(root, options = {}) {
      this.root = typeof root === 'string' ? document.querySelector(root) : root;
      if (!this.root) return;

      this.options = {
        ...DEFAULT_OPTIONS,
        ...options,
        colors: { ...DEFAULT_OPTIONS.colors, ...(options.colors || {}) },
        tone: { ...DEFAULT_OPTIONS.tone, ...(options.tone || {}) },
        trail: { ...DEFAULT_OPTIONS.trail, ...(options.trail || {}) }
      };

      this.canvas = document.createElement('canvas');
      this.canvas.style.position = 'absolute';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.display = 'block';
      this.canvas.style.pointerEvents = 'none';

      this.root.style.position = this.root.style.position || 'relative';
      this.root.style.overflow = 'hidden';
      this.root.appendChild(this.canvas);

      this.init();
    }

    init() {
      const { root, canvas, options } = this;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cell = Math.max(4, Math.round(options.cellSize || 10));
      const matrix = options.pattern === '4' ? BAYER4 : BAYER8;
      const mSize = options.pattern === '4' ? 4 : 8;
      const mMask = mSize - 1;
      const half = mSize >> 1;

      const bg = options.colors.background ?? 'transparent';
      const ink = options.colors.ink ?? 'rgba(255, 255, 255, 0.08)';
      const trailCol = options.colors.trail ?? '#C8F45C';

      const BG = toPacked(bg, 'transparent');
      const INK = toPacked(ink, '#1A1A1A');
      const TRAIL = toPacked(trailCol, '#5EB8F2');

      const inkMasks = buildMasks(INK_SETS[options.glyphs] || INK_SETS.mixed, cell);
      const trailMasks = buildMasks(TRAIL_SETS[options.trail.shape] || TRAIL_SETS.beads, cell);
      const inkLevels = inkMasks.length;
      const trailLevels = trailMasks.length;

      const contrast = options.tone.contrast ?? 1;
      const brightness = options.tone.brightness ?? 0;
      const invert = options.tone.invert ?? false;

      let cols = 0;
      let rows = 0;
      let W = 0;
      let dark = new Float32Array(0);
      let field = new Float32Array(0);
      let next = new Float32Array(0);
      let imgData = null;
      let buf = null;
      let time = 0;

      const shape = d => {
        let v = (d - 0.5) * contrast + 0.5 - brightness;
        if (invert) v = 1 - v;
        return clamp01(v);
      };

      const sampleProcedural = () => {
        const h = Math.max(1, rows * cell);
        for (let y = 0; y < rows; y++) {
          const py = y * cell;
          for (let x = 0; x < cols; x++) {
            const px = x * cell;
            const d =
              0.4 +
              0.14 * Math.sin((px + py) * 0.006 + time * 0.3) +
              0.1 * Math.sin((px * 0.4 - py) * 0.009 - time * 0.2) +
              0.06 * Math.sin((px + py * 1.3) * 0.017 + time * 0.25) +
              (py / h) * 0.12;
            dark[y * cols + x] = shape(d);
          }
        }
      };

      const blit = (cx, cy, mask, col) => {
        if (!buf) return;
        let o = cy * cell * W + cx * cell;
        let m = 0;
        for (let y = 0; y < cell; y++) {
          for (let x = 0; x < cell; x++) {
            if (mask[m++]) buf[o + x] = col;
          }
          o += W;
        }
      };

      const draw = () => {
        if (!buf || !imgData) return;
        buf.fill(BG);
        for (let y = 0; y < rows; y++) {
          const row = (y & mMask) * mSize;
          const row2 = ((y + 1) & mMask) * mSize;
          const base = y * cols;
          for (let x = 0; x < cols; x++) {
            const i = base + x;
            const th = matrix[row + (x & mMask)];
            const th2 = matrix[row2 + ((x + half) & mMask)];
            const tl = Math.min(trailLevels, Math.floor(clamp01(field[i]) * trailLevels + th2 - 0.25));
            if (tl > 0) {
              blit(x, y, trailMasks[tl - 1], TRAIL);
              continue;
            }
            const il = Math.min(inkLevels, Math.floor(dark[i] * inkLevels + th));
            if (il > 0) blit(x, y, inkMasks[il - 1], INK);
          }
        }
        ctx.putImageData(imgData, 0, 0);
      };

      const resize = () => {
        const w = root.offsetWidth || window.innerWidth;
        const h = root.offsetHeight || 600;
        const nc = Math.max(1, Math.ceil(w / cell));
        const nr = Math.max(1, Math.ceil(h / cell));
        if (nc === cols && nr === rows && imgData) return;

        cols = nc;
        rows = nr;
        W = cols * cell;
        canvas.width = W;
        canvas.height = rows * cell;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${rows * cell}px`;

        dark = new Float32Array(cols * rows);
        field = new Float32Array(cols * rows);
        next = new Float32Array(cols * rows);
        imgData = ctx.createImageData(W, rows * cell);
        buf = new Uint32Array(imgData.data.buffer);

        sampleProcedural();
        draw();
      };

      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(root);

      // Pointer interactions
      let px = null;
      let py = null;
      let qx = null;
      let qy = null;

      const onMove = e => {
        if (e.pointerType !== 'mouse' && !options.trail.touch) return;
        const rect = root.getBoundingClientRect();

        // Check if inside bounds (with slight padding for smooth entry/exit)
        if (
          e.clientX < rect.left - 40 ||
          e.clientX > rect.right + 40 ||
          e.clientY < rect.top - 40 ||
          e.clientY > rect.bottom + 40
        ) {
          px = py = qx = qy = null;
          return;
        }

        const sx = rect.width / (root.offsetWidth || 1);
        const sy = rect.height / (root.offsetHeight || 1);
        qx = (e.clientX - rect.left) / sx / cell;
        qy = (e.clientY - rect.top) / sy / cell;
      };

      const onLeave = () => {
        px = py = qx = qy = null;
      };

      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerleave', onLeave);
      window.addEventListener('blur', onLeave);

      const stamp = (x, y, r, strength) => {
        const r2 = r * r;
        const x0 = Math.max(0, Math.floor(x - r));
        const x1 = Math.min(cols - 1, Math.ceil(x + r));
        const y0 = Math.max(0, Math.floor(y - r));
        const y1 = Math.min(rows - 1, Math.ceil(y + r));
        if (x0 > x1 || y0 > y1) return;

        for (let yy = y0; yy <= y1; yy++) {
          const dy = yy - y;
          for (let xx = x0; xx <= x1; xx++) {
            const dx = xx - x;
            const d = (dx * dx + dy * dy) / r2;
            if (d >= 1) continue;
            const v = strength * (1 - d) * (1 - d);
            const i = yy * cols + xx;
            if (v > field[i]) field[i] = v;
          }
        }
      };

      let raf = 0;
      let last = performance.now();
      let alive = false;

      const tick = now => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        const t = options.trail || {};
        const radius = Math.max(1, (t.radius ?? 50) / cell);
        const strength = t.strength ?? 0.75;
        const duration = Math.max(0.1, t.duration ?? 1.6);
        const spread = t.spread ?? 0.2;
        let dirty = false;

        // Stamp along the path since last frame
        if (qx !== null && qy !== null) {
          if (px === null || py === null) {
            stamp(qx, qy, radius, strength);
          } else if (qx !== px || qy !== py) {
            const dx = qx - px;
            const dy = qy - py;
            const dist = Math.hypot(dx, dy);
            const steps = Math.max(1, Math.ceil(dist / (radius * 0.3)));
            for (let s = 1; s <= steps; s++) {
              stamp(px + (dx * s) / steps, py + (dy * s) / steps, radius, strength);
            }
          }
          if (px !== qx || py !== qy) {
            alive = true;
            dirty = true;
          }
          px = qx;
          py = qy;
        }

        // Diffuse + decay
        if (alive) {
          const decay = Math.pow(0.03, dt / duration);
          const s = Math.min(1, spread * dt * 60 * 0.5);
          let max = 0;
          for (let y = 0; y < rows; y++) {
            const up = y > 0 ? -cols : 0;
            const down = y < rows - 1 ? cols : 0;
            for (let x = 0; x < cols; x++) {
              const i = y * cols + x;
              const c = field[i];
              const l = x > 0 ? field[i - 1] : c;
              const r = x < cols - 1 ? field[i + 1] : c;
              const avg = (l + r + field[i + up] + field[i + down]) * 0.25;
              const v = (c + (avg - c) * s) * decay;
              next[i] = v;
              if (v > max) max = v;
            }
          }
          const tmp = field;
          field = next;
          next = tmp;
          if (max < 0.004) {
            field.fill(0);
            alive = false;
          }
          dirty = true;
        }

        const sp = options.speed ?? 1;
        if (sp > 0) {
          time += dt * sp;
          sampleProcedural();
          dirty = true;
        }

        if (dirty) draw();
      };

      raf = requestAnimationFrame(tick);

      this.destroy = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        window.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerleave', onLeave);
        window.removeEventListener('blur', onLeave);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      };
    }
  }

  function initGlyphTrail(container, options) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return null;
    if (el._glyphTrailInstance) return el._glyphTrailInstance;
    const instance = new GlyphTrailInstance(el, options);
    el._glyphTrailInstance = instance;
    return instance;
  }

  return {
    GlyphTrailInstance,
    initGlyphTrail,
    DEFAULT_OPTIONS
  };
});

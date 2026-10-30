/**
 * Dot Grid Background Component (Framer Port)
 * Original: https://framer.com/m/Dot-Grid-BG-GVxaLr.js@mfNBQfaPK0E7CX1epbhh
 * Converted to high-performance zero-dependency Canvas module for Evntiqa
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var exp = factory();
    root.DotGridBg = exp;
    root.DotGridBackground = exp;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_OPTIONS = {
    dotColor: '#6366f1',
    dotSize: 3,
    dotSpacing: 28,
    orbitSpeed: 1.5,
    impactRadius: 100,
    scaleOnHover: 1.8,
    enableRevolve: true,
    pauseOffscreen: true,
    maxDpr: 2
  };

  function smoothstep(t) {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }

  function resolveVar(raw, el) {
    const s = (raw || '').trim();
    if (!s.startsWith('var(')) return s;
    const inner = s.slice(4, -1).trim();
    const commaIdx = inner.indexOf(',');
    const varName = (commaIdx !== -1 ? inner.slice(0, commaIdx) : inner).trim();
    const fallback = commaIdx !== -1 ? inner.slice(commaIdx + 1).trim() : '';
    try {
      if (el) {
        const resolved = getComputedStyle(el).getPropertyValue(varName).trim();
        if (resolved) return resolved;
      }
    } catch (_) {}
    if (fallback) return resolveVar(fallback, el);
    return '#6366f1';
  }

  function parseColor(raw, el) {
    if (!raw) return { r: 99, g: 102, b: 241 };
    if (typeof raw === 'object' && 'r' in raw && 'g' in raw && 'b' in raw) {
      return raw;
    }
    const color = resolveVar(String(raw), el);
    if (color.startsWith('rgb')) {
      const m = color.match(/[\d.]+/g) || [];
      return {
        r: Number(m[0]) || 0,
        g: Number(m[1]) || 0,
        b: Number(m[2]) || 0
      };
    }
    let h = color.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    const n = parseInt(h.slice(0, 6), 16);
    if (isNaN(n)) return { r: 99, g: 102, b: 241 };
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255
    };
  }

  function pseudoRand(c, r, seed) {
    var h = ((c + 1000) * 374761393 + (r + 1000) * 668265263 + seed * 961748941) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function DotGridBgInstance(container, userOptions) {
    var options = Object.assign({}, DEFAULT_OPTIONS);

    // Read data-attributes if available
    if (container.dataset) {
      if (container.dataset.dotColor) options.dotColor = container.dataset.dotColor;
      if (container.dataset.dotSize) options.dotSize = parseFloat(container.dataset.dotSize);
      if (container.dataset.dotSpacing) options.dotSpacing = parseFloat(container.dataset.dotSpacing);
      if (container.dataset.orbitSpeed) options.orbitSpeed = parseFloat(container.dataset.orbitSpeed);
      if (container.dataset.impactRadius) options.impactRadius = parseFloat(container.dataset.impactRadius);
      if (container.dataset.scaleOnHover) options.scaleOnHover = parseFloat(container.dataset.scaleOnHover);
      if (container.dataset.enableRevolve !== undefined) options.enableRevolve = container.dataset.enableRevolve === 'true';
    }

    Object.assign(options, userOptions || {});

    var canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';

    container.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    var maxDpr = options.maxDpr || 2;
    var dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

    var W = 0, H = 0;
    var mouse = { x: -9999, y: -9999 };
    var hovering = false;
    var leaveTs = 0;
    var prevTs = 0;
    var raf = 0;
    var globalAngle = 0;
    var dots = [];
    var spacingSnap = options.dotSpacing;
    var isVisible = true;

    function buildDots() {
      var sp = options.dotSpacing;
      spacingSnap = sp;
      dots = [];
      if (W <= 0 || H <= 0) return;

      var cols = Math.ceil(W / sp) + 2;
      var rows = Math.ceil(H / sp) + 2;
      var offsetX = ((W % sp) - sp) * 0.5;
      var offsetY = ((H % sp) - sp) * 0.5;

      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          dots.push({
            bx: offsetX + c * sp,
            by: offsetY + r * sp,
            inclination: pseudoRand(c, r, 1) * Math.PI,
            ascension: pseudoRand(c, r, 2) * Math.PI * 2,
            phase: pseudoRand(c, r, 3) * Math.PI * 2,
            speedMult: 0.7 + pseudoRand(c, r, 4) * 0.6
          });
        }
      }
    }

    function resize() {
      var rect = container.getBoundingClientRect();
      W = rect.width || container.clientWidth || 300;
      H = rect.height || container.clientHeight || 300;
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildDots();
    }

    var ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    // Listen to mouse events on parent section for full interactive coverage
    var trackEl = container.closest('section') || container.parentElement || container;

    function onMouseMove(e) {
      var rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      hovering = true;
    }

    function onMouseEnter(e) {
      var rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      hovering = true;
    }

    function onMouseLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
      hovering = false;
      leaveTs = performance.now();
    }

    function onTouchMove(e) {
      if (!e.touches || !e.touches[0]) return;
      var rect = canvas.getBoundingClientRect();
      mouse.x = e.touches[0].clientX - rect.left;
      mouse.y = e.touches[0].clientY - rect.top;
      hovering = true;
    }

    trackEl.addEventListener('mousemove', onMouseMove, { passive: true });
    trackEl.addEventListener('mouseenter', onMouseEnter, { passive: true });
    trackEl.addEventListener('mouseleave', onMouseLeave, { passive: true });
    trackEl.addEventListener('touchmove', onTouchMove, { passive: true });
    trackEl.addEventListener('touchend', onMouseLeave, { passive: true });
    trackEl.addEventListener('touchcancel', onMouseLeave, { passive: true });
    window.addEventListener('blur', onMouseLeave);

    // Pause when offscreen for maximum battery & performance efficiency
    var io = null;
    if (options.pauseOffscreen && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          isVisible = entry.isIntersecting;
          if (isVisible) {
            prevTs = performance.now();
          }
        });
      }, { threshold: 0.01 });
      io.observe(container);
    }

    function loop(ts) {
      raf = requestAnimationFrame(loop);

      if (options.pauseOffscreen && !isVisible) {
        prevTs = ts;
        return;
      }

      var dt = Math.min((ts - (prevTs || ts)) / 1000, 0.05);
      prevTs = ts;

      if (spacingSnap !== options.dotSpacing) {
        buildDots();
      }

      globalAngle += options.orbitSpeed * dt;

      ctx.clearRect(0, 0, W, H);

      var rgb = parseColor(options.dotColor, canvas);
      var mx = mouse.x, my = mouse.y;
      var timeSinceLeave = hovering ? 0 : Math.max(0, ts - leaveTs) / 1000;
      var decay = hovering ? 1 : smoothstep(Math.max(0, 1 - timeSinceLeave * 1.5));

      var len = dots.length;
      var impactRadius = options.impactRadius;
      var enableRevolve = options.enableRevolve;
      var dotSpacing = options.dotSpacing;
      var scaleOnHover = options.scaleOnHover;
      var dotSize = options.dotSize;

      for (var i = 0; i < len; i++) {
        var d = dots[i];
        var dx = d.bx - mx;
        var dy = d.by - my;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var inRange = dist < impactRadius && dist > 0;
        var x = d.bx;
        var y = d.by;
        var scale = 1;
        var alpha = 0.3;

        if (inRange) {
          var t = dist / impactRadius;
          var inf = smoothstep(1 - t) * decay;

          if (enableRevolve) {
            var orbitR = (1 - t) * dotSpacing * 0.7 * inf;
            var theta = globalAngle * d.speedMult + d.phase;

            var cosA = Math.cos(d.ascension);
            var sinA = Math.sin(d.ascension);
            var cosI = Math.cos(d.inclination);
            var sinI = Math.sin(d.inclination);
            var lx = Math.cos(theta);
            var ly = Math.sin(theta) * cosI;
            var lz = Math.sin(theta) * sinI;

            var ox = (lx * cosA - ly * sinA) * orbitR;
            var oy = (lx * sinA + ly * cosA) * orbitR;
            x = d.bx + ox;
            y = d.by + oy;

            var depthScale = 0.75 + 0.25 * ((lz + 1) * 0.5);
            scale = (1 + (scaleOnHover - 1) * inf) * depthScale;
            alpha = (0.3 + 0.7 * inf) * depthScale;
          } else {
            scale = 1 + (scaleOnHover - 1) * inf;
            alpha = 0.3 + 0.7 * inf;
          }
        }

        var r = (dotSize / 2) * scale;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
        ctx.fill();
      }
    }

    raf = requestAnimationFrame(loop);

    this.update = function (newOpts) {
      Object.assign(options, newOpts || {});
      if (spacingSnap !== options.dotSpacing) {
        buildDots();
      }
    };

    this.destroy = function () {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (io) io.disconnect();
      trackEl.removeEventListener('mousemove', onMouseMove);
      trackEl.removeEventListener('mouseenter', onMouseEnter);
      trackEl.removeEventListener('mouseleave', onMouseLeave);
      trackEl.removeEventListener('touchmove', onTouchMove);
      trackEl.removeEventListener('touchend', onMouseLeave);
      trackEl.removeEventListener('touchcancel', onMouseLeave);
      window.removeEventListener('blur', onMouseLeave);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      delete container._dotGridInstance;
    };
  }

  function init(target, userOptions) {
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;
    if (el._dotGridInstance) return el._dotGridInstance;
    var instance = new DotGridBgInstance(el, userOptions);
    el._dotGridInstance = instance;
    return instance;
  }

  return {
    init: init,
    DotGridBgInstance: DotGridBgInstance,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS
  };
});

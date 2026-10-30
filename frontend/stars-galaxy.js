/**
 * Stars Galaxy Component (Framer port)
 * Original: https://framer.com/m/Stars-Galaxy-mcPCjY.js@Mj2pxzqB0usafl3jU9iO
 * Converted to zero-dependency Canvas module for Evntiqa
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StarsGalaxy = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Framer property-control defaults
  const DEFAULT_OPTIONS = {
    stars: 1000,
    speed: 2,
    spread: 5,
    focal: 2,
    twinkle: 0.35,
    size: 2,
    fadeInRange: 5,
    reverseFly: true,
    followCursor: false,
    background: '#000000',
    starColor: '#ffffff',
    pauseOffscreen: true,
    maxDpr: 2
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function initStarsGalaxy(selectorOrEl, options = {}) {
    const container = typeof selectorOrEl === 'string'
      ? document.querySelector(selectorOrEl)
      : selectorOrEl;
    if (!container) return null;
    if (container._starsGalaxy) return container._starsGalaxy;

    const config = Object.assign({}, DEFAULT_OPTIONS, options);
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;background:${config.background}`;
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const mouse = { x: 0.5, y: 0.5 };
    let dpr = 1;
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = !config.pauseOffscreen;

    const createStar = () => ({
      x: (Math.random() - 0.5) * config.spread,
      y: (Math.random() - 0.5) * config.spread,
      z: Math.random(),
      tw: Math.random() * Math.PI * 2
    });
    const stars = Array.from({ length: config.stars }, createStar);

    function resize() {
      const rect = container.getBoundingClientRect();
      dpr = Math.min(config.maxDpr, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduceMotion) draw(false);
    }

    function onMouseMove(e) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      mouse.y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    }

    function draw(advance) {
      const focal = clamp(config.focal, 0.01, 10);
      const speed = clamp(config.speed, 0, 10) * 0.002;
      const twinkle = clamp(config.twinkle, 0, 1);
      const size = clamp(config.size, 0.1, 5);
      const fadeInRange = clamp(config.fadeInRange, 0.1, 10);

      ctx.globalAlpha = 1;
      ctx.fillStyle = config.background;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = config.starColor;

      const cx = config.followCursor ? mouse.x * w : w / 2;
      const cy = config.followCursor ? mouse.y * h : h / 2;

      for (const s of stars) {
        const depth = s.z * focal + 0.001;
        const px = cx + (s.x / depth) * w;
        const py = cy + (s.y / depth) * h;
        if (advance) {
          s.z += config.reverseFly ? speed : -speed;
          if (s.z <= 0 || s.z > 1) Object.assign(s, createStar());
          s.tw += twinkle * 0.05;
        }
        const alpha = Math.max(0, 1 - s.z / fadeInRange);
        const radius = size * (1 - s.z) * (1 + Math.sin(s.tw) * twinkle);
        if (alpha <= 0 || radius <= 0) continue;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function animate() {
      raf = 0;
      draw(true);
      if (visible && !document.hidden) raf = requestAnimationFrame(animate);
    }

    function start() {
      if (!reduceMotion && !raf) raf = requestAnimationFrame(animate);
    }

    function onVisibility() {
      if (!document.hidden && visible) start();
    }

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (resizeObserver) resizeObserver.observe(container);
    else window.addEventListener('resize', resize, { passive: true });

    let io = null;
    if (config.pauseOffscreen && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }, { rootMargin: '200px 0px' });
      io.observe(container);
    } else {
      visible = true;
    }

    if (config.followCursor) window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    if (reduceMotion) draw(false);
    else start();

    const instance = {
      destroy() {
        if (raf) cancelAnimationFrame(raf);
        if (io) io.disconnect();
        if (resizeObserver) resizeObserver.disconnect();
        else window.removeEventListener('resize', resize);
        window.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.remove();
        delete container._starsGalaxy;
      }
    };
    container._starsGalaxy = instance;
    return instance;
  }

  return { init: initStarsGalaxy };
});

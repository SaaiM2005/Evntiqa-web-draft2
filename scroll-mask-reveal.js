/**
 * Scroll Mask Reveal Component (Framer port)
 * Original: https://framer.com/m/ScrollMaskReveal-kxiuIp.js@cOfcvhoAnA4UCakEbTqF
 * Converted to high-performance zero-dependency module for Evntiqa
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScrollMaskReveal = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp01(n) {
    return Math.min(1, Math.max(0, n));
  }

  // Smoothstep easing (same as Framer's useEasedScrollProgress)
  function smoothstep(p) {
    return p * p * (3 - 2 * p);
  }

  function initScrollMaskReveal(selectorOrEl, options = {}) {
    const container = typeof selectorOrEl === 'string'
      ? document.querySelector(selectorOrEl)
      : selectorOrEl;

    if (!container) return null;

    const config = Object.assign({
      startSize: 28,      // percentage of viewport for mask at start
      endSize: 260,       // percentage of viewport for mask at completion
      maskSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><circle cx="300" cy="300" r="300" fill="white"/></svg>`,
      onProgress: null
    }, options);

    const maskSvgDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(config.maskSvg)}`;

    const maskedEl = container.querySelector('[data-smr-masked]');
    const videoEl = container.querySelector('video');
    const headerEl = container.querySelector('[data-smr-header]');
    const maskBorder = container.querySelector('[data-smr-border]');

    if (!maskedEl) return null;

    // Apply SVG mask
    maskedEl.style.maskImage = `url("${maskSvgDataUri}")`;
    maskedEl.style.webkitMaskImage = `url("${maskSvgDataUri}")`;
    maskedEl.style.maskPosition = 'center center';
    maskedEl.style.webkitMaskPosition = 'center center';
    maskedEl.style.maskRepeat = 'no-repeat';
    maskedEl.style.webkitMaskRepeat = 'no-repeat';

    let isVisible = false;
    let ticking = false;

    function update() {
      ticking = false;
      if (!isVisible) return;

      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      // Expand mask as section enters and pins
      // Start expanding when section top reaches 70% of viewport height
      // Reach full expansion when section top reaches -10% of viewport height
      const startRevealAt = viewportHeight * 0.7;
      const revealDistance = viewportHeight * 0.85;
      const rawProgress = clamp01((startRevealAt - rect.top) / revealDistance);
      const easedProgress = smoothstep(rawProgress);

      const targetSize = config.startSize + (config.endSize - config.startSize) * easedProgress;

      // Set mask size on the masked video layer
      const maskSizeStr = `${targetSize.toFixed(1)}%`;
      maskedEl.style.maskSize = maskSizeStr;
      maskedEl.style.webkitMaskSize = maskSizeStr;

      // Update glowing border ring around the expanding portal
      if (maskBorder) {
        const basePx = Math.min(viewportHeight, window.innerWidth || 1200) * (targetSize / 100);
        maskBorder.style.width = `${basePx.toFixed(1)}px`;
        maskBorder.style.height = `${basePx.toFixed(1)}px`;
        // Fade border ring out as mask completes expansion
        const borderOpacity = clamp01(1 - (rawProgress - 0.2) * 2.2);
        maskBorder.style.opacity = borderOpacity.toFixed(3);
      }

      // Smoothly reveal header onto the video background as mask expands
      if (headerEl) {
        const headerProgress = clamp01((rawProgress - 0.15) / 0.55);
        const headerOpacity = smoothstep(headerProgress);
        headerEl.style.opacity = headerOpacity.toFixed(3);
        headerEl.style.transform = `translateY(${((1 - headerOpacity) * 28).toFixed(1)}px)`;
      }

      if (typeof config.onProgress === 'function') {
        config.onProgress(rawProgress, easedProgress, targetSize);
      }
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    // Video playback management & viewport visibility
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isVisible = entry.isIntersecting;
        if (isVisible) {
          if (videoEl && videoEl.paused) {
            videoEl.play().catch(() => {});
          }
          update();
        } else {
          if (videoEl && !videoEl.paused) {
            videoEl.pause();
          }
        }
      });
    }, { threshold: [0, 0.05, 0.2, 0.5, 0.8, 1.0] });

    observer.observe(container);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // Initial pass
    update();

    return {
      destroy: function () {
        observer.disconnect();
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      },
      update: update
    };
  }

  return {
    init: initScrollMaskReveal
  };
});

/**
 * Scroll Mask Reveal Component (Framer port)
 * Original: https://framer.com/m/ScrollMaskReveal-kxiuIp.js@cOfcvhoAnA4UCakEbTqF
 * Converted to high-performance zero-dependency module for Evntiqa
 * Custom Mask: Evntiqa Lowercase "e" Monogram
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

  // Lowercase "e" vector path with open bottom-right aperture and upper eye counter
  const EVNTIQA_LOWER_E_PATH = 'M 507 265 A 210 210 0 1 0 456 441 L 382 374 A 110 110 0 0 1 196 335 L 507 335 L 507 265 Z M 196 265 L 404 265 A 110 110 0 0 0 196 265 Z';

  const DEFAULT_E_MASK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><path fill-rule="evenodd" d="${EVNTIQA_LOWER_E_PATH}" fill="white"/></svg>`;

  function initScrollMaskReveal(selectorOrEl, options = {}) {
    const container = typeof selectorOrEl === 'string'
      ? document.querySelector(selectorOrEl)
      : selectorOrEl;

    if (!container) return null;
    if (container._smrInstance) {
      return container._smrInstance;
    }

    const config = Object.assign({
      startSize: 30,       // percentage of viewport for mask at start
      endSize: 2800,      // expands wide enough to completely clear all screen corners
      maskSvg: DEFAULT_E_MASK,
      onProgress: null
    }, options);

    const maskSvgDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(config.maskSvg)}`;

    const maskedEl = container.querySelector('[data-smr-masked]');
    const videoEl = container.querySelector('video');
    const headerEl = container.querySelector('[data-smr-header]');
    const maskBorder = container.querySelector('[data-smr-border]');

    if (!maskedEl) return null;

    // Apply SVG mask initially
    maskedEl.style.maskImage = `url("${maskSvgDataUri}")`;
    maskedEl.style.webkitMaskImage = `url("${maskSvgDataUri}")`;
    maskedEl.style.maskPosition = 'center center';
    maskedEl.style.webkitMaskPosition = 'center center';
    maskedEl.style.maskRepeat = 'no-repeat';
    maskedEl.style.webkitMaskRepeat = 'no-repeat';

    let ticking = false;

    function update() {
      ticking = false;

      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      // If completely offscreen, skip styling
      if (rect.bottom < -100 || rect.top > viewportHeight + 100) {
        return;
      }

      // Expand mask as section enters and pins
      // Start expanding when section top reaches 75% of viewport height
      // Reach full expansion right as the section pins at top: 0
      const startRevealAt = viewportHeight * 0.75;
      const revealDistance = viewportHeight * 0.70;
      const rawProgress = clamp01((startRevealAt - rect.top) / revealDistance);

      // Expansion progress smoothly accelerates to full bleed (1.0)
      const expansionProgress = clamp01(rawProgress / 0.85);
      const easedProgress = smoothstep(expansionProgress);

      const targetSize = config.startSize + (config.endSize - config.startSize) * easedProgress;

      // When expansion reaches completion (or targetSize >= 1500), remove mask entirely so video is 100% full bleed
      if (expansionProgress >= 0.92 || targetSize >= 1500) {
        maskedEl.style.maskImage = 'none';
        maskedEl.style.webkitMaskImage = 'none';
        maskedEl.style.mask = 'none';
        maskedEl.style.webkitMask = 'none';
      } else {
        maskedEl.style.maskImage = `url("${maskSvgDataUri}")`;
        maskedEl.style.webkitMaskImage = `url("${maskSvgDataUri}")`;
        maskedEl.style.maskPosition = 'center center';
        maskedEl.style.webkitMaskPosition = 'center center';
        maskedEl.style.maskRepeat = 'no-repeat';
        maskedEl.style.webkitMaskRepeat = 'no-repeat';
        const maskSizeStr = `${targetSize.toFixed(1)}%`;
        maskedEl.style.maskSize = maskSizeStr;
        maskedEl.style.webkitMaskSize = maskSizeStr;
      }

      // Update glowing border contour around expanding "e"
      if (maskBorder) {
        const basePx = Math.min(viewportHeight, window.innerWidth || 1200) * (targetSize / 100);
        maskBorder.style.width = `${basePx.toFixed(1)}px`;
        maskBorder.style.height = `${basePx.toFixed(1)}px`;
        // Fade border out cleanly as monogram expands
        const borderOpacity = clamp01(1 - rawProgress * 2.5);
        maskBorder.style.opacity = borderOpacity.toFixed(3);
        maskBorder.style.display = borderOpacity <= 0.01 ? 'none' : 'block';
      }

      // Smoothly reveal header onto the video background as mask expands
      if (headerEl) {
        const headerProgress = clamp01((rawProgress - 0.15) / 0.55);
        const headerOpacity = smoothstep(headerProgress);
        headerEl.style.opacity = headerOpacity.toFixed(3);
        headerEl.style.transform = `translateY(${((1 - headerOpacity) * 20).toFixed(1)}px)`;
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
        if (entry.isIntersecting) {
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

    const instance = {
      destroy: function () {
        observer.disconnect();
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        if (container._smrInstance === instance) {
          delete container._smrInstance;
        }
      },
      update: update
    };

    container._smrInstance = instance;
    return instance;
  }

  return {
    init: initScrollMaskReveal,
    EVNTIQA_LOWER_E_PATH: EVNTIQA_LOWER_E_PATH
  };
});

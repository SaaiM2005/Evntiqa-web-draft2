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
      startSize: 28,       // percentage of viewport for mask at start
      endSize: 520,        // expands wide enough to completely clear all screen corners on any display
      maskSvg: DEFAULT_E_MASK,
      revealDistance: null, // dynamic based on viewport & container
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
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1200;

      // If completely offscreen, skip styling
      if (rect.bottom < -100 || rect.top > viewportHeight + 100) {
        return;
      }

      // Mask is visible when entering the section.
      // While entering (rect.top > 0), progress is 0 and mask stays at startSize.
      // The expansion begins when the section reaches top: 0 (pins in viewport).
      const pinnedScroll = Math.max(0, -rect.top);

      // Section height and available pinned travel
      const containerHeight = container.offsetHeight || (viewportHeight * 2.2);
      const maxPinTravel = Math.max(viewportHeight * 0.5, containerHeight - viewportHeight);

      // Reveal distance: expands across ~85% of viewport height (or ~72% of pinned travel)
      // to reduce scroll speed smoothly.
      const revealDistance = config.revealDistance || Math.min(viewportHeight * 0.90, maxPinTravel * 0.72);

      const rawProgress = clamp01(pinnedScroll / revealDistance);

      // Expansion progress smoothly accelerates to full bleed (1.0)
      const expansionProgress = clamp01(rawProgress / 0.88);
      const easedProgress = smoothstep(expansionProgress);

      const targetSize = config.startSize + (config.endSize - config.startSize) * easedProgress;

      // When expansion reaches completion (or targetSize >= 450), remove mask entirely so video is 100% full bleed
      if (expansionProgress >= 0.95 || targetSize >= 450) {
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
        const svgPx = viewportWidth * (targetSize / 100);
        const basePx = svgPx * 0.70; // 0.70 is diameter of outer circle (2 * 210 / 600)
        maskBorder.style.width = `${basePx.toFixed(1)}px`;
        maskBorder.style.height = `${basePx.toFixed(1)}px`;
        // Fade border out cleanly as monogram expands
        const borderOpacity = clamp01(1 - rawProgress * 2.2);
        maskBorder.style.opacity = borderOpacity.toFixed(3);
        maskBorder.style.display = borderOpacity <= 0.01 ? 'none' : 'block';
      }

      // Smoothly reveal header onto the video background as mask expands
      if (headerEl) {
        const headerProgress = clamp01((rawProgress - 0.20) / 0.50);
        const headerOpacity = smoothstep(headerProgress);
        headerEl.style.opacity = headerOpacity.toFixed(3);
        headerEl.style.transform = `translateY(${((1 - headerOpacity) * 20).toFixed(1)}px)`;
      }

      // Reveal step cards as mask opens wide enough to showcase them
      const stepCards = container.querySelectorAll('[data-step-card]');
      if (stepCards.length > 0) {
        stepCards.forEach((card, i) => {
          const cardOffset = i * 0.04;
          const individualProgress = clamp01((rawProgress - 0.25 - cardOffset) / 0.40);
          const indivOpacity = smoothstep(individualProgress);
          card.style.opacity = indivOpacity.toFixed(3);
          card.style.transform = `translateY(${((1 - indivOpacity) * 16).toFixed(1)}px)`;
        });
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

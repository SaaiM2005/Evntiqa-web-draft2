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

    // Step timeline timing, in units of revealDistance scrolled. Unlike the
    // mask this runs past 1, using the rest of the pinned travel so each
    // step reveals on its own, one after another.
    const STEP_START = 0.7;
    const STEP_STAGGER = 0.24;
    const STEP_DURATION = 0.26;
    // Fraction of a step's reveal at which the rail fill reaches its node
    const NODE_HIT = 0.12;

    const timelineEl = container.querySelector('#process-timeline');
    let railsCache = null;

    // Assign each step node to the visible rail it sits on, and record its
    // position along that rail (0→1). Measured once per layout.
    function getRails(count) {
      if (railsCache) return railsCache;
      const nodes = container.querySelectorAll('[data-step-node]');
      if (nodes.length !== count) return null;

      const rails = [];
      container.querySelectorAll('[data-steps-rail]').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (!rect.width && !rect.height) return; // hidden at this breakpoint
        rails.push({ el, rect, vertical: rect.height > rect.width, stops: [] });
      });
      if (!rails.length) return null;

      Array.prototype.forEach.call(nodes, (node, index) => {
        const r = node.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let best = null;
        let bestDistance = Infinity;
        rails.forEach((rail) => {
          const distance = rail.vertical
            ? Math.abs(cx - (rail.rect.left + rail.rect.width / 2))
            : Math.abs(cy - (rail.rect.top + rail.rect.height / 2));
          if (distance < bestDistance) {
            bestDistance = distance;
            best = rail;
          }
        });
        const length = best.vertical ? best.rect.height : best.rect.width;
        const along = best.vertical ? cy - best.rect.top : cx - best.rect.left;
        best.stops.push({ index, stop: clamp01(along / length) });
      });

      railsCache = rails.filter((rail) => rail.stops.length);
      return railsCache;
    }

    // Piecewise-linear interpolation of value at time t
    function interpolate(times, values, t) {
      if (t <= times[0]) return values[0];
      for (let k = 1; k < times.length; k++) {
        if (t < times[k]) {
          const segment = (t - times[k - 1]) / (times[k] - times[k - 1]);
          return values[k - 1] + (values[k] - values[k - 1]) * segment;
        }
      }
      return values[values.length - 1];
    }

    function onResize() {
      railsCache = null;
      onScroll();
    }

    // Card heights shift when fonts load or content re-renders; re-measure nodes then
    const timelineObserver = (timelineEl && typeof ResizeObserver !== 'undefined')
      ? new ResizeObserver(() => { railsCache = null; })
      : null;
    if (timelineObserver) timelineObserver.observe(timelineEl);

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
      const stepProgress = pinnedScroll / revealDistance;

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

      // Smoothly fade label as scroll starts
      const labelEl = container.querySelector('[data-smr-label]');
      if (labelEl) {
        const labelOpacity = clamp01(1 - rawProgress * 3.0);
        labelEl.style.opacity = labelOpacity.toFixed(3);
        labelEl.style.transform = `translateX(-50%) translateY(${(rawProgress * 14).toFixed(1)}px)`;
      }

      // Smoothly reveal header onto the video background as mask expands
      if (headerEl) {
        const headerProgress = clamp01((rawProgress - 0.20) / 0.50);
        const headerOpacity = smoothstep(headerProgress);
        headerEl.style.opacity = headerOpacity.toFixed(3);
        headerEl.style.transform = `translateY(${((1 - headerOpacity) * 20).toFixed(1)}px)`;
      }

      // Reveal steps one after another once the video is near full bleed
      const stepCards = container.querySelectorAll('[data-step-card]');
      if (stepCards.length > 0) {
        const rails = getRails(stepCards.length);

        stepCards.forEach((card, i) => {
          const start = STEP_START + i * STEP_STAGGER;
          const individualProgress = clamp01((stepProgress - start) / STEP_DURATION);
          card.style.setProperty('--p', smoothstep(individualProgress).toFixed(3));
          card.classList.toggle('is-lit', individualProgress >= NODE_HIT);
        });

        // The rail fill travels node to node, arriving at each node just as
        // that step starts revealing (and its node lights up). A later rail
        // starts once the previous one ends.
        if (timelineEl && rails) {
          const nodeHit = (i) => STEP_START + i * STEP_STAGGER + NODE_HIT * STEP_DURATION;
          let previousEnd = 0;
          rails.forEach((rail) => {
            const first = rail.stops[0].index;
            const times = [Math.max(nodeHit(first) - 0.12, previousEnd)];
            const values = [0];
            rail.stops.forEach(({ index, stop }) => {
              if (stop <= values[values.length - 1] + 0.001) return;
              times.push(Math.max(nodeHit(index), times[times.length - 1] + 0.01));
              values.push(stop);
            });
            previousEnd = times[times.length - 1];
            times.push(previousEnd + 0.15);
            values.push(1);
            rail.el.style.setProperty('--rail', interpolate(times, values, stepProgress).toFixed(4));
          });
          timelineEl.style.setProperty('--t', smoothstep(clamp01((stepProgress - 0.45) / 0.2)).toFixed(3));
        }
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

    // Aggressive early video warm-up & playback management
    if (videoEl) {
      videoEl.muted = true;
      videoEl.defaultMuted = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', '');

      const startPlay = () => {
        const p = videoEl.play();
        if (p !== undefined) {
          p.catch(() => {
            const unlockPlay = () => {
              videoEl.play().catch(() => {});
              window.removeEventListener('touchstart', unlockPlay);
              window.removeEventListener('scroll', unlockPlay);
              window.removeEventListener('click', unlockPlay);
            };
            window.addEventListener('touchstart', unlockPlay, { passive: true });
            window.addEventListener('scroll', unlockPlay, { passive: true });
            window.addEventListener('click', unlockPlay, { passive: true });
          });
        }
      };

      // Warm up immediately so browser buffers it
      startPlay();
    }

    // Video playback management with 800px rootMargin so video is playing BEFORE entering viewport
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (videoEl && videoEl.paused) {
            videoEl.play().catch(() => {});
          }
          update();
        } else {
          // Only pause when far offscreen (>800px away)
          if (videoEl && !videoEl.paused) {
            videoEl.pause();
          }
        }
      });
    }, {
      rootMargin: '800px 0px 800px 0px',
      threshold: 0
    });

    observer.observe(container);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    // Initial pass
    update();

    const instance = {
      destroy: function () {
        observer.disconnect();
        if (timelineObserver) timelineObserver.disconnect();
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
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

/**
 * Process Timeline
 * Pins the "Six Steps" section and reveals its steps one after another as
 * the page scrolls, filling the rail node to node.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProcessTimeline = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp01(n) {
    return Math.min(1, Math.max(0, n));
  }

  function smoothstep(p) {
    return p * p * (3 - 2 * p);
  }

  // Step timing, in units of `scrollUnit` scrolled while pinned
  const STEP_START = 0.2;
  const STEP_STAGGER = 0.24;
  const STEP_DURATION = 0.26;
  // Fraction of a step's reveal at which the rail fill reaches its node
  const NODE_HIT = 0.12;

  function initProcessTimeline(selectorOrEl) {
    const container = typeof selectorOrEl === 'string'
      ? document.querySelector(selectorOrEl)
      : selectorOrEl;

    if (!container) return null;
    if (container._timelineInstance) return container._timelineInstance;

    const timelineEl = container.querySelector('#process-timeline');
    const stepCards = container.querySelectorAll('[data-step-card]');
    let railsCache = null;
    let ticking = false;

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

    function update() {
      ticking = false;

      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      if (rect.bottom < -100 || rect.top > viewportHeight + 100) return;

      const pinnedScroll = Math.max(0, -rect.top);
      const scrollUnit = viewportHeight * 0.9;
      const progress = pinnedScroll / scrollUnit;

      stepCards.forEach((card, i) => {
        const start = STEP_START + i * STEP_STAGGER;
        const individualProgress = clamp01((progress - start) / STEP_DURATION);
        card.style.setProperty('--p', smoothstep(individualProgress).toFixed(3));
        card.classList.toggle('is-lit', individualProgress >= NODE_HIT);
      });

      // The rail fill travels node to node, arriving at each node just as
      // that step starts revealing (and its node lights up). A later rail
      // starts once the previous one ends.
      const rails = stepCards.length ? getRails(stepCards.length) : null;
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
          rail.el.style.setProperty('--rail', interpolate(times, values, progress).toFixed(4));
        });
        timelineEl.style.setProperty('--t', smoothstep(clamp01(progress / 0.12)).toFixed(3));
      }
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
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

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    update();

    const instance = {
      destroy: function () {
        if (timelineObserver) timelineObserver.disconnect();
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
        if (container._timelineInstance === instance) {
          delete container._timelineInstance;
        }
      },
      update: update
    };

    container._timelineInstance = instance;
    return instance;
  }

  return { init: initProcessTimeline };
});

/**
 * LinkNest health.php UI helpers (external — CSP script-src 'self' + jsDelivr for Mermaid).
 * Theme preference: cookie ln_health_theme + localStorage ln-health-theme.
 */
(function () {
  'use strict';

  var COOKIE = 'ln_health_theme';
  var STORAGE = 'ln-health-theme';
  var MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js';
  var root = document.documentElement;
  var mermaidLoadPromise = null;
  var mermaidReady = false;
  var flowSvg = null;
  var flowRaf = 0;
  var flowPackets = [];
  var flowStartedAt = 0;

  function readStoredTheme() {
    try {
      var s = localStorage.getItem(STORAGE);
      if (s === 'light' || s === 'dark') return s;
    } catch (e) {}
    return null;
  }

  function writeCookie(theme) {
    document.cookie =
      COOKIE +
      '=' +
      encodeURIComponent(theme) +
      '; Path=/; Max-Age=31536000; SameSite=Lax';
  }

  function syncThemeUi(theme) {
    var isLight = theme === 'light';
    var toggle = document.getElementById('themeToggle');
    var themeLabel = document.getElementById('themeLabel');
    if (themeLabel) {
      themeLabel.textContent = isLight ? 'Night mode' : 'Day mode';
    }
    if (toggle) {
      toggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
      toggle.title = isLight ? 'Switch to night mode' : 'Switch to day mode';
    }
  }

  function setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      theme = 'dark';
    }
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE, theme);
    } catch (e) {}
    writeCookie(theme);
    syncThemeUi(theme);
    if (mermaidReady) {
      renderMermaid(true);
    }
  }

  function initTheme() {
    var stored = readStoredTheme();
    var current = root.getAttribute('data-theme');
    if (stored && stored !== current) {
      setTheme(stored);
    } else {
      syncThemeUi(current === 'light' ? 'light' : 'dark');
      if (current === 'light' || current === 'dark') {
        writeCookie(current);
      }
    }

    var toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        setTheme(next);
      });
    }
  }

  function showToast(msg) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.classList.remove('show');
    }, 2200);
  }

  function initExport() {
    var exportBtn = document.getElementById('exportJson');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', function (ev) {
      var el = document.getElementById('health-payload');
      var name = exportBtn.getAttribute('data-filename') || 'health.json';
      var raw = '';
      if (el) {
        raw = typeof el.value === 'string' && el.value !== '' ? el.value : (el.textContent || '');
      }
      if (!raw) {
        return;
      }
      try {
        var pretty = JSON.stringify(JSON.parse(raw), null, 2);
        var blob = new Blob([pretty], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Downloaded ' + name);
        ev.preventDefault();
      } catch (e) {
        // Fall through to href download
      }
    });
  }

  function diagramSource() {
    var src = document.getElementById('health-mermaid-source');
    if (!src) return '';
    return (typeof src.value === 'string' ? src.value : src.textContent || '').trim();
  }

  function currentDiagramMode() {
    var section = document.querySelector('[data-mermaid-diagram]');
    var mode = section ? section.getAttribute('data-diagram-mode') : 'flow';
    return mode === 'seq' ? 'seq' : 'flow';
  }

  function syncActiveSourceFromMode(mode) {
    var active = document.getElementById('health-mermaid-source');
    var from = document.getElementById(
      mode === 'seq' ? 'health-mermaid-source-seq' : 'health-mermaid-source-flow'
    );
    if (!active || !from) return;
    active.value = typeof from.value === 'string' ? from.value : from.textContent || '';
  }

  function setDiagramMode(mode) {
    mode = mode === 'seq' ? 'seq' : 'flow';
    var section = document.querySelector('[data-mermaid-diagram]');
    var title = document.getElementById('diagramTitle');
    var sub = document.getElementById('diagramSub');
    var live = document.getElementById('mermaidLiveLink');
    var fallbackLink = document.getElementById('mermaidFallbackLink');
    var flowBtn = document.getElementById('diagramModeFlow');
    var seqBtn = document.getElementById('diagramModeSeq');
    var sourceView = section ? section.querySelector('[data-mermaid-source-view]') : null;
    var canvas = document.getElementById('mermaid-canvas');
    var viewBtn = section ? section.querySelector('[data-mermaid-action="view"]') : null;

    if (section) {
      section.setAttribute('data-diagram-mode', mode);
      section.setAttribute(
        'aria-label',
        mode === 'seq' ? 'Request sequence diagram' : 'Deploy architecture diagram'
      );
    }
    if (title) {
      title.textContent = mode === 'seq' ? 'Sequence diagram' : 'Architecture diagram';
    }
    if (sub) {
      sub.textContent =
        mode === 'seq'
          ? 'Request lifecycle for this host: Browser → Apache → PHP → SQLite → response.'
          : 'Runtime layout for this host. Colored balls travel solid edges to show request / data flow (Pause flow to stop).';
    }
    var liveUrl = section
      ? section.getAttribute(mode === 'seq' ? 'data-live-seq' : 'data-live-flow') || ''
      : '';
    if (live && liveUrl) live.setAttribute('href', liveUrl);
    if (fallbackLink && liveUrl) fallbackLink.setAttribute('href', liveUrl);

    if (flowBtn) {
      flowBtn.classList.toggle('btn-primary', mode === 'flow');
      flowBtn.setAttribute('aria-pressed', mode === 'flow' ? 'true' : 'false');
    }
    if (seqBtn) {
      seqBtn.classList.toggle('btn-primary', mode === 'seq');
      seqBtn.setAttribute('aria-pressed', mode === 'seq' ? 'true' : 'false');
    }

    if (sourceView) sourceView.setAttribute('hidden', '');
    if (canvas) canvas.hidden = false;
    if (viewBtn) viewBtn.textContent = 'View code';

    try {
      localStorage.setItem('ln-health-diagram-mode', mode);
    } catch (e) {}

    syncActiveSourceFromMode(mode);
    if (mode === 'seq') {
      clearFlowPackets(flowSvg);
    }
    renderMermaid(true);
  }

  function initDiagramMode() {
    var flowBtn = document.getElementById('diagramModeFlow');
    var seqBtn = document.getElementById('diagramModeSeq');
    if (flowBtn) {
      flowBtn.addEventListener('click', function () {
        setDiagramMode('flow');
      });
    }
    if (seqBtn) {
      seqBtn.addEventListener('click', function () {
        setDiagramMode('seq');
      });
    }

    var stored = null;
    try {
      stored = localStorage.getItem('ln-health-diagram-mode');
    } catch (e) {}
    if (stored === 'seq' || stored === 'flow') {
      // Apply UI + source without double-render before first paint path:
      // initMermaidUi will render once after this.
      var section = document.querySelector('[data-mermaid-diagram]');
      if (section) section.setAttribute('data-diagram-mode', stored);
      syncActiveSourceFromMode(stored);
      if (stored === 'seq') {
        // Defer full setDiagramMode until after first hooks; just sync labels
        var title = document.getElementById('diagramTitle');
        var sub = document.getElementById('diagramSub');
        var live = document.getElementById('mermaidLiveLink');
        var fallbackLink = document.getElementById('mermaidFallbackLink');
        if (title) title.textContent = 'Sequence diagram';
        if (sub) {
          sub.textContent =
            'Request lifecycle for this host: Browser → Apache → PHP → SQLite → response.';
        }
        var liveUrl = section ? section.getAttribute('data-live-seq') || '' : '';
        if (live && liveUrl) live.setAttribute('href', liveUrl);
        if (fallbackLink && liveUrl) fallbackLink.setAttribute('href', liveUrl);
        if (flowBtn) {
          flowBtn.classList.remove('btn-primary');
          flowBtn.setAttribute('aria-pressed', 'false');
        }
        if (seqBtn) {
          seqBtn.classList.add('btn-primary');
          seqBtn.setAttribute('aria-pressed', 'true');
        }
      }
    } else {
      syncActiveSourceFromMode('flow');
    }
  }

  function loadMermaid() {
    if (window.mermaid) {
      return Promise.resolve(window.mermaid);
    }
    if (mermaidLoadPromise) {
      return mermaidLoadPromise;
    }
    mermaidLoadPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-linknest-health-mermaid]');
      if (existing) {
        existing.addEventListener('load', function () {
          if (window.mermaid) resolve(window.mermaid);
          else reject(new Error('Mermaid missing after load'));
        });
        existing.addEventListener('error', function () {
          reject(new Error('Mermaid CDN failed'));
        });
        return;
      }
      var script = document.createElement('script');
      script.src = MERMAID_CDN;
      script.async = true;
      script.dataset.linknestHealthMermaid = '1';
      script.onload = function () {
        if (window.mermaid) resolve(window.mermaid);
        else {
          mermaidLoadPromise = null;
          reject(new Error('Mermaid loaded but window.mermaid is missing'));
        }
      };
      script.onerror = function () {
        mermaidLoadPromise = null;
        reject(new Error('Failed to load Mermaid from CDN'));
      };
      document.head.appendChild(script);
    });
    return mermaidLoadPromise;
  }

  function renderMermaid(force) {
    var node = document.getElementById('health-mermaid');
    var fallback = document.getElementById('mermaid-fallback');
    var source = diagramSource();
    if (!node || !source) return Promise.resolve();

    return loadMermaid()
      .then(function (mermaid) {
        var dark = root.getAttribute('data-theme') !== 'light';
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: dark ? 'dark' : 'default',
          fontFamily: 'Segoe UI, ui-sans-serif, system-ui, sans-serif',
          flowchart: {
            htmlLabels: true,
            curve: 'basis',
            padding: 16,
            nodeSpacing: 40,
            rankSpacing: 48,
            useMaxWidth: true,
          },
        });
        node.removeAttribute('data-processed');
        node.textContent = source;
        return mermaid.run({ nodes: [node] }).then(function () {
          mermaidReady = true;
          if (fallback) fallback.hidden = true;
          var svg = node.querySelector('svg');
          if (svg) {
            svg.style.maxWidth = '100%';
            svg.style.height = 'auto';
            if (currentDiagramMode() === 'flow') {
              startFlowPackets(svg);
            } else {
              clearFlowPackets(svg);
              flowSvg = svg;
            }
          }
          syncFlowToggleUi();
        });
      })
      .catch(function () {
        mermaidReady = false;
        if (fallback) fallback.hidden = false;
        if (force) showToast('Mermaid render failed — use Mermaid Live');
      });
  }

  function stopFlowPackets() {
    if (flowRaf) {
      cancelAnimationFrame(flowRaf);
      flowRaf = 0;
    }
  }

  function clearFlowPackets(svg) {
    stopFlowPackets();
    flowPackets = [];
    var rootSvg = svg || flowSvg;
    if (!rootSvg) return;
    var layers = rootSvg.querySelectorAll('.ln-flow-layer');
    for (var i = 0; i < layers.length; i++) {
      layers[i].parentNode.removeChild(layers[i]);
    }
  }

  function collectEdgePaths(svg) {
    var found = [];
    var seen = [];
    var nodes = svg.querySelectorAll('path.flowchart-link, .edgePath > path');
    for (var i = 0; i < nodes.length; i++) {
      var path = nodes[i];
      if (seen.indexOf(path) !== -1) continue;
      seen.push(path);
      var d = path.getAttribute('d') || '';
      if (!d || d.length < 4) continue;
      var len = 0;
      try {
        len = path.getTotalLength();
      } catch (e) {
        len = 0;
      }
      if (!len || len < 12) continue;
      found.push(path);
    }
    return found;
  }

  function pathKind(path) {
    var cls = (path.getAttribute('class') || '').toLowerCase();
    var id = ((path.closest('.edgePath') && path.closest('.edgePath').id) || path.id || '').toLowerCase();
    if (
      cls.indexOf('dashed') !== -1 ||
      cls.indexOf('edge-pattern-dashed') !== -1 ||
      id.indexOf('build') !== -1
    ) {
      return 'build';
    }
    return 'request';
  }

  function startFlowPackets(svg) {
    clearFlowPackets(svg);
    flowSvg = svg || flowSvg;
    if (!flowSvg || !flowEnabled()) return;

    var preferReduce = false;
    try {
      preferReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {}
    if (preferReduce) return;

    var NS = 'http://www.w3.org/2000/svg';
    var layer = document.createElementNS(NS, 'g');
    layer.setAttribute('class', 'ln-flow-layer');
    flowSvg.appendChild(layer);

    var paths = collectEdgePaths(flowSvg);
    var dataTail = Math.max(0, paths.length - 2);

    for (var i = 0; i < paths.length; i++) {
      var path = paths[i];
      var kind = pathKind(path);
      if (kind === 'request' && i >= dataTail) {
        kind = 'data';
      }
      var len = path.getTotalLength();
      var duration = Math.max(1600, Math.min(4800, len * 14));
      if (kind === 'build') duration *= 1.55;
      if (kind === 'data') duration *= 0.85;

      var balls = kind === 'data' ? 2 : 1;
      for (var b = 0; b < balls; b++) {
        var circle = document.createElementNS(NS, 'circle');
        var radius = kind === 'data' ? 4.6 : kind === 'build' ? 3.8 : 3.5;
        circle.setAttribute('r', String(radius));
        circle.setAttribute(
          'class',
          'ln-flow-packet' +
            (kind === 'data' ? ' ln-flow-packet-data' : '') +
            (kind === 'build' ? ' ln-flow-packet-build' : '')
        );
        circle.setAttribute('cx', '0');
        circle.setAttribute('cy', '0');
        layer.appendChild(circle);
        flowPackets.push({
          el: circle,
          path: path,
          len: len,
          duration: duration,
          phase: (b / balls + i * 0.08) % 1,
        });
      }
    }

    if (!flowPackets.length) return;

    flowStartedAt = performance.now();
    function tick(now) {
      if (!flowEnabled() || !flowSvg) {
        flowRaf = 0;
        return;
      }
      var t = now - flowStartedAt;
      for (var p = 0; p < flowPackets.length; p++) {
        var pkt = flowPackets[p];
        var u = (t / pkt.duration + pkt.phase) % 1;
        if (u < 0) u += 1;
        var pt = pkt.path.getPointAtLength(u * pkt.len);
        pkt.el.setAttribute('cx', String(pt.x));
        pkt.el.setAttribute('cy', String(pt.y));
      }
      flowRaf = requestAnimationFrame(tick);
    }
    flowRaf = requestAnimationFrame(tick);
  }

  function flowEnabled() {
    var canvas = document.getElementById('mermaid-canvas');
    if (!canvas) return true;
    return canvas.classList.contains('ln-flow-on');
  }

  function setFlowEnabled(on) {
    var canvas = document.getElementById('mermaid-canvas');
    if (!canvas) return;
    canvas.classList.toggle('ln-flow-on', on);
    canvas.classList.toggle('ln-flow-off', !on);
    try {
      localStorage.setItem('ln-health-flow', on ? 'on' : 'off');
    } catch (e) {}
    syncFlowToggleUi();
    if (on) {
      if (flowSvg) startFlowPackets(flowSvg);
    } else {
      stopFlowPackets();
    }
  }

  function syncFlowToggleUi() {
    var btn = document.getElementById('flowToggle');
    if (!btn) return;
    var on = flowEnabled();
    btn.setAttribute('data-flow', on ? 'on' : 'off');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'Pause flow' : 'Animate flow';
    btn.title = on ? 'Pause data-flow animation' : 'Resume data-flow animation';
  }

  function initFlowToggle() {
    var btn = document.getElementById('flowToggle');
    var canvas = document.getElementById('mermaid-canvas');
    if (!canvas) return;

    var preferReduce = false;
    try {
      preferReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {}

    var stored = null;
    try {
      stored = localStorage.getItem('ln-health-flow');
    } catch (e) {}

    if (stored === 'on' || stored === 'off') {
      setFlowEnabled(stored === 'on');
    } else {
      setFlowEnabled(!preferReduce);
    }

    if (btn) {
      btn.addEventListener('click', function () {
        setFlowEnabled(!flowEnabled());
      });
    }
  }

  function initMermaidUi() {
    var section = document.querySelector('[data-mermaid-diagram]');
    if (!section) return;

    var sourceView = section.querySelector('[data-mermaid-source-view]');
    var canvas = section.querySelector('.mermaid-canvas');
    var viewBtn = section.querySelector('[data-mermaid-action="view"]');

    initDiagramMode();
    initFlowToggle();

    section.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-mermaid-action]') : null;
      if (!btn || btn.tagName === 'A') return;
      var action = btn.getAttribute('data-mermaid-action');
      var source = diagramSource();

      if (action === 'view') {
        if (!sourceView || !canvas) return;
        var showing = !sourceView.hasAttribute('hidden');
        if (showing) {
          sourceView.setAttribute('hidden', '');
          canvas.hidden = false;
          btn.textContent = 'View code';
        } else {
          sourceView.textContent = source;
          sourceView.removeAttribute('hidden');
          canvas.hidden = true;
          btn.textContent = 'View diagram';
        }
        return;
      }

      if (action === 'copy') {
        if (!source) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(source).then(
            function () {
              showToast('Mermaid source copied');
            },
            function () {
              showToast('Copy failed');
            }
          );
        } else {
          showToast('Clipboard unavailable');
        }
        return;
      }

      if (action === 'refresh') {
        if (sourceView) sourceView.setAttribute('hidden', '');
        if (canvas) canvas.hidden = false;
        if (viewBtn) viewBtn.textContent = 'View code';
        renderMermaid(true);
      }
    });

    renderMermaid(false);
  }

  function boot() {
    initTheme();
    initExport();
    initMermaidUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

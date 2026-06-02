// GSM (Global Scalable Matrix) — Real-time Control Center & Landing Page Logic
// Cross-subdomain (app.gsm.app <-> api.gsm.app). All fetches use credentials: 'include'.
// API base is provided at build time via dist/config.js (window.__GSM_CONFIG__.API_BASE).

(function () {
  'use strict';

  // ─── Config & State ──────────────────────────────────────────────────────────
  const CFG = Object.assign(
    { API_BASE: '', APP_VERSION: '1.2.0', ENV_NAME: 'production' },
    (typeof window !== 'undefined' && window.__GSM_CONFIG__) || {}
  );

  // Resolve API base: explicit config > same origin > relative.
  // In cross-subdomain deploys, set API_BASE=https://api.gsm.app at build time.
  const API_BASE = (CFG.API_BASE || window.location.origin).replace(/\/+$/, '');

  const STATE = {
    updateInterval: null,
    authChecked: false,
    lastEventTs: 0,
    isOnline: false,
    pollFailures: 0
  };

  // ─── DOM Cache ───────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  const dom = {
    // Landing
    landing: $('landing-section'),
    responsibilityCheck: $('responsibility-check'),
    googleConnectBtn: $('google-connect-btn'),

    // Dashboard
    dashboard: $('dashboard-section'),
    systemStatusBadge: $('system-status'),
    metricCpu: $('metric-cpu'),
    metricMem: $('metric-mem'),
    metricNodes: $('metric-nodes'),
    metricPing: $('metric-ping'),
    cpuBar: $('cpu-bar'),
    memBar: $('mem-bar'),
    streamContainer: $('event-stream-container'),
    eventTypeInput: $('event-type'),
    eventPayloadInput: $('event-payload'),
    btnPublish: $('btn-publish'),
    btnClearFeed: $('btn-clear-feed'),

    // Mobile
    mobileMenuBtn: $('mobile-menu-btn'),
    mobileNav: $('mobile-nav')
  };

  // ─── Utilities ───────────────────────────────────────────────────────────────
  const POLL_MS = 2500;
  const MAX_FAILURES = 4;

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeJsonStringify(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return '[unserializable payload]';
    }
  }

  async function apiFetch(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const opts = Object.assign(
      { credentials: 'include', headers: {} },
      options
    );
    if (opts.body && typeof opts.body !== 'string' && !opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    return res;
  }

  function showError(msg) {
    console.error('[GSM]', msg);
  }

  // ─── Bootstrap ───────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initSmoothAnchors();
    determineAuthAndRender();
  });

  async function determineAuthAndRender() {
    // We never rely on document.cookie alone (HttpOnly cookies are invisible to JS).
    // Try a lightweight /api/status call. Backend returns 200 if authed, 401 otherwise.
    try {
      const res = await apiFetch('/api/status', { method: 'GET' });
      if (res.ok) {
        enterDashboard();
      } else if (res.status === 401 || res.status === 403) {
        enterLanding();
      } else {
        // Network reachable but unexpected status — fall back to landing
        enterLanding();
      }
    } catch (err) {
      // Network error: backend unreachable. Show landing optimistically
      // but keep "system status" badge honest when user later reaches dashboard.
      enterLanding();
    } finally {
      STATE.authChecked = true;
    }
  }

  // ─── LANDING ─────────────────────────────────────────────────────────────────
  function enterLanding() {
    if (!dom.landing) return;
    dom.landing.classList.remove('hidden');
    dom.dashboard && dom.dashboard.classList.add('hidden');
    initLandingPage();
  }

  function initLandingPage() {
    if (!dom.responsibilityCheck || !dom.googleConnectBtn) return;
    dom.responsibilityCheck.addEventListener('change', (e) => {
      if (e.target.checked) {
        dom.googleConnectBtn.classList.remove(
          'pointer-events-none',
          'text-slate-500',
          'bg-slate-800/40',
          'border-slate-700/50'
        );
        dom.googleConnectBtn.classList.add(
          'text-slate-900',
          'bg-white',
          'hover:bg-slate-100',
          'border-white',
          'shadow-2xl'
        );
        dom.googleConnectBtn.style.boxShadow =
          '0 10px 25px rgba(255,255,255,0.08), 0 0 20px rgba(66,133,244,0.15)';
        dom.googleConnectBtn.removeAttribute('aria-disabled');
        dom.googleConnectBtn.setAttribute('tabindex', '0');
      } else {
        dom.googleConnectBtn.classList.add(
          'pointer-events-none',
          'text-slate-500',
          'bg-slate-800/40',
          'border-slate-700/50'
        );
        dom.googleConnectBtn.classList.remove(
          'text-slate-900',
          'bg-white',
          'hover:bg-slate-100',
          'border-white',
          'shadow-2xl'
        );
        dom.googleConnectBtn.style.boxShadow = 'none';
        dom.googleConnectBtn.setAttribute('aria-disabled', 'true');
        dom.googleConnectBtn.setAttribute('tabindex', '-1');
      }
    });
  }

  // ─── DASHBOARD ───────────────────────────────────────────────────────────────
  function enterDashboard() {
    if (!dom.dashboard) return;
    dom.dashboard.classList.remove('hidden');
    dom.landing && dom.landing.classList.add('hidden');
    initDashboard();
  }

  function initDashboard() {
    if (STATE.updateInterval) clearInterval(STATE.updateInterval);
    void checkSystemStatus();
    void fetchEvents();

    STATE.updateInterval = setInterval(() => {
      void checkSystemStatus();
      void fetchEvents();
    }, POLL_MS);

    if (dom.btnPublish) dom.btnPublish.addEventListener('click', injectEvent);
    if (dom.btnClearFeed) {
      dom.btnClearFeed.addEventListener('click', () => {
        dom.streamContainer.innerHTML =
          '<div class="text-slate-500 italic text-center py-10">Stream cleared. Waiting for events...</div>';
      });
    }

    // Pause polling when tab is hidden (saves backend load)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!STATE.updateInterval) {
          STATE.updateInterval = setInterval(pollOnce, POLL_MS);
        }
        void pollOnce();
      } else {
        if (STATE.updateInterval) {
          clearInterval(STATE.updateInterval);
          STATE.updateInterval = null;
        }
      }
    });
  }

  async function pollOnce() {
    await checkSystemStatus();
    await fetchEvents();
  }

  // ─── API: /api/status ────────────────────────────────────────────────────────
  async function checkSystemStatus() {
    const start = performance.now();
    try {
      const res = await apiFetch('/api/status', { method: 'GET' });
      const duration = Math.round(performance.now() - start);

      if (res.ok) {
        STATE.isOnline = true;
        STATE.pollFailures = 0;
        dom.systemStatusBadge.textContent = 'OPERATIONAL';
        dom.systemStatusBadge.className =
          'status-pill-ok shadow-glow-green';
        if (dom.metricPing) dom.metricPing.textContent = `${duration} ms`;
      } else if (res.status === 401 || res.status === 403) {
        handleAuthExpired();
      } else {
        setDisconnectedState();
      }
    } catch (err) {
      setDisconnectedState();
    }
  }

  function setDisconnectedState() {
    STATE.isOnline = false;
    STATE.pollFailures += 1;
    if (dom.systemStatusBadge) {
      dom.systemStatusBadge.textContent =
        STATE.pollFailures >= MAX_FAILURES ? 'OFFLINE' : 'CONNECTING…';
      dom.systemStatusBadge.className =
        STATE.pollFailures >= MAX_FAILURES
          ? 'status-pill-off shadow-glow-blue'
          : 'status-pill-warn';
    }
    if (dom.metricPing) dom.metricPing.textContent = '-- ms';
  }

  function handleAuthExpired() {
    if (STATE.updateInterval) {
      clearInterval(STATE.updateInterval);
      STATE.updateInterval = null;
    }
    showError('Session expired. Redirecting to login.');
    // Replace cookie if not HttpOnly; otherwise backend has already cleared it.
    document.cookie = 'gsm_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    // Small delay so the user perceives a clean transition
    setTimeout(() => window.location.assign('/'), 600);
  }

  // ─── API: /api/events ────────────────────────────────────────────────────────
  async function fetchEvents() {
    try {
      const res = await apiFetch('/api/events', { method: 'GET' });
      if (res.status === 401 || res.status === 403) {
        handleAuthExpired();
        return;
      }
      if (!res.ok) return;

      const events = await res.json();
      if (!Array.isArray(events) || events.length === 0) return;

      renderEventStream(events);

      const systemTicks = events.filter((e) => e.type === 'SYSTEM_METRIC_TICK');
      if (systemTicks.length > 0) {
        const latest = systemTicks[systemTicks.length - 1];
        updateMetricsUI(latest.payload);
      }
    } catch (err) {
      showError(`fetchEvents failed: ${err.message}`);
    }
  }

  // ─── Metrics ─────────────────────────────────────────────────────────────────
  function updateMetricsUI(payload) {
    if (!payload || typeof payload !== 'object') return;

    const cpu = Number(payload.cpu_usage) || 0;
    const nodes = Number(payload.active_nodes) || 0;
    const memFree = Number(payload.memory_free_gb) || 0;
    const memTotal = Number(payload.memory_total_gb) || 16; // sane default

    if (dom.metricCpu) dom.metricCpu.textContent = `${cpu.toFixed(1)}%`;
    if (dom.cpuBar) dom.cpuBar.style.width = `${Math.max(0, Math.min(100, cpu))}%`;

    if (dom.metricMem) {
      const used = Math.max(0, memTotal - memFree);
      dom.metricMem.textContent = `${used.toFixed(1)} / ${memTotal} GB`;
    }
    if (dom.memBar) {
      const pct = memTotal > 0 ? ((memTotal - memFree) / memTotal) * 100 : 0;
      dom.memBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }

    if (dom.metricNodes) dom.metricNodes.textContent = String(nodes);
  }

  // ─── Event stream renderer (XSS-safe) ───────────────────────────────────────
  function renderEventStream(events) {
    if (!dom.streamContainer) return;

    // Diff: only re-render if the latest event changed
    const latest = events[events.length - 1];
    const latestKey = `${latest && latest.timestamp}|${latest && latest.type}`;
    if (latestKey === STATE.lastEventTs) return;
    STATE.lastEventTs = latestKey;

    // Build via DOM (no innerHTML for user-controlled data)
    const frag = document.createDocumentFragment();

    const ordered = events.slice().reverse();
    ordered.forEach((event) => {
      const type = escapeHtml(event && event.type);
      let borderClass = 'border-google-yellow';
      if (type.includes('SYSTEM')) borderClass = 'border-google-green';
      else if (type.includes('CUSTOM')) borderClass = 'border-google-blue';

      const card = document.createElement('div');
      card.className = `event-log-card ${borderClass}`;

      const meta = document.createElement('div');
      meta.className = 'flex justify-between text-slate-500 text-[10px]';
      const typeSpan = document.createElement('span');
      typeSpan.className = 'font-bold text-slate-300';
      typeSpan.textContent = type;
      const timeSpan = document.createElement('span');
      timeSpan.textContent = formatTs(event.timestamp);
      meta.appendChild(typeSpan);
      meta.appendChild(timeSpan);

      const payload = document.createElement('div');
      payload.className = 'text-indigo-300 overflow-x-auto whitespace-pre font-mono';
      payload.textContent = safeJsonStringify(event.payload);

      card.appendChild(meta);
      card.appendChild(payload);
      frag.appendChild(card);
    });

    dom.streamContainer.innerHTML = '';
    dom.streamContainer.appendChild(frag);
  }

  function formatTs(ts) {
    if (!ts) return '';
    const n = typeof ts === 'number' ? ts : Date.parse(ts);
    if (!Number.isFinite(n)) return String(ts);
    return new Date(n).toLocaleTimeString();
  }

  // ─── Event Injector ──────────────────────────────────────────────────────────
  async function injectEvent() {
    const type = (dom.eventTypeInput.value || '').trim();
    if (!type) {
      flashError(dom.eventTypeInput, 'Event type is required');
      return;
    }

    let payload = {};
    try {
      payload = JSON.parse(dom.eventPayloadInput.value || '{}');
    } catch (e) {
      flashError(dom.eventPayloadInput, 'Payload must be valid JSON');
      return;
    }

    setPublishingState(true);
    try {
      const res = await apiFetch('/api/publish', {
        method: 'POST',
        body: { type, payload }
      });

      if (res.status === 401 || res.status === 403) {
        handleAuthExpired();
        return;
      }

      if (!res.ok) {
        flashError(dom.btnPublish, `Inject failed (${res.status})`);
        return;
      }

      // micro-interaction
      dom.btnPublish.style.transform = 'scale(0.98)';
      setTimeout(() => (dom.btnPublish.style.transform = ''), 120);
      await fetchEvents();
    } catch (err) {
      flashError(dom.btnPublish, 'Network error');
      showError(err);
    } finally {
      setPublishingState(false);
    }
  }

  function setPublishingState(busy) {
    if (!dom.btnPublish) return;
    dom.btnPublish.disabled = busy;
    dom.btnPublish.dataset.originalText = dom.btnPublish.dataset.originalText || dom.btnPublish.textContent;
    dom.btnPublish.textContent = busy ? 'Injecting…' : dom.btnPublish.dataset.originalText;
  }

  function flashError(el, message) {
    if (!el) {
      window.alert(message);
      return;
    }
    const prev = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 2px #EA4335';
    el.style.transition = 'box-shadow 0.2s';
    setTimeout(() => (el.style.boxShadow = prev), 1200);
    showError(message);
  }

  // ─── Mobile menu ─────────────────────────────────────────────────────────────
  function initMobileMenu() {
    if (!dom.mobileMenuBtn || !dom.mobileNav) return;
    dom.mobileMenuBtn.addEventListener('click', () => {
      const open = dom.mobileNav.classList.toggle('hidden');
      dom.mobileMenuBtn.setAttribute('aria-expanded', String(!open));
    });
    dom.mobileNav.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => {
        dom.mobileNav.classList.add('hidden');
        dom.mobileMenuBtn.setAttribute('aria-expanded', 'false');
      })
    );
  }

  function initSmoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href').slice(1);
        if (!id) return;
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ─── SDK tabs (exposed for inline onclick) ───────────────────────────────────
  window.switchTab = function (lang) {
    document.querySelectorAll('.sdk-code-block').forEach((b) => {
      b.classList.add('hidden');
      b.classList.remove('block');
    });
    const active = document.getElementById(`code-${lang}`);
    if (active) {
      active.classList.remove('hidden');
      active.classList.add('block');
    }
    document.querySelectorAll('.sdk-tab-btn').forEach((btn) => {
      btn.classList.remove('active');
    });
    document.querySelectorAll(`.sdk-tab-btn[data-lang="${lang}"]`).forEach((btn) => {
      btn.classList.add('active');
    });
  };

  // ─── Sign out (exposed for inline onclick) ───────────────────────────────────
  window.signOut = function () {
    if (STATE.updateInterval) {
      clearInterval(STATE.updateInterval);
      STATE.updateInterval = null;
    }
    document.cookie =
      'gsm_session=; Path=/; Domain=' + window.location.hostname + '; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie =
      'gsm_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    window.location.assign('/');
  };
})();

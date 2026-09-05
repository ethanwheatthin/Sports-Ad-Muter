// fab.js
// On-page floating action button (FAB) for S.A.M. Created the first time
// monitoring starts and then persists for the tab's page session. Shows the
// detector status and quick actions (Start/Stop, Reset player, Open settings).
//
// Talks to content.js only through window.__samControl:
//   start() / stop() / resetPlayer() / openSettings() / getStatus()
// content.js pushes fresh status via window.__samFab.update(status); we also
// poll as a fallback.

(function () {
  const HOST_ID = 'sam-fab-host';
  let host = null;
  let root = null;
  let expanded = false;
  let pollTimer = null;
  let lastStatus = null;
  let lastSig = null;

  // Position (distance from viewport right / bottom edges, px) + drag state.
  let pos = { right: 20, bottom: 20 };
  let dragging = false;
  let suppressClick = false;
  let dragStart = null;

  const STATE_META = {
    idle:          { color: '#6b7280', label: 'Idle',          pulse: false },
    analyzing:     { color: '#2563eb', label: 'Analyzing…',     pulse: true  },
    gameplay:      { color: '#16a34a', label: 'Gameplay',       pulse: false },
    ad:            { color: '#d97706', label: 'Ad — muted',     pulse: false },
    inconclusive:  { color: '#6b7280', label: 'Inconclusive',   pulse: false }
  };

  const CSS = `
    :host { all: initial; }
    .wrap {
      position: fixed; right: 20px; bottom: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
      opacity: .38; transition: opacity .2s ease;
    }
    .wrap:hover, .wrap.expanded, .wrap.dragging { opacity: 1; }
    .items {
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      transition: opacity .15s ease;
    }
    .items.hidden { display: none; }
    .pill, .action {
      display: flex; align-items: center; gap: 8px;
      background: #ffffff; color: #1f2937;
      border: none; border-radius: 999px;
      padding: 10px 16px; font-size: 13px; font-weight: 600;
      box-shadow: 0 4px 14px rgba(0,0,0,.18);
      white-space: nowrap;
    }
    /* Entrance animation only when the menu is being opened, never on
       background status re-renders (avoids flashing). */
    .items.opening .pill, .items.opening .action {
      opacity: 0; transform: translateY(6px);
      animation: rise .18s ease forwards;
    }
    .action { cursor: pointer; }
    .action:hover { background: #f3f4f6; }
    .action:active { transform: translateY(1px); }
    .action .dot, .pill .dot { width: 18px; height: 18px; display: grid; place-items: center; flex: 0 0 auto; }
    .action .dot svg, .pill .dot svg { width: 16px; height: 16px; }
    .pill { background: #eef2ff; color: #3730a3; cursor: default; }
    .pill .sub { font-weight: 500; opacity: .75; }
    .items.opening .action:nth-child(2) { animation-delay: .03s; }
    .items.opening .action:nth-child(3) { animation-delay: .06s; }
    .items.opening .action:nth-child(4) { animation-delay: .09s; }
    @keyframes rise { to { opacity: 1; transform: translateY(0); } }

    .fab {
      position: relative;
      width: 56px; height: 56px; border-radius: 50%;
      border: none; cursor: grab;
      background: #4c3a63; color: #fff;
      box-shadow: 0 6px 18px rgba(0,0,0,.28);
      display: grid; place-items: center;
      transition: transform .15s ease, background .2s ease;
      touch-action: none; user-select: none;
    }
    .wrap.dragging .fab { cursor: grabbing; transition: none; }
    .fab:hover { transform: scale(1.05); }
    .fab svg { width: 24px; height: 24px; }
    .ring {
      position: absolute; inset: -3px; border-radius: 50%;
      border: 3px solid var(--ring, #6b7280);
      box-sizing: border-box;
    }
    .ring.pulse { animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse {
      0%,100% { box-shadow: 0 0 0 0 var(--ring); opacity: 1; }
      50%     { box-shadow: 0 0 0 6px transparent; opacity: .6; }
    }
    .badge {
      position: absolute; top: -2px; right: -2px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #4c3a63; color: #fff; border: 2px solid #fff;
      font-size: 10px; display: grid; place-items: center;
    }
  `;

  const ICON_SAM = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 21l-4.9-2.8.9-5.5-4-3.9L9.5 8z"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_STOP = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  const ICON_RESET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/></svg>';
  const ICON_GEAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9 4a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2l-.4-2.6h-4l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 003 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/></svg>';
  // Collapsed-FAB glyphs that say what the detector currently thinks it sees.
  const ICON_GAMEPLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16 8.5a4 4 0 010 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 6a7.5 7.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_AD = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function statusText(s) {
    if (!s) return { label: 'Idle', sub: '' };
    const dec = s.decision || {};
    const meta = STATE_META[dec.state] || STATE_META.idle;
    let label = s.monitoring ? meta.label : 'Stopped';
    let sub = '';
    if (s.monitoring) {
      if (dec.state === 'ad' || dec.state === 'gameplay') {
        const parts = [];
        if (dec.confidence != null) parts.push(Math.round(dec.confidence * 100) + '%');
        if (dec.method) parts.push(dec.method);
        sub = parts.join(' · ');
      }
      if (s.drm) sub = (sub ? sub + ' · ' : '') + (s.drmCaptureArmed ? 'DRM: tab capture' : 'DRM: signals');
      if (s.queue && s.queue.pending) sub = (sub ? sub + ' · ' : '') + s.queue.pending + ' queued';
    }
    return { label, sub };
  }

  function ringColor(s) {
    if (!s || !s.monitoring) return STATE_META.idle.color;
    const meta = STATE_META[(s.decision || {}).state] || STATE_META.idle;
    return meta.color;
  }
  function ringPulse(s) {
    if (!s || !s.monitoring) return false;
    return !!(STATE_META[(s.decision || {}).state] || {}).pulse;
  }
  function pillIcon(s) {
    const st = s && s.monitoring ? (s.decision || {}).state : 'idle';
    if (st === 'gameplay') return ICON_GAMEPLAY;
    if (st === 'ad') return ICON_AD;
    if (st === 'analyzing') return ICON_SAM;
    return ICON_STOP;
  }
  // Glyph shown in the collapsed FAB: gameplay = sound waves, ad = muted.
  function centerIcon(s) {
    if (expanded) return ICON_CLOSE;
    if (!s || !s.monitoring) return ICON_SAM;
    const st = (s.decision || {}).state;
    if (st === 'gameplay') return ICON_GAMEPLAY;
    if (st === 'ad') return ICON_AD;
    return ICON_SAM;
  }

  function render(force) {
    if (!root) return;
    const s = lastStatus;
    const monitoring = !!(s && s.monitoring);
    const txt = statusText(s);

    // Only rebuild the DOM when something visible actually changed. Background
    // status polls that produce an identical view are ignored, so the expanded
    // buttons don't flash/re-animate.
    const sig = JSON.stringify([
      expanded, monitoring, (s && s.decision || {}).state,
      txt.label, txt.sub, !!(s && s.drm), ringColor(s), ringPulse(s)
    ]);
    if (!force && sig === lastSig) return;
    const wasOpen = lastSig !== null && JSON.parse(lastSig)[0] === true;
    lastSig = sig;
    const justOpened = expanded && !wasOpen;

    root.innerHTML = `<style>${CSS}</style>
      <div class="wrap ${expanded ? 'expanded' : ''} ${dragging ? 'dragging' : ''}"
           style="right:${pos.right}px; bottom:${pos.bottom}px;">
        <div class="items ${expanded ? '' : 'hidden'} ${justOpened ? 'opening' : ''}">
          <div class="pill">
            <span class="dot" style="color:${ringColor(s)}">${pillIcon(s)}</span>
            <span>${escapeHtml(txt.label)}</span>
            ${txt.sub ? `<span class="sub">${escapeHtml(txt.sub)}</span>` : ''}
          </div>
          <button class="action" data-act="toggle">
            <span class="dot">${monitoring ? ICON_STOP : ICON_PLAY}</span>
            <span>${monitoring ? 'Stop monitoring' : 'Start monitoring'}</span>
          </button>
          <button class="action" data-act="reset">
            <span class="dot">${ICON_RESET}</span><span>Reset player</span>
          </button>
          <button class="action" data-act="settings">
            <span class="dot">${ICON_GEAR}</span><span>Open full settings</span>
          </button>
        </div>
        <button class="fab" data-act="fab" title="${escapeHtml(txt.label)}${txt.sub ? ' — ' + escapeHtml(txt.sub) : ''}">
          <span class="ring ${ringPulse(s) ? 'pulse' : ''}" style="--ring:${ringColor(s)}"></span>
          ${centerIcon(s)}
          ${s && s.drm ? '<span class="badge">🔒</span>' : ''}
        </button>
      </div>`;

    root.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', onAction);
    });
    const fabEl = root.querySelector('.fab');
    if (fabEl) fabEl.addEventListener('pointerdown', onDragStart);
  }

  function onDragStart(e) {
    if (e.button !== 0) return;
    dragStart = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom };
    dragging = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    e.currentTarget.addEventListener('pointermove', onDragMove);
    e.currentTarget.addEventListener('pointerup', onDragEnd);
    e.currentTarget.addEventListener('pointercancel', onDragEnd);
  }

  function onDragMove(e) {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (!dragging && Math.hypot(dx, dy) < 5) return;
    if (!dragging) {
      dragging = true;
      const w = root.querySelector('.wrap');
      if (w) w.classList.add('dragging');
    }
    const maxR = Math.max(8, window.innerWidth - 68);
    const maxB = Math.max(8, window.innerHeight - 68);
    pos.right = Math.min(maxR, Math.max(8, dragStart.right - dx));
    pos.bottom = Math.min(maxB, Math.max(8, dragStart.bottom - dy));
    const w = root.querySelector('.wrap');
    if (w) { w.style.right = pos.right + 'px'; w.style.bottom = pos.bottom + 'px'; }
  }

  function onDragEnd(e) {
    const el = e.currentTarget;
    el.removeEventListener('pointermove', onDragMove);
    el.removeEventListener('pointerup', onDragEnd);
    el.removeEventListener('pointercancel', onDragEnd);
    try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    dragStart = null;
    if (dragging) {
      suppressClick = true;
      dragging = false;
      const w = root.querySelector('.wrap');
      if (w) w.classList.remove('dragging');
      savePos();
    }
  }

  function savePos() {
    try {
      chrome.storage.local.set({ samFabPos: pos }, () => void chrome.runtime.lastError);
    } catch (e) { /* ignore */ }
  }

  function loadPos(cb) {
    try {
      chrome.storage.local.get(['samFabPos'], (r) => {
        if (r && r.samFabPos && typeof r.samFabPos.right === 'number') pos = r.samFabPos;
        cb && cb();
      });
    } catch (e) { cb && cb(); }
  }

  function onAction(e) {
    const act = e.currentTarget.getAttribute('data-act');
    const ctl = window.__samControl || {};
    if (act === 'fab') {
      if (suppressClick) { suppressClick = false; return; }
      expanded = !expanded;
      render();
      return;
    }
    if (act === 'toggle') {
      if (lastStatus && lastStatus.monitoring) { ctl.stop && ctl.stop(); }
      else { ctl.start && ctl.start(); }
      setTimeout(refresh, 300);
    } else if (act === 'reset') {
      ctl.resetPlayer && ctl.resetPlayer();
    } else if (act === 'settings') {
      ctl.openSettings && ctl.openSettings();
    }
    expanded = false;
    render();
  }

  function onDocClick(e) {
    if (!expanded) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (host && path.indexOf(host) === -1) { expanded = false; render(); }
  }
  function onKey(e) {
    if (e.key === 'Escape' && expanded) { expanded = false; render(); }
  }

  function currentParent() {
    const fs = document.fullscreenElement;
    if (fs && !/^(VIDEO|IMG|CANVAS)$/.test(fs.tagName)) return fs;
    return document.body || document.documentElement;
  }

  function attach() {
    const parent = currentParent();
    if (host.parentNode !== parent) parent.appendChild(host);
  }

  function onFullscreenChange() { if (host) attach(); }

  function refresh() {
    try {
      const s = window.__samControl && window.__samControl.getStatus();
      if (s) { lastStatus = s; render(); }
    } catch (e) { /* content not ready */ }
  }

  window.__samFab = {
    ensure() {
      if (host) { attach(); return; }
      host = document.createElement('div');
      host.id = HOST_ID;
      host.style.cssText = 'all: initial;';
      root = host.attachShadow({ mode: 'open' });
      attach();
      render();
      loadPos(() => render(true));
      refresh();

      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('fullscreenchange', onFullscreenChange, true);
      document.addEventListener('webkitfullscreenchange', onFullscreenChange, true);

      pollTimer = setInterval(() => {
        if (!host || !host.isConnected) attach();
        refresh();
      }, 1500);
    },
    update(status) {
      if (status) { lastStatus = status; }
      if (root) render();
    },
    destroy() {
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('fullscreenchange', onFullscreenChange, true);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange, true);
      if (host && host.parentNode) host.parentNode.removeChild(host);
      host = root = null;
      expanded = false;
    }
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  console.log('[SAM FAB] loaded');
})();

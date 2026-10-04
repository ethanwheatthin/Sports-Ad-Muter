// panel.js — view layer for the side panel (tabs, live hero, timeline, history,
// and the settings controls). popup.js owns settings persistence, monitoring
// control and storage; it calls into window.SamPanel from a few places.
//
// A "decision" is derived from one analysisLogs entry (see saveLogEntry in
// content.js). Normalized shape, so any engine (LLM, signals, a future
// probability-returning decision model) renders through the same UI:
//   { ts, kind, source, model, latencyMs, confidence, probs, method,
//     text, error, imageUrl, action }
//   kind:  'gameplay' | 'ad' | 'error' | 'unclear' | 'event'
//   probs: { gameplay: 0..1, ad: 0..1 } when the engine provides them
(function () {
  const $ = (id) => document.getElementById(id);

  let activeTab = 'live';
  let historyFilter = 'all';
  let lastLogs = [];
  let monitorStartedAt = 0;          // 0 = unknown (panel opened mid-session)
  let wasMonitoring = null;
  let lastHistorySig = null;
  const openRows = new Set();

  const SPORT_LABELS = {
    general: 'General', american: 'American Sports', golf: 'Golf', esports: 'Esports',
    aquatics: 'Aquatics', olympics: 'Olympics', soccer: 'Soccer', motorsports: 'Motorsports',
    tennis: 'Tennis', winter: 'Winter Sports', news: 'News', custom: 'Custom'
  };

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function ago(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    return Math.floor(s / 3600) + 'h ago';
  }

  function responseText(r) {
    if (!r || r.error) return '';
    const x = r.response;
    if (typeof x === 'string') return x;
    if (x && typeof x.response === 'string') return x.response;
    if (x && x.message && x.message.content) return x.message.content;
    return '';
  }

  function pct(n) { return Math.round(n * 100) + '%'; }

  function normalize(log) {
    const r = log.llmResponse || null;
    const action = log.action || '';
    let kind;
    if (log.result === true) kind = 'gameplay';
    else if (log.result === false) kind = 'ad';
    else if ((r && r.error) || /^(error|api error|failed|request (dropped|timeout)|background script|no response)/i.test(action)) kind = 'error';
    else if (r && r.model) kind = 'unclear';
    else kind = 'event';

    let source = '';
    let confidence = null;
    let probs = null;
    if (r && r.combined) {
      source = 'Signal · ' + (r.combined.source || 'audio/dom');
      confidence = typeof r.combined.confidence === 'number' ? r.combined.confidence : null;
    } else if (r) {
      source = r.engine || (r.model ? 'LLM' : '');
      if (typeof r.confidence === 'number') confidence = r.confidence;
      if (r.probabilities && typeof r.probabilities === 'object') {
        const g = Number(r.probabilities.gameplay), a = Number(r.probabilities.ad);
        if (isFinite(g) && isFinite(a)) {
          probs = { gameplay: g, ad: a };
          if (confidence == null) confidence = Math.max(g, a);
        }
      }
    }

    return {
      ts: log.timestamp,
      kind,
      source,
      model: r && r.model || '',
      latencyMs: r && typeof r.processingTime === 'number' ? Math.round(r.processingTime) : null,
      confidence,
      probs,
      method: r && r.captureMethod || '',
      text: responseText(r),
      error: r && r.error || (kind === 'error' ? action : ''),
      imageUrl: log.imageUrl || '',
      action
    };
  }

  function sameName(a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }

  const KIND_LABEL = { gameplay: 'Gameplay', ad: 'Ad', error: 'Error', unclear: 'Unclear', event: 'Note' };

  /* ---------------- tabs ---------------- */

  function showTab(name) {
    activeTab = name;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.id === 'pane-' + name));
    if (name === 'history') renderHistory(true);
  }

  /* ---------------- live: hero / frame / timeline / stats ---------------- */

  function currentDecision(decisions) {
    for (let i = decisions.length - 1; i >= 0; i--) {
      const d = decisions[i];
      if (d.kind === 'event') continue;
      if (monitorStartedAt && d.ts < monitorStartedAt) return null;
      return d;
    }
    return null;
  }

  function renderHero(d) {
    const hero = $('hero');
    const monitoring = typeof isMonitoring !== 'undefined' && isMonitoring;
    let cls = 'idle', icon = '⏸', state = 'Not monitoring', sub = 'Press Start to begin watching this tab.';
    let pctText = '';
    const meta = [];
    let probs = null;

    if (monitoring && !d) {
      const iv = $('checkInterval').value || '10';
      cls = 'analyzing'; icon = '👁'; state = 'Waiting for first frame…';
      sub = 'Checking about every ' + iv + 's.';
    } else if (monitoring && d) {
      if (d.kind === 'gameplay') { cls = 'gameplay'; icon = '🔊'; state = 'Gameplay'; sub = 'Audio on'; }
      else if (d.kind === 'ad') { cls = 'ad'; icon = '🔇'; state = 'Ad — muted'; sub = 'Will unmute when gameplay returns'; }
      else if (d.kind === 'error') { cls = 'error'; icon = '⚠️'; state = 'Model error'; sub = d.error || 'The last request failed.'; }
      else { cls = 'analyzing'; icon = '❔'; state = 'Unclear'; sub = 'The model gave no clear answer — no change made.'; }
      if (d.confidence != null) pctText = pct(d.confidence);
      probs = d.probs;
      if (d.source) meta.push(d.source);
      if (d.model && !sameName(d.model, d.source)) meta.push(d.model);
      if (d.latencyMs != null) meta.push(d.latencyMs + ' ms');
      if (d.method) meta.push(d.method);
      meta.push(ago(d.ts));
    } else if (!monitoring && d) {
      sub = 'Last decision: ' + (KIND_LABEL[d.kind] || '') + ' · ' + ago(d.ts);
    }

    hero.className = 'hero ' + cls;
    $('heroIcon').textContent = icon;
    $('heroState').textContent = state;
    $('heroSub').textContent = sub;
    $('heroPct').textContent = pctText;
    $('heroMeta').innerHTML = meta.map((m) => '<span class="tag">' + esc(m) + '</span>').join('');

    const bar = $('heroProb');
    if (probs) {
      const total = (probs.gameplay + probs.ad) || 1;
      $('heroProbG').style.width = (probs.gameplay / total * 100) + '%';
      $('heroProbA').style.width = (probs.ad / total * 100) + '%';
      bar.style.display = 'flex';
    } else {
      bar.style.display = 'none';
    }
  }

  function renderLatestFrame(decisions, d) {
    const wrap = $('latestFrameWrap');
    let withImg = null;
    for (let i = decisions.length - 1; i >= 0; i--) {
      if (decisions[i].imageUrl) { withImg = decisions[i]; break; }
    }
    if (!withImg) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    const img = $('latestFrame');
    if (img.dataset.ts !== String(withImg.ts)) {
      img.src = withImg.imageUrl;
      img.dataset.ts = String(withImg.ts);
      wrap.dataset.url = withImg.imageUrl;
    }
    const chip = $('latestFrameChip');
    chip.className = 'chip ' + withImg.kind;
    chip.textContent = KIND_LABEL[withImg.kind] + (withImg.confidence != null ? ' ' + pct(withImg.confidence) : '');
    $('latestFrameTime').textContent = ago(withImg.ts);
  }

  function renderTimeline(decisions) {
    const el = $('timeline');
    const recent = decisions.filter((d) => d.kind !== 'event').slice(-30);
    if (!recent.length) { el.innerHTML = '<span class="muted-note">No decisions yet.</span>'; return; }
    el.innerHTML = recent.map((d) =>
      '<button class="tl-bar ' + d.kind + '" data-ts="' + d.ts + '" title="' +
      esc(KIND_LABEL[d.kind] + ' · ' + new Date(d.ts).toLocaleTimeString()) + '"></button>'
    ).join('');
  }

  function renderStats(decisions) {
    let adBreaks = 0, gameplay = 0, inAd = false;
    decisions.forEach((d) => {
      if (d.kind === 'gameplay') { gameplay++; inAd = false; }
      else if (d.kind === 'ad') { if (!inAd) adBreaks++; inAd = true; }
    });
    $('statAds').textContent = adBreaks;
    $('statGameplay').textContent = gameplay;
  }

  /* ---------------- history ---------------- */

  function renderHistory(force) {
    if (activeTab !== 'history') return;
    const list = lastLogs.map(normalize);
    const filtered = list.filter((d) => historyFilter === 'all' ? true :
      historyFilter === 'error' ? (d.kind === 'error' || d.kind === 'unclear') : d.kind === historyFilter);
    const last = list.length ? list[list.length - 1].ts : 0;
    const sig = [list.length, last, historyFilter, Array.from(openRows).join(',')].join('|');
    if (!force && sig === lastHistorySig) return;
    lastHistorySig = sig;

    const container = $('recentFramesContainer');
    if (!filtered.length) {
      container.innerHTML = '<div class="no-logs">' + (list.length
        ? 'Nothing matches this filter.'
        : 'No decisions yet. Start monitoring to see what the model sees.') + '</div>';
      return;
    }

    container.innerHTML = filtered.slice().reverse().map((d) => {
      const open = openRows.has(d.ts);
      const thumb = d.imageUrl
        ? '<img class="h-thumb" loading="lazy" src="' + esc(d.imageUrl) + '" alt="">'
        : '<span class="h-thumb">' + (d.kind === 'event' ? '✎' : '〰') + '</span>';
      const line2 = [new Date(d.ts).toLocaleTimeString(), d.source, d.latencyMs != null ? d.latencyMs + ' ms' : '']
        .filter(Boolean).join(' · ');
      const rawText = d.kind === 'error' ? (d.error || d.action) : (d.text || d.action);
      const rows = [
        ['Time', new Date(d.ts).toLocaleString()],
        d.source && ['Engine', d.source],
        d.model && !sameName(d.model, d.source) && ['Model', d.model],
        d.latencyMs != null && ['Latency', d.latencyMs + ' ms'],
        d.confidence != null && ['Confidence', pct(d.confidence)],
        d.probs && ['Gameplay / Ad', pct(d.probs.gameplay) + ' / ' + pct(d.probs.ad)],
        d.method && ['Capture', d.method],
        d.action && d.kind !== 'error' && ['Action', d.action]
      ].filter(Boolean);
      return '<div class="h-row' + (open ? ' open' : '') + '" data-ts="' + d.ts + '">' +
        '<button class="h-summary" data-toggle="' + d.ts + '">' + thumb +
          '<div class="h-main">' +
            '<div class="h-line1"><span class="chip ' + d.kind + '">' + KIND_LABEL[d.kind] + '</span>' +
              (d.confidence != null ? '<span class="h-pct">' + pct(d.confidence) + '</span>' : '') + '</div>' +
            '<div class="h-line2">' + esc(line2) + '</div>' +
          '</div><span class="h-caret">▼</span></button>' +
        '<div class="h-detail">' +
          (open && d.imageUrl ? '<img data-full="' + esc(d.imageUrl) + '" src="' + esc(d.imageUrl) + '" alt="Captured frame">' : '') +
          (open ? '<dl class="kv">' + rows.map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') + '</dl>' : '') +
          (open && rawText ? '<div class="raw">' + esc(rawText) + '</div>' : '') +
        '</div></div>';
    }).join('');
  }

  /* ---------------- public render entry ---------------- */

  function render(logs) {
    lastLogs = Array.isArray(logs) ? logs : [];
    const decisions = lastLogs.map(normalize);
    const d = currentDecision(decisions);
    renderHero(d);
    renderLatestFrame(decisions, d);
    renderTimeline(decisions);
    renderStats(decisions);
    $('historyCount').textContent = lastLogs.length;
    renderHistory(false);
  }

  /* ---------------- header / monitoring state ---------------- */

  function onMonitoringChanged(monitoring) {
    if (wasMonitoring === false && monitoring) monitorStartedAt = Date.now();
    if (!monitoring) monitorStartedAt = 0;
    wasMonitoring = monitoring;
    const dot = $('brandDot');
    if (dot) dot.classList.toggle('on', !!monitoring);
    render(lastLogs);
  }

  /* ---------------- settings controls ---------------- */

  function buildSportChips() {
    const sel = $('sportMode');
    const wrap = $('sportChips');
    wrap.innerHTML = Array.from(sel.options).map((o) =>
      '<button type="button" data-mode="' + esc(o.value) + '">' + esc(SPORT_LABELS[o.value] || o.textContent) + '</button>'
    ).join('');
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      sel.value = b.dataset.mode;
      sel.dispatchEvent(new Event('change', { bubbles: true }));  // popup.js fills the prompt + auto-saves
      syncSettingsUI();
    });
  }

  function syncSettingsUI() {
    const provider = $('apiProvider').value || 'ollama';
    document.querySelectorAll('#providerSeg button').forEach((b) =>
      b.classList.toggle('active', b.dataset.provider === provider));
    const mode = $('sportMode').value;
    document.querySelectorAll('#sportChips button').forEach((b) =>
      b.classList.toggle('active', b.dataset.mode === mode));
    const n = parseFloat($('checkInterval').value);
    if (isFinite(n)) $('intervalSlider').value = Math.min(180, Math.max(10, n));
  }

  function wireSettings() {
    buildSportChips();

    $('providerSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-provider]');
      if (!b) return;
      const sel = $('apiProvider');
      sel.value = b.dataset.provider;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      syncSettingsUI();
    });

    const num = $('checkInterval');
    const slider = $('intervalSlider');
    slider.addEventListener('input', () => { num.value = slider.value; });
    slider.addEventListener('change', () => num.dispatchEvent(new Event('change', { bubbles: true })));
    num.addEventListener('input', syncSettingsUI);
  }

  /* ---------------- wiring ---------------- */

  function init() {
    document.querySelector('.tabs').addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (t) showTab(t.dataset.tab);
    });

    $('historyFilters').addEventListener('click', (e) => {
      const f = e.target.closest('.filter');
      if (!f) return;
      historyFilter = f.dataset.filter;
      document.querySelectorAll('.filter').forEach((x) => x.classList.toggle('active', x === f));
      renderHistory(true);
    });

    $('recentFramesContainer').addEventListener('click', (e) => {
      const full = e.target.closest('[data-full]');
      if (full) { openImageInNewTab(full.dataset.full); return; }
      const t = e.target.closest('[data-toggle]');
      if (!t) return;
      const ts = Number(t.dataset.toggle);
      if (openRows.has(ts)) openRows.delete(ts); else openRows.add(ts);
      renderHistory(true);
    });

    $('timeline').addEventListener('click', (e) => {
      const b = e.target.closest('.tl-bar');
      if (!b) return;
      openRows.add(Number(b.dataset.ts));
      historyFilter = 'all';
      document.querySelectorAll('.filter').forEach((x) => x.classList.toggle('active', x.dataset.filter === 'all'));
      showTab('history');
      const row = document.querySelector('.h-row[data-ts="' + b.dataset.ts + '"]');
      if (row) row.scrollIntoView({ block: 'center' });
    });

    $('latestFrameWrap').addEventListener('click', () => {
      const url = $('latestFrameWrap').dataset.url;
      if (url) openImageInNewTab(url);
    });

    wireSettings();
    syncSettingsUI();
  }

  window.SamPanel = { render, onMonitoringChanged, syncSettingsUI, showTab };
  init();
})();

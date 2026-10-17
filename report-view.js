// report-view.js — the "Report" tab: pick a monitoring session, see how many ad
// vs gameplay frames were caught, the model's answers, and export it. Sessions
// are written by content.js (see session-report.js); this file only reads them.
(function () {
  const $ = (id) => document.getElementById(id);
  const R = window.SamReport;
  if (!R || !$('pane-report')) return;

  const RESPONSE_ROWS = 100;   // newest frames listed; the export has all of them
  let sessions = [];           // newest first
  let selectedId = null;
  let filter = 'all';
  let showAll = false;

  const KIND_LABEL = { gameplay: 'Gameplay', ad: 'Ad', unclear: 'Unclear', error: 'Error' };
  const KIND_CHIP = { gameplay: 'gameplay', ad: 'ad', unclear: 'event', error: 'error' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const pct = (n) => (n == null ? '—' : Math.round(n * 100) + '%');
  const pct1 = (n) => (n == null ? '—' : (n * 100).toFixed(1) + '%');

  function clock(ms) {
    const s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + 'h ' + String(m).padStart(2, '0') + 'm' : m + 'm ' + String(s % 60).padStart(2, '0') + 's';
  }
  function mmss(ms) {
    const m = Math.floor(ms / 60000);
    return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
  }

  function load(cb) {
    chrome.storage.local.get([R.SESSION_INDEX_KEY], (st) => {
      const ids = (st && st[R.SESSION_INDEX_KEY]) || [];
      const keys = ids.map(R.sessionKey);
      if (!keys.length) { sessions = []; cb(); return; }
      chrome.storage.local.get(keys, (data) => {
        sessions = ids.map((id) => data[R.sessionKey(id)]).filter(Boolean).reverse();
        cb();
      });
    });
  }

  function selected() {
    return sessions.find((s) => s.id === selectedId) || sessions[0] || null;
  }

  function label(s) {
    const sum = R.summarize(s);
    const when = new Date(s.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return when + ' · ' + (s.meta && s.meta.site || 'unknown site') + ' · ' + sum.frames + ' frames' + (s.endedAt == null ? ' · live' : '');
  }

  function renderPicker() {
    const sel = $('reportSelect');
    const cur = selected();
    sel.innerHTML = sessions.map((s) =>
      '<option value="' + esc(s.id) + '"' + (cur && cur.id === s.id ? ' selected' : '') + '>' + esc(label(s)) + '</option>'
    ).join('');
    const has = !!cur;
    sel.disabled = !has;
    ['reportJsonBtn', 'reportCsvBtn', 'reportDeleteBtn'].forEach((id) => { $(id).disabled = !has; });
  }

  function statTile(val, label) {
    return '<div class="stat"><div class="stat-val">' + val + '</div><div class="stat-label">' + label + '</div></div>';
  }

  function renderSegments(sum) {
    if (!sum.segments.length) return '';
    const max = Math.max.apply(null, sum.segments.map((g) => g.gameplay + g.ad + g.unclear + g.error)) || 1;
    return '<section class="card"><div class="card-head"><span class="card-title">Ads over time</span>' +
      '<span class="legend"><i class="lg lg-g"></i>Gameplay <i class="lg lg-a"></i>Ad</span></div>' +
      sum.segments.map((g) => {
        const total = g.gameplay + g.ad + g.unclear + g.error;
        const classified = g.gameplay + g.ad;
        return '<div class="seg-row"><span class="seg-label">' + mmss(g.startMs) + '</span>' +
          '<div class="seg-bar" style="width:' + Math.max(4, total / max * 100) + '%">' +
            '<i class="seg-g" style="flex:' + g.gameplay + '"></i><i class="seg-a" style="flex:' + g.ad + '"></i>' +
            '<i class="seg-o" style="flex:' + (g.unclear + g.error) + '"></i></div>' +
          '<span class="seg-val">' + (classified ? pct(g.ad / classified) : '—') + ' ad</span></div>';
      }).join('') +
      '<div class="info">Each row is a 15-minute slice of the game (elapsed time since monitoring started).</div></section>';
  }

  function renderResponses(s) {
    const frames = s.frames.filter((f) => filter === 'all' ? true :
      filter === 'issues' ? (f.kind === 'unclear' || f.kind === 'error') : f.kind === filter);
    const rows = frames.slice().reverse();
    const shown = showAll ? rows : rows.slice(0, RESPONSE_ROWS);
    const chips = ['all', 'ad', 'gameplay', 'issues'].map((k) =>
      '<button class="filter' + (k === filter ? ' active' : '') + '" data-rfilter="' + k + '">' +
      ({ all: 'All', ad: 'Ads', gameplay: 'Gameplay', issues: 'Issues' })[k] + '</button>').join('');
    return '<section class="card"><div class="card-head"><span class="card-title">Model responses</span></div>' +
      '<div class="filters" id="reportFilters">' + chips + '</div>' +
      (shown.length ? shown.map((f) =>
        '<div class="rep-resp"><div class="rep-resp-top"><span class="chip ' + KIND_CHIP[f.kind] + '">' + KIND_LABEL[f.kind] + '</span>' +
          (f.p != null ? '<span class="h-pct">' + pct1(f.p) + ' broadcast</span>' : '') +
          '<span class="rep-time">' + esc(new Date(f.t).toLocaleTimeString()) + (f.ms != null ? ' · ' + f.ms + ' ms' : '') + '</span></div>' +
          (f.text ? '<div class="raw">' + esc(f.text) + '</div>' : '') + '</div>'
      ).join('') : '<div class="no-logs">Nothing matches this filter.</div>') +
      (rows.length > shown.length
        ? '<div class="row-actions"><button class="btn-ghost" id="reportShowAll">Show all ' + rows.length + ' (export has everything)</button></div>'
        : '') +
      '</section>';
  }

  function renderBody() {
    const body = $('reportBody');
    const s = selected();
    if (!s) {
      body.innerHTML = '<div class="no-logs">No sessions yet. Press Start on a game — a report is built as it runs.</div>';
      return;
    }
    const sum = R.summarize(s);
    const classified = sum.gameplay + sum.ad;
    const interval = sum.medianGapMs != null ? Math.round(sum.medianGapMs / 1000) + 's' : '—';
    const engine = s.meta && s.meta.detectionEngine === 'decision' ? 'Decision model' : 'Generative model';
    const lat = sum.latency;
    body.innerHTML =
      '<section class="rep-hero"><div class="rep-hero-val">' + pct(sum.adFramePct) + '</div>' +
        '<div class="rep-hero-label">of classified frames were ads</div>' +
        '<div class="rep-hero-sub">' + sum.ad + ' ad · ' + sum.gameplay + ' gameplay (' + classified + ' classified)</div></section>' +
      '<section class="stats-grid">' +
        statTile(sum.frames, 'Frames analysed') + statTile(sum.gameplay, 'Gameplay frames') + statTile(sum.ad, 'Ad frames') +
        statTile(sum.adBreaks, 'Ad breaks') + statTile(sum.unclear, 'Unclear') + statTile(sum.error, 'Errors') +
        '<div class="stat-foot">' + esc(clock(sum.durationMs)) + ' monitored · a frame about every ' + esc(interval) +
        ' · counts are frames sampled, not minutes of ads</div></section>' +
      renderSegments(sum) +
      '<section class="card"><div class="card-head"><span class="card-title">Model &amp; timing</span></div><dl class="kv">' +
        '<dt>Engine</dt><dd>' + esc(engine) + (s.meta && s.meta.apiProvider ? ' · ' + esc(s.meta.apiProvider) : '') + '</dd>' +
        '<dt>Model</dt><dd>' + (sum.models.length ? esc(sum.models.join(', ')) : '—') + '</dd>' +
        '<dt>Response time</dt><dd>' + (lat ? 'avg ' + lat.avg + ' ms · p95 ' + lat.p95 + ' ms · max ' + lat.max + ' ms' : '—') + '</dd>' +
        '<dt>P(broadcast)</dt><dd>' + (sum.probability.n
          ? 'gameplay frames avg ' + pct1(sum.probability.avgGameplay) + ' · ad frames avg ' + pct1(sum.probability.avgAd)
          : 'not reported by this engine') + '</dd>' +
        '<dt>Site</dt><dd>' + esc((s.meta && s.meta.site) || '—') + '</dd>' +
        '<dt>Started</dt><dd>' + esc(new Date(s.startedAt).toLocaleString()) + '</dd></dl></section>' +
      renderResponses(s);
  }

  function render() {
    renderPicker();
    renderBody();
  }

  function refresh() { load(render); }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function fileStem(s) {
    const d = new Date(s.startedAt);
    const p = (n) => String(n).padStart(2, '0');
    const site = String((s.meta && s.meta.site) || 'session').replace(/[^a-z0-9.-]+/gi, '-');
    return 'sam-report-' + site + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function deleteSelected() {
    const s = selected();
    if (!s || !window.confirm('Delete this report? This cannot be undone.')) return;
    chrome.storage.local.get([R.SESSION_INDEX_KEY], (st) => {
      const ids = ((st && st[R.SESSION_INDEX_KEY]) || []).filter((id) => id !== s.id);
      chrome.storage.local.set({ [R.SESSION_INDEX_KEY]: ids }, () => {
        chrome.storage.local.remove(R.sessionKey(s.id), () => { selectedId = null; refresh(); });
      });
    });
  }

  function init() {
    $('reportSelect').addEventListener('change', (e) => { selectedId = e.target.value; showAll = false; render(); });
    $('reportJsonBtn').addEventListener('click', () => {
      const s = selected();
      if (s) download(fileStem(s) + '.json', R.toJson(s), 'application/json');
    });
    $('reportCsvBtn').addEventListener('click', () => {
      const s = selected();
      if (s) download(fileStem(s) + '.csv', R.toCsv(s), 'text/csv');
    });
    $('reportDeleteBtn').addEventListener('click', deleteSelected);
    $('reportBody').addEventListener('click', (e) => {
      const f = e.target.closest('[data-rfilter]');
      if (f) { filter = f.dataset.rfilter; showAll = false; renderBody(); return; }
      if (e.target.closest('#reportShowAll')) { showAll = true; renderBody(); }
    });
    document.querySelector('.tabs').addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (t && t.dataset.tab === 'report') refresh();
    });
    // Live sessions grow frame by frame; keep the open report current.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !$('pane-report').classList.contains('active')) return;
      if (Object.keys(changes).some((k) => k === R.SESSION_INDEX_KEY || k.indexOf(R.SESSION_KEY_PREFIX) === 0)) refresh();
    });
    refresh();
  }

  init();
})();

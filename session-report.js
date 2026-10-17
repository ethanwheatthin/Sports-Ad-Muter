// Session reports: a text-only record of every frame analysed while monitoring
// was on, plus the maths to summarise it (ad-frame share, latency, per-segment
// breakdown) and export it. Pure helpers shared by the content script, the side
// panel and tests; storage and UI live elsewhere.
//
// Frame record (kept small so a 3h game stays well under the storage quota):
//   { t, kind, p, model, engine, ms, method, interval, text }
//   kind: 'gameplay' | 'ad' | 'unclear' | 'error'
//   p:    P(broadcast) from a decision model, else null

(function (root) {
const SESSION_INDEX_KEY = 'samSessionIndex';
const SESSION_KEY_PREFIX = 'samSession:';
const SESSION_LIMIT = 20;          // newest sessions kept
const FRAME_TEXT_MAX = 300;        // model text is clipped to this
const SEGMENT_MS = 15 * 60 * 1000; // bucket size for the over-time breakdown

function newSession(meta, now = Date.now()) {
  return {
    id: 's' + now.toString(36) + Math.random().toString(36).slice(2, 6),
    startedAt: now,
    endedAt: null,
    meta: meta || {},
    frames: []
  };
}

function clip(s) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > FRAME_TEXT_MAX ? s.slice(0, FRAME_TEXT_MAX - 1) + '…' : s;
}

// Mirror of how the side panel reads a model's answer, across engines.
function responseText(r) {
  if (!r) return '';
  if (r.error) return clip(r.error);
  const x = r.response;
  if (typeof x === 'string') return clip(x);
  if (x && typeof x.response === 'string') return clip(x.response);
  if (x && x.message && x.message.content) return clip(x.message.content);
  if (x && typeof x.thinking === 'string') return clip(x.thinking);
  return '';
}

// One analysed frame from a background analysis response
// ({ result, model, response, processingTime, error? }).
function frameFromAnalysis(response, captureMethod, intervalMs, now = Date.now()) {
  response = response || {};
  const p = response.response && typeof response.response.probability === 'number'
    ? response.response.probability : null;
  let kind = 'unclear';
  if (response.error) kind = 'error';
  else if (response.result === true) kind = 'gameplay';
  else if (response.result === false) kind = 'ad';
  return {
    t: now,
    kind,
    p,
    model: response.model || null,
    engine: p != null ? 'Decision model' : 'LLM',
    ms: typeof response.processingTime === 'number' ? Math.round(response.processingTime) : null,
    method: captureMethod || null,
    interval: intervalMs != null ? Math.round(intervalMs) : null,
    text: responseText(response)
  };
}

// One audio/DOM signal verdict (DRM streams where pixels can't be read).
function frameFromSignal(signals, intervalMs, now = Date.now()) {
  const c = signals && signals.combined;
  if (!c || c.likelyAd == null) return null;
  const pct = Math.round((c.confidence || 0) * 100);
  return {
    t: now,
    kind: c.likelyAd ? 'ad' : 'gameplay',
    p: null,
    model: null,
    engine: 'Signal',
    ms: null,
    method: 'signals',
    interval: intervalMs != null ? Math.round(intervalMs) : null,
    text: clip(`${c.source || 'signal'} ${pct}%`)
  };
}

// Each session lives under its own storage key so a new frame only rewrites the
// current session; a small index (ids, oldest first) says which exist.
function sessionKey(id) { return SESSION_KEY_PREFIX + id; }

// Append an id to the index, keeping the newest SESSION_LIMIT. `dropped` are the
// ids whose storage keys should be removed.
function addToIndex(index, id) {
  const out = (Array.isArray(index) ? index : []).filter((x) => x !== id);
  out.push(id);
  return { index: out.slice(-SESSION_LIMIT), dropped: out.slice(0, -SESSION_LIMIT) };
}

// A session left open (tab closed mid-game) is ended at its last frame.
function closeSession(session, now = Date.now()) {
  if (!session || session.endedAt != null) return session;
  const last = session.frames.length ? session.frames[session.frames.length - 1].t : now;
  return Object.assign({}, session, { endedAt: last });
}

function median(nums) {
  if (!nums.length) return null;
  const a = nums.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function percentile(nums, q) {
  if (!nums.length) return null;
  const a = nums.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.ceil(q * a.length) - 1)];
}

function summarize(session, segmentMs = SEGMENT_MS) {
  const frames = (session && session.frames) || [];
  const count = { gameplay: 0, ad: 0, unclear: 0, error: 0 };
  frames.forEach((f) => { if (f.kind in count) count[f.kind]++; });
  const classified = count.gameplay + count.ad;

  // An ad break = a run of ad frames; unclear/error frames don't end it, gameplay does.
  let adBreaks = 0, inAd = false;
  frames.forEach((f) => {
    if (f.kind === 'gameplay') inAd = false;
    else if (f.kind === 'ad') { if (!inAd) adBreaks++; inAd = true; }
  });

  const lat = frames.map((f) => f.ms).filter((n) => typeof n === 'number');
  const pG = frames.filter((f) => f.kind === 'gameplay' && typeof f.p === 'number').map((f) => f.p);
  const pA = frames.filter((f) => f.kind === 'ad' && typeof f.p === 'number').map((f) => f.p);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  const startedAt = session && session.startedAt || (frames[0] && frames[0].t) || 0;
  const lastAt = frames.length ? frames[frames.length - 1].t : startedAt;
  const endedAt = session && session.endedAt != null ? session.endedAt : lastAt;

  const segments = [];
  frames.forEach((f) => {
    const i = Math.max(0, Math.floor((f.t - startedAt) / segmentMs));
    while (segments.length <= i) {
      segments.push({ startMs: segments.length * segmentMs, gameplay: 0, ad: 0, unclear: 0, error: 0 });
    }
    if (f.kind in count) segments[i][f.kind]++;
  });

  const gaps = [];
  for (let i = 1; i < frames.length; i++) gaps.push(frames[i].t - frames[i - 1].t);

  return {
    frames: frames.length,
    gameplay: count.gameplay,
    ad: count.ad,
    unclear: count.unclear,
    error: count.error,
    adFramePct: classified ? count.ad / classified : null,
    adBreaks,
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    latency: lat.length
      ? { avg: Math.round(avg(lat)), p95: percentile(lat, 0.95), max: Math.max.apply(null, lat), n: lat.length }
      : null,
    probability: {
      n: pG.length + pA.length,
      avgGameplay: avg(pG),   // mean P(broadcast) on frames called gameplay
      avgAd: avg(pA)          // mean P(broadcast) on frames called ad
    },
    medianGapMs: median(gaps),
    models: Array.from(new Set(frames.map((f) => f.model).filter(Boolean))),
    segments
  };
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // keep spreadsheets from running model text as a formula
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(session) {
  const start = session.startedAt;
  const rows = [['time', 'elapsed_s', 'verdict', 'p_broadcast', 'engine', 'model', 'latency_ms', 'capture', 'interval_ms', 'response']];
  session.frames.forEach((f) => rows.push([
    new Date(f.t).toISOString(), Math.round((f.t - start) / 1000), f.kind, f.p == null ? '' : f.p.toFixed(4),
    f.engine, f.model, f.ms, f.method, f.interval, f.text
  ]));
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

function toJson(session) {
  return JSON.stringify({
    session: { id: session.id, startedAt: session.startedAt, endedAt: session.endedAt, meta: session.meta },
    summary: summarize(session),
    frames: session.frames
  }, null, 2);
}

const SamReport = {
  SESSION_INDEX_KEY, SESSION_KEY_PREFIX, SESSION_LIMIT, SEGMENT_MS,
  newSession, frameFromAnalysis, frameFromSignal, sessionKey, addToIndex, closeSession,
  summarize, toCsv, toJson
};

// Wrapped in a function so helper names (clip, median, ...) can't collide with
// the other classic scripts sharing a content-script world.
if (typeof module !== 'undefined' && module.exports) module.exports = SamReport;
root.SamReport = SamReport;
})(typeof self !== 'undefined' ? self : globalThis);

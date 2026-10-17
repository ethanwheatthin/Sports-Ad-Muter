const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// session-report.js is a classic script (package.json is "type": "module"), so load it via vm.
const sandbox = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'session-report.js'), 'utf8'), sandbox);
const R = sandbox.module.exports;

const T0 = 1_000_000;
const frame = (offsetS, kind, extra = {}) =>
  Object.assign({ t: T0 + offsetS * 1000, kind, p: null, model: 'm', engine: 'LLM', ms: 100, method: 'x', interval: 10000, text: '' }, extra);
const session = (frames, endedAt = null) => Object.assign(R.newSession({ site: 'tv.example' }, T0), { frames, endedAt });

test('frameFromAnalysis maps results to kinds and reads decision-model probability', () => {
  const g = R.frameFromAnalysis({ result: true, model: 'clef', response: { thinking: 'Decision model: broadcast 97.0%', probability: 0.97 }, processingTime: 212.4 }, 'imageCapture', 10000, T0);
  assert.strictEqual(g.kind, 'gameplay');
  assert.strictEqual(g.p, 0.97);
  assert.strictEqual(g.engine, 'Decision model');
  assert.strictEqual(g.ms, 212);
  assert.strictEqual(g.text, 'Decision model: broadcast 97.0%');

  assert.strictEqual(R.frameFromAnalysis({ result: false, response: { response: 'false' } }, null, null, T0).kind, 'ad');
  assert.strictEqual(R.frameFromAnalysis({ result: null, response: { response: 'maybe' } }, null, null, T0).kind, 'unclear');
  const e = R.frameFromAnalysis({ result: null, error: 'boom' }, null, null, T0);
  assert.strictEqual(e.kind, 'error');
  assert.strictEqual(e.text, 'boom');
});

test('frameFromAnalysis clips long model text', () => {
  const f = R.frameFromAnalysis({ result: true, response: { response: 'a'.repeat(1000) } }, null, null, T0);
  assert.ok(f.text.length <= 300);
});

test('frameFromSignal ignores inconclusive signals', () => {
  assert.strictEqual(R.frameFromSignal({ combined: { likelyAd: null } }, 1000, T0), null);
  const f = R.frameFromSignal({ combined: { likelyAd: true, confidence: 0.8, source: 'audio' } }, 1000, T0);
  assert.strictEqual(f.kind, 'ad');
  assert.strictEqual(f.engine, 'Signal');
});

test('summarize counts frames, ad share and ad breaks', () => {
  const s = R.summarize(session([
    frame(0, 'gameplay'), frame(10, 'ad'), frame(20, 'ad'), frame(30, 'unclear'), frame(40, 'ad'),
    frame(50, 'gameplay'), frame(60, 'error'), frame(70, 'ad'), frame(80, 'gameplay')
  ], T0 + 90000));
  assert.strictEqual(s.frames, 9);
  assert.strictEqual(s.gameplay, 3);
  assert.strictEqual(s.ad, 4);
  assert.strictEqual(s.unclear, 1);
  assert.strictEqual(s.error, 1);
  assert.strictEqual(s.adFramePct, 4 / 7);   // errors/unclear excluded from the share
  assert.strictEqual(s.adBreaks, 2);         // unclear doesn't split a break, gameplay does
  assert.strictEqual(s.durationMs, 90000);
  assert.strictEqual(s.medianGapMs, 10000);
});

test('summarize with no frames is safe', () => {
  const s = R.summarize(session([]));
  assert.strictEqual(s.frames, 0);
  assert.strictEqual(s.adFramePct, null);
  assert.strictEqual(s.latency, null);
  assert.deepEqual(s.segments, []);
});

test('summarize latency and probability', () => {
  const s = R.summarize(session([
    frame(0, 'gameplay', { ms: 100, p: 0.9 }), frame(10, 'gameplay', { ms: 300, p: 0.8 }),
    frame(20, 'ad', { ms: 200, p: 0.1 })
  ]));
  assert.strictEqual(s.latency.avg, 200);
  assert.strictEqual(s.latency.max, 300);
  assert.ok(Math.abs(s.probability.avgGameplay - 0.85) < 1e-9);
  assert.ok(Math.abs(s.probability.avgAd - 0.1) < 1e-9);
  assert.strictEqual(s.probability.n, 3);
});

test('summarize buckets frames into 15 minute segments', () => {
  const s = R.summarize(session([
    frame(0, 'gameplay'), frame(14 * 60, 'ad'), frame(15 * 60, 'ad'), frame(31 * 60, 'gameplay')
  ]));
  assert.strictEqual(s.segments.length, 3);
  assert.deepEqual([s.segments[0].gameplay, s.segments[0].ad], [1, 1]);
  assert.deepEqual([s.segments[1].gameplay, s.segments[1].ad], [0, 1]);
  assert.deepEqual([s.segments[2].gameplay, s.segments[2].ad], [1, 0]);
});

test('open session ends at its last frame', () => {
  const s = R.summarize(session([frame(0, 'gameplay'), frame(60, 'ad')]));
  assert.strictEqual(s.durationMs, 60000);
});

test('addToIndex keeps the newest sessions and reports which ids to drop', () => {
  let index = [];
  let dropped = [];
  for (let i = 0; i < R.SESSION_LIMIT + 2; i++) {
    const r = R.addToIndex(index, 'id' + i);
    index = r.index;
    dropped = dropped.concat(r.dropped);
  }
  assert.strictEqual(index.length, R.SESSION_LIMIT);
  assert.deepEqual(dropped, ['id0', 'id1']);
  assert.strictEqual(index[index.length - 1], 'id' + (R.SESSION_LIMIT + 1));
  assert.deepEqual(R.addToIndex(['a', 'b'], 'a').index, ['b', 'a']);   // re-adding moves it to newest
  assert.strictEqual(R.sessionKey('x'), 'samSession:x');
});

test('closeSession ends an open session at its last frame and leaves ended ones alone', () => {
  const open = session([frame(0, 'gameplay'), frame(30, 'ad')]);
  assert.strictEqual(R.closeSession(open, T0 + 999999).endedAt, T0 + 30000);
  const done = Object.assign(session([]), { endedAt: 7 });
  assert.strictEqual(R.closeSession(done), done);
});

test('toCsv quotes cells and defuses formula-like model text', () => {
  const csv = R.toCsv(session([frame(5, 'ad', { text: '=HYPERLINK("x"), hi', p: 0.25 })]));
  const [head, row] = csv.trim().split('\n');
  assert.ok(head.startsWith('time,elapsed_s,verdict,p_broadcast'));
  assert.ok(row.includes(',5,ad,0.2500,'));
  assert.ok(row.endsWith('"\'=HYPERLINK(""x""), hi"'));
});

test('toJson round-trips with summary and frames', () => {
  const j = JSON.parse(R.toJson(session([frame(0, 'ad')])));
  assert.strictEqual(j.summary.ad, 1);
  assert.strictEqual(j.frames.length, 1);
  assert.strictEqual(j.session.meta.site, 'tv.example');
});

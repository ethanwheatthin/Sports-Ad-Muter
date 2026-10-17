const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// decision-model.js is a classic script (package.json is "type": "module"), so load it via vm.
const sandbox = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'decision-model.js'), 'utf8'), sandbox);
const { buildDecisionRequest, interpretDecision } = sandbox.module.exports;

const resp = (p) => ({
  answers: { frame: { type: 'choice', choice: 'x', probabilities: { broadcast: p, ad_break: 1 - p } } }
});

test('builds a systemone request with the image and a 2-way choice question', () => {
  const body = buildDecisionRequest('clef-flash:9b', 'AAAA');
  assert.strictEqual(body.model, 'clef-flash:9b');
  assert.strictEqual(body.keep_alive, '30m');
  assert.deepEqual(body.images, ['AAAA']);
  const q = body.questions.frame;
  assert.strictEqual(q.type, 'choice');
  assert.deepEqual(Object.keys(q.criteria), ['broadcast', 'ad_break']);
});

test('high broadcast probability -> gameplay', () => {
  assert.deepEqual(interpretDecision(resp(0.97)), { result: true, probability: 0.97 });
});

test('low broadcast probability -> ad', () => {
  assert.deepEqual(interpretDecision(resp(0.05)), { result: false, probability: 0.05 });
});

test('probability between thresholds -> inconclusive', () => {
  assert.strictEqual(interpretDecision(resp(0.5)).result, null);
});

test('thresholds are inclusive at the boundaries', () => {
  assert.strictEqual(interpretDecision(resp(0.75)).result, true);
  assert.strictEqual(interpretDecision(resp(0.4)).result, false);
});

test('custom thresholds override the defaults', () => {
  const th = { gameplay: 0.9, ad: 0.2 };
  assert.strictEqual(interpretDecision(resp(0.8), th).result, null);
  assert.strictEqual(interpretDecision(resp(0.9), th).result, true);
  assert.strictEqual(interpretDecision(resp(0.2), th).result, false);
});

test('malformed response -> inconclusive', () => {
  assert.strictEqual(interpretDecision({}).result, null);
  assert.strictEqual(interpretDecision(null).result, null);
});

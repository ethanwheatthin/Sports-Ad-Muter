const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
// Classic scripts (package.json is "type": "module"), so load via vm.
const sbx = { module: { exports: {} }, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'log-store.js'), 'utf8'), sbx);
const { createLogStore, THUMB_WIDTH } = sbx.module.exports;

// Minimal chrome.storage area (callback API) that counts operations.
function fakeArea(initial = {}) {
  const data = { ...initial };
  const area = {
    gets: 0, sets: 0, data,
    get(keys, cb) { area.gets++; setImmediate(() => cb(Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])))); },
    set(obj, cb) { area.sets++; Object.assign(data, JSON.parse(JSON.stringify(obj))); setImmediate(cb); }
  };
  return area;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('many appends cost one read and one write', async () => {
  const area = fakeArea();
  const store = createLogStore(area, 'logs', { max: 50, delay: 20 });
  for (let i = 0; i < 20; i++) store.append({ i });
  await wait(80);
  assert.strictEqual(area.gets, 1);
  assert.strictEqual(area.sets, 1);
  assert.strictEqual(area.data.logs.length, 20);
});

test('caps stored entries at max, keeping the newest', async () => {
  const area = fakeArea({ logs: Array.from({ length: 5 }, (_, i) => ({ i })) });
  const store = createLogStore(area, 'logs', { max: 5, delay: 10 });
  await store.append({ i: 5 });
  await store.append({ i: 6 });
  await wait(50);
  assert.deepEqual(area.data.logs.map((e) => e.i), [2, 3, 4, 5, 6]);
});

test('later appends after a flush trigger another write, not another read', async () => {
  const area = fakeArea();
  const store = createLogStore(area, 'logs', { max: 10, delay: 10 });
  await store.append({ a: 1 });
  await wait(40);
  await store.append({ a: 2 });
  await wait(40);
  assert.strictEqual(area.gets, 1);
  assert.strictEqual(area.sets, 2);
  assert.strictEqual(area.data.logs.length, 2);
});

test('an external clear is not undone by the stale cache', async () => {
  const area = fakeArea();
  const store = createLogStore(area, 'logs', { max: 10, delay: 10 });
  await store.append({ a: 1 });
  await wait(40);
  store.external(undefined); // popup cleared the log
  await store.append({ a: 2 });
  await wait(40);
  assert.deepEqual(area.data.logs, [{ a: 2 }]);
});

test('afterWrite fires once per flush', async () => {
  const area = fakeArea();
  let n = 0;
  const store = createLogStore(area, 'logs', { delay: 10, afterWrite: () => n++ });
  for (let i = 0; i < 5; i++) store.append({ i });
  await wait(50);
  assert.strictEqual(n, 1);
});

test('thumbnail width is small enough to matter', () => {
  assert.ok(THUMB_WIDTH <= 400);
});

test('dlog is silent unless SAM_DEBUG is set', () => {
  const lines = [];
  const sandbox = { console: { log: (...a) => lines.push(a) } };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'debug-log.js'), 'utf8'), sandbox);
  sandbox.dlog('hidden');
  assert.strictEqual(lines.length, 0);
  sandbox.SAM_DEBUG = true;
  sandbox.dlog('shown');
  assert.deepEqual(lines, [['shown']]);
});

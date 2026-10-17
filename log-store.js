// Write-behind log store for chrome.storage. Replaces the per-entry
// get -> push -> set round trip (which re-read and re-wrote every stored log,
// image data included, for each frame) with an in-memory cache that is
// flushed to storage at most once per `delay` ms.
(function (root) {
  function createLogStore(area, key, opts) {
    const max = (opts && opts.max) || 100;
    const delay = opts && opts.delay != null ? opts.delay : 250;
    const afterWrite = (opts && opts.afterWrite) || null;
    const lastError = (opts && opts.lastError) || (() => null);

    let cache = null;
    let loading = null;
    let timer = null;
    let writing = 0;

    function load() {
      if (cache) return Promise.resolve(cache);
      if (!loading) {
        loading = new Promise((resolve) => {
          area.get([key], (r) => {
            // Entries appended while the read was in flight must not be lost.
            const stored = (!lastError() && r && Array.isArray(r[key])) ? r[key] : [];
            cache = stored;
            resolve(cache);
          });
        });
      }
      return loading;
    }

    function flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!cache) return;
      writing++;
      area.set({ [key]: cache }, () => {
        writing--;
        if (lastError()) return;
        if (afterWrite) afterWrite();
      });
    }

    function schedule() {
      if (timer) return;
      timer = setTimeout(flush, delay);
    }

    return {
      append(entry) {
        return load().then((logs) => {
          logs.push(entry);
          if (logs.length > max) logs.splice(0, logs.length - max);
          schedule();
        });
      },
      flush,
      // Feed chrome.storage.onChanged here so an external clear (the popup's
      // "clear logs" button) isn't undone by our stale cache.
      external(newValue) {
        if (timer || writing) return; // our own write / pending write wins
        cache = Array.isArray(newValue) ? newValue.slice() : [];
        loading = null;
      }
    };
  }

  // Downscale-by-default policy numbers, kept here so tests can assert them.
  const THUMB_WIDTH = 320;
  const THUMB_QUALITY = 0.6;

  const api = { createLogStore, THUMB_WIDTH, THUMB_QUALITY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SamLogStore = api;
})(typeof self !== 'undefined' ? self : this);

// Debug logging gate. dlog() is a no-op unless the user enables
// `debugLogging` in chrome.storage.local (e.g. from the DevTools console:
// chrome.storage.local.set({ debugLogging: true })). The per-tick chatter in
// the content script and service worker used to log unconditionally, which
// costs real time for object serialisation while DevTools is open.
(function (g) {
  g.SAM_DEBUG = false;
  g.dlog = function () {
    if (g.SAM_DEBUG) console.log.apply(console, arguments);
  };
  try {
    chrome.storage.local.get(['debugLogging'], (r) => {
      if (r && r.debugLogging) g.SAM_DEBUG = true;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.debugLogging) g.SAM_DEBUG = !!changes.debugLogging.newValue;
    });
  } catch (e) { /* not in an extension context (tests) */ }
})(typeof self !== 'undefined' ? self : this);

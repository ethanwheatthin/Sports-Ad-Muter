## Football Ad Muter — AI Agent Instructions

This file gives an AI coding agent the concise, actionable knowledge needed to make focused changes in this repository.

**Big Picture**:
- **Content script (`content.js`)**: runs in page context, finds the active `video` element, captures frames (multi-method fallbacks), enqueues analysis requests, and applies mute/unmute actions.
- **Background service worker (`background.js`)**: central point for calling the Ollama API, performing heavy async work, and tracking API metrics. Communicates via `chrome.runtime.sendMessage`.
- **Popup (`popup.html`, `popup.js`)**: UI for starting/stopping monitoring, adjusting settings (`ollamaUrl`, `checkInterval`), and viewing logs/metrics.
- **Supporting modules**: `request-queue.js` (rate-limited queue manager) and `adaptive-sampler.js` (adaptive capture frequency). These are intentionally decoupled and exposed globally for the content script to instantiate.

**Key Files to Inspect for Changes**:
- `content.js` — main orchestration, capture and enqueue flow (`captureAndAnalyzeVideo`, `performCapture`).
- `background.js` — Ollama integration and model prompt (`analyzeWithOllama`, `testOllamaConnection`).
- `request-queue.js` — how requests are enqueued, handlers, and lifecycle (`enqueue`, `executeRequest`, `getStatus`).
- `adaptive-sampler.js` — logic for when to capture (`shouldCaptureFrame`, `updateStrategy`).
- `popup.js` — UX expectations, storage keys and messaging conventions.

**Developer Workflows / Commands**:
- Load unpacked extension in Chrome: open `chrome://extensions/` → enable Developer mode → `Load unpacked` → select repository root.
- Ollama setup: follow `README.md`; default API URL is `http://localhost:11434`. Useful commands: `ollama pull qwen3-vl:2b` and `ollama serve`.
- Helper scripts: `setup.bat` and `start-ollama-with-cors.bat` may contain platform-specific steps — inspect before changing.

**Project-Specific Conventions & Patterns**:
- Storage:
  - **Settings & activity logs:** use `chrome.storage.sync` (small items). Keys: `ollamaUrl`, `checkInterval`, `isEnabled`, `activityLogs`.
  - **Analysis frames / LLM responses:** use `chrome.storage.local` and key `analysisLogs` since frames are large base64 blobs.
- Messaging:
  - Popup ↔ Content: `chrome.tabs.sendMessage` (tab-scoped)
  - Content ↔ Background: `chrome.runtime.sendMessage` (background handles Ollama calls)
  - Background uses async responses (listener returns `true` for async)
- Capture fallback order (explicit in `content.js`): `ImageCapture` → `OffscreenCanvas` → `createImageBitmap` → traditional canvas. Preserve this order if modifying capture logic.
- Queueing: Use `RequestQueue.enqueue({... handler, onSuccess, onError })` rather than calling background directly — this centralizes timeouts, retries, and rate limits.

**Integration Points & Constraints**:
- Ollama API: background uses endpoints `/api/tags` (health) and `/api/generate` (analysis). CORS and timeouts are handled; when changing network code, maintain the existing timeout and error handling pattern.
- Storage limits: `storage.sync` is small; `storage.local` is used for larger payloads — keep `analysisLogs` trimmed to ~50 entries to avoid overflow.
- Extension manifest (`manifest.json`) loads `request-queue.js`, `adaptive-sampler.js`, and `content.js` as content scripts; changes to these files must keep them compatible with MV3 service worker environment.

**Concrete Examples (copy/paste references)**:
- Enqueue an analysis request (see `content.js`):
  - `requestQueue.enqueue({ priority: X, data: { base64Image, ollamaUrl }, handler: async (data) => { return new Promise((resolve,reject)=>{ chrome.runtime.sendMessage({ action: 'analyzeImage', base64Image: data.base64Image, ollamaUrl }, (resp)=>{ ... }) }) }, onSuccess: fn, onError: fn })`
- Ollama prompt lives inside `background.js` in `analyzeWithOllama()` — keep the single-token `true`/`false` response contract unchanged unless updating downstream logic.

**When Editing**:
- Preserve messaging contracts (action names: `analyzeImage`, `testApiConnection`, `getApiMetrics`, `logUpdate`, `activityUpdate`).
- If you change storage keys, update `popup.js`, `content.js`, and `background.js` consistently.
- Any change that increases captured image size or retention must also update `chrome.storage.local` trimming logic in `saveLogEntry`.

**Debugging / Quick Checks**:
- Use browser DevTools Console on the page (content script logs) and Service Worker console (chrome://serviceworker-internals or Extensions → Service Worker background page) for background logs.
- Test helper pages: `peacock-debug.html`, `test-403-debug.html`, `test-ollama-cors.html`, and `test-video-capture.html` exist for reproducing common issues — open in the browser to replicate scenarios.

If any part of these instructions is unclear or you'd like the agent to expand a specific area (e.g., add unit-test scaffolding, or standardize timeouts), tell me which section and I'll iterate.

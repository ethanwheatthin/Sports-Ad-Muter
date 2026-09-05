// Offscreen document: owns the tab-capture MediaStream and produces cropped
// JPEG frames on demand. Used for DRM-protected sites (Peacock, ESPN) where
// an in-page canvas.drawImage(video) is blocked by EME.

const LOG = '[SAM Offscreen]';

let stream = null;
let streamId = null;
const videoEl = document.getElementById('cap');
const canvas = document.getElementById('draw');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return false;

  if (msg.action === 'offscreen-start-capture') {
    startCapture(msg.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error(LOG, 'startCapture failed:', err);
        sendResponse({ ok: false, error: String(err && err.message || err) });
      });
    return true;
  }

  if (msg.action === 'offscreen-capture-frame') {
    captureFrame(msg.rect, msg.maxWidth || 800)
      .then((res) => sendResponse(res))
      .catch((err) => {
        console.error(LOG, 'captureFrame failed:', err);
        sendResponse({ ok: false, error: String(err && err.message || err) });
      });
    return true;
  }

  if (msg.action === 'offscreen-stop-capture') {
    stopCapture();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'offscreen-status') {
    sendResponse({
      ok: true,
      hasStream: !!stream,
      streamId: streamId,
      videoWidth: videoEl.videoWidth,
      videoHeight: videoEl.videoHeight,
      playing: !videoEl.paused
    });
    return true;
  }

  return false;
});

async function startCapture(id) {
  stopCapture();
  streamId = id;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: id,
        // Keep it reasonably sized; we downscale again per-frame.
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 5
      }
    }
  });
  videoEl.srcObject = stream;
  await videoEl.play().catch(() => {});
  // Wait for the first frame so videoWidth/Height are populated.
  await waitForDimensions(3000);
  console.log(LOG, 'capture started', videoEl.videoWidth + 'x' + videoEl.videoHeight);

  stream.getVideoTracks().forEach((t) => {
    t.addEventListener('ended', () => {
      console.log(LOG, 'capture track ended');
      stopCapture();
      chrome.runtime.sendMessage({ action: 'drmCaptureEnded' }).catch(() => {});
    });
  });
}

function waitForDimensions(timeoutMs) {
  return new Promise((resolve) => {
    if (videoEl.videoWidth > 0) return resolve();
    const start = Date.now();
    const iv = setInterval(() => {
      if (videoEl.videoWidth > 0 || Date.now() - start > timeoutMs) {
        clearInterval(iv);
        resolve();
      }
    }, 100);
  });
}

function stopCapture() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
  stream = null;
  streamId = null;
  videoEl.srcObject = null;
}

// rect: normalized { x, y, w, h } in [0,1] describing the video region inside
// the captured tab viewport. If omitted, the whole frame is used.
async function captureFrame(rect, maxWidth) {
  if (!stream || videoEl.videoWidth === 0) {
    return { ok: false, error: 'no-active-capture' };
  }

  const fullW = videoEl.videoWidth;
  const fullH = videoEl.videoHeight;

  let sx = 0, sy = 0, sw = fullW, sh = fullH;
  if (rect && rect.w > 0.05 && rect.h > 0.05) {
    sx = Math.max(0, Math.round(rect.x * fullW));
    sy = Math.max(0, Math.round(rect.y * fullH));
    sw = Math.min(fullW - sx, Math.round(rect.w * fullW));
    sh = Math.min(fullH - sy, Math.round(rect.h * fullH));
  }

  const scale = sw > maxWidth ? maxWidth / sw : 1;
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  canvas.width = dw;
  canvas.height = dh;
  ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, dw, dh);

  const black = isMostlyBlack(dw, dh);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

  return {
    ok: true,
    black: black.black,
    variance: black.variance,
    meanLuma: black.mean,
    width: dw,
    height: dh,
    base64: dataUrl.split(',')[1],
    dataUrl: dataUrl
  };
}

// Detects the DRM "black frame" case (HDCP / Widevine L1 blackout) so the
// content script can fall back to audio/DOM signals.
function isMostlyBlack(w, h) {
  const sw = Math.min(w, 120);
  const sh = Math.min(h, 120);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  let sum = 0;
  let sumSq = 0;
  const n = sw * sh;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += luma;
    sumSq += luma * luma;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return { black: mean < 6 && variance < 12, mean: +mean.toFixed(2), variance: +variance.toFixed(2) };
}

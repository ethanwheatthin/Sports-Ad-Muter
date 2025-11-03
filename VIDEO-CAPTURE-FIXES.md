# Video Capture Function - Debug Fixes

## Issues Found and Fixed

### 1. **ReadyState Check Too Strict**
**Problem:** The function was checking for `readyState >= 2`, which requires substantial video data to be loaded. This could cause the function to skip frames unnecessarily.

**Fix:** Relaxed to `readyState >= 1` (HAVE_METADATA), which allows capture as soon as video dimensions are available.

```javascript
// Before
if (video.readyState < 2) {
  return;
}

// After
if (video.readyState < 1) {
  return;
}
```

---

### 2. **Overly Strict CORS Check**
**Problem:** The CORS pre-check was causing early returns even when the video could be captured successfully.

**Fix:** Removed the CORS pre-check. Canvas will naturally fail if CORS blocks access, and we handle that error properly in the blob conversion.

```javascript
// REMOVED this entire block:
try {
  const testCanvas = document.createElement('canvas');
  testCanvas.width = 1;
  testCanvas.height = 1;
  const testCtx = testCanvas.getContext('2d');
  testCtx.drawImage(video, 0, 0, 1, 1);
  testCtx.getImageData(0, 0, 1, 1); // This will throw if CORS blocked
} catch (corsError) {
  console.error('[Football Ad Muter] CORS error - cannot capture video:', corsError);
  saveLogEntry(null, 'CORS error - video capture blocked');
  return;
}
```

---

### 3. **Pixel Variance Threshold Too High**
**Problem:** The function was rejecting frames with `pixelVariance < 10`, which could skip valid dark scenes or certain video content.

**Fix:** Reduced threshold to `pixelVariance < 5` and changed behavior to log a warning but continue with analysis instead of returning early.

```javascript
// Before
if (!hasVideoContent || pixelVariance < 10) {
  // Log warning and return early - NO ANALYSIS
  return;
}

// After
if (!hasVideoContent || pixelVariance < 5) {
  // Log warning but CONTINUE with analysis
  console.log('[Football Ad Muter] Warning: Low pixel variance detected, but continuing with analysis');
}
```

---

### 4. **Early Video Time Check Too Conservative**
**Problem:** Skipping capture if `video.currentTime < 2` was too conservative, causing missed opportunities.

**Fix:** Changed to `video.currentTime < 1` to allow earlier captures while still avoiding loading frames.

```javascript
// Before
if (video.currentTime < 2 && video.duration > 5) {
  return;
}

// After
if (video.currentTime < 1 && video.duration > 5) {
  return;
}
```

---

### 5. **Missing Error Handlers**
**Problem:** The FileReader didn't have proper error handling, and there was no timeout for the message passing.

**Fix:** Added comprehensive error handling:

```javascript
// Added FileReader error handler
reader.onerror = (error) => {
  console.error('[Football Ad Muter] FileReader error:', error);
  saveLogEntry(null, 'Failed to read image blob');
};

// Added timeout for message passing
const timeout = setTimeout(() => {
  reject(new Error('Background script response timeout'));
}, 35000); // 35 second timeout

chrome.runtime.sendMessage({...}, (response) => {
  clearTimeout(timeout);
  // handle response
});

// Added timeout error handling
if (messageError.message.includes('timeout')) {
  saveLogEntry(null, 'Background script timeout - analysis took too long');
}
```

---

### 6. **Async/Await in toBlob Callback**
**Problem:** Using `async` in the `toBlob` callback was unnecessary and could cause issues with the callback structure.

**Fix:** Removed `async` from the callback since we're properly handling promises inside it:

```javascript
// Before
canvas.toBlob(async (blob) => {
  // ...
}, 'image/jpeg', 0.8);

// After
canvas.toBlob((blob) => {
  // ... async operations inside are still handled with async/await
}, 'image/jpeg', 0.8);
```

---

## Testing

A new test page has been created: `test-video-capture.html`

### How to Test:

1. Open `test-video-capture.html` in your browser
2. Ensure the Football Ad Muter extension is loaded and enabled
3. Click "Play Video" to start the test video
4. Click "Test Capture" to manually test the capture functionality
5. Watch the console log for detailed information
6. The captured frame will be displayed on the page

### What to Check:

- ✅ Video dimensions are properly detected
- ✅ Canvas is created with correct size
- ✅ Video frame is drawn to canvas
- ✅ Pixel variance is calculated
- ✅ Blob is created successfully
- ✅ Base64 image is generated
- ✅ Captured frame is displayed

---

## Expected Behavior After Fixes

1. **More Reliable Captures**: Videos will be captured more consistently, even in edge cases
2. **Better Error Messages**: Clearer logs when something goes wrong
3. **Fewer False Negatives**: Dark scenes and low-contrast content won't be skipped
4. **Timeout Protection**: Long-running API calls won't hang indefinitely
5. **Proper Error Recovery**: Failed captures log errors but don't crash the extension

---

## Debug Console Commands

Open browser DevTools console and try these:

```javascript
// Check if content script is loaded
console.log('[Football Ad Muter] Status check');

// Manually trigger a capture (if monitoring is active)
const video = document.querySelector('video');
if (video) {
  console.log('Video found:', video.videoWidth, 'x', video.videoHeight);
} else {
  console.log('No video element found');
}

// Check extension storage
chrome.storage.sync.get(['ollamaUrl', 'checkInterval', 'isEnabled'], console.log);
```

---

## Summary

The main issues were:
1. **Too strict validation** - causing legitimate frames to be skipped
2. **Missing error handling** - silent failures without proper logging
3. **No timeout protection** - could hang on slow API responses

All issues have been addressed while maintaining the core functionality of detecting and capturing active video content.

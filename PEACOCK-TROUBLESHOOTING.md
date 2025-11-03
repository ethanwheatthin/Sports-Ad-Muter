# Peacock Video Capture - Troubleshooting Guide

## Issue: Extension Not Capturing Peacock Video

### Common Causes

1. **Multiple Video Elements** - Peacock uses multiple `<video>` tags (one for ads, one for content)
2. **Dynamic Loading** - Video elements are created/destroyed during playback
3. **Hidden Videos** - Inactive videos may have 0x0 dimensions or be positioned off-screen
4. **CORS/DRM Protection** - Peacock may use protected content that blocks canvas capture
5. **Delayed Initialization** - Video elements may not be ready when monitoring starts

---

## Step 1: Use the Debug Tool

1. Open `peacock-debug.html` in your browser
2. Click "Copy Script to Clipboard"
3. Go to Peacock and start playing a video
4. Open DevTools (F12) → Console tab
5. Paste the script and press Enter
6. Review the output

### What to Look For:

```
✅ GOOD SIGNS:
- Multiple videos found (1-2 is normal)
- One video has large dimensions (e.g., 1920x1080)
- readyState is 3 or 4 (HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA)
- Not paused
- Capture test succeeds
- Pixel variance > 5

⚠️ PROBLEMS:
- All videos have 0x0 dimensions
- readyState is 0 or 1
- Capture test fails with CORS error
- Pixel variance is 0 or very low
- All videos are paused
```

---

## Step 2: Check Extension Logs

Open DevTools Console while on Peacock with extension running:

```javascript
// Look for these log messages:
[Football Ad Muter] Found X video elements on page
[Football Ad Muter] Video 1: {...}
[Football Ad Muter] Selected largest playing video
```

### Common Log Issues:

**"No video element found"**
- Page hasn't loaded completely
- Video is in an iframe
- Solution: Wait for video to start playing, then reload extension

**"Video not ready - no dimensions"**
- Video element exists but hasn't initialized
- Solution: Reduce check interval to 1-2 seconds

**"Canvas appears to have no video content"**
- Video is showing black screen or loading
- Solution: Wait a few seconds and check again

**"CORS error - video capture blocked"**
- Peacock is blocking canvas access (DRM protection)
- Solution: This may not be fixable for protected content

---

## Step 3: Improvements Made

The extension now has enhanced video detection:

### ✅ Multi-Strategy Video Selection

1. **Active Class Detection** - Looks for `.player-active`, `.playing`, `.main`
2. **Visibility Check** - Filters out hidden videos (display:none, opacity:0)
3. **Size Priority** - Prefers larger videos (actual content vs thumbnails)
4. **Z-Index Awareness** - Considers which video is "on top"
5. **Playing State** - Prioritizes videos that are actively playing

### ✅ Better Monitoring

- Tracks video element changes (detects ad/content switches)
- Faster initial capture (0.5s instead of 1s)
- Consecutive failure detection
- More detailed logging for debugging

### ✅ Relaxed Capture Requirements

- Accepts readyState >= 1 (was 2)
- Lower pixel variance threshold (5 instead of 10)
- Continues analysis even with warnings

---

## Step 4: Manual Testing

### Test the new video selection:

```javascript
// Run this in Peacock's console while video is playing:
(function() {
    const videos = document.querySelectorAll('video');
    console.log('Total videos:', videos.length);
    
    videos.forEach((v, i) => {
        const rect = v.getBoundingClientRect();
        const style = getComputedStyle(v);
        console.log(`Video ${i+1}:`, {
            size: v.videoWidth + 'x' + v.videoHeight,
            playing: !v.paused,
            visible: style.display !== 'none' && parseFloat(style.opacity) > 0,
            readyState: v.readyState,
            rectSize: rect.width + 'x' + rect.height
        });
    });
})();
```

---

## Step 5: Known Limitations

### Peacock-Specific Issues:

1. **DRM Protected Content**
   - Some Peacock streams use EME (Encrypted Media Extensions)
   - Canvas capture may be blocked by the browser
   - **No workaround available** - this is a security feature

2. **Dynamic Ad Insertion**
   - Peacock may swap video elements during ad breaks
   - Extension now detects this and handles element changes

3. **Buffering/Loading States**
   - During buffering, frames may be black or frozen
   - Extension logs warnings but continues attempting capture

---

## Step 6: Alternative Approaches

If standard capture fails, try these:

### Option A: Reduce Check Interval
- Go to extension popup
- Set check interval to 2000ms (2 seconds)
- This captures more frequently and catches content faster

### Option B: Manual Reset
- Click "Reset Video" button in extension popup
- This clears mute states and forces re-detection

### Option C: Reload Page
- Peacock's video player may need a fresh start
- Reload the page and start monitoring immediately

---

## Step 7: Report Issues

If Peacock still doesn't work, collect this info:

1. **Console logs** - Copy all `[Football Ad Muter]` messages
2. **Debug script output** - From peacock-debug.html
3. **Video state** - Screenshot of extension popup logs
4. **Peacock plan** - Free vs Premium (different DRM?)
5. **Browser** - Chrome/Edge version
6. **Content type** - Live sports vs on-demand

---

## Quick Checklist

Before troubleshooting, verify:

- [ ] Extension is enabled (popup shows "Monitoring Active")
- [ ] Ollama is running (`http://localhost:11434`)
- [ ] Video is actually playing on Peacock (not paused)
- [ ] Browser allows video capture (not in incognito with blocked permissions)
- [ ] Extension has been reloaded recently (chrome://extensions → Reload)
- [ ] Check interval is reasonable (2-5 seconds recommended)

---

## Expected Behavior

With improvements, you should see:

```
[Football Ad Muter] Found 2 video elements on page
[Football Ad Muter] Video 1: {width: 1920, height: 1080, playing, visible}
[Football Ad Muter] Video 2: {width: 0, height: 0, hidden}
[Football Ad Muter] Selected largest playing video, area: 2073600
[Football Ad Muter] Starting video capture and analysis...
[Football Ad Muter] Canvas created: 800x450
[Football Ad Muter] Pixel analysis: variance=234, hasContent=true
[Football Ad Muter] Sending image to background script...
[Football Ad Muter] Analysis result: true (gameplay detected)
```

---

## Still Not Working?

If after all this Peacock still fails:

1. **Test on YouTube** - Verify extension works on simpler sites
2. **Check Peacock's DevTools Network tab** - Look for video URLs with DRM
3. **Try different content** - Some Peacock content may have stricter protection
4. **Consider alternatives** - Peacock may have technical limitations that prevent capture

The extension has been significantly improved for streaming services like Peacock, but DRM protection is a legitimate blocker that cannot be bypassed.

# Peacock Video Capture - Improvements Summary

## Problems Identified

Your extension was having trouble capturing Peacock's video feed due to:

1. **Multiple video elements** - Peacock uses multiple `<video>` tags simultaneously
2. **Hidden/inactive videos** - Some videos have 0x0 dimensions or are off-screen
3. **Strict filtering** - Old logic was too strict, filtering out valid videos
4. **No visibility checking** - Didn't account for CSS visibility (display, opacity, z-index)
5. **No site-specific optimizations** - Treated all sites the same

---

## Improvements Made

### 1. Enhanced Video Selection Strategy (`getActiveVideo`)

**New Multi-Strategy Approach:**

```javascript
Strategy 1: Site-Specific Optimizations
  ├─ Peacock: Filter videos > 100x100px, visible
  ├─ YouTube: Use .html5-video-container selector
  └─ Generic: Standard detection

Strategy 2: Active Class Detection
  ├─ Look for .player-active, .playing, .main
  └─ Check parent elements up the DOM tree

Strategy 3: Visibility Filtering
  ├─ Check CSS: display, visibility, opacity
  ├─ Verify dimensions > 50x50px
  └─ Ensure readyState >= 1

Strategy 4: Playing State Priority
  ├─ Prefer !paused && currentTime > 0
  └─ Filter readyState >= 2 for playing videos

Strategy 5: Size + Z-Index Sorting
  ├─ Largest video area wins
  └─ If similar size, higher z-index wins

Strategy 6: Fallback Options
  └─ Any video with dimensions > 0
```

### 2. Site Detection System

Added automatic site detection:

```javascript
- Peacock (peacocktv.com)
- YouTube (youtube.com)
- Netflix (netflix.com)
- Hulu (hulu.com)
- Amazon Prime (amazon.com, primevideo.com)
```

### 3. Improved Monitoring Logic

**Better video tracking:**
- Detects when video element changes (ad/content switch)
- Tracks consecutive failures
- Clears old mute flags when videos change
- Faster initial capture (0.5s instead of 1s)

### 4. Enhanced Logging

**More detailed debug info:**
```javascript
// Now logs for each video:
- Video dimensions (width, height, area)
- Playback state (paused, muted, currentTime)
- Visibility (display, opacity, z-index, rect size)
- Ready state and network state
- Parent classes and active indicators
- Source URL (truncated to 100 chars)
```

### 5. Relaxed Capture Requirements

**Previous (Too Strict):**
```javascript
- readyState >= 2 (HAVE_CURRENT_DATA)
- pixelVariance >= 10
- currentTime >= 1 second
- Would skip empty frames
```

**Now (More Lenient):**
```javascript
- readyState >= 1 (HAVE_METADATA)
- pixelVariance >= 5
- currentTime >= 0.5 seconds
- Warns but continues on empty frames
```

---

## Debug Tools Created

### 1. `peacock-debug.html`
- Interactive debug page
- Copy-paste script for console
- Analyzes all videos on Peacock
- Tests capture capability
- Shows visibility, dimensions, playback state

### 2. `test-video-capture.html`
- Local test environment
- Manual capture testing
- Real-time video state display
- Pixel variance analysis
- Shows captured frames

### 3. `PEACOCK-TROUBLESHOOTING.md`
- Step-by-step debugging guide
- Common issues and solutions
- Known limitations
- Manual testing commands
- Issue reporting checklist

---

## How to Test the Improvements

### Quick Test:

1. **Reload the extension:**
   - Go to `chrome://extensions`
   - Click the reload icon on "Football Ad Muter"

2. **Go to Peacock:**
   - Start playing any video (sports stream preferred)
   - Open DevTools Console (F12)

3. **Check logs:**
   ```
   Look for:
   [Football Ad Muter] Detected site: {isPeacock: true}
   [Football Ad Muter] Found X video elements on page
   [Football Ad Muter] Peacock detected - applying Peacock-specific video selection
   [Football Ad Muter] Video 1: {detailed info...}
   [Football Ad Muter] Selected largest playing video, area: XXXXX
   ```

4. **Start monitoring:**
   - Click extension icon
   - Click "Start Monitoring"
   - Watch console for capture attempts

### Deep Debug:

1. **Open `peacock-debug.html`**
2. **Copy the debug script**
3. **Go to Peacock, open console, paste script**
4. **Analyze output:**
   - How many videos found?
   - Which has largest dimensions?
   - Is capture test successful?
   - What's the pixel variance?

---

## Expected Results

### On Peacock (with improvements):

```javascript
// Console output should show:
[Football Ad Muter] Detected site: {isPeacock: true, ...}
[Football Ad Muter] Found 2 video elements on page
[Football Ad Muter] Peacock detected - applying Peacock-specific video selection
[Football Ad Muter] After Peacock filter: 1 videos remain
[Football Ad Muter] Video 1: {
  width: 1920,
  height: 1080,
  area: 2073600,
  paused: false,
  visible: true,
  readyState: 4,
  currentTime: 45.23,
  display: "block",
  zIndex: "auto",
  rectWidth: 1920,
  rectHeight: 1080
}
[Football Ad Muter] Selected largest playing video, area: 2073600
[Football Ad Muter] Starting video capture and analysis...
[Football Ad Muter] Canvas created: 800x450
[Football Ad Muter] Video frame drawn to canvas
[Football Ad Muter] Canvas content analysis: {hasVideoContent: true, pixelVariance: 187}
[Football Ad Muter] Sending image to background script...
[Football Ad Muter] Analysis result: true
[Football Ad Muter] 🔊 UNMUTING VIDEO - Gameplay detected
```

### Success Indicators:

✅ Site detected correctly (isPeacock: true)  
✅ Videos found and filtered  
✅ Correct video selected (largest, visible, playing)  
✅ Canvas created successfully  
✅ Pixel variance > 5  
✅ Image sent to background script  
✅ Analysis returns true/false  
✅ Video muted/unmuted appropriately  

---

## Known Limitations

### DRM Protection
Peacock may use Encrypted Media Extensions (EME) for premium content. If you see:

```javascript
[Football Ad Muter] CORS error - video capture blocked
// OR
Capture test: ❌ Capture failed: SecurityError
```

This means **DRM is blocking canvas capture** and cannot be bypassed. This is a browser security feature.

**Workaround:** Try different Peacock content (free vs premium), as DRM may vary.

### Dynamic Ad Insertion
Peacock swaps video elements during ads. The extension now:
- Detects element changes
- Clears old mute flags
- Re-analyzes new video element

### Multiple Videos
Peacock loads multiple videos simultaneously. The extension now:
- Filters by visibility and size
- Prefers playing videos
- Uses z-index to find top video

---

## Comparison: Before vs After

### Before:
```
❌ Found 2 videos, selected wrong one (ad placeholder)
❌ Video had 0x0 dimensions
❌ Strict readyState check blocked capture
❌ No visibility filtering
❌ No site-specific logic
❌ Generic error: "Video not ready"
```

### After:
```
✅ Found 2 videos, Peacock filter applied
✅ Selected visible video (1920x1080)
✅ Relaxed readyState (>= 1 instead of >= 2)
✅ Visibility checked (display, opacity, rect size)
✅ Peacock-specific optimizations
✅ Detailed logs: "Selected largest playing video, area: 2073600"
```

---

## Next Steps

1. **Test on Peacock** with the reloaded extension
2. **Review console logs** to verify video selection
3. **Use debug tools** if issues persist
4. **Check for DRM** if capture fails
5. **Report results** with detailed logs

The extension should now work significantly better on Peacock and similar streaming services!

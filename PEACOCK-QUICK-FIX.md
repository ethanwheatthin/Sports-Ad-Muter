# 🦚 Peacock Quick Fix Guide

## TL;DR - What Changed?

Your extension can now **automatically detect and handle Peacock** with these improvements:

### ✅ What's New:
1. **Site detection** - Knows when you're on Peacock
2. **Smart video selection** - Filters out hidden/dummy videos
3. **Visibility checking** - Only selects visible, playing videos
4. **Better logging** - Detailed info about what it's doing
5. **Faster capture** - Starts at 0.5s instead of 1s

---

## Quick Test (2 minutes)

### Step 1: Reload Extension
```
1. Go to chrome://extensions
2. Find "Football Ad Muter"
3. Click the reload button (🔄)
```

### Step 2: Test on Peacock
```
1. Go to Peacock (peacocktv.com)
2. Start any video
3. Open DevTools Console (F12)
4. Click extension icon → "Start Monitoring"
```

### Step 3: Check Console
Look for these messages:
```javascript
✅ [Football Ad Muter] Detected site: {isPeacock: true}
✅ [Football Ad Muter] Peacock detected - applying Peacock-specific video selection
✅ [Football Ad Muter] Selected largest playing video, area: 2073600
✅ [Football Ad Muter] Starting video capture and analysis...
```

---

## Still Not Working?

### Option 1: Use Debug Script

1. Open `peacock-debug.html`
2. Click "Copy Script"
3. Go to Peacock → F12 → Console → Paste
4. Look at output - does capture test succeed?

### Option 2: Check for DRM

If you see:
```javascript
❌ Capture test: ❌ Capture failed: SecurityError
```

**This means DRM is blocking capture.** Try:
- Different Peacock content (free vs premium)
- Different browser
- Non-premium streams

### Option 3: Manual Adjustments

In extension popup:
- Reduce check interval to **2000ms** (2 seconds)
- Click "Reset Video" button
- Restart monitoring

---

## Debug Checklist

Before reporting issues:

- [ ] Extension reloaded after code changes
- [ ] Peacock video is actually playing (not paused)
- [ ] DevTools Console is open to see logs
- [ ] Monitoring is started (extension popup)
- [ ] Ollama is running (test with test-ollama-cors.html)
- [ ] Not using incognito mode

---

## Expected vs Problem Logs

### ✅ WORKING:
```
[Football Ad Muter] Detected site: {isPeacock: true}
[Football Ad Muter] Found 2 video elements on page
[Football Ad Muter] Peacock detected - applying Peacock-specific video selection
[Football Ad Muter] After Peacock filter: 1 videos remain
[Football Ad Muter] Video 1: {width: 1920, height: 1080, visible: true, paused: false}
[Football Ad Muter] Selected largest playing video, area: 2073600
[Football Ad Muter] Canvas created: 800x450
[Football Ad Muter] Pixel variance: 156
[Football Ad Muter] Analysis result: true
```

### ❌ NOT WORKING:
```
Problem A: No videos found
[Football Ad Muter] Found 0 video elements on page
→ Solution: Wait for video to load, check if in iframe

Problem B: All videos have no dimensions
[Football Ad Muter] Video 1: {width: 0, height: 0}
→ Solution: Wait longer, video still initializing

Problem C: DRM blocking
[Football Ad Muter] CORS error - video capture blocked
→ Solution: Try different content, may not be fixable

Problem D: Wrong video selected
[Football Ad Muter] Video 1: {width: 320, height: 180, paused: true}
→ Solution: Wait for main video to start playing
```

---

## Files Created for You

| File | Purpose |
|------|---------|
| `peacock-debug.html` | Interactive debug tool with copy-paste script |
| `PEACOCK-TROUBLESHOOTING.md` | Complete troubleshooting guide |
| `IMPROVEMENTS-SUMMARY.md` | Detailed technical explanation |
| `VIDEO-CAPTURE-FIXES.md` | Original capture function fixes |
| `test-video-capture.html` | Local testing environment |

---

## What Each File Does

### 🔧 peacock-debug.html
**Use when:** Peacock not working, need to diagnose why  
**How:** Open → Copy script → Paste in Peacock console  
**Shows:** Video dimensions, visibility, capture test results

### 📖 PEACOCK-TROUBLESHOOTING.md
**Use when:** Step-by-step debugging needed  
**Contains:** Common issues, solutions, manual tests

### 📊 IMPROVEMENTS-SUMMARY.md
**Use when:** Want to understand what changed  
**Contains:** Before/after comparison, technical details

### 🧪 test-video-capture.html
**Use when:** Testing capture logic locally  
**Contains:** Sample video, capture button, real-time logs

---

## One-Line Fixes

Try these in DevTools Console while on Peacock:

```javascript
// See all videos
document.querySelectorAll('video').forEach((v,i) => console.log(`Video ${i+1}:`, v.videoWidth+'x'+v.videoHeight, 'paused:', v.paused))

// Force unmute all
document.querySelectorAll('video').forEach(v => v.muted = false)

// Check visibility
document.querySelectorAll('video').forEach((v,i) => console.log(`Video ${i+1} visible:`, getComputedStyle(v).display !== 'none'))

// Get largest video
Array.from(document.querySelectorAll('video')).sort((a,b) => (b.videoWidth*b.videoHeight) - (a.videoWidth*a.videoHeight))[0]
```

---

## Success Metrics

Extension is working when:
- ✅ Console shows Peacock detection
- ✅ Correct video selected (large dimensions)
- ✅ Canvas created successfully
- ✅ Pixel variance > 5
- ✅ Analysis returns true/false
- ✅ Video mutes/unmutes based on content

---

## Contact / Report

If still broken after all this, provide:
1. Full console logs (copy all `[Football Ad Muter]` messages)
2. Debug script output from peacock-debug.html
3. Peacock plan (Free/Premium/Premium Plus)
4. Content type (Live sports/On-demand/Peacock Originals)
5. Browser version

Good luck! 🚀

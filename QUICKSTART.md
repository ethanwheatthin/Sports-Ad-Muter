# Quick Start Guide

Get S.A.M (Sports Ad Muter) running in 5 minutes!

## What You Need

- Chrome browser
- Ollama installed ([download here](https://ollama.com/))
- The qwen3-vl:2b model

---

## Quick Setup

### Step 1: Install Ollama Model

Open a terminal and run:

```bash
ollama pull qwen3-vl:2b
```

This downloads the AI vision model (~2.5GB). Wait for it to complete.

### Step 2: Start Ollama with CORS Support

**Windows Users**: Double-click `start-ollama-with-cors.bat` in the extension folder

> **What this script does**:
> - Stops any existing Ollama processes
> - Clears port 11434 if it's in use  
> - Starts Ollama with `OLLAMA_ORIGINS=*` for Chrome extension access
> - **Keep the terminal window open** while using the extension

**Manual Start** (all platforms):

**Windows**:
```bash
set OLLAMA_ORIGINS=* && ollama serve
```

**macOS/Linux**:
```bash
OLLAMA_ORIGINS=* ollama serve
```

> **Why CORS?** Chrome extensions need CORS (Cross-Origin Resource Sharing) enabled to communicate with Ollama. The `*` allows requests from any origin, including the extension.

### Step 3: Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`

2. Enable **Developer mode** (toggle in top-right corner)

3. Click **Load unpacked**

4. Select the `Football-Ad-Muter` folder (the one containing `manifest.json`)

5. The S.A.M icon should appear in your toolbar

---

## Using the Extension

### Start Monitoring

1. Navigate to a sports livestream (try YouTube Sports)

2. Click the S.A.M extension icon

3. Click **Start Monitoring**

4. The extension will now:
   - Detect when ads play → **Mutes video**
   - Detect when game is on → **Unmutes video**

### Check It's Working

- Open the popup to see recent frame captures
- Check the activity log for mute/unmute events
- Watch the video - it should auto-mute during ads!

---

## Platform Compatibility

### Works Great On:
- **YouTube** - Sports channels, live streams
- **Fox Sports** - Sports channels
- **CBS Sports** - Sports channels

### DRM Protected Content (Won't Work):
Some platforms use **DRM (Digital Rights Management)** which prevents the extension from capturing video frames:

#### ESPN
- **DRM Protected**: Most live games and premium content
- **May Work**: Some replays, highlights, and free content
- **Note**: If ESPN content is DRM-protected, the extension will detect it and show an alert

#### Peacock
- **DRM Protected**: Most NBC Sports and premium live events  
- **May Work**: Some free content and replays
- **Note**: The extension will automatically stop if DRM is detected

### How to Tell if DRM is Active:

1. Start monitoring on a video
2. If DRM is detected, you'll see:
   - **Red alert** in the popup: "DRM Protected Content Detected"
   - Extension automatically stops monitoring
   - Details about which DRM system was detected (Widevine, PlayReady, etc.)

**Why DRM Blocks This**: DRM prevents any JavaScript from accessing video frames to protect copyrighted content. This is a browser security feature we cannot bypass.

---

## Troubleshooting

### Extension Not Detecting Ads/Gameplay?

**Check Ollama is running:**
```bash
ollama list
```

You should see `qwen3-vl:2b` in the list.

**Verify CORS is enabled:**
- Make sure you started Ollama with `OLLAMA_ORIGINS=*`
- Or use the `start-ollama-with-cors.bat` script

**Check the console:**
- Press F12 to open Developer Tools
- Look for error messages
- Common issue: "CORS policy" means Ollama needs to be restarted with CORS

### Video Not Being Detected?

- Refresh the page after starting monitoring
- Make sure the video is actually playing (not paused)
- Try a different video source
- Check if it's DRM-protected content

### Port 11434 Already in Use?

The `start-ollama-with-cors.bat` script handles this automatically, but if you see this error:

**Windows**:
```bash
netstat -ano | findstr :11434
taskkill /F /PID <PID_NUMBER>
```

**macOS/Linux**:
```bash
lsof -i :11434
kill -9 <PID>
```

### Extension Popup Shows Errors?

1. Click the **Test Model** button in the popup
2. If it fails:
   - Restart Ollama with the CORS script
   - Reload the extension (chrome://extensions → reload button)
   - Try again

---

## Tips for Best Results

1. **Start monitoring BEFORE the game starts** - Let it calibrate

2. **YouTube works best** - Most reliable platform for testing

3. **Check the activity log** - See exactly when mute/unmute happens

4. **Adjust check interval** - Default 10 seconds is usually good
   - Lower = more responsive, higher CPU usage
   - Higher = less responsive, lower CPU usage

5. **Test on free streams first** - Make sure it's working before trying premium content

---

## What the Extension Does

1. **Captures video frames** every 10 seconds (adaptive)
2. **Sends to Ollama** for AI analysis
3. **AI determines**: Is this gameplay or an ad?
4. **Auto-mutes** during commercials
5. **Auto-unmutes** when game returns

All processing is **100% local** - nothing is sent to external servers!

---

## Need More Help?

- Full documentation: See [README.md](README.md)
- Detailed troubleshooting: See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Issues: [GitHub Issues](https://github.com/ethanwheatthin/Football-Ad-Muter/issues)

---

**Ready to watch sports without annoying ads? Click Start Monitoring and enjoy!**

# S.A.M (Sports Ad Muter)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome)](https://www.google.com/chrome/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org/)

**Automatically detect and mute advertisements during live sports broadcasts using AI-powered vision models**

S.A.M intelligently distinguishes between live sports action and commercials, seamlessly muting ads while keeping you immersed in the game. Supports both local Ollama AI and in-browser Transformers.js models.

> **New to S.A.M?** Check out the [Quick Start Guide](QUICKSTART.md) for a 5-minute setup!

---

## Features

- **Smart Ad Detection** - AI vision model identifies gameplay vs. commercials in real-time
- **Automatic Muting** - Instantly mutes during ads, unmutes for live action
- **Dual AI Modes**:
  - **Ollama Mode**: Use local `qwen3-vl:2b` model for high accuracy
  - **Browser Mode**: In-browser Transformers.js with `vit-gpt2-image-captioning` (no external dependencies)
- **Adaptive Sampling** - Intelligently adjusts capture frequency based on content stability
- **Rate-Limited Queue** - Prevents API overload with smart request management
- **Easy Controls** - Simple start/stop interface in extension popup
- **Privacy First** - All processing happens locally, nothing sent to external servers
- **Multi-Platform** - Works on YouTube, Twitch, ESPN, Peacock, and more

---

## Table of Contents

- **[Quick Start Guide](QUICKSTART.md)** - Get running in 5 minutes!
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Prerequisites

Choose **ONE** of the following setups:

### Option A: Ollama Mode (Recommended for Accuracy)

- **Ollama** installed and running locally
- **qwen3-vl:2b** model downloaded

```bash
# Install Ollama from https://ollama.ai
# Then pull the vision model:
ollama pull qwen3-vl:2b

# Start Ollama (usually runs automatically):
ollama serve
```

### Option B: Browser Mode (No External Dependencies)

- **Node.js 18+** and npm (for building only)
- **Modern browser** with WebGPU support (optional, for better performance)

---

## Installation

### For Users (Chrome Web Store - Coming Soon)

*Extension will be published to Chrome Web Store*

### For Developers (Build from Source)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ethanwheatthin/Football-Ad-Muter.git
   cd Football-Ad-Muter
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension**:
   ```bash
   npm run build
   ```
   This creates a `dist/` folder with the bundled extension.

4. **Load in Chrome**:
   - Open `chrome://extensions/`
   - Enable **Developer mode** (toggle in top-right)
   - Click **Load unpacked**
   - Select the `dist/` folder
   - Extension icon appears in toolbar

---

## Quick Start

### Using Ollama Mode

1. Ensure Ollama is running with CORS support:
   - **Windows**: Run `start-ollama-with-cors.bat` (included in project)
   - **macOS/Linux**: `OLLAMA_ORIGINS=* ollama serve`

2. Navigate to a live sports stream (e.g., YouTube Sports)

3. Click the S.A.M extension icon

4. Click **Start Monitoring**

5. S.A.M automatically mutes ads and unmutes for gameplay!

> **Note**: The `start-ollama-with-cors.bat` script automatically handles port conflicts and sets the required CORS configuration.

### Using Browser Mode

1. Click the extension icon

2. Click **Load Model** (first time only - downloads ~1GB model)

3. Wait for model to load (progress shown in popup)

4. Navigate to a live sports stream

5. Click **Start Monitoring**

---

## Usage

### Basic Operation

1. **Open Extension Popup** - Click the S.A.M icon in Chrome toolbar

2. **Configure Settings** (Optional):
   - **Check Interval**: How often to analyze video (default: 10 seconds)
   - Adaptive sampling automatically adjusts this during ads/gameplay

3. **Start Monitoring** - Click "Start Monitoring" button

4. **Watch the Game** - S.A.M works in the background:
   - Green status = Gameplay detected (unmuted)
   - Yellow status = Ad detected (muted)
   - Activity log shows all detection events

5. **Stop Monitoring** - Click "Stop Monitoring" when done

### Advanced Features

**Recent Frame Captures** - View the last 3 analyzed frames with AI decisions

**Activity Log** - Real-time log of all mute/unmute events

**Queue Metrics** - Monitor API request queue status and performance

**Reset Video** - Manually reset video player state if needed

---

## Configuration

### Check Interval

Adjust how often S.A.M analyzes the video:

- **Default**: 10 seconds (adaptive)
- **Range**: 1-60 seconds
- **Recommendation**: Leave at 10s, adaptive sampler handles optimization

### Ollama Settings (Ollama Mode Only)

- **API URL**: Default `http://localhost:11434`
- Change if Ollama runs on different port/machine
- Requires CORS configuration for remote access

### Adaptive Sampling Behavior

Automatically adjusts based on detected content:
- **Ads**: 3-5 second intervals (faster detection)
- **Stable Gameplay**: 10-15 second intervals (conserve resources)
- **Scene Changes**: Immediate capture on significant visual changes

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Chrome Tab                            │
│  ┌────────────────────────────────────────────────────┐     │
│  │              content.js (Content Script)            │     │
│  │  • Finds active video element                       │     │
│  │  • Captures frames (multi-method fallback)          │     │
│  │  • Applies mute/unmute based on AI response         │     │
│  │  • Manages adaptive sampling                        │     │
│  └────────────────┬────────────────────────────────────┘     │
└───────────────────┬──────────────────────────────────────────┘
                    │ chrome.runtime.sendMessage()
                    ▼
┌─────────────────────────────────────────────────────────────┐
│           background.js (Service Worker)                     │
│  • Handles AI model inference (Ollama or Transformers.js)   │
│  • Manages request queue and rate limiting                  │
│  • Tracks API performance metrics                           │
│  • Keeps service worker alive                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Modules

**`content.js`** - Page Context
- Video element detection (handles multiple videos, DRM content)
- Frame capture with 4-method fallback (ImageCapture, OffscreenCanvas, ImageBitmap, Canvas)
- Request queueing via `RequestQueue`
- Adaptive capture timing via `AdaptiveSampler`

**`background.js`** - Service Worker
- AI model management (Ollama API or Transformers.js)
- Image analysis and content classification
- Metrics tracking and monitoring

**`request-queue.js`** - Rate Limiting
- Concurrent request control (max 2 simultaneous)
- Priority-based queue processing
- Exponential backoff on failures
- Request timeout handling

**`adaptive-sampler.js`** - Intelligent Sampling
- Adjusts capture frequency based on content type
- Fast sampling during ads (3-5s intervals)
- Slow sampling during stable gameplay (10-15s intervals)
- Scene change detection

**`popup.js`** - User Interface
- Settings management
- Real-time status display
- Activity log viewer
- Frame capture preview

### AI Model Flow

```
Video Frame → Canvas → Base64 → [Queue] → AI Model → true/false
                                              ↓
                               true = Gameplay (unmute)
                               false = Ad (mute)
```

---

## Troubleshooting

### Extension Not Working

**Check Extension Status**:
```
1. Go to chrome://extensions/
2. Verify S.A.M is enabled
3. Check "Service worker" status (should say "active")
4. Click "Inspect views: service worker" to view logs
```

**Reload Extension**:
```
1. Go to chrome://extensions/
2. Click reload button (🔄) on S.A.M
3. Refresh your video page
```

### Ollama Mode Issues

**Connection Failures**:
```bash
# Verify Ollama is running:
ollama list

# If not running, start it:
ollama serve

# Test the connection:
curl http://localhost:11434/api/tags
```

**CORS Errors**:
```bash
# Windows:
set OLLAMA_ORIGINS=* && ollama serve

# macOS/Linux:
OLLAMA_ORIGINS=* ollama serve
```

**Model Not Found**:
```bash
# Install the required model:
ollama pull qwen3-vl:2b

# Verify installation:
ollama list
```

### Browser Mode Issues

**Model Won't Load**:
- Ensure sufficient disk space (~1GB)
- Check browser console for errors (F12)
- Try clearing browser cache
- Verify internet connection for first download

**Slow Inference**:
- WebGPU not available → Falls back to WASM (slower)
- Check WebGPU support: `chrome://gpu`
- Consider using Ollama mode for better performance

### Video Detection Issues

**No Video Found**:
- Refresh the page after starting monitoring
- Ensure video is actually playing (not paused)
- Check console for "No video element found" messages

**Wrong Video Detected**:
- Extension targets largest visible video
- Check for hidden/background videos on page
- Use "Reset Video" button to force re-detection

### DRM Protected Content

Some platforms use DRM (Digital Rights Management) which prevents frame capture:

**DRM Protected (Extension Cannot Work)**:
- Netflix
- Disney+
- Amazon Prime Video (most content)
- **ESPN** - Most live games and premium content
- **Peacock** - Most NBC Sports and live events
- HBO Max

**Usually Works**:
- YouTube (all content)
- Twitch (most streams)
- ESPN (some replays and highlights)
- Peacock (some free content)
- Most non-DRM streaming sites

**How It Works**: 
- S.A.M automatically detects DRM protection when you start monitoring
- If DRM is found, the extension shows an alert and stops automatically
- The alert tells you which DRM system was detected (Widevine, PlayReady, etc.)

**Why DRM Blocks This**: DRM prevents JavaScript from accessing video frames to protect copyrighted content. This is a browser security feature that cannot be bypassed.

### Performance Issues

**High CPU Usage**:
- Increase check interval to 15-20 seconds
- Use Browser mode instead of Ollama (lower overhead)
- Close other resource-intensive tabs

**Memory Usage**:
- Extension uses ~100-200MB normally
- Browser mode model uses additional ~1-2GB when loaded
- Ollama mode uses less browser memory (processing on server)

### Debug Tools

**Browser Console** (F12):
- Shows content script logs
- Displays video detection info
- Reports capture errors

**Service Worker Console** (`chrome://extensions` → Inspect):
- Shows background script logs
- Displays API request/response info
- Reports model loading status

**Popup Console** (Right-click popup → Inspect):
- Shows UI-related logs
- Displays storage operations

---

## Development

### Setup Development Environment

1. **Clone and install**:
   ```bash
   git clone https://github.com/ethanwheatthin/Football-Ad-Muter.git
   cd Football-Ad-Muter
   npm install
   ```

2. **Development build with watch mode**:
   ```bash
   npm run watch
   ```
   Auto-rebuilds on file changes

3. **Load unpacked extension** from `dist/` folder in `chrome://extensions/`

### Project Structure

```
Football-Ad-Muter/
├── src/                      # Source files (Transformers.js version)
│   ├── background.js         # Service worker with Transformers.js
│   ├── content.js            # Content script (dual-mode compatible)
│   ├── popup.js              # Popup UI
│   ├── request-queue.js      # Request queue manager
│   └── adaptive-sampler.js   # Adaptive sampling logic
├── manifest.json             # Extension manifest (v3)
├── popup.html                # Popup UI structure
├── popup.css                 # Popup styling
├── images/                   # Extension icons
├── webpack.config.js         # Webpack bundler config
├── package.json              # Dependencies and scripts
└── README.md                 # This file

Note: Root-level .js files are the Ollama-only version
```

### Build Commands

```bash
npm run build        # Production build (minified)
npm run build:dev    # Development build (with source maps)
npm run watch        # Auto-rebuild on changes
npm run clean        # Remove dist/ folder
```

### Testing Checklist

Before submitting a PR, test:

- [ ] Multiple video platforms (YouTube, Twitch, etc.)
- [ ] Both Ollama and Browser modes
- [ ] Start/stop monitoring
- [ ] Settings changes apply correctly
- [ ] Frame capture displays in popup
- [ ] Activity log updates in real-time
- [ ] Video detection with multiple videos on page
- [ ] Error handling (no Ollama, model not loaded, etc.)

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## Contributing

Contributions are welcome! We appreciate:

- Bug reports and fixes
- New features and enhancements
- Documentation improvements
- Test coverage additions
- Architecture suggestions

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Areas for Contribution

**High Priority**:
- Improve ad detection accuracy (better prompts, models)
- Support more streaming platforms
- Performance optimizations
- Better error messages

**Good First Issues**:
- UI improvements
- Documentation additions
- Configuration options
- Statistics tracking

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **Ollama** - Local AI model runtime
- **Hugging Face** - Transformers.js and vision models
- **Chrome Extensions Team** - Manifest V3 documentation
- **Contributors** - Everyone who has contributed to this project

---

## Support

- **Issues**: [GitHub Issues](https://github.com/ethanwheatthin/Football-Ad-Muter/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ethanwheatthin/Football-Ad-Muter/discussions)

---

**Made by sports fans, for sports fans**
# Football Ad Muter

A Chrome extension that automatically detects and mutes advertisements during football livestreams using AI-powered image recognition.

## Features

- 🎯 Automatically detects active football gameplay vs. commercials
- 🔇 Mutes video during ads, unmutes during gameplay
- 🤖 Uses Ollama's qwen3-vl:2b vision model for image classification
- ⚙️ Configurable check intervals
- 🎮 Simple start/stop controls

## Prerequisites

1. **Ollama** installed and running locally
2. **qwen3-vl:2b model** downloaded in Ollama

### Install Ollama and Model

```bash
# Install Ollama (if not already installed)
# Visit: https://ollama.ai

# Pull the qwen3-vl:2b model
ollama pull qwen3-vl:2b

# Start Ollama (it usually runs automatically)
ollama serve
```

## Installation

1. Clone this repository:
```bash
git clone https://github.com/ethanwheatthin/Football-Ad-Muter.git
cd Football-Ad-Muter
```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked" and select the `Football-Ad-Muter` folder

5. The extension icon should appear in your Chrome toolbar

## Usage

1. Navigate to a football livestream (YouTube, Twitch, etc.)

2. Click the Football Ad Muter extension icon

3. Configure settings (optional):
   - **Ollama API URL**: Default is `http://localhost:11434`
   - **Check Interval**: How often to analyze the video (in milliseconds)

4. Click "Start Monitoring"

5. The extension will now:
   - Periodically capture screenshots of the active video
   - Send them to Ollama for analysis
   - Mute during commercials/ads
   - Unmute during active gameplay

6. Click "Stop Monitoring" to disable

## How It Works

1. **Video Detection**: Finds the largest playing video element on the page
2. **Screenshot Capture**: Takes periodic screenshots using HTML5 canvas
3. **AI Analysis**: Sends images to Ollama's qwen3-vl:2b model with a specialized prompt
4. **Smart Muting**: 
   - Returns `false` → Mutes video (ad detected)
   - Returns `true` → Unmutes video (gameplay detected)

## Configuration

### Check Interval
- Default: 3000ms (3 seconds)
- Range: 1000-10000ms
- Lower values = more responsive but higher CPU usage

### Ollama URL
- Default: `http://localhost:11434`
- Change if running Ollama on a different machine/port

## File Structure

```
Football-Ad-Muter/
├── manifest.json       # Extension configuration
├── content.js          # Main logic for video monitoring
├── background.js       # Service worker
├── popup.html          # Extension popup UI
├── popup.js           # Popup functionality
├── image_classifier.py # Prompt used for classification
├── icons/             # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Troubleshooting

### Extension not working?
- Ensure Ollama is running: `ollama serve`
- Verify qwen3-vl:2b model is installed: `ollama list`
- Check browser console for errors (F12 → Console)

### Video not being detected?
- Refresh the page after enabling the extension
- Make sure video is actually playing
- Check that the video element is visible on screen

### Ollama connection issues?
- Verify Ollama is running on the correct port
- Check CORS settings if running Ollama remotely
- Ensure no firewall is blocking localhost:11434

## Privacy

- All processing happens locally on your machine
- No data is sent to external servers
- Screenshots are analyzed in real-time and not stored

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use and modify as needed.
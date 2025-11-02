# Chrome Extension CORS Troubleshooting Guide

## Current Status
✅ Ollama is running with CORS support  
✅ Background script updated with better error handling  
✅ Content script updated with improved messaging  

## Step-by-Step Debugging

### 1. Test Ollama CORS Directly
1. Open `test-ollama-cors.html` in your browser
2. Click "Test Ollama Connection"
3. If this fails with CORS, the issue is with Ollama setup
4. If this succeeds, the issue is with the extension

### 2. Reload Extension Completely
1. Go to `chrome://extensions/`
2. Find "Football Ad Muter" extension
3. Click the reload button (🔄)
4. Check that it shows "Service worker" status

### 3. Test Background Script
1. In `chrome://extensions/`, click "Inspect views: service worker"
2. This opens the background script console
3. You should see startup messages

### 4. Test Extension on YouTube
1. Go to any YouTube video
2. Open Developer Tools (F12)
3. Open the extension popup
4. Look for these messages in the console:
   - `✅ Background script is responsive` (popup console)
   - `[Football Ad Muter Background] Ping received` (service worker console)

### 5. If Still Getting CORS Errors

The issue might be that requests are still coming from content script. Check the console error message:

- If it shows `from origin 'https://www.youtube.com'` → Content script is making the request (BAD)
- If it shows `from origin 'chrome-extension://...'` → Background script is making the request (GOOD)

### 6. Emergency Fallback - Direct CORS Fix

If the background script approach isn't working, restart Ollama with more permissive CORS:

```bash
# Stop Ollama completely
taskkill //F //IM ollama.exe

# Start with specific CORS for YouTube
set OLLAMA_ORIGINS=https://www.youtube.com,https://youtube.com,chrome-extension://* && ollama serve
```

### 7. Common Issues

1. **Service Worker Inactive**: Extensions sometimes need to be reloaded 2-3 times
2. **Message Timing**: Sometimes the first message fails, subsequent ones work
3. **Image Size**: Very large images might timeout - our code now limits to 800px width

## Current Ollama CORS Status
Your Ollama should now be running with these CORS origins enabled:
- `chrome-extension://` (for your extension)
- `http://localhost` and variations
- `https://localhost` and variations  
- All local IP variations

## Next Steps
1. Test the CORS test page first
2. If that works, reload your extension
3. Try the extension on YouTube
4. Check both browser console and service worker console for errors
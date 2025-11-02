# 🔥 Fix for 403 Error - Ollama API

## Problem
Getting 403 Forbidden error when calling Ollama API `/api/generate` from Chrome extension.

## Root Cause
Ollama blocks cross-origin requests by default. Your Chrome extension runs from `chrome-extension://` origin, which Ollama sees as a different origin and blocks.

## ✅ Solution (Step-by-Step)

### Step 1: Stop Current Ollama Instance
```bash
taskkill //F //IM ollama.exe
```

### Step 2: Start Ollama with CORS Enabled

**Option A: Use the provided batch file (EASIEST)**
1. Double-click `start-ollama-with-cors.bat` in this folder
2. Leave the terminal window open

**Option B: Manual command in CMD**
```cmd
set OLLAMA_ORIGINS=chrome-extension://* && ollama serve
```

**Option C: Make it permanent (PowerShell as Admin)**
```powershell
[System.Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', 'chrome-extension://*', 'User')
```
Then restart Ollama normally.

### Step 3: Reload Your Extension
1. Go to `chrome://extensions/`
2. Find "Football Ad Muter"
3. Click the reload icon (🔄)

### Step 4: Test
1. Open the debug test page: Open `test-403-debug.html` in your browser
2. Click "Test /api/tags" - should succeed
3. Click "Test Simple Generate" - should succeed
4. Click "Test Generate with Image" - should succeed

## 🐛 If Still Getting 403 Error

### Check 1: Verify CORS is enabled
Open a new browser tab and paste this in console (F12):
```javascript
fetch('http://localhost:11434/api/tags')
  .then(r => r.json())
  .then(d => console.log('✅ CORS working!', d))
  .catch(e => console.error('❌ CORS not working:', e));
```

### Check 2: Verify Ollama is running with CORS
```bash
# Check if Ollama is running
tasklist | findstr "ollama"

# Check the environment variable
echo %OLLAMA_ORIGINS%
```
Should output: `chrome-extension://*`

### Check 3: Try more permissive CORS (temporary test only)
```bash
taskkill //F //IM ollama.exe
set OLLAMA_ORIGINS=* && ollama serve
```

### Check 4: Browser Console Errors
1. Open your extension popup
2. Open DevTools (F12)
3. Go to Console tab
4. Look for the actual error message
5. If it says "CORS policy", CORS is still not configured
6. If it says "403", might be a different issue

## 📝 Code Changes Made

### Fixed `background.js`
Removed these incorrect headers:
```javascript
'Access-Control-Request-Method': 'POST',
'Access-Control-Request-Headers': 'Content-Type'
```

These are **preflight-only headers** that the browser sends automatically. Manually including them can cause issues.

## 🔍 Test Files Created

1. **`test-403-debug.html`** - Comprehensive test suite
   - Tests each endpoint individually
   - Shows detailed error messages
   - Tests different header configurations

2. **`start-ollama-with-cors.bat`** - Quick start script
   - Automatically sets CORS environment variable
   - Starts Ollama with correct configuration

## 📚 Understanding the 403 Error

### What is 403?
- **403 Forbidden** means the server understood the request but refuses to authorize it
- In Ollama's case, it's CORS blocking the request

### Why does this happen?
- Browser extensions run from `chrome-extension://[extension-id]` origin
- Ollama defaults to only allowing requests from `localhost` or same origin
- CORS (Cross-Origin Resource Sharing) is a security feature

### The Fix
- Set `OLLAMA_ORIGINS` environment variable to allow Chrome extensions
- This tells Ollama to add CORS headers to responses
- Chrome extension can then make requests successfully

## 🎯 Quick Diagnostic Commands

```bash
# Is Ollama running?
tasklist | findstr "ollama"

# What port is Ollama on?
netstat -ano | findstr "11434"

# What models are installed?
ollama list

# Test Ollama directly (should work even without CORS)
curl http://localhost:11434/api/tags

# Test from browser (tests CORS)
# Paste in browser console:
fetch('http://localhost:11434/api/tags').then(r=>r.json()).then(console.log)
```

## 🚀 Expected Behavior After Fix

1. **Before Fix:**
   ```
   ❌ POST http://localhost:11434/api/generate 403 (Forbidden)
   ❌ Access to fetch at '...' has been blocked by CORS policy
   ```

2. **After Fix:**
   ```
   ✅ POST http://localhost:11434/api/generate 200 (OK)
   ✅ Response received with analysis result
   ```

## 💡 Alternative: Use OpenWebUI as Proxy

If CORS continues to be problematic, you can use OpenWebUI as a proxy:
1. Install OpenWebUI
2. Configure it to connect to your local Ollama
3. Use OpenWebUI's API endpoint instead (it has CORS enabled by default)

But the direct Ollama approach (with CORS) is simpler and faster.

## ✅ Verification Checklist

- [ ] Ollama stopped
- [ ] Ollama restarted with CORS
- [ ] Extension reloaded in Chrome
- [ ] Test page shows success
- [ ] Extension works on YouTube

---

**Need more help?** Check the browser console and service worker console for specific error messages.

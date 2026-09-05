// Background service worker

// Default AI prompt
const DEFAULT_PROMPT = `SPORTS BROADCAST DETECTOR - RAPID MODE

INPUT: Image
OUTPUT: true OR false (only)

TRUE = Live sports broadcast content:
• Active gameplay/competition
• Athletes in action on field/court
• Sports venue with players
• Game action (running, passing, shooting, etc.)
• Scoreboard during play
• Sports broadcast angles
• Studio analysts/commentators
• Replays with graphics
• Sideline interviews
• Pre/post-game coverage
• Crowd shots
• Press conferences
• Player/coach closeups
• Sports-related content

FALSE = Everything else:
• Commercials/ads
• Halftime entertainment  
• Non-sports content
• Static graphics/promos

DECISION RULE: When uncertain → false

RESPOND: true OR false (nothing else)`;

// Keep service worker alive
let keepAliveInterval;

// ---------------------------------------------------------------------------
// DRM tab-capture support (offscreen document)
// ---------------------------------------------------------------------------
let drmCapture = { armed: false, tabId: null };
let creatingOffscreen = null;

async function hasOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA', 'DISPLAY_MEDIA'],
    justification: 'Capture DRM-protected video frames for ad detection when in-page canvas capture is blocked.'
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function armDrmCapture(streamId, tabId) {
  await ensureOffscreenDocument();
  const res = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'offscreen-start-capture',
    streamId
  });
  if (res && res.ok) {
    drmCapture = { armed: true, tabId: tabId || null };
  }
  return res;
}

async function captureDrmFrame(rect, maxWidth) {
  if (!drmCapture.armed) return { ok: false, error: 'not-armed' };
  return chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'offscreen-capture-frame',
    rect,
    maxWidth
  });
}

async function stopDrmCapture() {
  drmCapture = { armed: false, tabId: null };
  if (await hasOffscreenDocument()) {
    try {
      await chrome.runtime.sendMessage({ target: 'offscreen', action: 'offscreen-stop-capture' });
      await chrome.offscreen.closeDocument();
    } catch (e) { /* already gone */ }
  }
}

// Track API performance metrics
let apiMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalProcessingTime: 0,
  averageProcessingTime: 0,
  lastRequestTime: 0
};

function keepServiceWorkerAlive() {
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      if (chrome.runtime.lastError) {
        console.log('[Football Ad Muter Background] Service worker keepalive check failed');
      } else {
        console.log('[Football Ad Muter Background] Service worker keepalive ping');
      }
    });
  }, 25000); // 25 seconds
}

chrome.runtime.onStartup.addListener(() => {
  console.log('[Football Ad Muter Background] Service worker started');
  keepServiceWorkerAlive();
});

chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.sync.set({
    ollamaUrl: 'http://localhost:11434',
    checkInterval: 10000, // 10 seconds default (can be set up to 60 seconds)
    isEnabled: false,
    customPrompt: DEFAULT_PROMPT,
    ollamaModel: 'qwen3.5:0.8b',
    sportMode: 'general'
  });
  
  console.log('[Football Ad Muter Background] Extension installed');
  keepServiceWorkerAlive();
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Football Ad Muter Background] Received message:', request.action);
  
  if (request.action === 'ping') {
    console.log('[Football Ad Muter Background] Ping received, sending pong');
    sendResponse({ status: 'pong' });
    return false; // Synchronous response
  }
  
  // Messages addressed to the offscreen document — ignore here.
  if (request && request.target === 'offscreen') {
    return false;
  }

  if (request.action === 'drmCaptureEnded') {
    console.log('[Football Ad Muter Background] DRM capture stream ended');
    drmCapture = { armed: false, tabId: null };
    return false;
  }

  if (request.action === 'armTabCapture') {
    // streamId is obtained in the popup (needs the user gesture there).
    armDrmCapture(request.streamId, request.tabId)
      .then((res) => sendResponse(res || { ok: false, error: 'no-response' }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true;
  }

  if (request.action === 'stopTabCapture') {
    stopDrmCapture()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true;
  }

  if (request.action === 'captureVisibleTabFrame') {
    const tab = sender && sender.tab;
    if (!tab) { sendResponse({ ok: false, error: 'no-tab' }); return false; }
    chrome.tabs.get(tab.id, (t) => {
      if (chrome.runtime.lastError || !t || !t.active) {
        sendResponse({ ok: false, error: 'not-visible' });
        return;
      }
      chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({ ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'capture-failed' });
          return;
        }
        sendResponse({ ok: true, dataUrl });
      });
    });
    return true;
  }

  if (request.action === 'openSettingsWindow') {
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 420,
      height: 640
    }, () => void chrome.runtime.lastError);
    sendResponse({ ok: true });
    return false;
  }

  if (request.action === 'getDrmCaptureStatus') {
    sendResponse({ armed: drmCapture.armed, tabId: drmCapture.tabId });
    return false;
  }

  if (request.action === 'captureDrmFrame') {
    captureDrmFrame(request.rect, request.maxWidth || 800)
      .then((res) => sendResponse(res || { ok: false, error: 'no-response' }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true;
  }

  if (request.action === 'getTabId') {
    // Return the tab ID of the sender
    if (sender.tab && sender.tab.id) {
      console.log('[Football Ad Muter Background] Returning tab ID:', sender.tab.id);
      sendResponse({ tabId: sender.tab.id });
    } else {
      console.log('[Football Ad Muter Background] No tab ID available');
      sendResponse({ tabId: null });
    }
    return false; // Synchronous response
  }
  
  if (request.action === 'analyzeImage') {
    console.log('[Football Ad Muter Background] Processing image analysis request');
    console.log('[Football Ad Muter Background] Image size:', request.base64Image.length);
    console.log('[Football Ad Muter Background] API Metrics:', apiMetrics);
    
    // Increment request counter
    apiMetrics.totalRequests++;
    apiMetrics.lastRequestTime = Date.now();
    
    // Get custom prompt, model and URL from storage, or use defaults.
    // Storage is the source of truth so a stale content-script value can't
    // override the URL the user configured and tested in the popup.
    chrome.storage.sync.get(['customPrompt', 'ollamaModel', 'ollamaUrl'], (storage) => {
      const customPrompt = storage.customPrompt || DEFAULT_PROMPT;
      const ollamaModel = storage.ollamaModel || 'qwen3.5:0.8b';
      let ollamaUrl = storage.ollamaUrl || request.ollamaUrl || 'http://localhost:11434';
      ollamaUrl = ollamaUrl.trim().replace(/\/+$/, ''); // trim trailing slash
      if (ollamaUrl.includes('/ollama/api')) ollamaUrl = 'http://localhost:11434';
      console.log('[Football Ad Muter Background] Using Ollama URL:', ollamaUrl);

      // Handle async operation properly
      analyzeWithOllama(request.base64Image, ollamaUrl, customPrompt, ollamaModel)
        .then(analysisResult => {
        console.log('[Football Ad Muter Background] Analysis complete:', analysisResult);
        
        // Update metrics
        if (analysisResult.error) {
          apiMetrics.failedRequests++;
        } else {
          apiMetrics.successfulRequests++;
        }
        
        if (analysisResult.processingTime) {
          apiMetrics.totalProcessingTime += analysisResult.processingTime;
          apiMetrics.averageProcessingTime = 
            apiMetrics.totalProcessingTime / (apiMetrics.successfulRequests + apiMetrics.failedRequests);
        }
        
        console.log('[Football Ad Muter Background] Updated API Metrics:', apiMetrics);
        
        // Return the full analysis result object (includes result, model, response, processingTime, etc.)
        sendResponse(analysisResult);
      })
        .catch(error => {
          console.error('[Football Ad Muter Background] Analysis failed:', error);
          apiMetrics.failedRequests++;
          sendResponse({ result: null, error: error.message });
        });
    });
    
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'getApiMetrics') {
    console.log('[Football Ad Muter Background] API metrics requested');
    sendResponse({ metrics: apiMetrics });
    return false;
  }
  
  if (request.action === 'resetApiMetrics') {
    console.log('[Football Ad Muter Background] Resetting API metrics');
    apiMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      lastRequestTime: 0
    };
    sendResponse({ status: 'reset' });
    return false;
  }
  
  if (request.action === 'logUpdate') {
    // Handle log update messages from content script
    console.log('[Football Ad Muter Background] Log update message received');
    return false; // No response needed
  }
  
  if (request.action === 'testApiConnection') {
    console.log('[Football Ad Muter Background] API connection test requested');
    
    // Handle async operation properly
    testOllamaConnection(request.ollamaUrl)
      .then(result => {
        console.log('[Football Ad Muter Background] API test complete:', result);
        sendResponse({ result: result, error: null });
      })
      .catch(error => {
        console.error('[Football Ad Muter Background] API test failed:', error);
        sendResponse({ result: null, error: error.message });
      });
    
    return true; // Keep the message channel open for async response
  }
  
  return false; // Default case
});

async function testOllamaConnection(ollamaUrl) {
  try {
    console.log('[Football Ad Muter Background] 🔍 Testing Ollama API connection...');
    console.log('[Football Ad Muter Background] Testing URL:', `${ollamaUrl}/api/tags`);
    
    // Add timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for connection test
    
    // Test basic connectivity
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log('[Football Ad Muter Background] API test response status:', response.status, response.statusText);
    console.log('[Football Ad Muter Background] CORS headers:', {
      'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
      'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
      'access-control-allow-headers': response.headers.get('access-control-allow-headers')
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Football Ad Muter Background] API test failed:', response.status, errorText);
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('[Football Ad Muter Background] API test response:', data);
    
    const availableModels = data.models ? data.models.map(m => m.name) : [];

    return {
      success: true,
      connected: true,
      availableModels: availableModels
    };
    
  } catch (error) {
    console.error('[Football Ad Muter Background] 💥 Error testing Ollama API:', error);
    console.error('[Football Ad Muter Background] Error details:', {
      message: error.message,
      stack: error.stack,
      apiUrl: `${ollamaUrl}/api/tags`
    });
    throw error;
  }
}

async function analyzeWithOllama(base64Image, ollamaUrl, customPrompt = DEFAULT_PROMPT, ollamaModel = 'qwen3.5:0.8b') {
  const startTime = Date.now();

  try {
    console.log('[Football Ad Muter Background] 🤖 Starting Ollama API analysis...');
    console.log('[Football Ad Muter Background] Using model:', ollamaModel);
    console.log('[Football Ad Muter Background] Using custom prompt:', customPrompt.substring(0, 100) + '...');

    const prompt = customPrompt;

    console.log('[Football Ad Muter Background] Making API request to:', `${ollamaUrl}/api/generate`);
    console.log('[Football Ad Muter Background] Request payload size:', {
      model: ollamaModel,
      imageLength: base64Image.length,
      stream: false
    });

    // Add timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    // NOTE: use a "simple" Content-Type (text/plain) so the browser does NOT
    // send a CORS preflight OPTIONS. Ollama parses the JSON body regardless of
    // Content-Type, and many Ollama setups don't answer the preflight -> the
    // POST would fail with "Failed to fetch" even though a plain GET works.
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8'
      },
      body: JSON.stringify({
        model: ollamaModel,
        // Qwen3 reads `/no_think` as a control token to skip its reasoning
        // block; other model families would just see it as literal prompt text,
        // so only append it for Qwen.
        prompt: /qwen/i.test(ollamaModel) ? prompt + ' /no_think' : prompt,
        images: [base64Image],
        stream: false,
        // Disable chain-of-thought for models that support it (Qwen3 etc.) —
        // the reasoning block was adding ~6s per frame. No-op for Gemma/LLaVA.
        think: false,
        // Keep the model resident between checks so it isn't reloaded each call.
        keep_alive: '30m',
        options: {
          num_predict: 4,    // response is a single word (true/false)
          temperature: 0,    // deterministic classification
          num_ctx: 4096      // headroom for a full-res frame's vision tokens
        }
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const processingTime = Date.now() - startTime;
    
    console.log('[Football Ad Muter Background] API response status:', response.status, response.statusText);
    console.log('[Football Ad Muter Background] CORS headers:', {
      'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
      'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
      'access-control-allow-headers': response.headers.get('access-control-allow-headers')
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Football Ad Muter Background] API request failed:', response.status, errorText);
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('[Football Ad Muter Background] Full API response:', data);
    
    const result = data.response.trim().toLowerCase();
    console.log('[Football Ad Muter Background] Parsed result:', `"${result}"`);

    // Parse the response and return full details for logging. Match the token
    // anywhere rather than requiring an exact string, so a model that adds
    // stray whitespace/punctuation still classifies instead of going inconclusive.
    let isGameplay = null;

    if (/\btrue\b/.test(result)) {
      console.log('[Football Ad Muter Background] ✅ Analysis result: GAMEPLAY detected');
      isGameplay = true;
    } else if (/\bfalse\b/.test(result)) {
      console.log('[Football Ad Muter Background] ⚠️ Analysis result: ADVERTISEMENT detected');
      isGameplay = false;
    } else {
      console.warn('[Football Ad Muter Background] ❓ Unexpected analysis response:', result);
    }
    
    // Return full response object for logging
    return {
      result: isGameplay,
      model: data.model || ollamaModel,
      response: data,
      processingTime: processingTime
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    console.error('[Football Ad Muter Background] 💥 Error calling Ollama API:', error);
    console.error('[Football Ad Muter Background] Error details:', {
      message: error.message,
      stack: error.stack,
      apiUrl: `${ollamaUrl}/api/generate`
    });
    
    // Return error details for logging
    let friendly = error.message;
    if (error.name === 'AbortError') {
      friendly = `Ollama timed out after 30s (${ollamaUrl})`;
    } else if (/failed to fetch|networkerror|load failed/i.test(error.message || '')) {
      friendly = `Cannot reach Ollama at ${ollamaUrl} — check it's running and started with OLLAMA_ORIGINS=* (or chrome-extension://*)`;
    }
    return {
      result: null,
      error: friendly,
      processingTime: processingTime
    };
  }
}
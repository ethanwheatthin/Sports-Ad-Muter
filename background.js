// Background service worker

// Keep service worker alive
let keepAliveInterval;

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
    checkInterval: 10000, // 3 seconds default (can be set up to 60 seconds)
    isEnabled: false
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
  
  if (request.action === 'analyzeImage') {
    console.log('[Football Ad Muter Background] Processing image analysis request');
    console.log('[Football Ad Muter Background] Image size:', request.base64Image.length);
    console.log('[Football Ad Muter Background] Ollama URL:', request.ollamaUrl);
    console.log('[Football Ad Muter Background] API Metrics:', apiMetrics);
    
    // Increment request counter
    apiMetrics.totalRequests++;
    apiMetrics.lastRequestTime = Date.now();
    
    // Handle async operation properly
    analyzeWithOllama(request.base64Image, request.ollamaUrl)
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
    
    // Check if the required model is available
    const hasRequiredModel = data.models && data.models.some(model => 
      model.name.includes('qwen3-vl:2b') || model.name.includes('qwen3-vl')
    );
    
    return {
      connected: true,
      hasRequiredModel: hasRequiredModel,
      availableModels: data.models ? data.models.map(m => m.name) : []
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

async function analyzeWithOllama(base64Image, ollamaUrl) {
  const startTime = Date.now();
  
  try {
    console.log('[Football Ad Muter Background] 🤖 Starting Ollama API analysis...');
    const prompt = `SPORTS BROADCAST DETECTOR - RAPID MODE

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

    console.log('[Football Ad Muter Background] Making API request to:', `${ollamaUrl}/api/generate`);
    console.log('[Football Ad Muter Background] Request payload size:', {
      model: 'qwen3-vl:2b',
      imageLength: base64Image.length,
      stream: false
    });

    // Add timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    // Use fetch with mode: 'cors' explicitly
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen3-vl:2b',
        prompt: prompt,
        images: [base64Image],
        stream: false
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
    
    // Parse the response and return full details for logging
    let isGameplay = null;
    
    if (result === 'true') {
      console.log('[Football Ad Muter Background] ✅ Analysis result: GAMEPLAY detected');
      isGameplay = true;
    } else if (result === 'false') {
      console.log('[Football Ad Muter Background] ⚠️ Analysis result: ADVERTISEMENT detected');
      isGameplay = false;
    } else {
      console.warn('[Football Ad Muter Background] ❓ Unexpected analysis response:', result);
    }
    
    // Return full response object for logging
    return {
      result: isGameplay,
      model: data.model || 'qwen3-vl:2b',
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
    return {
      result: null,
      error: error.message,
      processingTime: processingTime
    };
  }
}
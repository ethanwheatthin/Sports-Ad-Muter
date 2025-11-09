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
    visionProvider: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    apiKey: '',
    modelName: 'llava',
    checkInterval: 10000, // 10 seconds default (can be set up to 60 seconds)
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
    console.log('[Football Ad Muter Background] Provider:', request.visionProvider || 'ollama');
    console.log('[Football Ad Muter Background] API Metrics:', apiMetrics);
    
    // Increment request counter
    apiMetrics.totalRequests++;
    apiMetrics.lastRequestTime = Date.now();
    
    // Handle async operation properly
    analyzeWithVisionAPI(request.base64Image, request)
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
    console.log('[Football Ad Muter Background] API connection test requested for provider:', request.visionProvider || 'ollama');
    
    // Handle async operation properly
    testVisionAPIConnection(request)
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

// Generic vision API testing function
async function testVisionAPIConnection(config) {
  const provider = config.visionProvider || 'ollama';
  
  switch (provider) {
    case 'ollama':
      return await testOllamaConnection(config.ollamaUrl);
    case 'openai':
      return await testOpenAIConnection(config.apiKey, config.modelName);
    case 'google':
      return await testGoogleConnection(config.apiKey, config.modelName);
    case 'claude':
      return await testClaudeConnection(config.apiKey, config.modelName);
    default:
      throw new Error(`Unsupported vision provider: ${provider}`);
  }
}

// Generic vision analysis function
async function analyzeWithVisionAPI(base64Image, config) {
  const provider = config.visionProvider || 'ollama';
  
  switch (provider) {
    case 'ollama':
      return await analyzeWithOllama(base64Image, config.ollamaUrl);
    case 'openai':
      return await analyzeWithOpenAI(base64Image, config.apiKey, config.modelName);
    case 'google':
      return await analyzeWithGoogle(base64Image, config.apiKey, config.modelName);
    case 'claude':
      return await analyzeWithClaude(base64Image, config.apiKey, config.modelName);
    default:
      throw new Error(`Unsupported vision provider: ${provider}`);
  }
}

// Test functions for each provider
async function testOpenAIConnection(apiKey, modelName) {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const hasModel = data.data.some(model => model.id === modelName);
    
    return {
      success: true,
      connected: true,
      hasRequiredModel: hasModel,
      message: hasModel ? `Model ${modelName} is available` : `Model ${modelName} not found`
    };
  } catch (error) {
    throw new Error(`OpenAI connection failed: ${error.message}`);
  }
}

async function testGoogleConnection(apiKey, modelName) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }
    
    const data = await response.json();
    const hasModel = data.models && data.models.some(model => model.name.includes(modelName));
    
    return {
      success: true,
      connected: true,
      hasRequiredModel: hasModel,
      message: hasModel ? `Model ${modelName} is available` : `Model ${modelName} not found`
    };
  } catch (error) {
    throw new Error(`Google API connection failed: ${error.message}`);
  }
}

async function testClaudeConnection(apiKey, modelName) {
  try {
    // Claude doesn't have a models endpoint, so we'll test with a simple request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      })
    });
    
    // A 400 error with model info means the API key works but model might be wrong
    // A 401 error means bad API key
    if (response.status === 401) {
      throw new Error('Invalid API key');
    }
    
    return {
      success: true,
      connected: true,
      hasRequiredModel: true,
      message: `Claude API connection successful with ${modelName}`
    };
  } catch (error) {
    throw new Error(`Claude API connection failed: ${error.message}`);
  }
}

// Analysis functions for each provider
async function analyzeWithOpenAI(base64Image, apiKey, modelName) {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Is this image showing live sports gameplay/broadcast content? Answer only "true" or "false". True = active sports gameplay, athletes in action, sports broadcast. False = commercials, ads, halftime entertainment, non-sports content.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 10,
        temperature: 0
      })
    });
    
    const processingTime = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const result = data.choices[0].message.content.trim().toLowerCase();
    
    return {
      result: result === 'true' ? true : result === 'false' ? false : null,
      model: modelName,
      response: data,
      processingTime: processingTime
    };
  } catch (error) {
    return {
      result: null,
      error: error.message,
      processingTime: Date.now() - startTime
    };
  }
}

async function analyzeWithGoogle(base64Image, apiKey, modelName) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: 'Is this image showing live sports gameplay/broadcast content? Answer only "true" or "false". True = active sports gameplay, athletes in action, sports broadcast. False = commercials, ads, halftime entertainment, non-sports content.'
              },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 10,
          temperature: 0
        }
      })
    });
    
    const processingTime = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }
    
    const data = await response.json();
    const result = data.candidates[0].content.parts[0].text.trim().toLowerCase();
    
    return {
      result: result === 'true' ? true : result === 'false' ? false : null,
      model: modelName,
      response: data,
      processingTime: processingTime
    };
  } catch (error) {
    return {
      result: null,
      error: error.message,
      processingTime: Date.now() - startTime
    };
  }
}

async function analyzeWithClaude(base64Image, apiKey, modelName) {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Is this image showing live sports gameplay/broadcast content? Answer only "true" or "false". True = active sports gameplay, athletes in action, sports broadcast. False = commercials, ads, halftime entertainment, non-sports content.'
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image
                }
              }
            ]
          }
        ]
      })
    });
    
    const processingTime = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }
    
    const data = await response.json();
    const result = data.content[0].text.trim().toLowerCase();
    
    return {
      result: result === 'true' ? true : result === 'false' ? false : null,
      model: modelName,
      response: data,
      processingTime: processingTime
    };
  } catch (error) {
    return {
      result: null,
      error: error.message,
      processingTime: Date.now() - startTime
    };
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
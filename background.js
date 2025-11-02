// Background service worker

chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.sync.set({
    ollamaUrl: 'http://localhost:11434',
    checkInterval: 3000,
    isEnabled: false
  });
  
  console.log('[Football Ad Muter] Extension installed');
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Football Ad Muter Background] Received message:', request.action);
  
  if (request.action === 'ping') {
    console.log('[Football Ad Muter Background] Ping received, sending pong');
    sendResponse({ status: 'pong' });
    return;
  }
  
  if (request.action === 'analyzeImage') {
    console.log('[Football Ad Muter Background] Processing image analysis request');
    console.log('[Football Ad Muter Background] Image size:', request.base64Image.length);
    console.log('[Football Ad Muter Background] Ollama URL:', request.ollamaUrl);
    
    // Handle async operation properly
    (async () => {
      try {
        const result = await analyzeWithOllama(request.base64Image, request.ollamaUrl);
        console.log('[Football Ad Muter Background] Analysis complete:', result);
        sendResponse({ result: result, error: null });
      } catch (error) {
        console.error('[Football Ad Muter Background] Analysis failed:', error);
        sendResponse({ result: null, error: error.message });
      }
    })();
    
    return true; // Keep the message channel open for async response
  }
});

async function analyzeWithOllama(base64Image, ollamaUrl) {
  try {
    console.log('[Football Ad Muter Background] 🤖 Starting Ollama API analysis...');
    const prompt = `You are a specialized image classifier for detecting live sports gameplay.

Your task: Analyze the provided image and determine if it shows ACTIVE SPORTS GAMEPLAY.

RETURN ONLY: true OR false (lowercase, no other text)

Return "true" if the image contains:
- Active sports gameplay (football, basketball, soccer, baseball, hockey, tennis, golf, racing, etc.)
- Athletes competing on a field/court/track during live action
- Clear view of a sports venue with players/athletes in uniform/gear
- Game action (running, passing, shooting, tackling, kicking, scoring, racing, etc.)
- Scoreboard visible with game clock/score during active play
- Typical sports broadcast camera angles showing the action
- Live competition in progress

Return "false" if the image contains:
- Commercials or advertisements
- Studio analysts or commentators
- Replays with obvious overlay graphics
- Halftime shows or entertainment
- Pre-game or post-game coverage
- Sideline interviews
- Press conferences
- Crowd shots without gameplay
- Loading screens or channel logos
- Any non-sports content
- Static graphics or promotional content

Be strict: When in doubt about active gameplay, return "false".

OUTPUT FORMAT: Only output "true" or "false" - nothing else.`;

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
    
    // Parse the response
    if (result === 'true') {
      console.log('[Football Ad Muter Background] ✅ Analysis result: GAMEPLAY detected');
      return true;
    }
    if (result === 'false') {
      console.log('[Football Ad Muter Background] ⚠️ Analysis result: ADVERTISEMENT detected');
      return false;
    }
    
    console.warn('[Football Ad Muter Background] ❓ Unexpected analysis response:', result);
    return null;
    
  } catch (error) {
    console.error('[Football Ad Muter Background] 💥 Error calling Ollama API:', error);
    console.error('[Football Ad Muter Background] Error details:', {
      message: error.message,
      stack: error.stack,
      apiUrl: `${ollamaUrl}/api/generate`
    });
    throw error;
  }
}
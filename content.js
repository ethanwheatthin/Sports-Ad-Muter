// Content script that monitors video elements and captures screenshots

let isMonitoring = false;
let checkInterval = null;
let ollamaUrl = 'http://localhost:11434';
let checkIntervalTime = 3000; // 3 seconds default

// Load settings from storage
chrome.storage.sync.get(['ollamaUrl', 'checkInterval', 'isEnabled'], (result) => {
  console.log('[Football Ad Muter] Loading settings from storage:', result);
  if (result.ollamaUrl) {
    ollamaUrl = result.ollamaUrl;
    // Clean up any old OpenWebUI URLs that might be cached
    if (ollamaUrl.includes('/ollama/api')) {
      ollamaUrl = 'http://localhost:11434';
      console.log('[Football Ad Muter] Detected old OpenWebUI URL, reset to:', ollamaUrl);
    }
    console.log('[Football Ad Muter] Ollama URL set to:', ollamaUrl);
  }
  if (result.checkInterval) {
    checkIntervalTime = result.checkInterval;
    console.log('[Football Ad Muter] Check interval set to:', checkIntervalTime, 'ms');
  }
  if (result.isEnabled) {
    console.log('[Football Ad Muter] Auto-starting monitoring from saved state');
    startMonitoring();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Football Ad Muter] Received message from popup:', request);
  
  if (request.action === 'ping') {
    console.log('[Football Ad Muter] Ping received from debug page');
    sendResponse({ status: 'pong' });
    return false;
  } else if (request.action === 'start') {
    console.log('[Football Ad Muter] Start command received');
    startMonitoring();
    sendResponse({ status: 'started' });
  } else if (request.action === 'stop') {
    console.log('[Football Ad Muter] Stop command received');
    stopMonitoring();
    sendResponse({ status: 'stopped' });
  } else if (request.action === 'updateSettings') {
    console.log('[Football Ad Muter] Settings update received:', {
      newOllamaUrl: request.ollamaUrl,
      newCheckInterval: request.checkInterval
    });
    ollamaUrl = request.ollamaUrl || ollamaUrl;
    checkIntervalTime = request.checkInterval || checkIntervalTime;
    if (isMonitoring) {
      console.log('[Football Ad Muter] Restarting monitoring with new settings');
      stopMonitoring();
      startMonitoring();
    }
    sendResponse({ status: 'updated' });
  }
  return false;
});

function startMonitoring() {
  if (isMonitoring) {
    console.log('[Football Ad Muter] Monitoring already active, ignoring start request');
    return;
  }
  
  isMonitoring = true;
  console.log('[Football Ad Muter] Monitoring started - checking every', checkIntervalTime, 'ms');
  console.log('[Football Ad Muter] Using API URL:', ollamaUrl);
  
  checkInterval = setInterval(() => {
    console.log('[Football Ad Muter] Running video check...');
    const video = getActiveVideo();
    if (video && !video.paused) {
      console.log('[Football Ad Muter] Active video found:', {
        width: video.videoWidth,
        height: video.videoHeight,
        currentTime: video.currentTime,
        duration: video.duration,
        muted: video.muted
      });
      captureAndAnalyzeVideo(video);
    } else {
      console.log('[Football Ad Muter] No active video found or video is paused');
    }
  }, checkIntervalTime);
}

function stopMonitoring() {
  if (!isMonitoring) return;
  
  isMonitoring = false;
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  console.log('[Football Ad Muter] Monitoring stopped');
}

function getActiveVideo() {
  // Find the largest playing video on the page
  const videos = Array.from(document.querySelectorAll('video'));
  
  console.log('[Football Ad Muter] Found', videos.length, 'video elements on page');
  
  if (videos.length === 0) return null;
  
  // Log details about all videos found
  videos.forEach((video, index) => {
    console.log(`[Football Ad Muter] Video ${index + 1}:`, {
      width: video.videoWidth,
      height: video.videoHeight,
      area: video.videoWidth * video.videoHeight,
      paused: video.paused,
      muted: video.muted,
      src: video.src || 'no src'
    });
  });
  
  // Sort by area (width * height) and return the largest
  videos.sort((a, b) => {
    const areaA = a.videoWidth * a.videoHeight;
    const areaB = b.videoWidth * b.videoHeight;
    return areaB - areaA;
  });
  
  console.log('[Football Ad Muter] Selected largest video with area:', videos[0].videoWidth * videos[0].videoHeight);
  return videos[0];
}

function captureAndAnalyzeVideo(video) {
  try {
    console.log('[Football Ad Muter] Starting video capture and analysis...');
    
    // Create a canvas to capture the video frame
    const canvas = document.createElement('canvas');
    
    // Optimize image size - reduce to max 800px width to decrease payload size
    const maxWidth = 800;
    const aspectRatio = video.videoHeight / video.videoWidth;
    
    if (video.videoWidth > maxWidth) {
      canvas.width = maxWidth;
      canvas.height = maxWidth * aspectRatio;
    } else {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    console.log('[Football Ad Muter] Canvas created with optimized dimensions:', canvas.width, 'x', canvas.height);
    console.log('[Football Ad Muter] Original video dimensions:', video.videoWidth, 'x', video.videoHeight);
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    console.log('[Football Ad Muter] Video frame captured to canvas');
    
    // Convert canvas to base64 image
    canvas.toBlob(async (blob) => {
      if (!blob) {
        console.error('[Football Ad Muter] Failed to create blob from canvas');
        return;
      }
      
      console.log('[Football Ad Muter] Canvas converted to blob, size:', blob.size, 'bytes');
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Image = reader.result.split(',')[1];
        console.log('[Football Ad Muter] Image converted to base64, length:', base64Image.length, 'characters');
        console.log('[Football Ad Muter] Sending image to background script for analysis...');
        
        // Send image to background script for API call
        try {
          console.log('[Football Ad Muter] Sending message to background script...');
          
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'analyzeImage',
              base64Image: base64Image,
              ollamaUrl: ollamaUrl
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('[Football Ad Muter] Runtime error:', chrome.runtime.lastError);
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });
          
          console.log('[Football Ad Muter] Received response from background:', response);
          
          if (!response) {
            console.error('[Football Ad Muter] No response received from background script');
            saveLogEntry(null, 'No response from background script - reload extension');
            return;
          }
          
          if (response.error) {
            console.error('[Football Ad Muter] API error from background:', response.error);
            saveLogEntry(null, `API Error: ${response.error}`);
            return;
          }
          
          const isGameplay = response.result;
          
          console.log('[Football Ad Muter] Analysis result:', isGameplay);
          
          // Log the analysis result
          let action = null;
        
          if (isGameplay === false) {
            // Mute the video
            if (!video.muted) {
              console.log('[Football Ad Muter] 🔇 MUTING VIDEO - Advertisement detected');
              video.muted = true;
              video.dataset.mutedByExtension = 'true';
              action = 'Video muted (advertisement detected)';
            } else {
              console.log('[Football Ad Muter] Video already muted, advertisement still detected');
            }
          } else if (isGameplay === true) {
            // Unmute if we muted it
            if (video.dataset.mutedByExtension === 'true') {
              console.log('[Football Ad Muter] 🔊 UNMUTING VIDEO - Gameplay detected');
              video.muted = false;
              delete video.dataset.mutedByExtension;
              action = 'Video unmuted (gameplay detected)';
            } else {
              console.log('[Football Ad Muter] Gameplay detected, video not muted by extension');
            }
          } else {
            console.log('[Football Ad Muter] Analysis returned null/undefined - no action taken');
          }
          
          // Save log entry
          saveLogEntry(isGameplay, action);
          
        } catch (messageError) {
          console.error('[Football Ad Muter] Error sending message to background:', messageError);
          if (messageError.message.includes('Receiving end does not exist')) {
            saveLogEntry(null, 'Background script unavailable - try reloading the extension');
          } else {
            saveLogEntry(null, `Message Error: ${messageError.message}`);
          }
        }
      };
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.8);
    
  } catch (error) {
    console.error('[Football Ad Muter] Error capturing video:', error);
    saveLogEntry(null, `Error: ${error.message}`);
  }
}



function saveLogEntry(result, action) {
  const logEntry = {
    timestamp: Date.now(),
    result: result,
    action: action
  };
  
  console.log('[Football Ad Muter] 💾 Saving log entry:', logEntry);
  
  chrome.storage.sync.get(['analysisLogs'], (storage) => {
    const logs = storage.analysisLogs || [];
    logs.push(logEntry);
    
    // Keep only the last 100 entries to prevent storage overflow
    const trimmedLogs = logs.slice(-100);
    
    console.log('[Football Ad Muter] Total logs in storage:', trimmedLogs.length);
    
    chrome.storage.sync.set({ analysisLogs: trimmedLogs }, () => {
      console.log('[Football Ad Muter] Log entry saved to storage');
      // Notify popup to refresh logs if it's open
      try {
        chrome.runtime.sendMessage({ action: 'logUpdate' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[Football Ad Muter] Could not notify popup (probably not open)');
          }
        });
      } catch (error) {
        console.log('[Football Ad Muter] Could not notify popup:', error.message);
      }
    });
  });
}
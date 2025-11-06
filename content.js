// Content script that monitors video elements and captures screenshots

let isMonitoring = false;
let checkInterval = null;
let ollamaUrl = 'http://localhost:11434';
let checkIntervalTime = 10000; // 10 seconds default

// Detect streaming service for optimizations
const currentSite = {
  isPeacock: window.location.hostname.includes('peacocktv.com'),
  isYouTube: window.location.hostname.includes('youtube.com'),
  isNetflix: window.location.hostname.includes('netflix.com'),
  isHulu: window.location.hostname.includes('hulu.com'),
  isAmazonPrime: window.location.hostname.includes('amazon.com') || window.location.hostname.includes('primevideo.com'),
  isGeneric: true
};

console.log('[Football Ad Muter] Detected site:', {
  hostname: window.location.hostname,
  isPeacock: currentSite.isPeacock,
  isYouTube: currentSite.isYouTube,
  isNetflix: currentSite.isNetflix,
  isHulu: currentSite.isHulu,
  isAmazonPrime: currentSite.isAmazonPrime
});

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
  
  // Log that the extension loaded
  logActivity('🚀 Extension loaded and ready', 'info');
  
  if (result.isEnabled) {
    console.log('[Football Ad Muter] Auto-starting monitoring from saved state');
    startMonitoring();
  }
});

// Activity logging function - logs important events to the popup
function logActivity(message, type = 'info') {
  const activityEntry = {
    timestamp: Date.now(),
    message: message,
    type: type // 'info', 'success', 'warning', 'error'
  };
  
  chrome.storage.sync.get(['activityLogs'], (storage) => {
    if (chrome.runtime.lastError) {
      console.error('[Football Ad Muter] Error reading activityLogs from storage:', chrome.runtime.lastError);
      return;
    }
    
    const logs = storage.activityLogs || [];
    logs.push(activityEntry);
    
    // Keep only the last 100 entries
    const trimmedLogs = logs.slice(-100);
    
    chrome.storage.sync.set({ activityLogs: trimmedLogs }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Football Ad Muter] Error saving activityLogs to storage:', chrome.runtime.lastError);
        return;
      }
      
      // Notify popup to refresh activity logs if it's open
      try {
        chrome.runtime.sendMessage({ action: 'activityUpdate' }, (response) => {
          // Ignore errors - popup might not be open
          if (chrome.runtime.lastError) {
            // This is normal when popup is closed, don't log
          }
        });
      } catch (error) {
        // Ignore - popup not available
      }
    });
  });
}

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
  } else if (request.action === 'resetVideo') {
    console.log('[Football Ad Muter] Reset video command received');
    resetVideoPlayer();
    sendResponse({ status: 'reset' });
  }
  return false;
});

function startMonitoring() {
  if (isMonitoring) {
    console.log('[Football Ad Muter] Monitoring already active, ignoring start request');
    logActivity('⚠️ Monitoring already active', 'warning');
    return;
  }
  
  isMonitoring = true;
  console.log('[Football Ad Muter] Monitoring started - checking every', checkIntervalTime, 'ms');
  console.log('[Football Ad Muter] Using API URL:', ollamaUrl);
  logActivity(`✅ Monitoring started (checking every ${checkIntervalTime/1000}s)`, 'success');
  
  // Track the last video we captured to detect video changes
  let lastVideoElement = null;
  let consecutiveFailures = 0;
  
  checkInterval = setInterval(() => {
    console.log('[Football Ad Muter] Running video check...');
    const video = getActiveVideo();
    
    if (!video) {
      console.log('[Football Ad Muter] No video element found');
      consecutiveFailures++;
      if (consecutiveFailures > 5) {
        console.log('[Football Ad Muter] ⚠️ No video found for 5 consecutive checks - might need to wait for page load');
        logActivity('⚠️ No video found for multiple checks', 'warning');
      }
      return;
    }
    
    // Reset failure counter when we find a video
    consecutiveFailures = 0;
    
    // Detect if video element changed (e.g., ad vs content switch)
    if (lastVideoElement && lastVideoElement !== video) {
      console.log('[Football Ad Muter] 🔄 Video element changed - different element detected');
      logActivity('🔄 Video element changed', 'info');
      // Clear the muted flag from old video if it exists
      if (lastVideoElement.dataset.mutedByExtension === 'true') {
        delete lastVideoElement.dataset.mutedByExtension;
      }
    }
    lastVideoElement = video;
    
    // Check if video is in a playable state
    if (video.paused) {
      console.log('[Football Ad Muter] Video is paused, skipping capture');
      return;
    }
    
    console.log('[Football Ad Muter] Active video found:', {
      width: video.videoWidth,
      height: video.videoHeight,
      currentTime: video.currentTime.toFixed(2),
      duration: video.duration.toFixed(2),
      readyState: video.readyState,
      networkState: video.networkState,
      muted: video.muted,
      mutedByExtension: video.dataset.mutedByExtension === 'true'
    });
    
    // Only capture if video has been playing for at least 0.5 seconds to avoid loading frames
    // Reduced from 1 second to capture sooner on Peacock and similar services
    if (video.currentTime >= 0.5 || (video.duration > 0 && video.currentTime / video.duration > 0.005)) {
      captureAndAnalyzeVideo(video);
    } else {
      console.log('[Football Ad Muter] Video just started, waiting for content to load... (currentTime:', video.currentTime.toFixed(3), 's)');
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
  logActivity('⏹️ Monitoring stopped', 'info');
}

function getActiveVideo() {
  // Find the active video on the page
  let videos = Array.from(document.querySelectorAll('video'));
  
  // Site-specific optimizations
  if (currentSite.isPeacock && videos.length > 1) {
    console.log('[Football Ad Muter] Peacock detected - applying Peacock-specific video selection');
    // Peacock often has multiple videos, prefer the one that's actually visible and large
    videos = videos.filter(v => {
      const rect = v.getBoundingClientRect();
      return v.videoWidth > 100 && v.videoHeight > 100 && rect.width > 100 && rect.height > 100;
    });
    console.log('[Football Ad Muter] After Peacock filter:', videos.length, 'videos remain');
  }
  
  if (currentSite.isYouTube) {
    console.log('[Football Ad Muter] YouTube detected - looking for main video player');
    // YouTube's main video is typically in .html5-video-container
    const youtubeVideo = document.querySelector('.html5-video-container video') || 
                        document.querySelector('.html5-main-video');
    if (youtubeVideo && youtubeVideo.videoWidth > 0) {
      console.log('[Football Ad Muter] Found YouTube main video');
      return youtubeVideo;
    }
  }
  
  console.log('[Football Ad Muter] Found', videos.length, 'video elements on page');
  
  if (videos.length === 0) return null;
  
  // Log details about all videos found with visibility info
  videos.forEach((video, index) => {
    const parentWithPlayerClass = video.closest('.player') || video.closest('[class*="player"]');
    const rect = video.getBoundingClientRect();
    const style = window.getComputedStyle(video);
    const isVisible = style.display !== 'none' && 
                     style.visibility !== 'hidden' && 
                     parseFloat(style.opacity) > 0 &&
                     rect.width > 0 && 
                     rect.height > 0;
    
    console.log(`[Football Ad Muter] Video ${index + 1}:`, {
      width: video.videoWidth,
      height: video.videoHeight,
      area: video.videoWidth * video.videoHeight,
      paused: video.paused,
      muted: video.muted,
      readyState: video.readyState,
      currentTime: video.currentTime,
      duration: video.duration,
      src: (video.src || video.currentSrc || 'no src').substring(0, 100),
      parentClasses: parentWithPlayerClass ? parentWithPlayerClass.className : 'no player parent',
      hasActiveClass: parentWithPlayerClass ? parentWithPlayerClass.classList.contains('player-active') : false,
      visible: isVisible,
      display: style.display,
      zIndex: style.zIndex,
      rectWidth: rect.width,
      rectHeight: rect.height
    });
  });
  
  // Strategy 1: If multiple videos, look for one with "player-active" or similar active class
  if (videos.length > 1) {
    console.log('[Football Ad Muter] Multiple videos found, looking for active indicators...');
    
    for (const video of videos) {
      // Check for various active indicators
      const parentWithActiveClass = video.closest('.player-active') || 
                                   video.closest('[class*="player"][class*="active"]') ||
                                   video.closest('[class*="player active"]') ||
                                   video.closest('[class*="playing"]') ||
                                   video.closest('[class*="main"]') ||
                                   video.closest('[data-active="true"]');
      
      if (parentWithActiveClass && video.videoWidth > 0 && video.videoHeight > 0) {
        console.log('[Football Ad Muter] Found video with active indicator, area:', video.videoWidth * video.videoHeight);
        console.log('[Football Ad Muter] Active element classes:', parentWithActiveClass.className);
        return video;
      }
    }
    
    console.log('[Football Ad Muter] No video with active class found, checking visibility and dimensions...');
  }
  
  // Strategy 2: Filter for videos that are visible and have good dimensions
  const visibleVideos = videos.filter(video => {
    const rect = video.getBoundingClientRect();
    const style = window.getComputedStyle(video);
    const isVisible = style.display !== 'none' && 
                     style.visibility !== 'hidden' && 
                     parseFloat(style.opacity) > 0.1 &&
                     rect.width > 50 && 
                     rect.height > 50;
    
    return isVisible && 
           video.videoWidth > 0 && 
           video.videoHeight > 0 && 
           video.readyState >= 1;
  });
  
  console.log('[Football Ad Muter] Visible videos found:', visibleVideos.length);
  
  // Strategy 3: Among visible videos, prefer those that are actually playing
  const playingVideos = visibleVideos.filter(video => 
    !video.paused &&
    video.currentTime > 0 &&
    video.readyState >= 2
  );
  
  console.log('[Football Ad Muter] Playing videos found:', playingVideos.length);
  
  // Strategy 4: If we have playing videos, choose the largest one
  if (playingVideos.length > 0) {
    playingVideos.sort((a, b) => {
      const areaA = a.videoWidth * a.videoHeight;
      const areaB = b.videoWidth * b.videoHeight;
      // If areas are very close, prefer higher z-index (on top)
      if (Math.abs(areaA - areaB) < 10000) {
        const zIndexA = parseInt(window.getComputedStyle(a).zIndex) || 0;
        const zIndexB = parseInt(window.getComputedStyle(b).zIndex) || 0;
        return zIndexB - zIndexA;
      }
      return areaB - areaA;
    });
    
    const selected = playingVideos[0];
    console.log('[Football Ad Muter] Selected largest playing video, area:', selected.videoWidth * selected.videoHeight);
    return selected;
  }
  
  // Strategy 5: If no playing videos, use the largest visible video that's ready
  if (visibleVideos.length > 0) {
    visibleVideos.sort((a, b) => {
      // Sort by area and readyState
      const areaA = a.videoWidth * a.videoHeight;
      const areaB = b.videoWidth * b.videoHeight;
      
      if (a.readyState !== b.readyState) {
        return b.readyState - a.readyState;
      }
      
      if (Math.abs(areaA - areaB) < 10000) {
        const zIndexA = parseInt(window.getComputedStyle(a).zIndex) || 0;
        const zIndexB = parseInt(window.getComputedStyle(b).zIndex) || 0;
        return zIndexB - zIndexA;
      }
      
      return areaB - areaA;
    });
    
    const selected = visibleVideos[0];
    console.log('[Football Ad Muter] Selected largest visible video (not playing), area:', selected.videoWidth * selected.videoHeight, 'readyState:', selected.readyState);
    return selected;
  }
  
  // Strategy 6: Last resort - any video with dimensions
  const videosWithDimensions = videos.filter(video => 
    video.videoWidth > 0 && video.videoHeight > 0
  );
  
  if (videosWithDimensions.length > 0) {
    videosWithDimensions.sort((a, b) => {
      const areaA = a.videoWidth * a.videoHeight;
      const areaB = b.videoWidth * b.videoHeight;
      return areaB - areaA;
    });
    
    const selected = videosWithDimensions[0];
    console.log('[Football Ad Muter] Last resort: selected video with dimensions, area:', selected.videoWidth * selected.videoHeight);
    return selected;
  }
  
  console.log('[Football Ad Muter] No suitable video found, returning first video');
  return videos[0];
}

// Helper function to check if canvas has actual video content
function checkCanvasContent(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, Math.min(width, 100), Math.min(height, 100));
  const pixels = imageData.data;
  let hasVideoContent = false;
  let pixelVariance = 0;
  
  // Sample pixels to check for content
  for (let i = 0; i < pixels.length; i += 16) { // Sample every 4th pixel
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    
    // Check if pixel is not white (background) or pure black
    if ((r !== 255 || g !== 255 || b !== 255) && (r > 5 || g > 5 || b > 5)) {
      hasVideoContent = true;
      pixelVariance++;
    }
  }
  
  return { hasVideoContent, pixelVariance, sampleSize: Math.floor(pixels.length / 16) };
}

// Method 1: Try ImageCapture API (best quality, modern browsers)
async function captureWithImageCapture(video, maxWidth) {
  console.log('[Football Ad Muter] Attempting Method 1: ImageCapture API');
  
  try {
    if (!('captureStream' in video)) {
      console.log('[Football Ad Muter] captureStream not available on video element');
      return null;
    }
    
    const stream = video.captureStream();
    const track = stream.getVideoTracks()[0];
    
    if (!track) {
      console.log('[Football Ad Muter] No video track available from stream');
      return null;
    }
    
    const imageCapture = new ImageCapture(track);
    const blob = await imageCapture.takePhoto();
    
    // Stop the track to free resources
    track.stop();
    
    console.log('[Football Ad Muter] ✅ ImageCapture API successful, blob size:', blob.size, 'bytes');
    return { blob, method: 'ImageCapture API' };
    
  } catch (error) {
    console.log('[Football Ad Muter] ImageCapture API failed:', error.message);
    return null;
  }
}

// Method 2: Try OffscreenCanvas (better performance)
async function captureWithOffscreenCanvas(video, maxWidth) {
  console.log('[Football Ad Muter] Attempting Method 2: OffscreenCanvas');
  
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      console.log('[Football Ad Muter] OffscreenCanvas not available');
      return null;
    }
    
    const aspectRatio = video.videoHeight / video.videoWidth;
    const width = video.videoWidth > maxWidth ? maxWidth : video.videoWidth;
    const height = width * aspectRatio;
    
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    
    // Fill with white background first
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    // Draw the video frame
    ctx.drawImage(video, 0, 0, width, height);
    
    // Check content
    const contentCheck = checkCanvasContent(ctx, width, height);
    console.log('[Football Ad Muter] OffscreenCanvas content analysis:', contentCheck);
    
    if (!contentCheck.hasVideoContent || contentCheck.pixelVariance < 3) {
      console.log('[Football Ad Muter] ⚠️ OffscreenCanvas has low/no video content, but continuing anyway');
      // Continue anyway - might be a dark scene or DRM workaround needed
    }
    
    const blob = await offscreen.convertToBlob({
      type: 'image/jpeg',
      quality: 0.8
    });
    
    console.log('[Football Ad Muter] ✅ OffscreenCanvas successful, blob size:', blob.size, 'bytes');
    return { blob, method: 'OffscreenCanvas' };
    
  } catch (error) {
    console.log('[Football Ad Muter] OffscreenCanvas failed:', error.message);
    return null;
  }
}

// Method 3: Traditional Canvas with createImageBitmap (faster drawing)
async function captureWithImageBitmap(video, maxWidth) {
  console.log('[Football Ad Muter] Attempting Method 3: Canvas with createImageBitmap');
  
  try {
    if (typeof createImageBitmap === 'undefined') {
      console.log('[Football Ad Muter] createImageBitmap not available');
      return null;
    }
    
    const aspectRatio = video.videoHeight / video.videoWidth;
    const width = video.videoWidth > maxWidth ? maxWidth : video.videoWidth;
    const height = width * aspectRatio;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Fill with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    // Create ImageBitmap for faster drawing
    const imageBitmap = await createImageBitmap(video);
    ctx.drawImage(imageBitmap, 0, 0, width, height);
    imageBitmap.close(); // Clean up
    
    // Check content
    const contentCheck = checkCanvasContent(ctx, width, height);
    console.log('[Football Ad Muter] ImageBitmap content analysis:', contentCheck);
    
    if (!contentCheck.hasVideoContent || contentCheck.pixelVariance < 3) {
      console.log('[Football Ad Muter] ⚠️ ImageBitmap canvas has low/no video content, but continuing anyway');
      // Continue anyway - might be a dark scene or DRM workaround needed
    }
    
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    });
    
    console.log('[Football Ad Muter] ✅ ImageBitmap method successful, blob size:', blob?.size, 'bytes');
    return blob ? { blob, method: 'Canvas with ImageBitmap' } : null;
    
  } catch (error) {
    console.log('[Football Ad Muter] ImageBitmap method failed:', error.message);
    return null;
  }
}

// Method 4: Traditional Canvas (most compatible fallback)
async function captureWithTraditionalCanvas(video, maxWidth) {
  console.log('[Football Ad Muter] Attempting Method 4: Traditional Canvas (fallback)');
  
  try {
    const aspectRatio = video.videoHeight / video.videoWidth;
    const width = video.videoWidth > maxWidth ? maxWidth : video.videoWidth;
    const height = width * aspectRatio;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Fill with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    
    // Draw the video frame
    ctx.drawImage(video, 0, 0, width, height);
    
    // Check content
    const contentCheck = checkCanvasContent(ctx, width, height);
    console.log('[Football Ad Muter] Traditional canvas content analysis:', contentCheck);
    
    if (!contentCheck.hasVideoContent || contentCheck.pixelVariance < 3) {
      console.log('[Football Ad Muter] ⚠️ Traditional canvas has low/no video content, but continuing anyway');
      // Continue anyway - might be a dark scene or DRM workaround needed
    }
    
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    });
    
    console.log('[Football Ad Muter] ✅ Traditional Canvas successful, blob size:', blob?.size, 'bytes');
    return blob ? { blob, method: 'Traditional Canvas' } : null;
    
  } catch (error) {
    console.log('[Football Ad Muter] Traditional Canvas failed:', error.message);
    return null;
  }
}

// Main capture function with multiple fallback methods
async function captureVideoFrame(video, maxWidth = 800) {
  console.log('[Football Ad Muter] Starting multi-method video frame capture...');
  
  // Try each method in order until one succeeds
  const methods = [
    captureWithImageCapture,
    captureWithOffscreenCanvas,
    captureWithImageBitmap,
    captureWithTraditionalCanvas
  ];
  
  for (const method of methods) {
    const result = await method(video, maxWidth);
    if (result) {
      console.log('[Football Ad Muter] 🎉 Successfully captured frame using:', result.method);
      return result;
    }
  }
  
  console.error('[Football Ad Muter] ❌ All capture methods failed');
  return null;
}

function captureAndAnalyzeVideo(video) {
  // Use requestVideoFrameCallback for precise timing if available
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    video.requestVideoFrameCallback((now, metadata) => {
      console.log('[Football Ad Muter] 📹 Capturing at exact video frame (requestVideoFrameCallback)');
      console.log('[Football Ad Muter] Frame metadata:', {
        presentationTime: metadata.presentationTime,
        expectedDisplayTime: metadata.expectedDisplayTime,
        width: metadata.width,
        height: metadata.height,
        mediaTime: metadata.mediaTime
      });
      performCapture(video);
    });
  } else {
    console.log('[Football Ad Muter] 📹 Capturing immediately (requestVideoFrameCallback not available)');
    performCapture(video);
  }
}

async function performCapture(video) {
  try {
    console.log('[Football Ad Muter] Starting video capture and analysis...');
    
    // Check if video is ready and has valid dimensions
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      console.log('[Football Ad Muter] Video not ready - no dimensions available:', {
        videoWidth: video?.videoWidth,
        videoHeight: video?.videoHeight,
        readyState: video?.readyState
      });
      saveLogEntry(null, 'Video not ready for capture - no dimensions');
      return;
    }
    
    // Check if video has loaded enough data
    if (video.readyState < 1) {
      console.log('[Football Ad Muter] Video not ready - insufficient data loaded. ReadyState:', video.readyState);
      saveLogEntry(null, 'Video not ready for capture - loading data');
      return;
    }
    
    console.log('[Football Ad Muter] Video state:', {
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      ended: video.ended,
      readyState: video.readyState,
      dimensions: `${video.videoWidth}x${video.videoHeight}`
    });
    
    // Try to capture the video frame using multiple methods
    const captureResult = await captureVideoFrame(video, 800);
    
    if (!captureResult) {
      console.error('[Football Ad Muter] Failed to capture video frame with any method');
      logActivity('❌ Failed to capture video frame', 'error');
      
      // Check if early in video
      if (video.currentTime < 1 && video.duration > 5) {
        saveLogEntry(null, 'Skipped: Video still loading/buffering', null, {
          reason: 'early_video',
          currentTime: video.currentTime,
          duration: video.duration
        });
      } else {
        saveLogEntry(null, 'Failed to capture frame - all methods failed', null, {
          reason: 'capture_failed',
          currentTime: video.currentTime,
          duration: video.duration,
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight
        });
      }
      return;
    }
    
    console.log('[Football Ad Muter] Successfully captured frame using:', captureResult.method);
    logActivity(`📸 Frame captured (${captureResult.method})`, 'info');
    console.log('[Football Ad Muter] Converting blob to base64...');
    
    const reader = new FileReader();
    
    reader.onerror = (error) => {
      console.error('[Football Ad Muter] FileReader error:', error);
      saveLogEntry(null, 'Failed to read image blob');
    };
    
    reader.onloadend = async () => {
      try {
        const base64Image = reader.result.split(',')[1];
        console.log('[Football Ad Muter] Image converted to base64, length:', base64Image.length, 'characters');
        console.log('[Football Ad Muter] Sending image to background script for analysis...');
        logActivity('🤖 Analyzing frame with LLM...', 'info');
        
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Background script response timeout'));
          }, 35000); // 35 second timeout
          
          chrome.runtime.sendMessage({
            action: 'analyzeImage',
            base64Image: base64Image,
            ollamaUrl: ollamaUrl
          }, (response) => {
            clearTimeout(timeout);
            
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
          saveLogEntry(null, 'No response from background script - reload extension', reader.result);
          return;
        }
        
        if (response.error) {
          console.error('[Football Ad Muter] API error from background:', response.error);
          logActivity(`❌ API Error: ${response.error}`, 'error');
          saveLogEntry(null, `API Error: ${response.error}`, reader.result, response);
          return;
        }
        
        const isGameplay = response.result;
        console.log('[Football Ad Muter] Analysis result:', isGameplay);
        
        // Get LLM response text for logging
        let llmResponseText = '';
        if (response.response) {
          llmResponseText = typeof response.response === 'string' 
            ? response.response 
            : (response.response.message?.content || JSON.stringify(response.response));
          // Truncate if too long for activity log
          if (llmResponseText.length > 150) {
            llmResponseText = llmResponseText.substring(0, 150) + '...';
          }
        }
        
        // Log the analysis result
        let action = null;
      
        if (isGameplay === false) {
          // Mute the video
          if (!video.muted) {
            console.log('[Football Ad Muter] 🔇 MUTING VIDEO - Advertisement detected');
            logActivity(`🔇 MUTING - Advertisement detected${llmResponseText ? ' | LLM: ' + llmResponseText : ''}`, 'warning');
            video.muted = true;
            video.dataset.mutedByExtension = 'true';
            action = `Video muted (advertisement detected) - Method: ${captureResult.method}`;
          } else {
            console.log('[Football Ad Muter] Video already muted, advertisement still detected');
          }
        } else if (isGameplay === true) {
          // Unmute if we muted it
          if (video.dataset.mutedByExtension === 'true') {
            console.log('[Football Ad Muter] 🔊 UNMUTING VIDEO - Gameplay detected');
            logActivity(`🔊 UNMUTING - Gameplay detected${llmResponseText ? ' | LLM: ' + llmResponseText : ''}`, 'success');
            video.muted = false;
            delete video.dataset.mutedByExtension;
            action = `Video unmuted (gameplay detected) - Method: ${captureResult.method}`;
          } else {
            console.log('[Football Ad Muter] Gameplay detected, video not muted by extension');
            logActivity(`✓ Gameplay confirmed${llmResponseText ? ' | LLM: ' + llmResponseText : ''}`, 'info');
          }
        } else {
          console.log('[Football Ad Muter] Analysis returned null/undefined - no action taken');
          logActivity('⚠️ Analysis inconclusive', 'warning');
        }
        
        // Save log entry with image data and full LLM response
        // The response now contains: { result, model, response, processingTime } or { result, error, processingTime }
        saveLogEntry(isGameplay, action, reader.result, response);
        
      } catch (messageError) {
        console.error('[Football Ad Muter] Error sending message to background:', messageError);
        if (messageError.message.includes('Receiving end does not exist')) {
          saveLogEntry(null, 'Background script unavailable - try reloading the extension');
        } else if (messageError.message.includes('timeout')) {
          saveLogEntry(null, 'Background script timeout - analysis took too long');
        } else {
          saveLogEntry(null, `Message Error: ${messageError.message}`);
        }
      }
    };
    
    reader.readAsDataURL(captureResult.blob);
    
  } catch (error) {
    console.error('[Football Ad Muter] Error capturing video:', error);
    saveLogEntry(null, `Error: ${error.message}`);
  }
}



function resetVideoPlayer() {
  console.log('[Football Ad Muter] Resetting video player...');
  
  const videos = Array.from(document.querySelectorAll('video'));
  console.log('[Football Ad Muter] Found', videos.length, 'video elements to reset');
  
  if (videos.length === 0) {
    console.log('[Football Ad Muter] No video elements found to reset');
    return;
  }
  
  videos.forEach((video, index) => {
    console.log(`[Football Ad Muter] Resetting video ${index + 1}...`);
    
    // Remove any extension-specific data attributes
    if (video.dataset.mutedByExtension) {
      delete video.dataset.mutedByExtension;
      console.log(`[Football Ad Muter] Removed mutedByExtension flag from video ${index + 1}`);
    }
    
    // Unmute the video if it's currently muted
    if (video.muted) {
      video.muted = false;
      console.log(`[Football Ad Muter] Unmuted video ${index + 1}`);
    }
    
    // Reset volume to a reasonable level if it's very low
    if (video.volume < 0.1) {
      video.volume = 0.8;
      console.log(`[Football Ad Muter] Reset volume to 0.8 for video ${index + 1}`);
    }
    
    // If the video is paused and has some duration, try to resume playback
    if (video.paused && video.duration > 0 && video.currentTime > 0) {
      try {
        video.play();
        console.log(`[Football Ad Muter] Resumed playback for video ${index + 1}`);
      } catch (error) {
        console.log(`[Football Ad Muter] Could not resume playback for video ${index + 1}:`, error.message);
      }
    }
  });
  
  // Log the reset action
  saveLogEntry(null, `Video player reset - ${videos.length} video(s) processed`);
  logActivity(`🔄 Video player reset (${videos.length} video(s))`, 'success');
  console.log('[Football Ad Muter] Video player reset complete');
}

function saveLogEntry(result, action, imageDataUrl = null, llmResponse = null) {
  const logEntry = {
    timestamp: Date.now(),
    result: result,
    action: action,
    imageUrl: imageDataUrl,
    llmResponse: llmResponse
  };
  
  console.log('[Football Ad Muter] 💾 Saving log entry:', {
    timestamp: logEntry.timestamp,
    result: logEntry.result,
    action: logEntry.action,
    hasImage: !!imageDataUrl,
    hasLLMResponse: !!llmResponse
  });
  
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
// Content script that monitors video elements and captures screenshots

let isMonitoring = false;
let checkInterval = null;
let ollamaUrl = 'http://localhost:11434';
let checkIntervalTime = 10000; // 10 seconds default

// Initialize request queue and adaptive sampler
let requestQueue = null;
let adaptiveSampler = null;

function initializeQueue() {
  if (!requestQueue) {
    requestQueue = new RequestQueue({
      maxConcurrent: 2, // Max 2 simultaneous API calls
      maxQueueSize: 3, // Max 3 pending requests
      requestTimeout: 30000, // 30 second timeout
      minTimeBetweenRequests: 2000 // 2 seconds between requests
    });
    console.log('[Football Ad Muter] Request queue initialized');
  }
  
  if (!adaptiveSampler) {
    adaptiveSampler = new AdaptiveSampler({
      minInterval: 3000, // 3 seconds minimum
      maxInterval: 15000, // 15 seconds maximum
      normalInterval: checkIntervalTime || 8000, // Use user setting or 8 seconds
      sceneChangeThreshold: 0.15 // 15% change triggers capture
    });
    console.log('[Football Ad Muter] Adaptive sampler initialized');
  }
}

// Detect streaming service for optimizations
const currentSite = {
  isPeacock: window.location.hostname.includes('peacocktv.com'),
  isYouTube: window.location.hostname.includes('youtube.com'),
  isNetflix: window.location.hostname.includes('netflix.com'),
  isHulu: window.location.hostname.includes('hulu.com'),
  isAmazonPrime: window.location.hostname.includes('amazon.com') || window.location.hostname.includes('primevideo.com'),
  isGeneric: true,
  isDrmProtected: false // Track if current content has DRM protection
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

// Activity logging function with image attachment
function logActivityWithImage(message, type = 'info', imageDataUrl = null) {
  const activityEntry = {
    timestamp: Date.now(),
    message: message,
    type: type,
    imageUrl: imageDataUrl
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
    
    // Update all settings
    ollamaUrl = request.ollamaUrl || ollamaUrl;
    checkIntervalTime = request.checkInterval || checkIntervalTime;
    
    // Update sampler with new base interval
    if (adaptiveSampler) {
      adaptiveSampler.normalInterval = checkIntervalTime;
    }
    
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
  } else if (request.action === 'getVideoStatus') {
    // Return basic status about the active video on the page
    try {
      const video = getActiveVideo();
      if (!video) {
        sendResponse({ found: false });
      } else {
        sendResponse({
          found: true,
          muted: !!video.muted,
          paused: !!video.paused,
          currentTime: video.currentTime
        });
      }
    } catch (err) {
      console.error('[Football Ad Muter] Error getting video status:', err);
      sendResponse({ found: false, error: err?.message || String(err) });
    }
  } else if (request.action === 'getQueueStatus') {
    // Return queue and sampler status
    try {
      const queueStatus = requestQueue ? requestQueue.getStatus() : null;
      const samplerStatus = adaptiveSampler ? adaptiveSampler.getStatus() : null;
      
      sendResponse({
        queue: queueStatus,
        sampler: samplerStatus
      });
    } catch (err) {
      console.error('[Football Ad Muter] Error getting queue status:', err);
      sendResponse({ error: err?.message || String(err) });
    }
  }
  return false;
});

function startMonitoring() {
  if (isMonitoring) {
    console.log('[Football Ad Muter] Monitoring already active, ignoring start request');
    logActivity('⚠️ Monitoring already active', 'warning');
    return;
  }
  
  // Initialize queue and sampler
  initializeQueue();
  
  isMonitoring = true;
  console.log('[Football Ad Muter] Monitoring started - checking every', checkIntervalTime, 'ms');
  console.log('[Football Ad Muter] Using API URL:', ollamaUrl);
  console.log('[Football Ad Muter] Queue config:', requestQueue.getStatus());
  console.log('[Football Ad Muter] Sampler config:', adaptiveSampler.getStatus());
  logActivity(`✅ Monitoring started (adaptive sampling: ${checkIntervalTime/1000}s base)`, 'success');
  
  // Track the last video we captured to detect video changes
  let lastVideoElement = null;
  let consecutiveFailures = 0;
  let drmCheckPerformed = false;
  
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
    
    // Perform DRM check once when we first find a video
    if (!drmCheckPerformed && video) {
      console.log('[Football Ad Muter] Running initial DRM protection check...');
      checkForDrmProtection(video).then(result => {
        if (result.isDrm) {
          console.log('[Football Ad Muter] 🔒 DRM PROTECTED CONTENT DETECTED - STOPPING MONITORING');
          logActivity(`🔒 DRM Protected Content Detected (${result.keySystem}) - Monitoring stopped`, 'error');
          // Stop monitoring
          stopMonitoring();
          drmCheckPerformed = true;
        } else {
          console.log('[Football Ad Muter] No DRM protection detected, continuing...');
          drmCheckPerformed = true;
        }
      }).catch(error => {
        console.error('[Football Ad Muter] Error during DRM check:', error);
        drmCheckPerformed = true; // Mark as performed even if error, to avoid repeated checks
      });
    }
    
    // If DRM was detected, stop processing
    if (currentSite.isDrmProtected) {
      return;
    }
    
    // Detect if video element changed (e.g., ad vs content switch)
    if (lastVideoElement && lastVideoElement !== video) {
      console.log('[Football Ad Muter] 🔄 Video element changed - different element detected');
      logActivity('🔄 Video element changed', 'info');
      // Clear the muted flag from old video if it exists
      if (lastVideoElement.dataset.mutedByExtension === 'true') {
        delete lastVideoElement.dataset.mutedByExtension;
      }
      // Reset sampler when video changes
      adaptiveSampler.reset();
      // Re-perform DRM check for new video element
      drmCheckPerformed = false;
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
    
    // Check adaptive sampler to see if we should capture now
    const shouldCapture = adaptiveSampler.shouldCaptureFrame(Date.now());
    
    // Only capture if video has been playing for at least 0.5 seconds to avoid loading frames
    if ((video.currentTime >= 0.5 || (video.duration > 0 && video.currentTime / video.duration > 0.005)) && shouldCapture) {
      // Log queue status
      const queueStatus = requestQueue.getStatus();
      console.log('[Football Ad Muter] Queue status:', queueStatus);
      
      // Log sampler status
      const samplerStatus = adaptiveSampler.getStatus();
      console.log('[Football Ad Muter] Sampler status:', samplerStatus);
      
      captureAndAnalyzeVideo(video);
    } else if (!shouldCapture) {
      console.log('[Football Ad Muter] Adaptive sampler says skip this frame (next in:', 
        Math.round((adaptiveSampler.currentInterval - (Date.now() - adaptiveSampler.lastCaptureTime)) / 1000), 's)');
    } else {
      console.log('[Football Ad Muter] Video just started, waiting for content to load... (currentTime:', video.currentTime.toFixed(3), 's)');
    }
  }, Math.min(checkIntervalTime, 3000)); // Check more frequently than capture for adaptive timing
}

function stopMonitoring() {
  if (!isMonitoring) return;
  
  isMonitoring = false;
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  
  // Clear the request queue
  if (requestQueue) {
    requestQueue.clear();
    console.log('[Football Ad Muter] Request queue cleared');
  }
  
  // Reset adaptive sampler
  if (adaptiveSampler) {
    adaptiveSampler.reset();
    console.log('[Football Ad Muter] Adaptive sampler reset');
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

// Function to detect DRM protection on video element
async function checkForDrmProtection(video) {
  try {
    console.log('[Football Ad Muter] Checking for DRM protection...');
    
    // Method 1: Check EME (Encrypted Media Extensions)
    if (navigator.requestMediaKeySystemAccess) {
      const keySystemsToCheck = [
        'com.widevine.alpha', // Widevine (Google)
        'com.microsoft.playready', // PlayReady (Microsoft)
        'com.apple.fps', // FairPlay (Apple)
        'org.w3.clearkey' // ClearKey
      ];
      
      for (const keySystem of keySystemsToCheck) {
        try {
          const access = await navigator.requestMediaKeySystemAccess(keySystem, [
            {
              initDataTypes: ['cenc', 'cbcs', 'sinf', 'webm', 'keyids'],
              videoCapabilities: [{ contentType: 'video/mp4' }],
              audioCapabilities: [{ contentType: 'audio/mp4' }]
            }
          ]);
          
          if (access) {
            console.log('[Football Ad Muter] 🔒 DRM DETECTED: ' + keySystem);
            currentSite.isDrmProtected = true;
            saveDrmStatus(true, keySystem);
            return { isDrm: true, keySystem: keySystem };
          }
        } catch (e) {
          // This key system is not supported, continue to next
        }
      }
    }
    
    // Method 2: Check video element for encrypted content indicators
    if (video.mediaKeys) {
      console.log('[Football Ad Muter] 🔒 DRM DETECTED: mediaKeys present on video element');
      currentSite.isDrmProtected = true;
      saveDrmStatus(true, 'mediaKeys');
      return { isDrm: true, keySystem: 'mediaKeys' };
    }
    
    // Method 3: Check for encrypted content type in source elements
    const sources = video.querySelectorAll('source');
    for (const source of sources) {
      const type = source.type || source.getAttribute('type') || '';
      if (type.includes('encrypted') || type.includes('drm')) {
        console.log('[Football Ad Muter] 🔒 DRM DETECTED: Source type indicates DRM - ' + type);
        currentSite.isDrmProtected = true;
        saveDrmStatus(true, 'source-type');
        return { isDrm: true, keySystem: 'source-type' };
      }
    }
    
    console.log('[Football Ad Muter] ✅ No DRM protection detected');
    currentSite.isDrmProtected = false;
    saveDrmStatus(false, null);
    return { isDrm: false, keySystem: null };
    
  } catch (error) {
    console.error('[Football Ad Muter] Error checking DRM protection:', error);
    // If we can't determine, assume no DRM
    currentSite.isDrmProtected = false;
    saveDrmStatus(false, null);
    return { isDrm: false, keySystem: null };
  }
}

// Save DRM status to storage
function saveDrmStatus(isDrm, keySystem) {
  const drmStatus = {
    isDrm: isDrm,
    keySystem: keySystem,
    detectedAt: Date.now(),
    url: window.location.href
  };
  
  chrome.storage.sync.set({ drmStatus: drmStatus }, () => {
    if (chrome.runtime.lastError) {
      console.error('[Football Ad Muter] Error saving DRM status:', chrome.runtime.lastError);
      return;
    }
    console.log('[Football Ad Muter] DRM status saved:', drmStatus);
  });
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
    
    // Mark this capture in the adaptive sampler
    adaptiveSampler.markCapture();
    
    // logActivity(`📸 Frame captured (${captureResult.method})`, 'info');
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
        
        // Log the frame capture with the image data
        // logActivityWithImage(`📸 Frame captured (${captureResult.method})`, 'info', reader.result);
        
        // Log that we're queueing the frame for analysis
        const queueStatus = requestQueue.getStatus();
        // logActivity(`📋 Queued for analysis (Queue: ${queueStatus.queueLength}, Active: ${queueStatus.activeRequests})`, 'info');
        
        // Enqueue the analysis request instead of sending immediately
        const requestId = requestQueue.enqueue({
          priority: adaptiveSampler.isAdDetected ? 2 : 1, // Higher priority during ads
          data: {
            base64Image: base64Image,
            ollamaUrl: ollamaUrl,
            captureMethod: captureResult.method,
            imageDataUrl: reader.result
          },
          handler: async (data) => {
            // This handler will be called by the queue when it's time to process
            console.log('[Football Ad Muter] Processing queued request, sending to background...');
            
            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Background script response timeout'));
              }, 35000); // 35 second timeout
              
              chrome.runtime.sendMessage({
                action: 'analyzeImage',
                base64Image: data.base64Image,
                ollamaUrl: ollamaUrl
              }, (response) => {
                clearTimeout(timeout);
                
                if (chrome.runtime.lastError) {
                  console.error('[Football Ad Muter] Runtime error:', chrome.runtime.lastError);
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve({ response, imageDataUrl: data.imageDataUrl, captureMethod: data.captureMethod });
                }
              });
            });
          },
          onSuccess: (result) => {
            handleAnalysisResult(result.response, result.imageDataUrl, result.captureMethod, video);
          },
          onError: (error) => {
            console.error('[Football Ad Muter] Queued request failed:', error);
            
            if (error.message.includes('queue full') || error.message.includes('Queue cleared')) {
              logActivity('⚠️ Request dropped - too many pending', 'warning');
              saveLogEntry(null, 'Request dropped - queue full', reader.result);
            } else if (error.message.includes('Receiving end does not exist')) {
              logActivity('❌ Background script unavailable', 'error');
              saveLogEntry(null, 'Background script unavailable - reload extension', reader.result);
            } else if (error.message.includes('timeout')) {
              logActivity('❌ Request timeout', 'error');
              saveLogEntry(null, 'Request timeout - analysis took too long', reader.result);
            } else {
              logActivity(`❌ Error: ${error.message}`, 'error');
              saveLogEntry(null, `Error: ${error.message}`, reader.result);
            }
          }
        });
        
        console.log('[Football Ad Muter] Request queued with ID:', requestId);
        
      } catch (messageError) {
        console.error('[Football Ad Muter] Error queueing request:', messageError);
        saveLogEntry(null, `Error: ${messageError.message}`);
      }
    };
    
    reader.readAsDataURL(captureResult.blob);
    
  } catch (error) {
    console.error('[Football Ad Muter] Error capturing video:', error);
    saveLogEntry(null, `Error: ${error.message}`);
  }
}

// Handle analysis results from the queue
function handleAnalysisResult(response, imageDataUrl, captureMethod, video) {
  console.log('[Football Ad Muter] Received response from background:', response);
  
  if (!response) {
    console.error('[Football Ad Muter] No response received from background script');
    saveLogEntry(null, 'No response from background script - reload extension', imageDataUrl);
    return;
  }
  
  if (response.error) {
    console.error('[Football Ad Muter] API error from background:', response.error);
    logActivity(`❌ API Error: ${response.error}`, 'error');
    saveLogEntry(null, `API Error: ${response.error}`, imageDataUrl, response);
    return;
  }
  
  const isGameplay = response.result;
  console.log('[Football Ad Muter] Analysis result:', isGameplay);
  
  // Update adaptive sampler with the result
  adaptiveSampler.updateStrategy(response);
  
  // Get LLM response text for logging
  let llmResponseText = '';
  if (response.response) {
    llmResponseText = typeof response.response === 'string' 
      ? response.response 
      : (response.response?.thinking || JSON.stringify(response.thinking));
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
      action = `Video muted (advertisement detected) - Method: ${captureMethod}`;
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
      action = `Video unmuted (gameplay detected) - Method: ${captureMethod}`;
    } else {
      console.log('[Football Ad Muter] Gameplay detected, video not muted by extension');
      logActivity(`✓ Gameplay confirmed${llmResponseText ? ' | LLM: ' + llmResponseText : ''}`, 'info');
    }
  } else {
    console.log('[Football Ad Muter] Analysis returned null/undefined - no action taken');
    logActivity('⚠️ Analysis inconclusive', 'warning');
  }
  
  // Save log entry with image data and full LLM response
  saveLogEntry(isGameplay, action, imageDataUrl, response);
  
  // Log sampler statistics
  const samplerStats = adaptiveSampler.getStats();
  console.log('[Football Ad Muter] Sampler stats:', samplerStats);
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
  
  // Use storage.local instead of storage.sync because base64 images are too large
  // storage.sync has 8KB per item limit, storage.local has ~10MB limit
  chrome.storage.local.get(['analysisLogs'], (storage) => {
    if (chrome.runtime.lastError) {
      console.error('[Football Ad Muter] ❌ Error reading storage.local:', chrome.runtime.lastError);
      return;
    }
    
    const logs = storage.analysisLogs || [];
    logs.push(logEntry);
    
    // Keep only the last 50 entries to prevent storage overflow (even local has limits)
    const trimmedLogs = logs.slice(-50);
    
    console.log('[Football Ad Muter] Total logs in storage.local:', trimmedLogs.length);
    
    chrome.storage.local.set({ analysisLogs: trimmedLogs }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Football Ad Muter] ❌ Error saving to storage.local:', chrome.runtime.lastError.message);
        console.error('[Football Ad Muter] Image size may be too large even for local storage');
        return;
      }
      
      console.log('[Football Ad Muter] ✅ Log entry saved to storage.local');
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
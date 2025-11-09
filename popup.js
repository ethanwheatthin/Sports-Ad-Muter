// Popup script

let isMonitoring = false;
let refreshInterval = null;

// Track expanded state of activity and log entries
const expandedActivityEntries = new Set();
const expandedLogEntries = new Set();
const expandedLLMResponses = new Set();

// Load current settings
chrome.storage.sync.get(['ollamaUrl', 'checkInterval', 'isEnabled', 'analysisLogs', 'activityLogs'], (result) => {
  console.log('[Football Ad Muter Popup] Loading settings:', result);
  document.getElementById('ollamaUrl').value = result.ollamaUrl || 'http://localhost:11434';
  // Convert milliseconds to seconds for display
  const intervalMs = result.checkInterval || 10000;
  document.getElementById('checkInterval').value = intervalMs / 1000;
  isMonitoring = result.isEnabled || false;
  console.log('[Football Ad Muter Popup] Monitoring state:', isMonitoring);
  updateUI();
  loadLogs();
  loadActivityLogs();
  
  // Start auto-refresh of logs while popup is open
  startLogRefresh();

  // Update video status UI once on load
  updateVideoStatus();
  
  // Test background script connection
  chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Football Ad Muter Popup] ❌ Background script connection error:', chrome.runtime.lastError);
      return;
    }
    if (response && response.status === 'pong') {
      console.log('[Football Ad Muter Popup] ✅ Background script is responsive');
    } else {
      console.error('[Football Ad Muter Popup] ❌ Background script not responding');
    }
  });
});

// Auto-refresh logs while popup is open
function startLogRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  // Refresh logs every 2 seconds while popup is open
  refreshInterval = setInterval(() => {
    loadLogs();
    loadActivityLogs();
    // also update the small video status indicators
    updateVideoStatus();
    // Update queue and API metrics
    updateMetrics();
  }, 2000);
}

// Update queue and API metrics display
function updateMetrics() {
  if (!isMonitoring) {
    return;
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    
    // Get queue status from content script
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getQueueStatus' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        return;
      }
      
      // Update queue metrics
      if (response.queue) {
        document.getElementById('queueLength').textContent = response.queue.queueLength || 0;
        document.getElementById('activeRequests').textContent = response.queue.activeRequests || 0;
        document.getElementById('droppedRequests').textContent = response.queue.stats.droppedRequests || 0;
        document.getElementById('completedRequests').textContent = response.queue.stats.completedRequests || 0;
        document.getElementById('totalRequests').textContent = response.queue.stats.totalRequests || 0;
        
        const successRate = response.queue.stats.totalRequests > 0
          ? Math.round((response.queue.stats.completedRequests / response.queue.stats.totalRequests) * 100)
          : 0;
        document.getElementById('apiSuccessRate').textContent = successRate;
        
        const avgTime = Math.round(response.queue.stats.averageProcessingTime || 0);
        document.getElementById('avgProcessingTime').textContent = avgTime;
      }
      
      // Update sampler metrics
      if (response.sampler) {
        const intervalSeconds = (response.sampler.currentInterval / 1000).toFixed(1);
        document.getElementById('currentInterval').textContent = intervalSeconds;
        
        let mode = 'normal';
        if (response.sampler.isAdDetected) {
          mode = 'ad detected (fast)';
        } else if (response.sampler.gameplayConfidence >= 3) {
          mode = 'stable gameplay';
        }
        document.getElementById('samplingMode').textContent = mode;
      }
    });
  });
  
  // Get API metrics from background script
  chrome.runtime.sendMessage({ action: 'getApiMetrics' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.metrics) {
      return;
    }
    
    // Additional metrics from background could be displayed here if needed
  });
}

// Stop refresh when popup closes
window.addEventListener('unload', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
  const ollamaUrl = document.getElementById('ollamaUrl').value;
  // Convert seconds to milliseconds for storage
  const checkIntervalSeconds = parseFloat(document.getElementById('checkInterval').value);
  
  // Validate check interval (1-60 seconds)
  if (checkIntervalSeconds < 1 || checkIntervalSeconds > 60) {
    alert('Check interval must be between 1 and 60 seconds');
    return;
  }
  
  const checkInterval = checkIntervalSeconds * 1000;
  
  console.log('[Football Ad Muter Popup] Saving settings:', { ollamaUrl, checkInterval: checkInterval + 'ms (' + checkIntervalSeconds + 's)' });
  
  chrome.storage.sync.set({
    ollamaUrl: ollamaUrl,
    checkInterval: checkInterval
  }, () => {
    // Update content script with new settings
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        console.log('[Football Ad Muter Popup] Sending settings update to content script');
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateSettings',
          ollamaUrl: ollamaUrl,
          checkInterval: checkInterval
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[Football Ad Muter Popup] Content script not available (normal if not on a compatible page)');
          } else {
            console.log('[Football Ad Muter Popup] Settings update sent successfully:', response);
          }
        });
      } else {
        console.log('[Football Ad Muter Popup] No active tab found for settings update');
      }
    });
    
    // Show feedback
    const saveBtn = document.getElementById('saveBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveBtn.textContent = originalText;
    }, 1500);
  });
});

// Start monitoring
document.getElementById('startBtn').addEventListener('click', () => {
  console.log('[Football Ad Muter Popup] Start button clicked');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      console.log('[Football Ad Muter Popup] Sending start command to tab:', tabs[0].id);
      chrome.tabs.sendMessage(tabs[0].id, { action: 'start' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Football Ad Muter Popup] Error starting monitoring:', chrome.runtime.lastError);
          alert('Error: Cannot start monitoring. Make sure you are on a webpage with video content.');
          return;
        }
        console.log('[Football Ad Muter Popup] Start response:', response);
        if (response && response.status === 'started') {
          isMonitoring = true;
          chrome.storage.sync.set({ isEnabled: true });
          updateUI();
          console.log('[Football Ad Muter Popup] Monitoring started successfully');
        }
      });
    } else {
      console.error('[Football Ad Muter Popup] No active tab found for start command');
    }
  });
});

// Stop monitoring
document.getElementById('stopBtn').addEventListener('click', () => {
  console.log('[Football Ad Muter Popup] Stop button clicked');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      console.log('[Football Ad Muter Popup] Sending stop command to tab:', tabs[0].id);
      chrome.tabs.sendMessage(tabs[0].id, { action: 'stop' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Football Ad Muter Popup] Error stopping monitoring:', chrome.runtime.lastError);
          // Still update UI since the error might mean content script isn't running anyway
          isMonitoring = false;
          chrome.storage.sync.set({ isEnabled: false });
          updateUI();
          return;
        }
        console.log('[Football Ad Muter Popup] Stop response:', response);
        if (response && response.status === 'stopped') {
          isMonitoring = false;
          chrome.storage.sync.set({ isEnabled: false });
          updateUI();
          console.log('[Football Ad Muter Popup] Monitoring stopped successfully');
        }
      });
    } else {
      console.error('[Football Ad Muter Popup] No active tab found for stop command');
    }
  });
});

// Clear logs
document.getElementById('clearLogsBtn').addEventListener('click', () => {
  console.log('[Football Ad Muter Popup] Clear analysis logs button clicked');
  chrome.storage.sync.set({ analysisLogs: [] }, () => {
    console.log('[Football Ad Muter Popup] Analysis logs cleared from storage');
    // Clear expanded state tracking for analysis logs
    expandedLLMResponses.clear();
    loadLogs();
  });
});

// Clear activity logs
document.getElementById('clearActivityBtn').addEventListener('click', () => {
  console.log('[Football Ad Muter Popup] Clear activity logs button clicked');
  chrome.storage.sync.set({ activityLogs: [] }, () => {
    console.log('[Football Ad Muter Popup] Activity logs cleared from storage');
    // Clear expanded state tracking for activity logs
    expandedActivityEntries.clear();
    loadActivityLogs();
  });
});

// Test API connection
document.getElementById('testApiBtn').addEventListener('click', () => {
  console.log('[Football Ad Muter Popup] Test API button clicked');
  const testBtn = document.getElementById('testApiBtn');
  const statusDiv = document.getElementById('connectionStatus');
  const ollamaUrl = document.getElementById('ollamaUrl').value || 'http://localhost:11434';
  
  // Update UI to show testing state
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';
  statusDiv.style.display = 'block';
  statusDiv.className = 'connection-status testing';
  statusDiv.textContent = 'Testing connection to Ollama API...';
  
  console.log('[Football Ad Muter Popup] Sending API test request to background script');
  
  // Send test request to background script
  chrome.runtime.sendMessage({
    action: 'testApiConnection',
    ollamaUrl: ollamaUrl
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Football Ad Muter Popup] Runtime error during API test:', chrome.runtime.lastError);
      statusDiv.className = 'connection-status error';
      statusDiv.textContent = '❌ Extension error: ' + chrome.runtime.lastError.message;
    } else if (response.error) {
      console.error('[Football Ad Muter Popup] API test failed:', response.error);
      statusDiv.className = 'connection-status error';
      
      if (response.error.includes('Failed to fetch') || response.error.includes('NetworkError') || response.error.includes('aborted')) {
        statusDiv.textContent = '❌ Cannot connect to Ollama. Make sure it\'s running and CORS is enabled.';
      } else {
        statusDiv.textContent = `❌ Connection failed: ${response.error}`;
      }
    } else if (response.result) {
      console.log('[Football Ad Muter Popup] API test successful:', response.result);
      
      if (response.result.hasRequiredModel) {
        statusDiv.className = 'connection-status success';
        statusDiv.textContent = '✅ Connection successful! qwen3-vl model is available.';
      } else {
        statusDiv.className = 'connection-status error';
        statusDiv.textContent = '⚠️ Connected, but qwen3-vl:2b model not found. Please install it with: ollama pull qwen3-vl:2b';
      }
    } else {
      statusDiv.className = 'connection-status error';
      statusDiv.textContent = '❌ Unexpected response from API test';
    }
    
    // Reset button state
    testBtn.disabled = false;
    testBtn.textContent = 'Test API Connection';
    
    // Hide status after 10 seconds
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 10000);
  });
});

// Reset video player
document.getElementById('resetVideoBtn').addEventListener('click', () => {
  console.log('[Football Ad Muter Popup] Reset video button clicked');
  const resetBtn = document.getElementById('resetVideoBtn');
  const statusDiv = document.getElementById('connectionStatus');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      console.log('[Football Ad Muter Popup] Sending reset command to tab:', tabs[0].id);
      chrome.tabs.sendMessage(tabs[0].id, { action: 'resetVideo' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Football Ad Muter Popup] Error resetting video:', chrome.runtime.lastError);
          statusDiv.style.display = 'block';
          statusDiv.className = 'connection-status error';
          statusDiv.textContent = '❌ Cannot reset video. Make sure you are on a webpage with video content.';
          setTimeout(() => statusDiv.style.display = 'none', 5000);
          return;
        }
        
        console.log('[Football Ad Muter Popup] Reset response:', response);
        if (response && response.status === 'reset') {
          statusDiv.style.display = 'block';
          statusDiv.className = 'connection-status success';
          statusDiv.textContent = '✅ Video player reset successfully!';
          setTimeout(() => statusDiv.style.display = 'none', 3000);
        }
      });
    } else {
      console.error('[Football Ad Muter Popup] No active tab found for reset command');
    }
  });
});

function updateUI() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const status = document.getElementById('status');
  const metricsSection = document.getElementById('metricsSection');
  
  if (isMonitoring) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    status.textContent = 'Monitoring Active';
    status.className = 'status active';
    metricsSection.style.display = 'block';
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    status.textContent = 'Inactive';
    status.className = 'status inactive';
    metricsSection.style.display = 'none';
  }
}

// Update the tiny status buttons for audio and play/pause state
function setTinyButton(btn, type, label) {
  if (!btn) return;
  btn.textContent = label;
  btn.classList.remove('active', 'inactive', 'neutral');
  if (type === 'active') btn.classList.add('active');
  else if (type === 'inactive') btn.classList.add('inactive');
  else btn.classList.add('neutral');
}

function updateVideoStatus() {
  const audioBtn = document.getElementById('audioStatusBtn');
  const playBtn = document.getElementById('playPauseBtn');
  const refreshBtn = document.getElementById('refreshStatusBtn');

  // Default to neutral state while we query
  setTinyButton(audioBtn, 'neutral', 'Audio: —');
  setTinyButton(playBtn, 'neutral', 'State: —');

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      setTinyButton(audioBtn, 'neutral', 'Audio: —');
      setTinyButton(playBtn, 'neutral', 'State: —');
      return;
    }

    try {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getVideoStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script not available / no video
          setTinyButton(audioBtn, 'neutral', 'Audio: —');
          setTinyButton(playBtn, 'neutral', 'State: —');
          return;
        }

        if (!response || !response.found) {
          setTinyButton(audioBtn, 'neutral', 'Audio: —');
          setTinyButton(playBtn, 'neutral', 'State: —');
          return;
        }

        // audio
        if (response.muted) {
          setTinyButton(audioBtn, 'inactive', 'Muted');
        } else {
          setTinyButton(audioBtn, 'active', 'Unmuted');
        }

        // play/pause
        if (response.paused) {
          setTinyButton(playBtn, 'inactive', 'Paused');
        } else {
          setTinyButton(playBtn, 'active', 'Playing');
        }
      });
    } catch (err) {
      console.error('[Football Ad Muter Popup] Error requesting video status:', err);
      setTinyButton(audioBtn, 'neutral', 'Audio: —');
      setTinyButton(playBtn, 'neutral', 'State: —');
    }
  });
}

// Wire refresh button on popup
document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refreshStatusBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      updateVideoStatus();
      // provide a small visual feedback by briefly toggling neutral style
      refreshBtn.classList.add('active');
      setTimeout(() => refreshBtn.classList.remove('active'), 250);
    });
  }
});

function loadLogs() {
  chrome.storage.sync.get(['analysisLogs'], (result) => {
    const logs = result.analysisLogs || [];
    console.log('[Football Ad Muter Popup] Loading', logs.length, 'logs from storage');
    displayLogs(logs);
  });
}

function loadActivityLogs() {
  chrome.storage.sync.get(['activityLogs'], (result) => {
    const logs = result.activityLogs || [];
    console.log('[Football Ad Muter Popup] Loading', logs.length, 'activity logs from storage');
    displayActivityLogs(logs);
  });
}

function displayActivityLogs(logs) {
  const container = document.getElementById('activityContainer');
  
  if (logs.length === 0) {
    container.innerHTML = '<div class="no-logs">No activity yet. Start monitoring to see live updates.</div>';
    return;
  }
  
  // Show most recent logs first (reverse chronological order)
  const recentLogs = logs.slice(-50).reverse();
  
  container.innerHTML = recentLogs.map((log, index) => {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const typeClass = `activity-${log.type || 'info'}`;
    
    // Check if this entry should be expanded
    const logKey = `${log.timestamp}-${log.message}`;
    const isExpanded = expandedActivityEntries.has(logKey);
    const expandedClass = isExpanded ? 'expanded' : '';
    
    let imageSection = '';
    if (log.imageUrl) {
      // Store image URL as data attribute
      imageSection = `
        <div class="log-thumbnail" data-activity-image-url="${escapeHtml(log.imageUrl)}" title="Click to view full size" style="cursor: pointer; margin-top: 6px;">
          <img src="${escapeHtml(log.imageUrl)}" alt="Video capture" style="max-width: 100%; height: auto; border-radius: 3px;" />
        </div>
        <div class="log-thumbnail-caption">📷 Click image to view full size</div>
      `;
    }
    
    return `
      <div class="activity-entry" data-activity-key="${escapeHtml(logKey)}" title="Click to expand/collapse">
        <span class="activity-time">${timestamp}</span>
        <span class="activity-message ${typeClass} ${expandedClass}" data-activity-key="${escapeHtml(logKey)}">${escapeHtml(log.message)}</span>
        ${imageSection}
      </div>
    `;
  }).join('');
  
  // Auto-scroll to bottom (most recent)
  container.scrollTop = 0;
  
  // Setup event listeners for activity entries
  setupActivityEventListeners();
}

function displayLogs(logs) {
  const container = document.getElementById('logsContainer');

  console.log('[Football Ad Muter Popup] Displaying analysis logs, total count:', logs.length);

  if (logs.length === 0) {
    container.innerHTML = '<div class="no-logs">No analysis results yet. Start monitoring to see results.</div>';
    return;
  }

  // Show most recent logs first (reverse chronological order)
  const recentLogs = logs.slice(-20).reverse();
  console.log('[Football Ad Muter Popup] Showing', recentLogs.length, 'recent analysis logs');

  container.innerHTML = recentLogs.map((log, index) => {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const resultClass = log.result === true ? 'log-gameplay' : 
                       log.result === false ? 'log-ad' : 'log-error';
    const resultText = log.result === true ? '✓ Gameplay detected' :
                      log.result === false ? '⚠ Advertisement detected' :
                      'System message';

    let actionText = '';
    if (log.action) {
      actionText = `<div class="log-action">${log.action}</div>`;
    }

    let imageSection = '';
    if (log.imageUrl) {
      // Store image URL as data attribute
      imageSection = `
        <div class="log-thumbnail" data-image-url="${escapeHtml(log.imageUrl)}" title="Click to view full size" style="cursor: pointer;">
          <img src="${escapeHtml(log.imageUrl)}" alt="Video capture" />
        </div>
        <div class="log-thumbnail-caption">📷 Click image to view full size (or right-click → Open in new tab)</div>
      `;
    }

    let llmResponseSection = '';
    if (log.llmResponse) {
      // Create unique key for this LLM response
      const responseKey = `${log.timestamp}-llm`;
      const isExpanded = expandedLLMResponses.has(responseKey);
      const displayStyle = isExpanded ? 'block' : 'none';
      
      const hasError = log.llmResponse.error;
      const statusText = hasError ? '❌ Error' : '✅ Success';
      const statusClass = hasError ? 'log-error' : 'log-gameplay';
      
      llmResponseSection = `
        <div class="llm-response-section">
          <div class="llm-toggle" data-response-key="${escapeHtml(responseKey)}" style="cursor: pointer; color: #007bff; font-size: 11px; margin-top: 4px;">
            🤖 LLM Response ${statusText} (click to ${isExpanded ? 'collapse' : 'expand'})
          </div>
          <div data-response-key="${escapeHtml(responseKey)}" class="llm-details" style="display: ${displayStyle}; background: #f8f9fa; padding: 8px; margin-top: 4px; border-radius: 3px; font-size: 11px; border-left: 3px solid #007bff;">
            ${formatLLMResponse(log.llmResponse)}
          </div>
        </div>
      `;
    }

    return `
      <div class="log-entry" data-log-timestamp="${log.timestamp}" style="cursor: pointer;" title="Click to expand/collapse details">
        <div class="log-timestamp">${timestamp}</div>
        <div class="log-result ${resultClass}">${resultText}</div>
        ${actionText}
        ${imageSection}
        ${llmResponseSection}
      </div>
    `;
  }).join('');
  
  // Auto-scroll to top to show most recent analysis
  container.scrollTop = 0;
  console.log('[Football Ad Muter Popup] Analysis logs displayed and scrolled to top');
  
  // Add event listeners for log entries using event delegation
  setupLogEventListeners();
}

function formatLLMResponse(llmResponse) {
  if (llmResponse.error) {
    return `
      <div style="color: #dc3545;">
        <strong>Error:</strong> ${escapeHtml(llmResponse.error)}
      </div>
    `;
  }

  let html = '';
  
  if (llmResponse.model) {
    html += `<div style="margin-bottom: 4px;"><strong>Model:</strong> ${escapeHtml(llmResponse.model)}</div>`;
  }
  
  if (llmResponse.result !== undefined) {
    const resultText = llmResponse.result === true ? 'Gameplay' : 
                      llmResponse.result === false ? 'Advertisement' : 'Unknown';
    const resultColor = llmResponse.result === true ? '#28a745' : 
                       llmResponse.result === false ? '#dc3545' : '#ffc107';
    html += `<div style="margin-bottom: 4px;"><strong>Analysis Result:</strong> <span style="color: ${resultColor}; font-weight: 600;">${resultText}</span></div>`;
  }
  
  if (llmResponse.response) {
    const responseText = typeof llmResponse.response === 'string' 
      ? llmResponse.response 
      : llmResponse.response.message?.content || JSON.stringify(llmResponse.response);
    
    html += `<div style="margin-top: 6px; margin-bottom: 4px;"><strong>LLM Raw Response:</strong></div>`;
    html += `<div style="background: #fff; padding: 6px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 10px; white-space: pre-wrap; max-height: 150px; overflow-y: auto; border: 1px solid #dee2e6;">${escapeHtml(responseText)}</div>`;
  }
  
  if (llmResponse.processingTime) {
    html += `<div style="margin-top: 6px; color: #666; font-size: 10px;"><strong>Processing Time:</strong> ${llmResponse.processingTime}ms</div>`;
  }
  
  return html || '<div style="color: #999;">No additional details available</div>';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Setup event listeners for log entries
function setupLogEventListeners() {
  const container = document.getElementById('logsContainer');
  
  // Remove old listener if exists
  const newContainer = container.cloneNode(true);
  container.parentNode.replaceChild(newContainer, container);
  
  // Add event delegation
  document.getElementById('logsContainer').addEventListener('click', (e) => {
    // Handle thumbnail click (open image)
    const thumbnail = e.target.closest('.log-thumbnail');
    if (thumbnail) {
      const imageUrl = thumbnail.dataset.imageUrl;
      if (imageUrl) {
        openImageInNewTab(imageUrl);
      }
      return;
    }
    
    // Handle LLM toggle click
    const llmToggle = e.target.closest('.llm-toggle');
    if (llmToggle) {
      const responseKey = llmToggle.dataset.responseKey;
      if (responseKey) {
        // Find the details element with matching key
        const detailsElement = document.querySelector(`.llm-details[data-response-key="${responseKey}"]`);
        if (detailsElement) {
          const isVisible = detailsElement.style.display !== 'none';
          detailsElement.style.display = isVisible ? 'none' : 'block';
          
          // Update the set of expanded responses
          if (isVisible) {
            expandedLLMResponses.delete(responseKey);
          } else {
            expandedLLMResponses.add(responseKey);
          }
          
          // Update toggle text
          const hasError = llmToggle.textContent.includes('❌ Error');
          const statusText = hasError ? '❌ Error' : '✅ Success';
          llmToggle.textContent = `🤖 LLM Response ${statusText} (click to ${isVisible ? 'expand' : 'collapse'})`;
        }
      }
      return;
    }
  });
}

// Function to open image in new tab
function openImageInNewTab(imageUrl) {
  try {
    // Open the base64 image data in a new tab
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Video Capture - Football Ad Muter</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              background: #222;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            img {
              max-width: 100%;
              height: auto;
              box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            }
          </style>
        </head>
        <body>
          <img src="${imageUrl}" alt="Video Capture" />
        </body>
        </html>
      `);
      newWindow.document.close();
    } else {
      console.error('[Football Ad Muter Popup] Failed to open new window - popup blocker?');
      alert('Unable to open image. Please allow popups for this extension or right-click the image and select "Open in new tab".');
    }
  } catch (error) {
    console.error('[Football Ad Muter Popup] Error opening image:', error);
    alert('Error opening image: ' + error.message);
  }
}

// Setup event listeners for activity entries
function setupActivityEventListeners() {
  const container = document.getElementById('activityContainer');
  
  // Remove old listener if exists
  const newContainer = container.cloneNode(true);
  container.parentNode.replaceChild(newContainer, container);
  
  // Add event delegation
  document.getElementById('activityContainer').addEventListener('click', (e) => {
    // Handle thumbnail click (open image)
    const thumbnail = e.target.closest('[data-activity-image-url]');
    if (thumbnail) {
      const imageUrl = thumbnail.dataset.activityImageUrl;
      if (imageUrl) {
        openImageInNewTab(imageUrl);
      }
      return;
    }
    
    // Handle activity entry click (toggle message expansion)
    const activityEntry = e.target.closest('.activity-entry');
    if (activityEntry) {
      const logKey = activityEntry.dataset.activityKey;
      const messageElement = activityEntry.querySelector('.activity-message');
      if (messageElement && logKey) {
        // Toggle expanded class
        messageElement.classList.toggle('expanded');
        
        // Update the set of expanded entries
        if (messageElement.classList.contains('expanded')) {
          expandedActivityEntries.add(logKey);
        } else {
          expandedActivityEntries.delete(logKey);
        }
      }
    }
  });
}

// Listen for log updates from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Football Ad Muter Popup] Received message:', request);
  try {
    if (request.action === 'logUpdate') {
      console.log('[Football Ad Muter Popup] Analysis log update received, refreshing display');
      loadLogs();
      sendResponse({ status: 'received' });
    } else if (request.action === 'activityUpdate') {
      console.log('[Football Ad Muter Popup] Activity log update received, refreshing display');
      loadActivityLogs();
      sendResponse({ status: 'received' });
    }
  } catch (error) {
    console.error('[Football Ad Muter Popup] Error handling message:', error);
  }
  return false; // Synchronous response
});
// Popup script

let isMonitoring = false;

// Load current settings
chrome.storage.sync.get(['ollamaUrl', 'checkInterval', 'isEnabled', 'analysisLogs'], (result) => {
  console.log('[Football Ad Muter Popup] Loading settings:', result);
  document.getElementById('ollamaUrl').value = result.ollamaUrl || 'http://localhost:11434';
  // Convert milliseconds to seconds for display
  const intervalMs = result.checkInterval || 3000;
  document.getElementById('checkInterval').value = intervalMs / 1000;
  isMonitoring = result.isEnabled || false;
  console.log('[Football Ad Muter Popup] Monitoring state:', isMonitoring);
  updateUI();
  loadLogs();
  
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
  console.log('[Football Ad Muter Popup] Clear logs button clicked');
  chrome.storage.sync.set({ analysisLogs: [] }, () => {
    console.log('[Football Ad Muter Popup] Logs cleared from storage');
    loadLogs();
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
  
  if (isMonitoring) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    status.textContent = 'Monitoring Active';
    status.className = 'status active';
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    status.textContent = 'Inactive';
    status.className = 'status inactive';
  }
}

function loadLogs() {
  chrome.storage.sync.get(['analysisLogs'], (result) => {
    const logs = result.analysisLogs || [];
    console.log('[Football Ad Muter Popup] Loading', logs.length, 'logs from storage');
    displayLogs(logs);
  });
}

function displayLogs(logs) {
  const container = document.getElementById('logsContainer');

  console.log('[Football Ad Muter Popup] Displaying logs, total count:', logs.length);

  if (logs.length === 0) {
    container.innerHTML = '<div class="no-logs">No logs available. Start monitoring to see analysis results.</div>';
    return;
  }

  // Show most recent logs first (reverse chronological order)
  const recentLogs = logs.slice(-20).reverse();
  console.log('[Football Ad Muter Popup] Showing', recentLogs.length, 'recent logs');

  container.innerHTML = recentLogs.map(log => {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const resultClass = log.result === true ? 'log-gameplay' : 
                       log.result === false ? 'log-ad' : 'log-error';
    const resultText = log.result === true ? '✓ Gameplay detected' :
                      log.result === false ? '⚠ Advertisement detected' :
                      'Nothing to report Yet';

    let actionText = '';
    if (log.action) {
      actionText = `<div class="log-action">${log.action}</div>`;
    }

    let imageLink = '';
    if (log.imageUrl) {
      imageLink = `<div class="log-image"><a href="${log.imageUrl}" target="_blank">View Image</a></div>`;
    }

    return `
      <div class="log-entry">
        <div class="log-timestamp">${timestamp}</div>
        <div class="log-result ${resultClass}">${resultText}</div>
        ${actionText}
        ${imageLink}
      </div>
    `;
  }).join('');
}

// Listen for log updates from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Football Ad Muter Popup] Received message:', request);
  try {
    if (request.action === 'logUpdate') {
      console.log('[Football Ad Muter Popup] Log update received, refreshing display');
      loadLogs();
      sendResponse({ status: 'received' });
    }
  } catch (error) {
    console.error('[Football Ad Muter Popup] Error handling message:', error);
  }
  return false; // Synchronous response
});
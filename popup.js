// Popup script

let isMonitoring = false;

// Load current settings
chrome.storage.sync.get(['ollamaUrl', 'checkInterval', 'isEnabled', 'analysisLogs'], (result) => {
  console.log('[Football Ad Muter Popup] Loading settings:', result);
  document.getElementById('ollamaUrl').value = result.ollamaUrl || 'http://localhost:11434';
  document.getElementById('checkInterval').value = result.checkInterval || 3000;
  isMonitoring = result.isEnabled || false;
  console.log('[Football Ad Muter Popup] Monitoring state:', isMonitoring);
  updateUI();
  loadLogs();
  
  // Test background script connection
  chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
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
  const checkInterval = parseInt(document.getElementById('checkInterval').value);
  
  console.log('[Football Ad Muter Popup] Saving settings:', { ollamaUrl, checkInterval });
  
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
    
    return `
      <div class="log-entry">
        <div class="log-timestamp">${timestamp}</div>
        <div class="log-result ${resultClass}">${resultText}</div>
        ${actionText}
      </div>
    `;
  }).join('');
}

// Listen for log updates from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Football Ad Muter Popup] Received message:', request);
  if (request.action === 'logUpdate') {
    console.log('[Football Ad Muter Popup] Log update received, refreshing display');
    loadLogs();
  }
});
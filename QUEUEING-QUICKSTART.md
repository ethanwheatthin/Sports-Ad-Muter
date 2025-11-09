# Quick Start: API Queueing System

## What Changed?

Your extension now includes:
1. **Request Queue** - Prevents API overload by limiting concurrent requests
2. **Adaptive Sampling** - Intelligently decides when to capture frames
3. **Performance Metrics** - Real-time monitoring in the popup

## Installation

The system is automatically included. Just reload your extension:
1. Go to `chrome://extensions`
2. Click the refresh icon on "Football Ad Muter"
3. Reload any active video tabs

## How It Works

### Before (Old System)
```
Every 10 seconds → Capture frame → Send to API immediately
```
**Problems**: Could send requests while previous ones are still processing, overwhelming the API.

### After (New System)
```
Adaptive timer → Check if should capture → Queue request → 
Process when API ready → Adjust timing based on results
```
**Benefits**: Smart rate limiting, no API overload, better resource usage.

## Monitoring Performance

When monitoring is active, the popup shows:

```
Queue & API Performance:
├─ Queue: 0 pending, 1 active
├─ Dropped: 0 requests
├─ API Success: 100% (15/15)
├─ Avg Response: 2,453ms
└─ Sampling: 8.0s interval, normal mode
```

### What These Mean:

- **Pending**: Requests waiting to be processed
- **Active**: Requests currently being analyzed
- **Dropped**: Requests discarded (queue was full)
- **Success Rate**: Percentage of successful API calls
- **Avg Response**: How long API takes to respond
- **Interval**: Current time between captures
- **Mode**: Current strategy (normal/ad detected/stable gameplay)

## Sampling Modes Explained

### 🟢 Normal Mode
- Interval: ~8 seconds
- Used during regular gameplay with occasional checks

### 🔴 Ad Detected (Fast)
- Interval: ~3-5 seconds  
- Used when an ad is detected to quickly catch when it ends

### 🔵 Stable Gameplay
- Interval: ~10-15 seconds
- Used when content is stable and confirmed as gameplay

## Configuration Tips

### Default Settings (Recommended)
```
Check Interval: 10 seconds
Ollama URL: http://localhost:11434
```

These work well for most setups. The adaptive system will fine-tune automatically.

### For Slow Computer/API
Increase the check interval to 15-20 seconds to reduce load.

### For Fast Computer/API
You can decrease to 5-8 seconds for more responsive detection.

### Understanding the Metrics

#### Good Performance
```
Queue: 0 pending, 1 active
Dropped: 0 requests
API Success: 95-100%
Avg Response: < 3000ms
```

#### Warning Signs
```
Queue: 3+ pending
Dropped: > 5 requests
API Success: < 85%
Avg Response: > 5000ms
```

**If you see warnings:**
1. Increase check interval in settings
2. Close other programs using Ollama
3. Check if Ollama is running properly

## Benefits You'll See

1. **No More API Overload**: Requests are queued and rate-limited
2. **Better Battery Life**: Fewer unnecessary captures
3. **Faster Ad Detection**: Smart sampling during ads
4. **More Reliable**: Handles API slowdowns gracefully
5. **Transparent**: See exactly what's happening

## Common Scenarios

### Scenario 1: Live Sports Game
- System detects stable gameplay
- Reduces sampling to ~10-12 seconds
- Saves API calls during long plays

### Scenario 2: Commercial Break
- System detects ad
- Increases sampling to ~3-5 seconds
- Quickly catches when game resumes

### Scenario 3: API is Slow
- System detects slow response times
- Automatically increases intervals
- Prevents queue buildup

### Scenario 4: Halftime Show
- System may detect as "not gameplay"
- Maintains moderate sampling rate
- Adapts when game resumes

## Troubleshooting

### "Queue constantly full"
**Cause**: API too slow or too many requests
**Fix**: Increase check interval to 15-20 seconds

### "Dropped requests > 10"
**Cause**: Queue overflow from slow API
**Fix**: Decrease sampling frequency or check if Ollama is overloaded

### "API Success rate < 80%"
**Cause**: Ollama connection issues
**Fix**: Click "Test API Connection" button, check Ollama is running

### "Avg Response > 6000ms"
**Cause**: API is processing slowly
**Fix**: Normal for large models, consider using a smaller/faster model

## Advanced: Fine-Tuning

If you want to customize the queue behavior, edit these files:

**`request-queue.js`** - Queue configuration
```javascript
maxConcurrent: 2,        // Change to 1 or 3
maxQueueSize: 5,         // Increase if you want larger buffer
minTimeBetweenRequests: 2000  // Increase for more spacing
```

**`adaptive-sampler.js`** - Sampling intervals
```javascript
minInterval: 3000,       // Fastest sampling rate
maxInterval: 15000,      // Slowest sampling rate
normalInterval: 8000     // Default rate
```

## Summary

The new queueing system automatically manages API requests to prevent overload while maintaining effective ad detection. Monitor the metrics in the popup to see it working, and adjust settings only if you notice issues.

**Default settings work great for most users!** 🎉

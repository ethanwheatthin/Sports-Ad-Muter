# API Queueing System - Complete Guide

## Overview

The Football Ad Muter now includes a sophisticated API queueing and adaptive sampling system to prevent overloading the Ollama API while maintaining effective ad detection.

## System Architecture

### 1. **Request Queue Manager** (`request-queue.js`)
Handles all API requests with intelligent queueing and rate limiting.

**Key Features:**
- **Concurrency Control**: Limits simultaneous API calls (default: 2)
- **Queue Size Management**: Caps pending requests (default: 5)
- **Priority-Based Processing**: Higher priority during ads
- **Rate Limiting**: Minimum time between requests (default: 2 seconds)
- **Exponential Backoff**: Auto-adjusts on failures
- **Request Timeout**: Prevents hanging requests (30 seconds)

**Configuration Options:**
```javascript
{
  maxConcurrent: 2,           // Max simultaneous API calls
  maxQueueSize: 5,            // Max pending requests
  requestTimeout: 30000,      // 30 second timeout
  minTimeBetweenRequests: 2000 // 2 seconds between requests
}
```

### 2. **Adaptive Sampler** (`adaptive-sampler.js`)
Intelligently determines when to capture and analyze frames.

**Key Features:**
- **Dynamic Intervals**: Adjusts sampling rate based on content
- **Scene Change Detection**: Captures when content changes significantly
- **API Performance Adaptation**: Slows down if API is slow
- **State-Based Sampling**: Different rates for ads vs gameplay

**Sampling Strategies:**

#### During Normal Gameplay (Stable)
- **Interval**: 8-15 seconds
- **Logic**: If content is stable (consecutive similar frames) and gameplay is confirmed, reduces sampling rate to save API calls

#### During Advertisements
- **Interval**: 3-5 seconds
- **Logic**: Samples more frequently to detect when ad ends and gameplay resumes

#### During Scene Changes
- **Interval**: 5-8 seconds
- **Logic**: When visual content changes significantly, samples more frequently to ensure accurate detection

#### When API is Slow
- **Interval**: Increased by 1-2 seconds
- **Logic**: If API response time > 5 seconds, automatically reduces sampling rate

#### When API is Fast
- **Interval**: Decreased by 0.5 seconds
- **Logic**: If API response time < 2 seconds, allows more frequent sampling

**Configuration Options:**
```javascript
{
  minInterval: 3000,           // 3 seconds minimum
  maxInterval: 15000,          // 15 seconds maximum
  normalInterval: 8000,        // 8 seconds default
  sceneChangeThreshold: 0.15   // 15% change triggers capture
}
```

## Frame Sampling Strategy - Best Practices

### Why Not Sample Every Frame?

1. **API Overload**: Analyzing every frame (30-60 fps) would send 30-60 requests per second
2. **Processing Time**: Each Ollama analysis takes 2-5 seconds
3. **Cost Efficiency**: Most scenes are stable for several seconds
4. **Resource Usage**: Reduces CPU, memory, and network usage

### Optimal Sampling Rates

| Scenario | Recommended Interval | Reason |
|----------|---------------------|--------|
| **Stable Gameplay** | 10-15 seconds | Content rarely changes |
| **Active Gameplay** | 5-8 seconds | More scene transitions |
| **Advertisement** | 3-5 seconds | Quick detection of ad end |
| **Scene Transitions** | 3-5 seconds | Capture new content quickly |

### Scene Change Detection

The system uses a lightweight frame signature comparison:
- Samples an 8x8 grid of pixels from each frame
- Compares brightness and dominant colors
- Detects changes > 15% threshold
- Triggers immediate capture on significant changes

**Benefits:**
- Catches important transitions without constant sampling
- Works efficiently without full frame analysis
- Reduces false positives from minor changes (camera movement)

## Queue Processing Flow

```
1. Frame Captured
   ↓
2. Adaptive Sampler Checks
   - Should we analyze this frame?
   - Is scene change detected?
   ↓
3. Request Added to Queue
   - Assigned priority (ads = higher)
   - Given unique ID
   ↓
4. Queue Manager Processes
   - Checks concurrency limits
   - Applies rate limiting
   - Executes request
   ↓
5. Background Script Analyzes
   - Calls Ollama API
   - Tracks performance metrics
   ↓
6. Result Processed
   - Updates adaptive sampler
   - Adjusts future sampling rate
   - Mutes/unmutes video
```

## Performance Metrics

The system tracks comprehensive metrics visible in the popup:

- **Queue Length**: Current pending requests
- **Active Requests**: Currently processing
- **Dropped Requests**: Requests discarded (queue full)
- **Success Rate**: Percentage of successful API calls
- **Average Response Time**: Mean API processing time
- **Current Interval**: Active sampling interval
- **Sampling Mode**: Current strategy (normal/ad detected/stable)

## Configuration Recommendations

### For Fast API (< 2 seconds response)
```javascript
RequestQueue: {
  maxConcurrent: 3,
  maxQueueSize: 5,
  minTimeBetweenRequests: 1000
}

AdaptiveSampler: {
  minInterval: 2000,
  normalInterval: 5000,
  maxInterval: 10000
}
```

### For Slow API (> 5 seconds response)
```javascript
RequestQueue: {
  maxConcurrent: 1,
  maxQueueSize: 3,
  minTimeBetweenRequests: 3000
}

AdaptiveSampler: {
  minInterval: 5000,
  normalInterval: 10000,
  maxInterval: 20000
}
```

### For Resource-Constrained Systems
```javascript
RequestQueue: {
  maxConcurrent: 1,
  maxQueueSize: 2,
  minTimeBetweenRequests: 5000
}

AdaptiveSampler: {
  minInterval: 8000,
  normalInterval: 12000,
  maxInterval: 20000
}
```

## Benefits of This Approach

### 1. **API Protection**
- Prevents overwhelming Ollama with requests
- Respects rate limits automatically
- Reduces server load

### 2. **Efficient Resource Usage**
- Captures only when necessary
- Adapts to content changes
- Minimizes CPU and memory usage

### 3. **Improved Accuracy**
- Focuses on important frames
- Reduces noise from similar frames
- Better detection of transitions

### 4. **Resilience**
- Handles API failures gracefully
- Exponential backoff on errors
- Queue prevents request loss

### 5. **User Experience**
- Real-time performance metrics
- Transparent queue status
- Adaptive to video content

## Monitoring and Debugging

### Check Queue Status
The popup displays real-time metrics when monitoring is active:
- Queue depth and active requests
- Success rate and dropped requests
- Average API response time
- Current sampling interval and mode

### Console Logging
Detailed logging in browser console:
```javascript
[RequestQueue] Request enqueued: {...}
[RequestQueue] Processing request: {...}
[AdaptiveSampler] Scene change detected!
[AdaptiveSampler] Strategy updated: {...}
```

### Common Issues and Solutions

**Issue**: Queue constantly full, requests being dropped
**Solution**: Reduce `maxConcurrent` or increase `minTimeBetweenRequests`

**Issue**: Too slow to detect ad ends
**Solution**: Decrease `minInterval` in AdaptiveSampler

**Issue**: API timeouts
**Solution**: Increase `requestTimeout` or reduce sampling frequency

**Issue**: High CPU usage
**Solution**: Increase intervals, reduce `maxConcurrent`

## Future Enhancements

Potential improvements to consider:

1. **Machine Learning Integration**: Learn optimal intervals per streaming service
2. **Bandwidth Detection**: Adjust based on network speed
3. **Multi-Model Support**: Queue different models for different tasks
4. **Predictive Sampling**: Anticipate ads based on patterns
5. **Custom Priority Rules**: User-defined priority settings

## Summary

The queueing system provides intelligent, adaptive frame analysis that:
- **Protects** your Ollama API from overload
- **Optimizes** resource usage through smart sampling
- **Maintains** effective ad detection
- **Adapts** to content and API performance in real-time

Start with the default settings and monitor the metrics in the popup. Adjust configuration based on your specific API performance and requirements.

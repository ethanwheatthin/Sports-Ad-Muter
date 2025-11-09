// Adaptive Frame Sampling Strategy
// Intelligently determines when to capture and analyze frames

class AdaptiveSampler {
  constructor(options = {}) {
    // Configuration
    this.minInterval = options.minInterval || 3000; // 3 seconds minimum
    this.maxInterval = options.maxInterval || 15000; // 15 seconds maximum
    this.normalInterval = options.normalInterval || 8000; // 8 seconds normal
    this.sceneChangeThreshold = options.sceneChangeThreshold || 0.15; // 15% change
    
    // State tracking
    this.lastCaptureTime = 0;
    this.lastFrameData = null;
    this.currentInterval = this.normalInterval;
    this.consecutiveSimilarFrames = 0;
    this.lastAnalysisResult = null;
    this.isAdDetected = false;
    this.gameplayConfidence = 0;
    
    // Statistics
    this.stats = {
      totalCaptures: 0,
      skippedDueToSimilarity: 0,
      sceneChangesDetected: 0,
      adaptiveIntervalChanges: 0
    };
    
    console.log('[AdaptiveSampler] Initialized with config:', {
      minInterval: this.minInterval,
      maxInterval: this.maxInterval,
      normalInterval: this.normalInterval,
      sceneChangeThreshold: this.sceneChangeThreshold
    });
  }
  
  // Determine if we should capture a frame now
  shouldCaptureFrame(currentTime) {
    const timeSinceLastCapture = currentTime - this.lastCaptureTime;
    
    // Enforce minimum interval
    if (timeSinceLastCapture < this.minInterval) {
      return false;
    }
    
    // Check if we've reached our adaptive interval
    if (timeSinceLastCapture >= this.currentInterval) {
      console.log('[AdaptiveSampler] Capture triggered by interval:', {
        interval: this.currentInterval,
        timeSinceLastCapture: timeSinceLastCapture
      });
      return true;
    }
    
    return false;
  }
  
  // Analyze frame similarity to detect scene changes
  async analyzeFrameSimilarity(canvas) {
    if (!this.lastFrameData) {
      // First frame - always capture
      this.lastFrameData = this.extractFrameSignature(canvas);
      return { similar: false, similarity: 0 };
    }
    
    const currentSignature = this.extractFrameSignature(canvas);
    const similarity = this.compareSignatures(this.lastFrameData, currentSignature);
    
    console.log('[AdaptiveSampler] Frame similarity:', (similarity * 100).toFixed(1) + '%');
    
    const isSimilar = similarity > (1 - this.sceneChangeThreshold);
    
    if (isSimilar) {
      this.consecutiveSimilarFrames++;
      this.stats.skippedDueToSimilarity++;
    } else {
      this.consecutiveSimilarFrames = 0;
      this.stats.sceneChangesDetected++;
      console.log('[AdaptiveSampler] Scene change detected!');
    }
    
    this.lastFrameData = currentSignature;
    
    return { similar: isSimilar, similarity: similarity };
  }
  
  // Extract a lightweight signature from the frame for comparison
  extractFrameSignature(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Sample a grid of pixels (e.g., 8x8 grid)
    const gridSize = 8;
    const stepX = Math.floor(width / gridSize);
    const stepY = Math.floor(height / gridSize);
    const signature = [];
    
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const pixelX = x * stepX + Math.floor(stepX / 2);
        const pixelY = y * stepY + Math.floor(stepY / 2);
        
        const imageData = ctx.getImageData(pixelX, pixelY, 1, 1);
        const [r, g, b] = imageData.data;
        
        // Calculate brightness and dominant color
        const brightness = (r + g + b) / 3;
        const dominantColor = r > g && r > b ? 'r' : g > b ? 'g' : 'b';
        
        signature.push({ brightness, dominantColor });
      }
    }
    
    return signature;
  }
  
  // Compare two frame signatures
  compareSignatures(sig1, sig2) {
    if (!sig1 || !sig2 || sig1.length !== sig2.length) {
      return 0;
    }
    
    let totalDifference = 0;
    
    for (let i = 0; i < sig1.length; i++) {
      // Compare brightness
      const brightnessDiff = Math.abs(sig1[i].brightness - sig2[i].brightness) / 255;
      
      // Compare dominant color (0 if same, 0.5 if different)
      const colorDiff = sig1[i].dominantColor === sig2[i].dominantColor ? 0 : 0.5;
      
      // Weighted difference
      totalDifference += (brightnessDiff * 0.7 + colorDiff * 0.3);
    }
    
    // Return similarity score (1 = identical, 0 = completely different)
    const averageDifference = totalDifference / sig1.length;
    return 1 - averageDifference;
  }
  
  // Update sampling strategy based on analysis results
  updateStrategy(analysisResult) {
    this.lastAnalysisResult = analysisResult;
    
    if (analysisResult.result === false) {
      // Advertisement detected
      if (!this.isAdDetected) {
        console.log('[AdaptiveSampler] Ad detected - increasing sampling rate');
        this.isAdDetected = true;
        this.gameplayConfidence = 0;
        
        // Check more frequently during ads (to detect end of ad quickly)
        this.currentInterval = this.minInterval;
        this.stats.adaptiveIntervalChanges++;
      }
    } else if (analysisResult.result === true) {
      // Gameplay detected
      this.isAdDetected = false;
      this.gameplayConfidence = Math.min(this.gameplayConfidence + 1, 5);
      
      // If we're confident it's gameplay and frames are similar, slow down
      if (this.gameplayConfidence >= 3 && this.consecutiveSimilarFrames > 2) {
        console.log('[AdaptiveSampler] Stable gameplay - decreasing sampling rate');
        this.currentInterval = Math.min(
          this.currentInterval + 2000,
          this.maxInterval
        );
        this.stats.adaptiveIntervalChanges++;
      } else if (this.consecutiveSimilarFrames === 0) {
        // Scene changed during gameplay - sample more frequently temporarily
        console.log('[AdaptiveSampler] Scene change during gameplay - maintaining higher rate');
        this.currentInterval = this.normalInterval;
      }
    }
    
    // Adapt based on API performance
    if (analysisResult.processingTime) {
      if (analysisResult.processingTime > 5000) {
        // API is slow - reduce sampling rate
        console.log('[AdaptiveSampler] API slow - reducing sampling rate');
        this.currentInterval = Math.min(
          this.currentInterval + 1000,
          this.maxInterval
        );
      } else if (analysisResult.processingTime < 2000 && this.currentInterval > this.minInterval) {
        // API is fast - we can sample more frequently if needed
        console.log('[AdaptiveSampler] API fast - allowing higher sampling rate');
        this.currentInterval = Math.max(
          this.currentInterval - 500,
          this.minInterval
        );
      }
    }
    
    console.log('[AdaptiveSampler] Strategy updated:', {
      currentInterval: this.currentInterval,
      isAdDetected: this.isAdDetected,
      gameplayConfidence: this.gameplayConfidence,
      consecutiveSimilarFrames: this.consecutiveSimilarFrames
    });
  }
  
  // Mark that a frame was captured
  markCapture() {
    this.lastCaptureTime = Date.now();
    this.stats.totalCaptures++;
  }
  
  // Reset the sampler state
  reset() {
    console.log('[AdaptiveSampler] Resetting state');
    this.lastCaptureTime = 0;
    this.lastFrameData = null;
    this.currentInterval = this.normalInterval;
    this.consecutiveSimilarFrames = 0;
    this.lastAnalysisResult = null;
    this.isAdDetected = false;
    this.gameplayConfidence = 0;
  }
  
  // Get current status
  getStatus() {
    return {
      currentInterval: this.currentInterval,
      isAdDetected: this.isAdDetected,
      gameplayConfidence: this.gameplayConfidence,
      consecutiveSimilarFrames: this.consecutiveSimilarFrames,
      timeSinceLastCapture: Date.now() - this.lastCaptureTime,
      stats: { ...this.stats }
    };
  }
  
  // Get statistics
  getStats() {
    const totalPossibleCaptures = this.stats.totalCaptures + this.stats.skippedDueToSimilarity;
    const captureRate = totalPossibleCaptures > 0 
      ? (this.stats.totalCaptures / totalPossibleCaptures * 100).toFixed(1)
      : 0;
    
    return {
      ...this.stats,
      captureRate: captureRate + '%',
      averageInterval: this.currentInterval
    };
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.AdaptiveSampler = AdaptiveSampler;
}

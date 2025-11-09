// Request Queue Manager for API calls
// Handles queueing, prioritization, and rate limiting of analysis requests

class RequestQueue {
  constructor(options = {}) {
    // Configuration
    this.maxConcurrent = options.maxConcurrent || 2; // Max simultaneous API calls
    this.maxQueueSize = options.maxQueueSize || 5; // Max pending requests
    this.requestTimeout = options.requestTimeout || 30000; // 30 seconds
    this.minTimeBetweenRequests = options.minTimeBetweenRequests || 1000; // 1 second
    
    // State
    this.queue = [];
    this.activeRequests = 0;
    this.lastRequestTime = 0;
    this.consecutiveFailures = 0;
    this.isProcessing = false;
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      droppedRequests: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0
    };
    
    console.log('[RequestQueue] Initialized with config:', {
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
      requestTimeout: this.requestTimeout,
      minTimeBetweenRequests: this.minTimeBetweenRequests
    });
  }
  
  // Add a request to the queue
  enqueue(request) {
    // Check if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      console.warn('[RequestQueue] Queue full, dropping oldest request');
      const dropped = this.queue.shift(); // Remove oldest
      this.stats.droppedRequests++;
      
      if (dropped.onError) {
        dropped.onError(new Error('Request dropped - queue full'));
      }
    }
    
    // Add timestamp and ID
    request.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    request.timestamp = Date.now();
    request.priority = request.priority || 1;
    
    this.queue.push(request);
    this.stats.totalRequests++;
    
    console.log('[RequestQueue] Request enqueued:', {
      id: request.id,
      priority: request.priority,
      queueLength: this.queue.length,
      activeRequests: this.activeRequests
    });
    
    // Start processing if not already running
    this.processQueue();
    
    return request.id;
  }
  
  // Process the queue
  async processQueue() {
    // Prevent multiple simultaneous processing loops
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
        // Check rate limiting
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.minTimeBetweenRequests) {
          const waitTime = this.minTimeBetweenRequests - timeSinceLastRequest;
          console.log('[RequestQueue] Rate limiting - waiting', waitTime, 'ms');
          await this.delay(waitTime);
        }
        
        // Exponential backoff on consecutive failures
        if (this.consecutiveFailures > 0) {
          const backoffTime = Math.min(5000, 1000 * Math.pow(2, this.consecutiveFailures - 1));
          console.log('[RequestQueue] Backoff after failures:', backoffTime, 'ms');
          await this.delay(backoffTime);
        }
        
        // Get highest priority request
        this.queue.sort((a, b) => b.priority - a.priority);
        const request = this.queue.shift();
        
        if (!request) break;
        
        // Process the request
        this.activeRequests++;
        this.lastRequestTime = Date.now();
        
        console.log('[RequestQueue] Processing request:', {
          id: request.id,
          priority: request.priority,
          activeRequests: this.activeRequests,
          remainingInQueue: this.queue.length
        });
        
        // Execute asynchronously without blocking queue processing
        this.executeRequest(request).catch(error => {
          console.error('[RequestQueue] Request execution error:', error);
        });
      }
    } finally {
      this.isProcessing = false;
      
      // If there are still items in queue, continue processing
      if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }
  
  // Execute a single request
  async executeRequest(request) {
    const startTime = Date.now();
    
    try {
      console.log('[RequestQueue] Executing request:', request.id);
      
      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), this.requestTimeout);
      });
      
      // Execute the request handler with timeout
      const resultPromise = request.handler(request.data);
      const result = await Promise.race([resultPromise, timeoutPromise]);
      
      // Success
      const processingTime = Date.now() - startTime;
      this.stats.completedRequests++;
      this.stats.totalProcessingTime += processingTime;
      this.stats.averageProcessingTime = 
        this.stats.totalProcessingTime / this.stats.completedRequests;
      this.consecutiveFailures = 0;
      
      console.log('[RequestQueue] Request completed:', {
        id: request.id,
        processingTime: processingTime,
        averageTime: Math.round(this.stats.averageProcessingTime)
      });
      
      if (request.onSuccess) {
        request.onSuccess(result);
      }
      
    } catch (error) {
      // Failure
      const processingTime = Date.now() - startTime;
      this.stats.failedRequests++;
      this.consecutiveFailures++;
      
      console.error('[RequestQueue] Request failed:', {
        id: request.id,
        error: error.message,
        processingTime: processingTime,
        consecutiveFailures: this.consecutiveFailures
      });
      
      if (request.onError) {
        request.onError(error);
      }
      
    } finally {
      this.activeRequests--;
      
      // Continue processing queue
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 0);
      }
    }
  }
  
  // Clear the queue
  clear() {
    console.log('[RequestQueue] Clearing queue -', this.queue.length, 'requests dropped');
    
    // Notify all pending requests
    this.queue.forEach(request => {
      if (request.onError) {
        request.onError(new Error('Queue cleared'));
      }
    });
    
    this.stats.droppedRequests += this.queue.length;
    this.queue = [];
  }
  
  // Get queue status
  getStatus() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent,
      consecutiveFailures: this.consecutiveFailures,
      stats: { ...this.stats }
    };
  }
  
  // Update configuration
  updateConfig(options) {
    if (options.maxConcurrent !== undefined) {
      this.maxConcurrent = options.maxConcurrent;
    }
    if (options.maxQueueSize !== undefined) {
      this.maxQueueSize = options.maxQueueSize;
    }
    if (options.requestTimeout !== undefined) {
      this.requestTimeout = options.requestTimeout;
    }
    if (options.minTimeBetweenRequests !== undefined) {
      this.minTimeBetweenRequests = options.minTimeBetweenRequests;
    }
    
    console.log('[RequestQueue] Configuration updated:', {
      maxConcurrent: this.maxConcurrent,
      maxQueueSize: this.maxQueueSize,
      requestTimeout: this.requestTimeout,
      minTimeBetweenRequests: this.minTimeBetweenRequests
    });
  }
  
  // Reset statistics
  resetStats() {
    console.log('[RequestQueue] Resetting statistics');
    this.stats = {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      droppedRequests: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0
    };
    this.consecutiveFailures = 0;
  }
  
  // Helper delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.RequestQueue = RequestQueue;
}


// swapQueue.js
class SwapQueueManager {
    constructor() {
      this.pendingSwaps = [];
      this.currentBatchId = 1;
      this.processingBatch = false;
    }
  
    // Add a swap to the queue
    addSwap(swap) {
      // In a real enclave, this would decrypt the swap first
      // For now, we assume it's already decrypted
      
      const swapWithTimestamp = {
        ...swap,
        timestamp: Date.now() // Use current time as timestamp
      };
      
      this.pendingSwaps.push(swapWithTimestamp);
      console.log(`Swap added to queue: ${JSON.stringify(swapWithTimestamp)}`);
      
      return { 
        success: true, 
        message: "Swap added to queue",
        position: this.pendingSwaps.length 
      };
    }
  
    // Get swaps ordered by timestamp
    getOrderedSwaps() {
      return [...this.pendingSwaps].sort((a, b) => a.timestamp - b.timestamp);
    }
  
    // Clear swaps that were processed
    clearProcessedSwaps(swaps) {
      const swapIds = swaps.map(s => s.id);
      this.pendingSwaps = this.pendingSwaps.filter(s => !swapIds.includes(s.id));
    }
  }
  
  module.exports = new SwapQueueManager();
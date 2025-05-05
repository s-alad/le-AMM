// batchProcessor.js
const { ethers } = require('ethers');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const swapQueue = require('./swapQueue');

class BatchProcessor {
  constructor(contract) {
    this.contract = contract;
    this.processingBatch = false;
    this.nextBatchId = 1;
    this.batchHistory = {};
  }

  // Create a Merkle tree from swap intents
  createMerkleTree(swaps) {
    const leaves = swaps.map(swap => {
      // Format the swap intent according to the contract's expected format
      const abiCoder = new ethers.AbiCoder();
      
      const packedSwap = abiCoder.encode(
        ['address', 'bool', 'uint256', 'uint256', 'uint256'],
        [
          swap.user,
          swap.ethToToken,
          ethers.parseUnits(swap.amountIn.toString(), 18),
          ethers.parseUnits(swap.minAmountOut.toString(), 18),
          swap.timestamp
        ]
      );
      
      return ethers.keccak256(packedSwap);
    });
    
    const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const rootHash = merkleTree.getHexRoot();
    
    return {
      tree: merkleTree,
      root: rootHash,
      leaves,
      swaps
    };
  }

  // Commit a batch to the blockchain
  async commitBatch() {
    try {
      if (this.processingBatch) {
        return { success: false, message: "Already processing a batch" };
      }
      
      // Get ordered swaps
      const swaps = swapQueue.getOrderedSwaps();
      if (swaps.length === 0) {
        return { success: false, message: "No swaps to process" };
      }
      
      console.log("Creating Merkle tree for swaps:", swaps);
      // Create Merkle tree
      const batch = this.createMerkleTree(swaps);
      const batchId = this.nextBatchId++;
      
      console.log("Batch created. Root:", batch.root);
      console.log("Attempting to send commitBatchIntents transaction...");
      
      this.processingBatch = true;
      
      // Check contract and account
      console.log("Contract address:", this.contract.target);
      console.log("Sending from address:", await this.contract.runner.getAddress());
      
      // Call the contract's commitBatchIntents function
      const tx = await this.contract.commitBatchIntents(
        batch.root,
        swaps.length
      );
      
      console.log(`Batch ${batchId} submitted to mempool: ${tx.hash}`);
      
      // Wait for transaction to be mined
      console.log("Waiting for transaction confirmation...");
      const receipt = await tx.wait();
      
      if (receipt.status === 0) {
        console.error("Transaction failed on-chain");
        this.processingBatch = false;
        return { success: false, message: "Transaction failed on-chain", txHash: tx.hash };
      }
      
      console.log(`Batch ${batchId} confirmed in block ${receipt.blockNumber}`);
      
      // Store batch data for later execution
      this.batchHistory[batchId] = {
        ...batch,
        commitTx: tx.hash,
        commitTime: Date.now(),
        executed: false
      };
      
      // Schedule batch execution after the commitment delay
      setTimeout(() => {
        this.executeBatch(batchId).catch(error => {
          console.error(`Error executing batch ${batchId}:`, error);
        });
      }, 3 * 60 * 1000); // 3 minutes delay

      swapQueue.clearProcessedSwaps(swaps);
      this.processingBatch = false;
      
      return { 
        success: true, 
        batchId, 
        message: "Batch committed successfully",
        commitTx: tx.hash
      };
    } catch (error) {
      console.error(`Error committing batch:`, error);
      // Log detailed error object
      if (error.error) console.error("Inner error:", error.error);
      if (error.code) console.error("Error code:", error.code);
      if (error.reason) console.error("Error reason:", error.reason);
      
      this.processingBatch = false;
      return { success: false, message: error.message };
    }
  }

  // Execute a previously committed batch
  async executeBatch(batchId) {
    const batch = this.batchHistory[batchId];
    if (!batch || batch.executed) {
      return { success: false, message: "Invalid batch or already executed" };
    }
    
    try {
      // Generate proofs for each swap
      const proofs = batch.leaves.map((leaf, i) => batch.tree.getHexProof(leaf));
      
      // Prepare parameters for the batchSwap function
      const users = batch.swaps.map(s => s.user);
      const ethToTokenFlags = batch.swaps.map(s => s.ethToToken);
      const amountsIn = batch.swaps.map(s => 
        ethers.parseUnits(s.amountIn.toString(), 18)
      );
      const minAmountsOut = batch.swaps.map(s => 
        ethers.parseUnits(s.minAmountOut.toString(), 18)
      );
      
      // Call the contract's batchSwap function
      const tx = await this.contract.batchSwap(
        batchId,
        users,
        ethToTokenFlags,
        amountsIn,
        minAmountsOut,
        proofs
      );
      
      console.log(`Batch ${batchId} executed: ${tx.hash}`);
      
      // Update batch status
      this.batchHistory[batchId].executed = true;
      this.batchHistory[batchId].executeTx = tx.hash;
      
      // Clear processed swaps from queue
      swapQueue.clearProcessedSwaps(batch.swaps);
      
      this.processingBatch = false;
      
      return { 
        success: true, 
        message: "Batch executed successfully",
        executeTx: tx.hash
      };
    } catch (error) {
      console.error(`Error executing batch: ${error.message}`);
      this.processingBatch = false;
      return { success: false, message: error.message };
    }
  }

  // Start automatic batch processing
  startAutomaticProcessing(interval = 60000) {
    setInterval(async () => {
      if (!this.processingBatch && swapQueue.pendingSwaps.length > 0) {
        await this.commitBatch();
      }
    }, interval);
    
    console.log(`Automatic batch processing started (interval: ${interval}ms)`);
  }
}

module.exports = BatchProcessor;
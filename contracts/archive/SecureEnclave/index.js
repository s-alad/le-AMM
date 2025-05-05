// index.js
const express = require('express');
const { ethers } = require('ethers');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
require('dotenv').config();

const app = express();
app.use(express.json());

// This would be the contract ABI after compilation
const ABI = require('./SequencedAMM.json').abi; 
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.SEQUENCER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;

// Provider and wallet setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sequencer running on port ${PORT}`);
});

const swapQueue = require('./swapQueue');
const BatchProcessor = require('./batchProcessor');

const batchProcessor = new BatchProcessor(contract);

// Start automatic batch processing (commit a batch every minute if there are swaps)
batchProcessor.startAutomaticProcessing();

// Endpoint to submit a swap intent
app.post('/api/submit-swap', (req, res) => {
  try {
    const { user, ethToToken, amountIn, minAmountOut } = req.body;
    
    // Validate input
    if (!user || ethToToken === undefined || !amountIn || !minAmountOut) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required parameters" 
      });
    }
    
    // Add swap to queue
    const result = swapQueue.addSwap({
      id: Date.now().toString(), // Simple unique ID
      user,
      ethToToken,
      amountIn,
      minAmountOut
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Endpoint to get pending swaps
app.get('/api/pending-swaps', (req, res) => {
  res.json({ 
    success: true, 
    swaps: swapQueue.pendingSwaps,
    count: swapQueue.pendingSwaps.length
  });
});

// Endpoint to get batch status
app.get('/api/batch/:batchId', (req, res) => {
  const { batchId } = req.params;
  const batch = batchProcessor.batchHistory[batchId];
  
  if (!batch) {
    return res.status(404).json({ 
      success: false, 
      message: "Batch not found" 
    });
  }
  
  res.json({
    success: true,
    batchId,
    commitTx: batch.commitTx,
    executeTx: batch.executeTx,
    commitTime: batch.commitTime,
    executed: batch.executed,
    swapCount: batch.swaps.length
  });
});

// Endpoint to manually trigger batch processing
app.post('/api/process-batch', async (req, res) => {
  try {
    console.log("Starting batch processing...");
    const result = await batchProcessor.commitBatch();
    console.log("Batch processing result:", result);
    res.json(result);
  } catch (error) {
    console.error("BATCH PROCESSING ERROR:", error);
    // Log the full error details
    if (error.error) console.error("Inner error:", error.error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Endpoint to verify a swap was included in a batch
app.post('/api/verify-inclusion', async (req, res) => {
  try {
    const { batchId, user, ethToToken, amountIn, minAmountOut } = req.body;
    
    const batch = batchProcessor.batchHistory[batchId];
    if (!batch) {
      return res.status(404).json({ 
        success: false, 
        message: "Batch not found" 
      });
    }
    
    // Find the swap in the batch
    const swapIndex = batch.swaps.findIndex(s => 
      s.user === user && 
      s.ethToToken === ethToToken &&
      parseFloat(s.amountIn) === parseFloat(amountIn) &&
      parseFloat(s.minAmountOut) === parseFloat(minAmountOut)
    );
    
    if (swapIndex === -1) {
      return res.json({ 
        success: false, 
        included: false,
        message: "Swap not found in batch" 
      });
    }
    
    // Get the proof for this swap
    const leaf = batch.leaves[swapIndex];
    const proof = batch.tree.getHexProof(leaf);
    
    // Check with the contract
    const included = await contract.verifySwapInclusion(
      batchId,
      user,
      ethToToken,
      ethers.utils.parseUnits(amountIn.toString(), 18),
      ethers.utils.parseUnits(minAmountOut.toString(), 18),
      proof
    );
    
    res.json({
      success: true,
      included,
      proof,
      swapIndex
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// test.js
const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function testSequencer() {
  try {
    // User 1 swaps ETH for tokens - using your first address
    console.log('User 1 submitting swap...');
    const swap1 = await axios.post(`${API_URL}/submit-swap`, {
      user: '0xc96a4D66Dc669799c042b5D6CC94e907CEea1aF1',  // Your first address
      ethToToken: true,
      amountIn: 2,
      minAmountOut: 6800
    });
    console.log(`Swap 1 response:`, swap1.data);
    
    // User 2 swaps tokens for ETH - using your second address
    console.log('User 2 submitting swap...');
    const swap2 = await axios.post(`${API_URL}/submit-swap`, {
      user: '0x33606f5fDA618630f5B297EE84Cce30732dAd48a',  // Your second address
      ethToToken: false,
      amountIn: 3500,
      minAmountOut: 0.95
    });
    console.log(`Swap 2 response:`, swap2.data);
    
    // Check pending swaps
    console.log('Checking pending swaps...');
    const pendingSwaps = await axios.get(`${API_URL}/pending-swaps`);
    console.log(`Pending swaps:`, pendingSwaps.data);
    
    // Manually trigger batch processing
    console.log('Triggering batch processing...');
    const batch = await axios.post(`${API_URL}/process-batch`);
    console.log(`Batch response:`, batch.data);
    
    // Wait for batch to be executed
    console.log('Waiting for batch execution...');
    setTimeout(async () => {
      const batchStatus = await axios.get(`${API_URL}/batch/${batch.data.batchId}`);
      console.log(`Batch status:`, batchStatus.data);
    }, 3 * 60 * 1000 + 5000);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSequencer();
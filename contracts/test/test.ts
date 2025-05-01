import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import dotenv from 'dotenv';
import hre from 'hardhat';
import { ethers } from 'ethers';
import fs from 'fs';

// This is needed because your project uses Viem instead of Ethers
import * as ethersHardhat from '@nomicfoundation/hardhat-ethers';

async function main() {
  console.log("=== Starting MultiTokenAMM Test Script ===");
  
  // Get provider and signer from Hardhat
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545/');
  
  // Create wallets using the known private keys from Hardhat
  // These are the default private keys used by Hardhat Network
  const HARDHAT_PRIVATE_KEYS = [
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Account #0
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Account #1
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Account #2
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // Account #3
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', // Account #4
  ];
  
  // Create wallet instances
  const wallets = HARDHAT_PRIVATE_KEYS.map(key => new ethers.Wallet(key, provider));
  
  // First account is the deployer
  const deployerWallet = wallets[0];
  console.log("Using deployer address:", deployerWallet.address);
  
  // Get remaining wallets for testing - now 4 wallets instead of 2
  const testWallets = wallets.slice(1, 5);
  
  // Use pre-funded accounts instead of generating random wallets
  console.log("\n=== Step 0: Using pre-funded Hardhat wallets ===");
  for (let i = 0; i < testWallets.length; i++) {
    const balance = await provider.getBalance(testWallets[i].address);
    console.log(`Wallet ${i+1} using pre-funded account: ${testWallets[i].address} (${ethers.formatEther(balance)} ETH)`);
  }
  
  // First, let's check if the contracts are actually deployed where we expect them
  console.log("\n=== Verifying contract deployments ===");
  
  // Load .env variables
  dotenv.config({ path: '../.env.local' });
  
  // Get contract addresses from env or use default addresses if not set
  const tromerTokenAddress = process.env.TROMER_TOKEN_ADDRESS || '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0';
  const leTokenAddress = process.env.LE_TOKEN_ADDRESS || '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9';
  const simpleTokenAddress = process.env.SIMPLE_TOKEN_ADDRESS || '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9';
  const multiTokenAmmAddress = process.env.MULTI_TOKEN_AMM_ADDRESS || '0x5fc8d32690cc91d4c39d9d3abcbd16989f875707';
  
  // Check if contracts exist at the specified addresses
  let tromerTokenCode = await provider.getCode(tromerTokenAddress);
  let leTokenCode = await provider.getCode(leTokenAddress);
  let simpleTokenCode = await provider.getCode(simpleTokenAddress);
  let multiTokenAmmCode = await provider.getCode(multiTokenAmmAddress);
  
  console.log(`TromerToken contract code exists: ${tromerTokenCode !== '0x'}`);
  console.log(`LeToken contract code exists: ${leTokenCode !== '0x'}`);
  console.log(`SimpleToken contract code exists: ${simpleTokenCode !== '0x'}`);
  console.log(`MultiTokenAMM contract code exists: ${multiTokenAmmCode !== '0x'}`);
  
  // If any contracts don't exist, we should deploy them
  if (tromerTokenCode === '0x' || leTokenCode === '0x' || simpleTokenCode === '0x' || multiTokenAmmCode === '0x') {
    console.log("\n⚠️ Some contracts are not deployed. Please deploy your contracts first with:");
    console.log("npx hardhat run scripts/deploy.js --network localhost");
    console.log("Exiting script");
    return;
  }
  
  // Load deployed contract ABIs and create factory instances
  console.log("\nLoading contract factories...");
  const tromerTokenAbi = JSON.parse(fs.readFileSync('./artifacts/contracts/SimpleToken.sol/SimpleToken.json', 'utf8')).abi;
  const multiTokenAmmAbi = JSON.parse(fs.readFileSync('./artifacts/contracts/MultiTokenAMM.sol/MultiTokenAMM.json', 'utf8')).abi;
  
  // Get contract instances
  console.log("Attaching to deployed contracts...");
  const tromerToken = new ethers.Contract(
    tromerTokenAddress,
    tromerTokenAbi,
    deployerWallet
  );
  console.log(`Attached to TromerToken at ${tromerTokenAddress}`);
  
  const leToken = new ethers.Contract(
    leTokenAddress,
    tromerTokenAbi, // All tokens use the same ABI
    deployerWallet
  );
  console.log(`Attached to LeToken at ${leTokenAddress}`);
  
  const simpleToken = new ethers.Contract(
    simpleTokenAddress,
    tromerTokenAbi, // All tokens use the same ABI
    deployerWallet
  );
  console.log(`Attached to SimpleToken at ${simpleTokenAddress}`);
  
  const multiTokenAmm = new ethers.Contract(
    multiTokenAmmAddress,
    multiTokenAmmAbi,
    deployerWallet
  );
  console.log(`Attached to MultiTokenAMM at ${multiTokenAmmAddress}`);
  
  // Add a check to verify owner access - try to check the owner of each token
  try {
    // For SimpleToken contract, the owner() function returns the owner address
    const tromerOwner = await tromerToken.owner();
    console.log(`TromerToken owner: ${tromerOwner}`);
    if (tromerOwner.toLowerCase() !== deployerWallet.address.toLowerCase()) {
      console.log(`⚠️ Warning: You are not the owner of TromerToken. Minting may fail.`);
    }
  } catch (error) {
    console.log(`⚠️ Error checking TromerToken owner: ${error.message}`);
  }
  
  // Define constants
  const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
  const MINT_AMOUNT = ethers.parseEther("1000");
  const DEPOSIT_AMOUNT = ethers.parseEther("500");
  const SWAP_AMOUNT = ethers.parseEther("20");
  const MIN_AMOUNT_OUT = ethers.parseEther("10");
  const MIN_ETH_AMOUNT_OUT = ethers.parseEther("0.03"); // Much lower minimum for ETH swaps
  console.log("Constants defined:", {
    ETH_ADDRESS,
    MINT_AMOUNT: ethers.formatEther(MINT_AMOUNT) + " tokens",
    DEPOSIT_AMOUNT: ethers.formatEther(DEPOSIT_AMOUNT) + " tokens",
    SWAP_AMOUNT: ethers.formatEther(SWAP_AMOUNT) + " tokens",
    MIN_AMOUNT_OUT: ethers.formatEther(MIN_AMOUNT_OUT) + " tokens",
    MIN_ETH_AMOUNT_OUT: ethers.formatEther(MIN_ETH_AMOUNT_OUT) + " ETH"
  });
  
  // Token combinations for swaps - round 1
  const swapCombinationsRound1 = [
    { tokenIn: tromerTokenAddress, tokenOut: leTokenAddress },
    { tokenIn: leTokenAddress, tokenOut: simpleTokenAddress },
    { tokenIn: simpleTokenAddress, tokenOut: ETH_ADDRESS },
    { tokenIn: tromerTokenAddress, tokenOut: simpleTokenAddress },
    { tokenIn: leTokenAddress, tokenOut: ETH_ADDRESS }
  ];
  
  // Token combinations for swaps - round 2 (reverse the pairs)
  const swapCombinationsRound2 = [
    { tokenIn: leTokenAddress, tokenOut: tromerTokenAddress },
    { tokenIn: simpleTokenAddress, tokenOut: leTokenAddress },
    { tokenIn: ETH_ADDRESS, tokenOut: simpleTokenAddress },
    { tokenIn: simpleTokenAddress, tokenOut: tromerTokenAddress },
    { tokenIn: ETH_ADDRESS, tokenOut: leTokenAddress }
  ];
  
  console.log(`Defined ${swapCombinationsRound1.length} swap combinations for round 1`);
  console.log(`Defined ${swapCombinationsRound2.length} swap combinations for round 2`);
  
  console.log("\n=== Step 1: Minting tokens to wallets ===");
  // Mint tokens to each wallet (requires owner privileges)
  for (let i = 0; i < testWallets.length; i++) {
    // Round 1 token combinations
    const { tokenIn: tokenInRound1 } = swapCombinationsRound1[i];
    
    if (tokenInRound1 !== ETH_ADDRESS) {
      // Determine which token to mint
      let tokenContract;
      let tokenName;
      if (tokenInRound1 === tromerTokenAddress) {
        tokenContract = tromerToken;
        tokenName = "Tromer";
      } else if (tokenInRound1 === leTokenAddress) {
        tokenContract = leToken;
        tokenName = "LeToken";
      } else if (tokenInRound1 === simpleTokenAddress) {
        tokenContract = simpleToken;
        tokenName = "SimpleToken";
      }
      
      console.log(`Minting ${ethers.formatEther(MINT_AMOUNT)} ${tokenName} tokens to ${testWallets[i].address}`);
      try {
        // Connect with deployer wallet to mint tokens
        const tx = await tokenContract.connect(deployerWallet).mint(testWallets[i].address, MINT_AMOUNT);
        await tx.wait();
        console.log(`✅ Minting successful: tx ${tx.hash}`);
        
        // Verify the balance
        try {
          const balance = await tokenContract.balanceOf(testWallets[i].address);
          console.log(`Wallet ${i+1} now has ${ethers.formatEther(balance)} ${tokenName} tokens`);
        } catch (error) {
          console.error(`❌ Error checking balance: ${error.message}`);
        }
      } catch (error) {
        console.error(`❌ Error minting tokens: ${error.message}`);
      }
    }
    
    // Also mint tokens for round 2 if needed (for ETH -> token swaps)
    const { tokenOut: tokenOutRound2 } = swapCombinationsRound2[i];
    if (tokenOutRound2 !== ETH_ADDRESS) {
      // Skip if the token is the same as round 1
      if (tokenOutRound2 !== tokenInRound1) {
        let tokenContract;
        let tokenName;
        if (tokenOutRound2 === tromerTokenAddress) {
          tokenContract = tromerToken;
          tokenName = "Tromer";
        } else if (tokenOutRound2 === leTokenAddress) {
          tokenContract = leToken;
          tokenName = "LeToken";
        } else if (tokenOutRound2 === simpleTokenAddress) {
          tokenContract = simpleToken;
          tokenName = "SimpleToken";
        }
        
        console.log(`Minting additional ${ethers.formatEther(MINT_AMOUNT)} ${tokenName} tokens to ${testWallets[i].address} (for round 2)`);
        try {
          // Connect with deployer wallet to mint tokens
          const tx = await tokenContract.connect(deployerWallet).mint(testWallets[i].address, MINT_AMOUNT);
          await tx.wait();
          console.log(`✅ Additional minting successful: tx ${tx.hash}`);
        } catch (error) {
          console.error(`❌ Error minting additional tokens: ${error.message}`);
        }
      }
    }
  }
  
  console.log("\n=== Step 2: Approving and depositing tokens ===");
  for (let i = 0; i < testWallets.length; i++) {
    // Round 1 token combinations
    const { tokenIn: tokenInRound1 } = swapCombinationsRound1[i];
    
    if (tokenInRound1 !== ETH_ADDRESS) {
      // Determine which token to approve
      let tokenContract;
      let tokenName;
      if (tokenInRound1 === tromerTokenAddress) {
        tokenContract = tromerToken;
        tokenName = "Tromer";
      } else if (tokenInRound1 === leTokenAddress) {
        tokenContract = leToken;
        tokenName = "LeToken";
      } else if (tokenInRound1 === simpleTokenAddress) {
        tokenContract = simpleToken;
        tokenName = "SimpleToken";
      }
      
      console.log(`Approving ${ethers.formatEther(DEPOSIT_AMOUNT)} ${tokenName} for ${testWallets[i].address}`);
      try {
        // Approve AMM to spend tokens
        const approveTx = await tokenContract.connect(testWallets[i]).approve(multiTokenAmmAddress, DEPOSIT_AMOUNT);
        await approveTx.wait();
        console.log(`✅ Approval successful: tx ${approveTx.hash}`);
        
        console.log(`Depositing ${ethers.formatEther(DEPOSIT_AMOUNT)} ${tokenName} for ${testWallets[i].address}`);
        // Deposit tokens to AMM
        const depositTx = await multiTokenAmm.connect(testWallets[i]).depositToken(tokenInRound1, DEPOSIT_AMOUNT);
        await depositTx.wait();
        console.log(`✅ Deposit successful: tx ${depositTx.hash}`);
        
        // Verify the deposit
        const balance = await multiTokenAmm.getTokenBalance(testWallets[i].address, tokenInRound1);
        console.log(`Wallet ${i+1} now has ${ethers.formatEther(balance)} ${tokenName} in the AMM`);
      } catch (error) {
        console.error(`❌ Error in approval/deposit:`, error.message);
      }
    } else {
      console.log(`Depositing ${ethers.formatEther(DEPOSIT_AMOUNT)} ETH for ${testWallets[i].address}`);
      try {
        // Deposit ETH to AMM
        const depositTx = await multiTokenAmm.connect(testWallets[i]).depositETH({ value: DEPOSIT_AMOUNT });
        await depositTx.wait();
        console.log(`✅ ETH Deposit successful: tx ${depositTx.hash}`);
        
        // Verify the deposit
        const balance = await multiTokenAmm.getETHBalance(testWallets[i].address);
        console.log(`Wallet ${i+1} now has ${ethers.formatEther(balance)} ETH in the AMM`);
      } catch (error) {
        console.error(`❌ Error in ETH deposit:`, error.message);
      }
    }
    
    // Also deposit for round 2 if needed (for ETH -> token swaps)
    const { tokenIn: tokenInRound2 } = swapCombinationsRound2[i];
    if (tokenInRound2 === ETH_ADDRESS) {
      console.log(`Depositing additional ${ethers.formatEther(DEPOSIT_AMOUNT)} ETH for ${testWallets[i].address} (for round 2)`);
      try {
        // Deposit ETH to AMM
        const depositTx = await multiTokenAmm.connect(testWallets[i]).depositETH({ value: DEPOSIT_AMOUNT });
        await depositTx.wait();
        console.log(`✅ Additional ETH Deposit successful: tx ${depositTx.hash}`);
      } catch (error) {
        console.error(`❌ Error in additional ETH deposit:`, error.message);
      }
    }
    
    console.log(`Wallet ${i+1} setup complete`);
  }
  
  // Add this line after your wallet setup is complete
  let currentNonce = await provider.getTransactionCount(deployerWallet.address);
  console.log(`Current deployer nonce before adding liquidity: ${currentNonce}`);

  console.log("\n=== Step 3: Setup liquidity pools with realistic prices ===");
  try {
    console.log("Minting tokens to deployer for liquidity provision...");
    
    // Mint tokens to deployer for creating pools
    const mintAmount = ethers.parseEther("100000"); // Increase from 20000 to 100000 tokens
    
    // Make sure to explicitly set nonces for all transactions
    const tx1 = await tromerToken.connect(deployerWallet).mint(
      deployerWallet.address, 
      mintAmount,
      { nonce: currentNonce++ }
    );
    await tx1.wait();
    console.log(`✅ Minted Tromer tokens to deployer: ${tx1.hash}`);
    
    const tx2 = await leToken.connect(deployerWallet).mint(
      deployerWallet.address, 
      mintAmount,
      { nonce: currentNonce++ }
    );
    await tx2.wait();
    console.log(`✅ Minted LeToken tokens to deployer: ${tx2.hash}`);
    
    const tx3 = await simpleToken.connect(deployerWallet).mint(
      deployerWallet.address, 
      mintAmount,
      { nonce: currentNonce++ }
    );
    await tx3.wait();
    console.log(`✅ Minted SimpleToken tokens to deployer: ${tx3.hash}`);
    
    // Approve AMM to use tokens
    const tx4 = await tromerToken.connect(deployerWallet).approve(
      multiTokenAmmAddress, 
      mintAmount,
      { nonce: currentNonce++ }
    );
    await tx4.wait();
    console.log(`✅ Approved Tromer for AMM: ${tx4.hash}`);
    
    const tx5 = await leToken.connect(deployerWallet).approve(
      multiTokenAmmAddress, 
      mintAmount,
      { nonce: currentNonce++ }
    );
    await tx5.wait();
    console.log(`✅ Approved LeToken for AMM: ${tx5.hash}`);
    
    const tx6 = await simpleToken.connect(deployerWallet).approve(
      multiTokenAmmAddress, 
      mintAmount,
      { nonce: currentNonce++ }
    );
    await tx6.wait();
    console.log(`✅ Approved SimpleToken for AMM: ${tx6.hash}`);
    
    // Create token-ETH pairs with even more balanced ratios
    const ethAmount = ethers.parseEther("50"); // Increased ETH amount for better liquidity
    
    // Create Tromer-ETH pool
    const tx7 = await multiTokenAmm.connect(deployerWallet).addLiquidityETH(
      tromerTokenAddress,
      ethers.parseEther("25000"), // 500:1 ratio (appropriate for token:ETH)
      { value: ethAmount, nonce: currentNonce++ }
    );
    await tx7.wait();
    console.log(`✅ Created Tromer-ETH pool: ${tx7.hash}`);
    
    // Create LeToken-ETH pool
    const tx8 = await multiTokenAmm.connect(deployerWallet).addLiquidityETH(
      leTokenAddress,
      ethers.parseEther("25000"), // 500:1 ratio (appropriate for token:ETH)
      { value: ethAmount, nonce: currentNonce++ }
    );
    await tx8.wait();
    console.log(`✅ Created LeToken-ETH pool: ${tx8.hash}`);
    
    // Create SimpleToken-ETH pool
    const tx9 = await multiTokenAmm.connect(deployerWallet).addLiquidityETH(
      simpleTokenAddress,
      ethers.parseEther("25000"), // 500:1 ratio (appropriate for token:ETH)
      { value: ethAmount, nonce: currentNonce++ }
    );
    await tx9.wait();
    console.log(`✅ Created SimpleToken-ETH pool: ${tx9.hash}`);
    
    // Create token-token pairs with more liquidity
    // Create Tromer-LeToken pool
    const tx10 = await multiTokenAmm.connect(deployerWallet).addLiquidityTokens(
      tromerTokenAddress,
      leTokenAddress,
      ethers.parseEther("15000"), // 1:1 ratio between tokens
      ethers.parseEther("15000"),
      { nonce: currentNonce++ }
    );
    await tx10.wait();
    console.log(`✅ Created Tromer-LeToken pool: ${tx10.hash}`);
    
    // Create Tromer-SimpleToken pool
    const tx11 = await multiTokenAmm.connect(deployerWallet).addLiquidityTokens(
      tromerTokenAddress,
      simpleTokenAddress,
      ethers.parseEther("15000"), // 1:1 ratio between tokens
      ethers.parseEther("15000"),
      { nonce: currentNonce++ }
    );
    await tx11.wait();
    console.log(`✅ Created Tromer-SimpleToken pool: ${tx11.hash}`);
    
    // Create LeToken-SimpleToken pool 
    const tx12 = await multiTokenAmm.connect(deployerWallet).addLiquidityTokens(
      leTokenAddress,
      simpleTokenAddress,
      ethers.parseEther("15000"), // 1:1 ratio between tokens
      ethers.parseEther("15000"),
      { nonce: currentNonce++ }
    );
    await tx12.wait();
    console.log(`✅ Created LeToken-SimpleToken pool: ${tx12.hash}`);
    
    console.log("All liquidity pools created successfully");
  } catch (error) {
    console.error(`❌ Error setting up liquidity pools:`, error);
    console.log("Continuing with existing pools...");
  }
  
  console.log("\n=== Step 4: Executing Batch Swaps - Round 1 ===");
  
  // Create SwapRequest objects for round 1
  const swapRequestsRound1 = [];
  for (let i = 0; i < testWallets.length; i++) {
    const { tokenIn, tokenOut } = swapCombinationsRound1[i];
    
    swapRequestsRound1.push({
      user: testWallets[i].address,
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      amountIn: SWAP_AMOUNT,
      minAmountOut: tokenOut === ETH_ADDRESS ? MIN_ETH_AMOUNT_OUT : MIN_AMOUNT_OUT
    });
    
    console.log(`Created swap request for ${testWallets[i].address}:`);
    console.log(`  TokenIn: ${tokenIn === ETH_ADDRESS ? "ETH" : tokenIn}`);
    console.log(`  TokenOut: ${tokenOut === ETH_ADDRESS ? "ETH" : tokenOut}`);
    console.log(`  AmountIn: ${ethers.formatEther(SWAP_AMOUNT)}`);
    console.log(`  MinAmountOut: ${tokenOut === ETH_ADDRESS ? 
                  ethers.formatEther(MIN_ETH_AMOUNT_OUT) : 
                  ethers.formatEther(MIN_AMOUNT_OUT)}`);
  }
  
  try {
    // Call the batchSwap function as the sequencer (deployer)
    console.log("\nExecuting batch swap for round 1...");
    const batchTx = await multiTokenAmm.connect(deployerWallet).batchSwap(swapRequestsRound1);
    const receipt = await batchTx.wait();
    console.log(`✅ Batch swap (round 1) executed: ${batchTx.hash}`);
    
    // Extract events from receipt
    const swapEvents = receipt.logs
      .filter(log => {
        try {
          const parsed = multiTokenAmm.interface.parseLog({
            topics: [...log.topics],
            data: log.data
          });
          return parsed.name === 'Swap';
        } catch (e) {
          return false;
        }
      })
      .map(log => {
        try {
          return multiTokenAmm.interface.parseLog({
            topics: [...log.topics],
            data: log.data
          }).args;
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
    
    console.log(`Successfully executed ${swapEvents.length} swaps in round 1`);
    
    // Print details about the swaps
    if (swapEvents.length > 0) {
      console.log("\nSwap details (round 1):");
      for (let i = 0; i < swapEvents.length; i++) {
        const event = swapEvents[i];
        console.log(`Swap ${i+1}:`);
        console.log(`  User: ${event.user}`);
        console.log(`  TokenIn: ${event.tokenIn === ETH_ADDRESS ? "ETH" : event.tokenIn}`);
        console.log(`  TokenOut: ${event.tokenOut === ETH_ADDRESS ? "ETH" : event.tokenOut}`);
        console.log(`  AmountIn: ${ethers.formatEther(event.amountIn)}`);
        console.log(`  AmountOut: ${ethers.formatEther(event.amountOut)}`);
      }
    }
    
    // Get batch statistics
    const batchId = await multiTokenAmm.batchCounter();
    const [total, success, failed] = await multiTokenAmm.getBatchStats(batchId);
    console.log(`\nBatch ${batchId} stats (round 1): Total=${total}, Success=${success}, Failed=${failed}`);
    
    // Check for failures
    if (failed > 0) {
      console.log("\nFailure details (round 1):");
      for (let i = 0; i < swapRequestsRound1.length; i++) {
        try {
          const reason = await multiTokenAmm.getSwapFailureReason(batchId, i);
          if (reason > 0) {
            // Translate reason code to a descriptive message
            let reasonMsg = "Unknown error";
            if (reason === 1) reasonMsg = "INSUFFICIENT_BALANCE";
            if (reason === 2) reasonMsg = "SLIPPAGE_TOO_HIGH";
            if (reason === 3) reasonMsg = "POOL_NOT_FOUND";
            if (reason === 4) reasonMsg = "OTHER";
            
            console.log(`Swap ${i+1} failed with reason: ${reasonMsg} (${reason})`);
            
            // Print the failed request details for debugging
            const req = swapRequestsRound1[i];
            console.log(`  User: ${req.user}`);
            console.log(`  TokenIn: ${req.tokenIn}`);
            console.log(`  TokenOut: ${req.tokenOut}`);
            console.log(`  AmountIn: ${ethers.formatEther(req.amountIn)}`);
            console.log(`  MinAmountOut: ${ethers.formatEther(req.minAmountOut)}`);
          }
        } catch (error) {
          console.log(`Error getting failure reason for swap ${i+1}: ${error.message}`);
        }
      }
    }
    
    // Wait a bit before round 2
    console.log("\nWaiting 2 seconds before round 2...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log("\n=== Step 5: Executing Batch Swaps - Round 2 ===");
    
    // Create SwapRequest objects for round 2
    const swapRequestsRound2 = [];
    for (let i = 0; i < testWallets.length; i++) {
      const { tokenIn, tokenOut } = swapCombinationsRound2[i];
      
      // For ETH -> Token swaps, we need different values
      let actualMinAmountOut = tokenOut === ETH_ADDRESS ? MIN_ETH_AMOUNT_OUT : MIN_AMOUNT_OUT;
      
      swapRequestsRound2.push({
        user: testWallets[i].address,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amountIn: SWAP_AMOUNT,
        minAmountOut: actualMinAmountOut
      });
      
      console.log(`Created swap request for ${testWallets[i].address} (round 2):`);
      console.log(`  TokenIn: ${tokenIn === ETH_ADDRESS ? "ETH" : tokenIn}`);
      console.log(`  TokenOut: ${tokenOut === ETH_ADDRESS ? "ETH" : tokenOut}`);
      console.log(`  AmountIn: ${ethers.formatEther(SWAP_AMOUNT)}`);
      console.log(`  MinAmountOut: ${ethers.formatEther(actualMinAmountOut)}`);
    }
    
    // Call the batchSwap function again for round 2
    console.log("\nExecuting batch swap for round 2...");
    const batchTx2 = await multiTokenAmm.connect(deployerWallet).batchSwap(swapRequestsRound2);
    const receipt2 = await batchTx2.wait();
    console.log(`✅ Batch swap (round 2) executed: ${batchTx2.hash}`);
    
    // Extract events from receipt for round 2
    const swapEvents2 = receipt2.logs
      .filter(log => {
        try {
          const parsed = multiTokenAmm.interface.parseLog({
            topics: [...log.topics],
            data: log.data
          });
          return parsed.name === 'Swap';
        } catch (e) {
          return false;
        }
      })
      .map(log => {
        try {
          return multiTokenAmm.interface.parseLog({
            topics: [...log.topics],
            data: log.data
          }).args;
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
    
    console.log(`Successfully executed ${swapEvents2.length} swaps in round 2`);
    
    // Print details about the swaps for round 2
    if (swapEvents2.length > 0) {
      console.log("\nSwap details (round 2):");
      for (let i = 0; i < swapEvents2.length; i++) {
        const event = swapEvents2[i];
        console.log(`Swap ${i+1}:`);
        console.log(`  User: ${event.user}`);
        console.log(`  TokenIn: ${event.tokenIn === ETH_ADDRESS ? "ETH" : event.tokenIn}`);
        console.log(`  TokenOut: ${event.tokenOut === ETH_ADDRESS ? "ETH" : event.tokenOut}`);
        console.log(`  AmountIn: ${ethers.formatEther(event.amountIn)}`);
        console.log(`  AmountOut: ${ethers.formatEther(event.amountOut)}`);
      }
    }
    
    // Get batch statistics for round 2
    const batchId2 = await multiTokenAmm.batchCounter();
    const [total2, success2, failed2] = await multiTokenAmm.getBatchStats(batchId2);
    console.log(`\nBatch ${batchId2} stats (round 2): Total=${total2}, Success=${success2}, Failed=${failed2}`);
    
    // Check for failures in round 2
    if (failed2 > 0) {
      console.log("\nFailure details (round 2):");
      for (let i = 0; i < swapRequestsRound2.length; i++) {
        try {
          const reason = await multiTokenAmm.getSwapFailureReason(batchId2, i);
          if (reason > 0) {
            // Translate reason code to a descriptive message
            let reasonMsg = "Unknown error";
            if (reason === 1) reasonMsg = "INSUFFICIENT_BALANCE";
            if (reason === 2) reasonMsg = "SLIPPAGE_TOO_HIGH";
            if (reason === 3) reasonMsg = "POOL_NOT_FOUND";
            if (reason === 4) reasonMsg = "OTHER";
            
            console.log(`Swap ${i+1} failed with reason: ${reasonMsg} (${reason})`);
            
            // Print the failed request details for debugging
            const req = swapRequestsRound2[i];
            console.log(`  User: ${req.user}`);
            console.log(`  TokenIn: ${req.tokenIn}`);
            console.log(`  TokenOut: ${req.tokenOut}`);
            console.log(`  AmountIn: ${ethers.formatEther(req.amountIn)}`);
            console.log(`  MinAmountOut: ${ethers.formatEther(req.minAmountOut)}`);
          }
        } catch (error) {
          console.log(`Error getting failure reason for swap ${i+1} in round 2: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error(`❌ Error in batch operations:`, error);
  }
  
  console.log("\n=== Script execution completed ===");
}

// We recommend this pattern to be able to use async/await everywhere
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Unhandled error in main script execution:");
    console.error(error);
    process.exit(1);
  });
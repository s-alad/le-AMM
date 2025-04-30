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
    '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // Account #5
    '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e', // Account #6
    '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', // Account #7
    '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97', // Account #8
    '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6', // Account #9
    '0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897'  // Account #10
  ];
  
  // Create wallet instances
  const wallets = HARDHAT_PRIVATE_KEYS.map(key => new ethers.Wallet(key, provider));
  
  // First account is the deployer
  const deployerWallet = wallets[0];
  console.log("Using deployer address:", deployerWallet.address);
  
  // Get remaining wallets for testing - now 10 wallets instead of 4
  const testWallets = wallets.slice(1, 11);
  
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
  
  // Token combinations for swaps - expand to 10 combinations for 10 wallets
  const swapCombinations = [
    { tokenIn: tromerTokenAddress, tokenOut: leTokenAddress },
    { tokenIn: leTokenAddress, tokenOut: tromerTokenAddress },
    { tokenIn: tromerTokenAddress, tokenOut: ETH_ADDRESS },
    { tokenIn: leTokenAddress, tokenOut: simpleTokenAddress },
    { tokenIn: simpleTokenAddress, tokenOut: tromerTokenAddress },
    { tokenIn: simpleTokenAddress, tokenOut: leTokenAddress },
    { tokenIn: simpleTokenAddress, tokenOut: ETH_ADDRESS },
    { tokenIn: leTokenAddress, tokenOut: ETH_ADDRESS },
    { tokenIn: ETH_ADDRESS, tokenOut: tromerTokenAddress },
    { tokenIn: ETH_ADDRESS, tokenOut: simpleTokenAddress }
  ];
  console.log(`Defined ${swapCombinations.length} swap combinations`);
  
  console.log("\n=== Step 1: Minting tokens to wallets ===");
  // Mint tokens to each wallet (requires owner privileges)
  for (let i = 0; i < testWallets.length; i++) {
    const { tokenIn } = swapCombinations[i % swapCombinations.length];
    
    if (tokenIn !== ETH_ADDRESS) {
      // Determine which token to mint
      let tokenContract;
      let tokenName;
      if (tokenIn === tromerTokenAddress) {
        tokenContract = tromerToken;
        tokenName = "Tromer";
      } else if (tokenIn === leTokenAddress) {
        tokenContract = leToken;
        tokenName = "LeToken";
      } else if (tokenIn === simpleTokenAddress) {
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
    } else {
      // For ETH, we'll use the existing ETH
      console.log(`Using existing ETH for ${testWallets[i].address}`);
      const balance = await provider.getBalance(testWallets[i].address);
      console.log(`Wallet ${i+1} has ${ethers.formatEther(balance)} ETH`);
    }
  }
  
  console.log("\n=== Step 2: Approving and depositing tokens ===");
  for (let i = 0; i < testWallets.length; i++) {
    const { tokenIn } = swapCombinations[i % swapCombinations.length];
    
    if (tokenIn !== ETH_ADDRESS) {
      // Determine which token to approve
      let tokenContract;
      let tokenName;
      if (tokenIn === tromerTokenAddress) {
        tokenContract = tromerToken;
        tokenName = "Tromer";
      } else if (tokenIn === leTokenAddress) {
        tokenContract = leToken;
        tokenName = "LeToken";
      } else if (tokenIn === simpleTokenAddress) {
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
        const depositTx = await multiTokenAmm.connect(testWallets[i]).depositToken(tokenIn, DEPOSIT_AMOUNT);
        await depositTx.wait();
        console.log(`✅ Deposit successful: tx ${depositTx.hash}`);
        
        // Verify the deposit
        const balance = await multiTokenAmm.getTokenBalance(testWallets[i].address, tokenIn);
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
  
  console.log("\n=== Step 4: Creating Merkle Tree for batch swap ===");

  // Use the exact same createIntent function from merkle.js
  function createIntent(user, tokenIn, tokenOut, amountIn, minAmountOut, timestamp = 0) {
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'address', 'uint256', 'uint256', 'uint256'], 
      [user, tokenIn, tokenOut, amountIn, minAmountOut, timestamp]
    );
    
    return ethers.keccak256(encoded);
  }

  // Initialize arrays to hold all our intent data
  const intentUsers = [];
  const intentTokensIn = [];
  const intentTokensOut = [];
  const intentAmountsIn = [];
  const intentMinAmountsOut = [];
  const intentTimestamps = [];
  const leafHashes = [];

  // Create intents for all test wallets
  console.log("\nCreating intents for all test wallets:");
  for (let i = 0; i < testWallets.length; i++) {
    const user = testWallets[i].address;
    const { tokenIn, tokenOut } = swapCombinations[i % swapCombinations.length];
    const amountIn = SWAP_AMOUNT;
    let minAmountOut;
    if (tokenOut === ETH_ADDRESS) {
      minAmountOut = MIN_ETH_AMOUNT_OUT;
    } else {
      minAmountOut = MIN_AMOUNT_OUT;
    }
    const timestamp = 0; // Using 0 for simplicity as in merkle.js
    
    // Store all intent data
    intentUsers.push(user);
    intentTokensIn.push(tokenIn);
    intentTokensOut.push(tokenOut);
    intentAmountsIn.push(amountIn.toString());
    intentMinAmountsOut.push(minAmountOut.toString());
    intentTimestamps.push(timestamp);
    
    // Create leaf hash for this intent
    const leafHash = createIntent(
      user,
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      timestamp
    );
    
    leafHashes.push(leafHash);
    
    console.log(`Intent ${i+1} created for ${user}:`);
    console.log(`  TokenIn: ${tokenIn === ETH_ADDRESS ? "ETH" : tokenIn}`);
    console.log(`  TokenOut: ${tokenOut === ETH_ADDRESS ? "ETH" : tokenOut}`);
    console.log(`  AmountIn: ${ethers.formatEther(amountIn)}`);
    console.log(`  MinAmountOut: ${ethers.formatEther(minAmountOut)}`);
    console.log(`  Hash: ${leafHash}`);
  }

  // Create Merkle tree with all leaves
  const tree = new MerkleTree(leafHashes, keccak256, { sortPairs: true });
  const root = tree.getHexRoot();

  // Get proof for each leaf
  const proofs = leafHashes.map(leaf => tree.getHexProof(leaf));

  // Print Merkle tree info
  console.log("\nMerkle Tree Information:");
  console.log(`Number of intents: ${leafHashes.length}`);
  console.log(`Merkle Root: ${root}`);

  console.log("\nValues for commitBatchIntents:");
  console.log(`intentRoot: "${root}"`);
  console.log(`batchSize: ${leafHashes.length}`);

  // Format the values for batchSwap
  console.log("\nValues for batchSwap:");
  console.log(`Users: ${JSON.stringify(intentUsers)}`);
  console.log(`TokensIn: ${JSON.stringify(intentTokensIn)}`);
  console.log(`TokensOut: ${JSON.stringify(intentTokensOut)}`);
  console.log(`AmountsIn: ${JSON.stringify(intentAmountsIn)}`);
  console.log(`MinAmountsOut: ${JSON.stringify(intentMinAmountsOut)}`);

  // Print proofs for each user
  for (let i = 0; i < intentUsers.length; i++) {
    console.log(`\nProofs for user ${i+1} (${intentUsers[i]}):`);
    console.log(JSON.stringify(proofs[i]));
  }

  // Format the complete batch parameters for the contract
  const batchParams = [
    intentUsers,
    intentTokensIn,
    intentTokensOut,
    intentAmountsIn,
    intentMinAmountsOut,
    proofs
  ];

  // Continue with the batch commitment
  console.log("\n=== Step 5: Committing batch intents ===");
  try {
    // Get the latest nonce again, just to be safe
    currentNonce = await provider.getTransactionCount(deployerWallet.address);
    console.log(`Current nonce before batch commitment: ${currentNonce}`);
    
    // Commit the batch intents
    const commitTx = await multiTokenAmm.connect(deployerWallet).commitBatchIntents(
      root,
      leafHashes.length,
      { nonce: currentNonce++ }
    );
    
    await commitTx.wait();
    console.log(`✅ Batch commitment successful: ${commitTx.hash}`);
    
    const batchId = await multiTokenAmm.batchCounter();
    console.log(`Batch committed with ID: ${batchId}`);
    
    console.log("\n=== Step 6: Fast-forwarding time to simulate delay ===");
    // Fast forward 30 seconds (past the 20 second delay)
    await provider.send("evm_increaseTime", [30]);
    await provider.send("evm_mine", []);
    console.log("Fast-forwarded 30 seconds");
    
    console.log("\n=== Step 7: Executing batch swaps ===");
    
    // Execute the batch swap with all parameters
    const executeTx = await multiTokenAmm.connect(deployerWallet).batchSwap(
      batchId,
      batchParams,
      { nonce: currentNonce++ }
    );
    
    const receiptExecute = await executeTx.wait();
    console.log(`✅ Batch execution successful: ${executeTx.hash}`);
    
    // Extract events from receipt
    const swapEvents = receiptExecute.logs
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
    
    console.log(`Successfully executed ${swapEvents.length} swaps`);
    
    // Print details about the swaps
    if (swapEvents.length > 0) {
      console.log("\nSwap details:");
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
    
    try {
      // Extract batch stats
      const batchResult = await multiTokenAmm.batchResults(batchId);
      console.log(`\nBatch ${batchId} stats: Total=${batchResult.totalProcessed}, Success=${batchResult.successCount}, Failed=${batchResult.failedCount}`);
      
      // Display any failures
      if (batchResult.failedCount > 0) {
        console.log("\nFailure details:");
        for (let i = 0; i < leafHashes.length; i++) {
          try {
            // Use getSwapFailureReason function to check if this swap failed
            const reason = await multiTokenAmm.getSwapFailureReason(batchId, i);
            if (reason > 0) {
              // Translate reason code to a descriptive message
              let reasonMsg = "Unknown error";
              if (reason === 1) reasonMsg = "INVALID_PROOF";
              if (reason === 2) reasonMsg = "INSUFFICIENT_BALANCE";
              if (reason === 3) reasonMsg = "SLIPPAGE_TOO_HIGH";
              if (reason === 4) reasonMsg = "POOL_NOT_FOUND";
              if (reason === 5) reasonMsg = "OTHER";
              
              console.log(`Swap ${i+1} failed with reason: ${reasonMsg} (${reason})`);
              
              // Print the failed intent details for debugging
              console.log(`  User: ${intentUsers[i]}`);
              console.log(`  TokenIn: ${intentTokensIn[i]}`);
              console.log(`  TokenOut: ${intentTokensOut[i]}`);
              console.log(`  AmountIn: ${ethers.formatEther(intentAmountsIn[i])}`);
              console.log(`  MinAmountOut: ${ethers.formatEther(intentMinAmountsOut[i])}`);
            }
          } catch (error) {
            console.log(`Error getting failure reason for swap ${i+1}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.log("Error getting batch results:", error.message);
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
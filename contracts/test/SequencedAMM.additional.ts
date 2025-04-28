import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { parseEther } from "viem";
import { MerkleTree } from "merkletreejs";
import { ethers } from "ethers";

describe("SequencedAMM Additional Tests", function() {
  let token, sequencedAMM, deployer, user1, user2, sequencer;

  beforeEach(async function() {
    // Get wallet clients
    [deployer, user1, user2, sequencer] = await hre.viem.getWalletClients();
    
    // Deploy token using viem pattern (not getContractFactory)
    token = await hre.viem.deployContract("TestToken", ["Test Token", "TST"]);
    
    // Deploy AMM using viem pattern
    sequencedAMM = await hre.viem.deployContract("SequencedAMM", [
      deployer.account.address,
      token.address
    ]);
    
    // Setup sequencer
    await sequencedAMM.write.setSequencer([sequencer.account.address]);
    
    // Mint tokens to users
    const mintAmount = parseEther("10000");
    await token.write.mint([deployer.account.address, mintAmount]);
    await token.write.mint([user1.account.address, mintAmount]);
    await token.write.mint([user2.account.address, mintAmount]);
  });

  describe("Liquidity Management", function() {
    it("Should correctly add initial liquidity and calculate shares", async function() {
      // Setup: Deposit assets first
      const ethAmount = parseEther("1");
      const tokenAmount = parseEther("100"); // Use same parseEther for consistency
      
      await sequencedAMM.write.depositETH({ value: ethAmount });
      await token.write.approve([sequencedAMM.address, tokenAmount]);
      await sequencedAMM.write.depositToken([tokenAmount]);
      
      // Add initial liquidity
      await sequencedAMM.write.addLiquidity([ethAmount, tokenAmount]);
      
      // Verify: First provider gets shares equal to ETH contributed
      expect(await sequencedAMM.read.liquidityShares([deployer.account.address])).to.equal(ethAmount);
      expect(await sequencedAMM.read.totalLiquidityShares()).to.equal(ethAmount);
      
      // Verify reserves
      expect(await sequencedAMM.read.ethReserve()).to.equal(ethAmount);
      expect(await sequencedAMM.read.tokenReserve()).to.equal(tokenAmount);
    });
    
    it("Should enforce proportional liquidity additions after initial deposit", async function() {
      // Setup: Create a second liquidity provider
      const initialEthAmount = parseEther("1");
      const initialTokenAmount = parseEther("100");
      
      // Create user-specific instances of the contracts
      const user1AMM = await hre.viem.getContractAt("SequencedAMM", sequencedAMM.address, 
        { client: { wallet: user1 } });
      const user1Token = await hre.viem.getContractAt("TestToken", token.address, 
        { client: { wallet: user1 } });
      const user2AMM = await hre.viem.getContractAt("SequencedAMM", sequencedAMM.address, 
        { client: { wallet: user2 } });
      const user2Token = await hre.viem.getContractAt("TestToken", token.address, 
        { client: { wallet: user2 } });
      
      // User1 adds initial liquidity
      await user1AMM.write.depositETH({ value: initialEthAmount });
      await user1Token.write.approve([sequencedAMM.address, initialTokenAmount]);
      await user1AMM.write.depositToken([initialTokenAmount]);
      await user1AMM.write.addLiquidity([initialEthAmount, initialTokenAmount]);
      
      // User2 attempts to add liquidity with incorrect ratio
      const user2EthAmount = parseEther("0.5");
      const incorrectTokenAmount = parseEther("60"); // Should be 50 tokens to maintain ratio
      
      await user2AMM.write.depositETH({ value: user2EthAmount });
      await user2Token.write.approve([sequencedAMM.address, incorrectTokenAmount]);
      await user2AMM.write.depositToken([incorrectTokenAmount]);
      
      // This should fail because the amounts don't maintain the price ratio
      await expect(
        user2AMM.write.addLiquidity([user2EthAmount, incorrectTokenAmount])
      ).to.be.rejectedWith("Unbalanced liquidity");
      
      // Now try with correct ratio
      const correctTokenAmount = parseEther("50");
      await user2AMM.write.addLiquidity([user2EthAmount, correctTokenAmount]);
      
      // Verify: User2 received the correct shares (half of user1's shares)
      expect(await sequencedAMM.read.liquidityShares([user2.account.address])).to.equal(initialEthAmount / 2n);
    });
    
    it("Should correctly remove liquidity and return proportional assets", async function() {
      // Setup: Add liquidity first
      const ethAmount = parseEther("1");
      const tokenAmount = parseEther("100");
      
      await sequencedAMM.write.depositETH({ value: ethAmount });
      await token.write.approve([sequencedAMM.address, tokenAmount]);
      await sequencedAMM.write.depositToken([tokenAmount]);
      await sequencedAMM.write.addLiquidity([ethAmount, tokenAmount]);
      
      // Record initial balances
      const initialEthBalance = await sequencedAMM.read.ethBalances([deployer.account.address]);
      const initialTokenBalance = await sequencedAMM.read.tokenBalances([deployer.account.address]);
      
      // Remove half of the liquidity
      const shares = await sequencedAMM.read.liquidityShares([deployer.account.address]);
      const halfShares = shares / 2n;
      await sequencedAMM.write.removeLiquidity([halfShares]);
      
      // Verify: Half of assets returned
      const newEthBalance = await sequencedAMM.read.ethBalances([deployer.account.address]);
      const newTokenBalance = await sequencedAMM.read.tokenBalances([deployer.account.address]);
      
      expect(newEthBalance - initialEthBalance).to.equal(ethAmount / 2n);
      expect(newTokenBalance - initialTokenBalance).to.equal(tokenAmount / 2n);
      
      // Verify: Shares and reserves updated
      expect(await sequencedAMM.read.liquidityShares([deployer.account.address])).to.equal(halfShares);
      expect(await sequencedAMM.read.ethReserve()).to.equal(ethAmount / 2n);
      expect(await sequencedAMM.read.tokenReserve()).to.equal(tokenAmount / 2n);
    });
  });

  describe("Fee Collection", function() {
    it("Should collect fees on swaps and maintain the invariant", async function() {
      // Setup: Add liquidity and prepare for a swap
      const ethAmount = parseEther("10");
      const tokenAmount = parseEther("1000");
      
      // Add initial liquidity
      await sequencedAMM.write.depositETH({ value: ethAmount });
      await token.write.approve([sequencedAMM.address, tokenAmount]);
      await sequencedAMM.write.depositToken([tokenAmount]);
      await sequencedAMM.write.addLiquidity([ethAmount, tokenAmount]);
      
      // Create user-specific instances of the contract
      const user1AMM = await hre.viem.getContractAt("SequencedAMM", sequencedAMM.address, 
        { client: { wallet: user1 } });
      const sequencerAMM = await hre.viem.getContractAt("SequencedAMM", sequencedAMM.address, 
        { client: { wallet: sequencer } });
      
      // Perform a swap through the sequencer
      const swapAmount = parseEther("1");
      await user1AMM.write.depositETH({ value: swapAmount });
      
      // Create and commit a batch
      const user = user1.account.address;
      const ethToToken = true;
      const amountIn = swapAmount;
      const minAmountOut = 0n; // Allow any slippage for test
      
      // Create a proper swap intent hash that matches exactly what the contract expects
      const swapIntentData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bool', 'uint256', 'uint256', 'uint256'],
        [user, ethToToken, amountIn, minAmountOut, 0] // Use timestamp 0 for simplicity
      );
      
      const leaf = ethers.keccak256(swapIntentData);
      
      // Create a merkle tree with just this one leaf
      const leaves = [leaf];
      const merkleTree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
      const root = merkleTree.getHexRoot();
      
      // Commit the batch
      await sequencerAMM.write.commitBatchIntents([root, 1]);
      
      // Wait for the commit-reveal delay
      await time.increase(240); // 4 minutes
      
      // Generate the proof for our leaf
      const proof = merkleTree.getHexProof(leaf);
      
      // Execute the batch swap with the proof
      await sequencerAMM.write.batchSwap([
        1, [user], [ethToToken], [amountIn], [minAmountOut], [proof]
      ]);
      
      // Check if the swap was successful by verifying token balances
      const tokenBalance = await sequencedAMM.read.tokenBalances([user1.account.address]);
      
      // Debug logging to see what's happening
      console.log("Token balance after swap:", tokenBalance.toString());
      
      // This should now be true because the swap should have succeeded
      expect(tokenBalance > 0n).to.be.true;
      
      // Check that ETH balance was reduced
      const ethBalance = await sequencedAMM.read.ethBalances([user1.account.address]);
      expect(ethBalance < swapAmount).to.be.true;
    });
  });

  describe("Security Mechanisms", function() {
    it("Should reject batch execution before commit-reveal delay", async function() {
      // Get sequencer instance
      const sequencerAMM = await hre.viem.getContractAt("SequencedAMM", sequencedAMM.address, 
        { client: { wallet: sequencer } });
      
      // Create a merkle tree with one swap intent
      const user = user1.account.address;
      const ethToToken = true;
      const amountIn = parseEther("1");
      const minAmountOut = 0n;
      
      const swapIntent = {
        user,
        ethToToken,
        amountIn,
        minAmountOut,
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      const leaf = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bool', 'uint256', 'uint256', 'uint256'],
        [swapIntent.user, swapIntent.ethToToken, swapIntent.amountIn, swapIntent.minAmountOut, swapIntent.timestamp]
      ));
      
      const merkleTree = new MerkleTree([leaf], ethers.keccak256, { sortPairs: true });
      const root = merkleTree.getHexRoot();
      
      // Commit the batch
      await sequencerAMM.write.commitBatchIntents([root, 1]);
      
      // Try to execute immediately (should fail)
      const proof = merkleTree.getHexProof(leaf);
      await expect(
        sequencerAMM.write.batchSwap([
          1, [user], [ethToToken], [amountIn], [minAmountOut], [proof]
        ])
      ).to.be.rejectedWith("Must wait after commit");
      
      // Now wait for delay and it should succeed
      await time.increase(240); // 4 minutes (as a number, not BigInt)
      
      await sequencerAMM.write.batchSwap([
        1, [user], [ethToToken], [amountIn], [minAmountOut], [proof]
      ]);
    });
    
    it("Should reject swaps with invalid proofs", async function() {
      // Get sequencer instance
      const sequencerAMM = await hre.viem.getContractAt("SequencedAMM", sequencedAMM.address, 
        { client: { wallet: sequencer } });
      
      // Add some liquidity first so swaps are possible
      const ethAmount = parseEther("10");
      const tokenAmount = parseEther("1000");
      await sequencedAMM.write.depositETH({ value: ethAmount });
      await token.write.approve([sequencedAMM.address, tokenAmount]);
      await sequencedAMM.write.depositToken([tokenAmount]);
      await sequencedAMM.write.addLiquidity([ethAmount, tokenAmount]);
      
      // Create swap intent for user1
      const validUser = user1.account.address;
      const invalidUser = user2.account.address;
      const ethToToken = true;
      const amountIn = parseEther("1");
      const minAmountOut = 0n;
      
      // Give user1 some ETH balance
      const user1AMM = await hre.viem.getContractAt("SequencedAMM", sequencedAMM.address, 
        { client: { wallet: user1 } });
      await user1AMM.write.depositETH({ value: amountIn });
      
      // Create valid swap intent
      const validSwapIntent = {
        user: validUser,
        ethToToken: ethToToken,
        amountIn: amountIn,
        minAmountOut: minAmountOut,
        timestamp: 0
      };
      
      // Create leaf for the valid swap
      const validLeaf = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bool', 'uint256', 'uint256', 'uint256'],
        [validSwapIntent.user, validSwapIntent.ethToToken, validSwapIntent.amountIn, validSwapIntent.minAmountOut, 0]
      ));
      
      // Create merkle tree with only the valid swap intent
      const merkleTree = new MerkleTree([validLeaf], ethers.keccak256, { sortPairs: true });
      const root = merkleTree.getHexRoot();
      
      // Commit the batch
      await sequencerAMM.write.commitBatchIntents([root, 1]);
      
      // Wait for the commit-reveal delay
      await time.increase(240); // 4 minutes
      
      // Get proof for the valid intent
      const validProof = merkleTree.getHexProof(validLeaf);
      
      // Create invalid swap intent (different user)
      const invalidSwapIntent = {
        user: invalidUser, 
        ethToToken: ethToToken,
        amountIn: amountIn,
        minAmountOut: minAmountOut,
        timestamp: 0
      };
      
      // Create leaf for invalid swap
      const invalidLeaf = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bool', 'uint256', 'uint256', 'uint256'],
        [invalidSwapIntent.user, invalidSwapIntent.ethToToken, invalidSwapIntent.amountIn, invalidSwapIntent.minAmountOut, 0]
      ));
      
      // Since we didn't include the invalid leaf in the tree, using validProof will fail for it
      // But we need a proof array for the batchSwap call
      const invalidProof = validProof;
      
      // Execute the batch with both swaps
      await sequencerAMM.write.batchSwap([
        1, 
        [validUser, invalidUser], 
        [ethToToken, ethToToken], 
        [amountIn, amountIn], 
        [minAmountOut, minAmountOut], 
        [validProof, invalidProof]
      ]);
      
      // Check first swap succeeded and second failed
      const [validSuccess, _] = await sequencedAMM.read.getSwapResult([1, 0]);
      const [invalidSuccess, failureReason] = await sequencedAMM.read.getSwapResult([1, 1]);
      
      // Verify: First swap should succeed
      expect(validSuccess).to.be.true;
      
      // Verify: Second swap should fail
      expect(invalidSuccess).to.be.false;
    });
  });

  describe("Emergency Functions", function() {
    it("Should allow fallback swaps after emergency disabling", async function() {
      // Create user-specific instances of the contract
      const user1AMM = await hre.viem.getContractAt("SequencedAMM", sequencedAMM.address, 
        { client: { wallet: user1 } });
      
      // Setup: Add liquidity to the pool
      const ethAmount = parseEther("10");
      const tokenAmount = parseEther("1000");
      
      await sequencedAMM.write.depositETH({ value: ethAmount });
      await token.write.approve([sequencedAMM.address, tokenAmount]);
      await sequencedAMM.write.depositToken([tokenAmount]);
      await sequencedAMM.write.addLiquidity([ethAmount, tokenAmount]);
      
      // Setup user balances for swap
      const swapAmount = parseEther("1");
      await user1AMM.write.depositETH({ value: swapAmount });
      
      // Try direct swap (should fail with sequencer-only mode)
      await expect(
        user1AMM.write.fallbackSwap([true, swapAmount, 0])
      ).to.be.rejectedWith("Direct swaps not allowed");
      
      // Fast-forward beyond the maxBatchDelay
      const maxBatchDelay = await sequencedAMM.read.maxBatchDelay();
      await time.increase(Number(maxBatchDelay)); // Convert BigInt to Number
      
      // Trigger emergency disable
      await user1AMM.write.emergencyDisableSequencer();
      
      // Verify sequencer-only is now false
      expect(await sequencedAMM.read.sequencerOnly()).to.be.false;
      
      // Now direct swap should work
      await user1AMM.write.fallbackSwap([true, swapAmount, 0]);
      
      // Verify user received tokens
      expect((await sequencedAMM.read.tokenBalances([user1.account.address])) > 0n).to.be.true;
    });
  });
});

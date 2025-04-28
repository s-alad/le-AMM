// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title SequencedAMM
 * @dev An Automated Market Maker (AMM) with front-running protection via a trusted sequencer
 *
 * System Overview:
 * This AMM prevents front-running and MEV attacks by removing user transactions from the public mempool.
 * Instead of submitting swaps directly to the blockchain, users send swap intents to a trusted sequencer.
 * The sequencer batches these intents off-chain and uses a commit-reveal pattern to execute them:
 *
 * 1. COMMIT PHASE: Sequencer submits a Merkle root of all swap intents (commitBatchIntents)
 * 2. WAITING PERIOD: A mandatory delay prevents last-minute reordering (commitRevealDelay)
 * 3. REVEAL & EXECUTE: Sequencer reveals and executes all swaps in the batch (batchSwap)
 * 4. FALLBACK: If the sequencer becomes unavailable, users can swap directly (fallbackSwap)
 *
 * The contract also manages liquidity pools using the constant product formula (x*y=k) and
 * handles user deposits, withdrawals, and balance tracking.
 */
contract SequencedAMM is Ownable, ReentrancyGuard {
    address public sequencer;
    bool public sequencerOnly = true;
    uint256 public maxBatchDelay = 20 seconds;
    uint256 public lastBatchTimestamp;
    
    // User balances
    mapping(address => uint256) public ethBalances;
    mapping(address => uint256) public tokenBalances;
    
    // AMM state variables
    IERC20 public token;
    uint256 public ethReserve;
    uint256 public tokenReserve;
    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 public feeRate = 3; // 0.3% fee
    
    // Events
    event Deposit(address indexed user, uint256 amount, bool isEth, uint256 timestamp);
    event Withdrawal(address indexed user, uint256 amount, bool isEth);
    event BatchSwap(uint256 batchId, uint256 swapCount);
    event FallbackSwap(address indexed user, uint256 amountIn, uint256 amountOut, bool ethToToken);
    event SequencerChanged(address indexed oldSequencer, address indexed newSequencer);
    event SequencerModeChanged(bool sequencerOnly);
    event BatchCommitted(uint256 batchId, bytes32 intentRoot, uint256 batchSize);
    event BatchSwapExecuted(uint256 batchId, uint256 swapCount, uint256 successCount);
    event LiquidityAdded(address indexed provider, uint256 ethAmount, uint256 tokenAmount);
    event LiquidityRemoved(address indexed provider, uint256 ethAmount, uint256 tokenAmount);
    
    /**
     * @dev Structure representing a user's swap request
     * @param user Address of the user requesting the swap
     * @param ethToToken Direction of the swap (true = ETH to token, false = token to ETH)
     * @param amountIn Amount of input asset the user wants to swap
     * @param minAmountOut Minimum amount of output asset the user will accept (slippage protection)
     * @param timestamp When the sequencer received this request (used for off-chain ordering)
     */
    struct SwapIntent {
        address user;
        bool ethToToken;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 timestamp;
    }

    /**
     * @dev Stores the cryptographic commitment for each batch and its submission time
     * These mappings support the commit-reveal pattern that prevents front-running
     */
    mapping(uint256 => bytes32) public batchIntentRoots;  // Merkle roots of swap intents
    mapping(uint256 => uint256) public batchSubmissionTimes;
    uint256 public nextBatchId = 1;
    uint256 public commitRevealDelay = 20 seconds;

    /**
     * @dev Tracks the execution results of each swap in a batch
     * This allows users to verify their swap was processed correctly and understand
     * why a swap might have failed
     */
    struct BatchResult {
        uint256 successCount;
        mapping(uint256 => bool) successfulSwaps;
        mapping(uint256 => string) failureReasons;
        mapping(uint256 => uint256) outputAmounts;
    }
    mapping(uint256 => BatchResult) public batchResults;

    /**
     * @dev Tracks liquidity provider contributions to the pool
     * Liquidity providers earn fees proportional to their share of the pool
     */
    mapping(address => uint256) public liquidityShares;
    uint256 public totalLiquidityShares;
    
    /**
     * @dev Sets up the AMM with an owner and token address
     * @param initialOwner Address that will have admin control of the contract
     * @param tokenAddress The ERC20 token to be paired with ETH in this AMM
     */
    constructor(address initialOwner, address tokenAddress) Ownable(initialOwner) {
        token = IERC20(tokenAddress);
    }
    
    /**
     * @dev Restricts function access to only the designated sequencer
     * This ensures only the trusted sequencer can batch and execute swaps
     */
    modifier onlySequencer() {
        require(msg.sender == sequencer, "Only sequencer can call");
        _;
    }

    /**
     * @dev Ensures the pool has non-zero reserves after the operation
     * This prevents divide-by-zero errors in the constant product formula
     */
    modifier ensureNonZeroReserves() {
        _;
        require(ethReserve > 0 && tokenReserve > 0, "Reserves cannot be zero");
    }
    
    /**
     * @dev Allows users to deposit ETH into their balance in the contract
     * Users must deposit before they can swap or provide liquidity
     */
    function depositETH() external payable {
        ethBalances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value, true, block.timestamp);
    }
    
    /**
     * @dev Allows users to deposit tokens into their balance in the contract
     * @param amount The amount of tokens to deposit
     * Requires prior approval of the token contract
     */
    function depositToken(uint256 amount) external {
        require(token.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        tokenBalances[msg.sender] += amount;
        emit Deposit(msg.sender, amount, false, block.timestamp);
    }
    
    /**
     * @dev Allows users to withdraw ETH from their balance in the contract
     * @param amount The amount of ETH to withdraw
     * Protected against reentrancy attacks
     */
    function withdrawETH(uint256 amount) external nonReentrant {
        require(ethBalances[msg.sender] >= amount, "Insufficient ETH balance");
        ethBalances[msg.sender] -= amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");
        emit Withdrawal(msg.sender, amount, true);
    }
    
    /**
     * @dev Allows users to withdraw tokens from their balance in the contract
     * @param amount The amount of tokens to withdraw
     * Protected against reentrancy attacks
     */
    function withdrawToken(uint256 amount) external nonReentrant {
        require(tokenBalances[msg.sender] >= amount, "Insufficient token balance");
        tokenBalances[msg.sender] -= amount;
        require(token.transfer(msg.sender, amount), "Token transfer failed");
        emit Withdrawal(msg.sender, amount, false);
    }
    
    /**
     * @dev Allows users to provide liquidity to the AMM pool
     * @param ethAmount Amount of ETH to contribute
     * @param tokenAmount Amount of tokens to contribute
     * 
     * Users receive liquidity shares proportional to their contribution.
     * After the first deposit, contributions must maintain the current price ratio.
     * Protected against reentrancy attacks.
     */
    function addLiquidity(uint256 ethAmount, uint256 tokenAmount) external nonReentrant ensureNonZeroReserves {
        require(ethBalances[msg.sender] >= ethAmount, "Insufficient ETH balance");
        require(tokenBalances[msg.sender] >= tokenAmount, "Insufficient token balance");
        
        uint256 shares;
        if (totalLiquidityShares == 0) {
            shares = ethAmount; // Initial liquidity determines initial shares
        } else {
            // Ensure proportional deposits to maintain price
            require(ethAmount * tokenReserve == tokenAmount * ethReserve, "Unbalanced liquidity");
            shares = (ethAmount * totalLiquidityShares) / ethReserve;
        }
        
        require(shares > 0, "No shares minted");
        
        ethBalances[msg.sender] -= ethAmount;
        tokenBalances[msg.sender] -= tokenAmount;
        
        ethReserve += ethAmount;
        tokenReserve += tokenAmount;
        
        liquidityShares[msg.sender] += shares;
        totalLiquidityShares += shares;
        
        emit LiquidityAdded(msg.sender, ethAmount, tokenAmount);
    }
    
    /**
     * @dev Allows liquidity providers to withdraw their liquidity from the pool
     * @param shareAmount The number of liquidity shares to burn
     * 
     * Returns a proportional amount of ETH and tokens from the pool.
     * Protected against reentrancy attacks.
     */
    function removeLiquidity(uint256 shareAmount) external nonReentrant {
        require(liquidityShares[msg.sender] >= shareAmount, "Insufficient shares");
        
        uint256 ethAmount = (shareAmount * ethReserve) / totalLiquidityShares;
        uint256 tokenAmount = (shareAmount * tokenReserve) / totalLiquidityShares;
        
        require(ethAmount > 0 && tokenAmount > 0, "Amounts too small");
        
        liquidityShares[msg.sender] -= shareAmount;
        totalLiquidityShares -= shareAmount;
        
        ethReserve -= ethAmount;
        tokenReserve -= tokenAmount;
        
        ethBalances[msg.sender] += ethAmount;
        tokenBalances[msg.sender] += tokenAmount;
        
        emit LiquidityRemoved(msg.sender, ethAmount, tokenAmount);
    }
    
    /**
     * @dev First step of the commit-reveal pattern - sequencer commits to a batch of swap intents
     * @param intentRoot The Merkle root hash of all swap intents in this batch
     * @param batchSize The number of swaps included in this batch
     * 
     * The sequencer constructs a Merkle tree of all user swap intents off-chain,
     * then commits only the root hash on-chain. This creates a binding commitment
     * to a specific set of transactions without revealing their details yet.
     * This commitment prevents the sequencer from changing the transaction set
     * after seeing new market conditions.
     */
    function commitBatchIntents(
        bytes32 intentRoot,
        uint256 batchSize
    ) external onlySequencer {
        batchIntentRoots[nextBatchId] = intentRoot;
        batchSubmissionTimes[nextBatchId] = block.timestamp;
        emit BatchCommitted(nextBatchId, intentRoot, batchSize);
        nextBatchId++;
    }

    // Add this struct definition near your other struct definitions
    struct BatchSwapParams {
        address[] users;
        bool[] ethToTokenFlags;
        uint256[] amountsIn;
        uint256[] minAmountsOut;
        bytes32[][] proofs;
    }

    /**
     * @dev Second step of the commit-reveal pattern - sequencer reveals and executes the batch
     * @param batchId The ID of the batch to execute
     * @param params A struct containing all batch parameters:
     *        - users: Array of user addresses for each swap
     *        - ethToTokenFlags: Array of swap directions (true = ETH to token)
     *        - amountsIn: Array of input amounts for each swap
     *        - minAmountsOut: Array of minimum output amounts (slippage protection)
     *        - proofs: Array of Merkle proofs verifying each swap was in the committed batch
     * 
     * This function:
     * 1. Verifies the mandatory waiting period has passed
     * 2. For each swap, verifies its inclusion in the original commitment using Merkle proofs
     * 3. Executes valid swaps and tracks success/failure
     * 4. Updates the last batch timestamp for the emergency timeout mechanism
     * 
     * The commit-reveal delay prevents the sequencer from inserting advantageous trades
     * after seeing market movements.
     */
    function batchSwap(
        uint256 batchId,
        BatchSwapParams calldata params
    ) external onlySequencer nonReentrant {
        require(block.timestamp >= batchSubmissionTimes[batchId] + commitRevealDelay, 
                "Must wait after commit");
        require(batchIntentRoots[batchId] != bytes32(0), "Batch not committed");
        
        // Check array lengths match
        require(params.users.length == params.ethToTokenFlags.length &&
                params.users.length == params.amountsIn.length &&
                params.users.length == params.minAmountsOut.length &&
                params.users.length == params.proofs.length,
                "Array length mismatch");
        
        // Process swaps in smaller batches to avoid stack depth issues
        processSwapBatch(batchId, params);
        
        // Update last batch timestamp
        lastBatchTimestamp = block.timestamp;
        
        emit BatchSwapExecuted(batchId, params.users.length, batchResults[batchId].successCount);
    }

    // Split the processing logic into a separate function
    function processSwapBatch(
        uint256 batchId,
        BatchSwapParams calldata params
    ) private {
        BatchResult storage result = batchResults[batchId];
        
        for (uint i = 0; i < params.users.length; i++) {
            // Process swaps individually to reduce local variables
            processSwap(batchId, i, params.users[i], params.ethToTokenFlags[i], 
                       params.amountsIn[i], params.minAmountsOut[i], params.proofs[i], result);
        }
    }

    // Process an individual swap
    function processSwap(
        uint256 batchId,
        uint256 swapIndex,
        address user,
        bool ethToToken,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes32[] calldata proof,
        BatchResult storage result
    ) private {
        // Create swap intent hash
        SwapIntent memory intent = SwapIntent({
            user: user,
            ethToToken: ethToToken,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            timestamp: 0 // Not needed for hash verification
        });
        
        bytes32 leaf = keccak256(abi.encode(intent));
        
        // Verify merkle proof
        bool isValidProof = MerkleProof.verify(
            proof,
            batchIntentRoots[batchId],
            leaf
        );
        
        if (!isValidProof) {
            result.successfulSwaps[swapIndex] = false;
            result.failureReasons[swapIndex] = "Invalid proof";
            return;
        }
        
        try this.executeSwap(user, ethToToken, amountIn, minAmountOut) returns (uint256 amountOut) {
            result.successfulSwaps[swapIndex] = true;
            result.successCount++;
            result.outputAmounts[swapIndex] = amountOut;
        } catch Error(string memory reason) {
            result.successfulSwaps[swapIndex] = false;
            result.failureReasons[swapIndex] = reason;
        }
    }

    /**
     * @dev Internal function to execute a single swap (called by batchSwap)
     * @param user Address of the user performing the swap
     * @param ethToToken Direction of the swap (true = ETH to token, false = token to ETH)
     * @param amountIn Amount of input asset to swap
     * @param minAmountOut Minimum acceptable output amount (slippage protection)
     * @return amountOut The amount of output asset received
     * 
     * This function:
     * 1. Checks the user has sufficient balance
     * 2. Calculates the output amount using the constant product formula (x*y=k)
     * 3. Applies the swap fee
     * 4. Checks against the minimum output amount (slippage protection)
     * 5. Updates user balances and pool reserves
     * 
     * It can only be called by the contract itself as part of batch execution.
     */
    function executeSwap(
        address user,
        bool ethToToken,
        uint256 amountIn, 
        uint256 minAmountOut
    ) external returns (uint256 amountOut) {
        require(msg.sender == address(this), "Only callable internally");
        
        if (ethToToken) {
            require(ethBalances[user] >= amountIn, "Insufficient ETH balance");
            
            // Calculate amount out using constant product formula
            uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeRate);
            amountOut = (tokenReserve * amountInWithFee) / 
                        (ethReserve * FEE_DENOMINATOR + amountInWithFee);
            
            require(amountOut >= minAmountOut, "Slippage too high");
            
            // Update user balances
            ethBalances[user] -= amountIn;
            tokenBalances[user] += amountOut;
            
            // Update reserves
            ethReserve += amountIn;
            tokenReserve -= amountOut;
        } else {
            require(tokenBalances[user] >= amountIn, "Insufficient token balance");
            
            // Calculate amount out using constant product formula
            uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeRate);
            amountOut = (ethReserve * amountInWithFee) / 
                        (tokenReserve * FEE_DENOMINATOR + amountInWithFee);
            
            require(amountOut >= minAmountOut, "Slippage too high");
            
            // Update user balances
            tokenBalances[user] -= amountIn;
            ethBalances[user] += amountOut;
            
            // Update reserves
            tokenReserve += amountIn;
            ethReserve -= amountOut;
        }
        
        return amountOut;
    }

    /**
     * @dev Allows users to verify their swap was included in a particular batch
     * @param batchId The batch ID to check
     * @param user The user address of the swap
     * @param ethToToken The direction of the swap
     * @param amountIn The input amount
     * @param minAmountOut The minimum output amount
     * @param proof The Merkle proof to verify
     * @return bool Whether the swap was included in the batch
     * 
     * This function enables users to independently verify that their swap
     * was correctly included in a batch by the sequencer.
     */
    function verifySwapInclusion(
        uint256 batchId,
        address user,
        bool ethToToken,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes32[] calldata proof
    ) external view returns (bool) {
        SwapIntent memory intent = SwapIntent({
            user: user,
            ethToToken: ethToToken,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            timestamp: 0 // Not needed for hash verification
        });
        
        bytes32 leaf = keccak256(abi.encode(intent));
        
        return MerkleProof.verify(
            proof,
            batchIntentRoots[batchId],
            leaf
        );
    }
    
    /**
     * @dev Retrieves the result of a specific swap in a batch
     * @param batchId The batch ID to query
     * @param swapIndex The index of the swap in the batch
     * @return success Whether the swap was successful
     * @return failureReason If unsuccessful, the reason for failure
     * @return outputAmount The output amount of the swap
     * 
     * This function allows users to check if their swap was executed
     * successfully and why it might have failed.
     */
    function getSwapResult(uint256 batchId, uint256 swapIndex) external view 
        returns (bool success, string memory failureReason, uint256 outputAmount) {
        BatchResult storage result = batchResults[batchId];
        return (
            result.successfulSwaps[swapIndex], 
            result.failureReasons[swapIndex],
            result.outputAmounts[swapIndex]
        );
    }
    
    /**
     * @dev Fallback swap mechanism for when sequencer mode is disabled
     * @param ethToToken Direction of the swap
     * @param amountIn Amount of input asset to swap
     * @param minAmountOut Minimum acceptable output amount
     * @return amountOut The amount of output asset received
     * 
     * This function allows direct swaps when:
     * 1. The sequencer is intentionally disabled by the owner
     * 2. The emergency timeout has triggered due to sequencer inactivity
     * 
     * It uses the same swap logic as batch swaps but can be called directly by users.
     * Protected against reentrancy attacks.
     */
    function fallbackSwap(
        bool ethToToken,
        uint256 amountIn,
        uint256 minAmountOut
    ) external nonReentrant returns (uint256 amountOut) {
        require(!sequencerOnly, "Direct swaps not allowed");
        
        if (ethToToken) {
            require(ethBalances[msg.sender] >= amountIn, "Insufficient ETH balance");
            
            // Calculate amount out using constant product formula
            uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeRate);
            amountOut = (tokenReserve * amountInWithFee) / 
                        (ethReserve * FEE_DENOMINATOR + amountInWithFee);
            
            require(amountOut >= minAmountOut, "Slippage too high");
            
            // Update user balances
            ethBalances[msg.sender] -= amountIn;
            tokenBalances[msg.sender] += amountOut;
            
            // Update reserves
            ethReserve += amountIn;
            tokenReserve -= amountOut;
        } else {
            require(tokenBalances[msg.sender] >= amountIn, "Insufficient token balance");
            
            // Calculate amount out using constant product formula
            uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeRate);
            amountOut = (ethReserve * amountInWithFee) / 
                        (tokenReserve * FEE_DENOMINATOR + amountInWithFee);
            
            require(amountOut >= minAmountOut, "Slippage too high");
            
            // Update user balances
            tokenBalances[msg.sender] -= amountIn;
            ethBalances[msg.sender] += amountOut;
            
            // Update reserves
            tokenReserve += amountIn;
            ethReserve -= amountOut;
        }
        
        emit FallbackSwap(msg.sender, amountIn, amountOut, ethToToken);
        return amountOut;
    }
    
    /**
     * @dev Calculates the expected output amount for a given input
     * @param ethToToken Direction of the swap
     * @param amountIn Amount of input asset
     * @return The expected output amount (before slippage)
     * 
     * This view function allows users to get a price quote without executing a swap.
     * It uses the same constant product formula and fee structure as actual swaps.
     */
    function getAmountOut(bool ethToToken, uint256 amountIn) external view returns (uint256) {
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeRate);
        
        if (ethToToken) {
            return (tokenReserve * amountInWithFee) / 
                   (ethReserve * FEE_DENOMINATOR + amountInWithFee);
        } else {
            return (ethReserve * amountInWithFee) / 
                   (tokenReserve * FEE_DENOMINATOR + amountInWithFee);
        }
    }
    
    /**
     * @dev Sets the sequencer address
     * @param newSequencer Address of the new sequencer
     * 
     * Only callable by the contract owner.
     */
    function setSequencer(address newSequencer) external onlyOwner {
        emit SequencerChanged(sequencer, newSequencer);
        sequencer = newSequencer;
    }
    
    /**
     * @dev Enables or disables sequencer-only mode
     * @param _sequencerOnly Whether to allow only the sequencer to execute swaps
     * 
     * When true, only batch swaps through the sequencer are allowed.
     * When false, direct swaps through fallbackSwap are also permitted.
     * Only callable by the contract owner.
     */
    function setSequencerOnly(bool _sequencerOnly) external onlyOwner {
        sequencerOnly = _sequencerOnly;
        emit SequencerModeChanged(_sequencerOnly);
    }
    
    /**
     * @dev Sets the fee rate for swaps
     * @param _feeRate New fee rate (in parts per 1000)
     * 
     * For example, a value of 3 equals a 0.3% fee.
     * Only callable by the contract owner.
     */
    function setFeeRate(uint256 _feeRate) external onlyOwner {
        require(_feeRate <= 50, "Fee too high"); // Max 5%
        feeRate = _feeRate;
    }
    
    /**
     * @dev Sets the delay between commit and reveal phases
     * @param _delay New delay in seconds
     * 
     * Only callable by the contract owner.
     */
    function setCommitRevealDelay(uint256 _delay) external onlyOwner {
        require(_delay <= 1 hours, "Delay too long");
        commitRevealDelay = _delay;
    }
    
    /**
     * @dev Emergency function to disable sequencer-only mode if the sequencer is inactive
     * 
     * This can be called by anyone if the sequencer hasn't submitted a batch
     * for longer than maxBatchDelay. It automatically enables fallback mode,
     * allowing users to execute swaps directly.
     * 
     * This prevents funds from being trapped if the sequencer becomes unavailable.
     */
    function emergencyDisableSequencer() external {
        require(
            block.timestamp > lastBatchTimestamp + maxBatchDelay,
            "Sequencer not considered inactive yet"
        );
        sequencerOnly = false;
        emit SequencerModeChanged(false);
    }
}
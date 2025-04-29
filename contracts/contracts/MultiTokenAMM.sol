// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MultiTokenAMM is ReentrancyGuard, Ownable {
    // For storing user balances of any token (ETH is address(0))
    mapping(address => mapping(address => uint256)) public tokenBalances;
    
    // Pool data structure
    struct LiquidityPool {
        address token0;
        address token1;
        uint256 reserve0;
        uint256 reserve1;
        uint256 totalShares;
        mapping(address => uint256) shares;
    }
    
    // Store pools by hash of token pair
    mapping(bytes32 => LiquidityPool) public pools;
    bytes32[] public allPools;
    address[] public supportedTokens;
    
    // Sequencer variables
    address public sequencer;
    uint256 public batchCounter = 0;
    uint256 public delay = 20 seconds;
    uint256 public emergencyTimeout = 24 hours;
    uint256 public lastSequencerActivity;
    bool public sequencerActive = true;
    uint256 public feeRate = 3; // 0.3% fee (divided by 1000)
    
    mapping(uint256 => bytes32) public batchIntentRoots;
    mapping(uint256 => uint256) public batchCommitTimes;
    mapping(uint256 => BatchResult) public batchResults;
    mapping(bytes32 => bool) public executedIntents; // Track which intents were processed
    
    // Result tracking for batches
    struct BatchResult {
        uint256 totalProcessed;
        uint256 successCount;
        uint256 failedCount;
        mapping(uint256 => FailureReason) failures;
    }
    
    enum FailureReason { 
        NONE,
        INVALID_PROOF, 
        INSUFFICIENT_BALANCE, 
        SLIPPAGE_TOO_HIGH, 
        POOL_NOT_FOUND,
        OTHER
    }
    
    // Swap intent structure
    struct SwapIntent {
        address user;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 timestamp;
    }
    
    // Events
    event LiquidityAdded(address indexed provider, address indexed token0, address indexed token1, uint256 amount0, uint256 amount1);
    event LiquidityRemoved(address indexed provider, address indexed token0, address indexed token1, uint256 amount0, uint256 amount1);
    event Swap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event BatchCommitted(uint256 indexed batchId, bytes32 intentRoot, uint256 timestamp);
    event BatchExecuted(uint256 indexed batchId, uint256 swapsProcessed, uint256 swapsSucceeded, uint256 swapsFailed);
    event SwapFailed(uint256 indexed batchId, uint256 swapIndex, FailureReason reason);
    event SequencerUpdated(address newSequencer);
    event SequencerStatusChanged(bool active);
    event EmergencyDirectSwap(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event FeeUpdated(uint256 newFeeRate);
    event DelayUpdated(uint256 newDelay);
    event TimeoutUpdated(uint256 newTimeout);
    
    constructor() Ownable(msg.sender) {
        sequencer = msg.sender;
        lastSequencerActivity = block.timestamp;
        // Add ETH as first supported token
        supportedTokens.push(address(0));
    }
    
    modifier onlySequencer() {
        require(msg.sender == sequencer, "Only sequencer");
        _;
    }
    
    modifier sequencerActiveOrTimedOut() {
        require(
            sequencerActive || 
            block.timestamp > lastSequencerActivity + emergencyTimeout, 
            "Sequencer active and not timed out"
        );
        _;
    }
    
    // Get unique pool ID for a token pair
    function getPoolKey(address tokenA, address tokenB) public pure returns (bytes32) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return keccak256(abi.encodePacked(token0, token1));
    }
    
    // Deposit ETH
    function depositETH() external payable {
        tokenBalances[msg.sender][address(0)] += msg.value;
    }
    
    // Deposit tokens
    function depositToken(address token, uint256 amount) external {
        require(token != address(0), "Use depositETH for ETH");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        tokenBalances[msg.sender][token] += amount;
    }
    
    // Withdraw ETH
    function withdrawETH(uint256 amount) external nonReentrant {
        require(tokenBalances[msg.sender][address(0)] >= amount, "Insufficient balance");
        tokenBalances[msg.sender][address(0)] -= amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");
    }
    
    // Withdraw tokens
    function withdrawToken(address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Use withdrawETH for ETH");
        require(tokenBalances[msg.sender][token] >= amount, "Insufficient balance");
        tokenBalances[msg.sender][token] -= amount;
        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");
    }
    
    // Add liquidity for a token-token pair (no ETH)
    function addLiquidityTokens(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external {
        require(tokenA != address(0) && tokenB != address(0), "Use addLiquidityETH for ETH pairs");
        require(tokenA != tokenB, "Identical tokens");
        
        // Transfer tokens from user
        require(IERC20(tokenA).transferFrom(msg.sender, address(this), amountA), "TokenA transfer failed");
        require(IERC20(tokenB).transferFrom(msg.sender, address(this), amountB), "TokenB transfer failed");
        
        // Sort tokens for consistent pool identification
        (address token0, address token1, uint256 amount0, uint256 amount1) = 
            tokenA < tokenB ? 
            (tokenA, tokenB, amountA, amountB) : 
            (tokenB, tokenA, amountB, amountA);
        
        _addLiquidity(token0, token1, amount0, amount1);
    }
    
    // Add liquidity for an ETH-token pair
    function addLiquidityETH(
        address token,
        uint256 tokenAmount
    ) external payable {
        require(token != address(0), "Token cannot be ETH");
        
        // Transfer token from user (ETH is already sent with msg.value)
        require(IERC20(token).transferFrom(msg.sender, address(this), tokenAmount), "Token transfer failed");
        
        // Sort tokens for consistent pool identification (ETH is always address(0))
        (address token0, address token1, uint256 amount0, uint256 amount1) = 
            address(0) < token ? 
            (address(0), token, msg.value, tokenAmount) : 
            (token, address(0), tokenAmount, msg.value);
        
        _addLiquidity(token0, token1, amount0, amount1);
    }
    
    // Internal function to handle the common liquidity addition logic
    function _addLiquidity(
        address token0,
        address token1,
        uint256 amount0, 
        uint256 amount1
    ) internal {
        bytes32 poolKey = getPoolKey(token0, token1);
        LiquidityPool storage pool = pools[poolKey];
        
        // Initialize new pool if needed
        if (pool.reserve0 == 0 && pool.reserve1 == 0) {
            pool.token0 = token0;
            pool.token1 = token1;
            allPools.push(poolKey);
            
            // Add tokens to supported tokens if they're not already there
            bool token0Supported = false;
            bool token1Supported = false;
            
            for (uint i = 0; i < supportedTokens.length; i++) {
                if (supportedTokens[i] == token0) token0Supported = true;
                if (supportedTokens[i] == token1) token1Supported = true;
            }
            
            if (!token0Supported) supportedTokens.push(token0);
            if (!token1Supported) supportedTokens.push(token1);
        } else {
            // Check for balanced liquidity provision
            require(
                amount0 * pool.reserve1 == amount1 * pool.reserve0,
                "Unbalanced liquidity"
            );
        }
        
        // Calculate liquidity shares
        uint256 shares;
        if (pool.totalShares == 0) {
            shares = amount0;  // Initial shares
        } else {
            shares = (amount0 * pool.totalShares) / pool.reserve0;
        }
        
        // Update pool
        pool.reserve0 += amount0;
        pool.reserve1 += amount1;
        pool.shares[msg.sender] += shares;
        pool.totalShares += shares;
        
        emit LiquidityAdded(msg.sender, token0, token1, amount0, amount1);
    }
    
    // Remove liquidity from a pool
    function removeLiquidity(
        address tokenA, 
        address tokenB, 
        uint256 shareAmount,
        uint256 minAmount0,
        uint256 minAmount1
    ) external nonReentrant {
        // Sort tokens for consistent pool identification
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        bytes32 poolKey = getPoolKey(token0, token1);
        LiquidityPool storage pool = pools[poolKey];
        
        require(pool.shares[msg.sender] >= shareAmount, "Insufficient shares");
        
        // Calculate token amounts to return based on share percentage
        uint256 amount0 = (pool.reserve0 * shareAmount) / pool.totalShares;
        uint256 amount1 = (pool.reserve1 * shareAmount) / pool.totalShares;
        
        require(amount0 >= minAmount0, "Amount0 below minimum");
        require(amount1 >= minAmount1, "Amount1 below minimum");
        
        // Update pool data
        pool.shares[msg.sender] -= shareAmount;
        pool.totalShares -= shareAmount;
        pool.reserve0 -= amount0;
        pool.reserve1 -= amount1;
        
        // Transfer tokens back to user
        if (token0 == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: amount0}("");
            require(success, "ETH transfer failed");
        } else {
            require(IERC20(token0).transfer(msg.sender, amount0), "Token0 transfer failed");
        }
        
        if (token1 == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: amount1}("");
            require(success, "ETH transfer failed");
        } else {
            require(IERC20(token1).transfer(msg.sender, amount1), "Token1 transfer failed");
        }
        
        emit LiquidityRemoved(msg.sender, token0, token1, amount0, amount1);
    }
    
    // Calculate swap amount using constant product formula
    function getSwapAmount(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal view returns (uint256) {
        uint256 amountInWithFee = amountIn * (1000 - feeRate);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        return numerator / denominator;
    }
    
    // View function to check expected swap output
    function getExpectedOutput(
        address tokenIn, 
        address tokenOut, 
        uint256 amountIn
    ) external view returns (uint256) {
        bytes32 poolKey = getPoolKey(tokenIn, tokenOut);
        LiquidityPool storage pool = pools[poolKey];
        require(pool.reserve0 > 0 && pool.reserve1 > 0, "Pool doesn't exist");
        
        bool isToken0 = tokenIn == pool.token0;
        uint256 reserveIn = isToken0 ? pool.reserve0 : pool.reserve1;
        uint256 reserveOut = isToken0 ? pool.reserve1 : pool.reserve0;
        
        return getSwapAmount(amountIn, reserveIn, reserveOut);
    }
    
    // Direct emergency swap (bypasses sequencer if timed out)
    function emergencySwap(
        address tokenIn, 
        address tokenOut, 
        uint256 amountIn, 
        uint256 minAmountOut
    ) external nonReentrant sequencerActiveOrTimedOut returns (uint256) {
        require(!sequencerActive || block.timestamp > lastSequencerActivity + emergencyTimeout, 
                "Sequencer is active");
        require(tokenBalances[msg.sender][tokenIn] >= amountIn, "Insufficient balance");
        
        bytes32 poolKey = getPoolKey(tokenIn, tokenOut);
        LiquidityPool storage pool = pools[poolKey];
        require(pool.reserve0 > 0 && pool.reserve1 > 0, "Pool doesn't exist");
        
        bool isToken0 = tokenIn == pool.token0;
        uint256 reserveIn = isToken0 ? pool.reserve0 : pool.reserve1;
        uint256 reserveOut = isToken0 ? pool.reserve1 : pool.reserve0;
        
        uint256 amountOut = getSwapAmount(amountIn, reserveIn, reserveOut);
        require(amountOut >= minAmountOut, "Slippage too high");
        
        // Update balances and reserves
        tokenBalances[msg.sender][tokenIn] -= amountIn;
        tokenBalances[msg.sender][tokenOut] += amountOut;
        
        if (isToken0) {
            pool.reserve0 += amountIn;
            pool.reserve1 -= amountOut;
        } else {
            pool.reserve0 -= amountOut;
            pool.reserve1 += amountIn;
        }
        
        emit EmergencyDirectSwap(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
        return amountOut;
    }
    
    // Commit batch of swap intents (sequencer only)
    function commitBatchIntents(bytes32 intentRoot, uint256 /* batchSize */) external onlySequencer {
        sequencerActive = true;
        lastSequencerActivity = block.timestamp;
        batchCounter++;
        batchIntentRoots[batchCounter] = intentRoot;
        batchCommitTimes[batchCounter] = block.timestamp;
        
        emit BatchCommitted(batchCounter, intentRoot, block.timestamp);
    }
    
    // Execute batch of swaps after delay
    function batchSwap(
        uint256 batchId, 
        SwapParams memory params
    ) external onlySequencer {
        require(block.timestamp >= batchCommitTimes[batchId] + delay, "Delay not passed");
        require(params.users.length == params.tokensIn.length, "Mismatched array lengths");
        require(params.users.length == params.tokensOut.length, "Mismatched array lengths");
        require(params.users.length == params.amountsIn.length, "Mismatched array lengths");
        require(params.users.length == params.minAmountsOut.length, "Mismatched array lengths");
        require(params.users.length == params.proofs.length, "Mismatched array lengths");
        
        // Set up batch result tracking
        BatchResult storage result = batchResults[batchId];
        result.totalProcessed = params.users.length;
        result.successCount = 0;
        result.failedCount = 0;
        
        lastSequencerActivity = block.timestamp;
        
        for (uint256 i = 0; i < params.users.length; i++) {
            bytes32 intentHash = getIntentHash(
                params.users[i],
                params.tokensIn[i],
                params.tokensOut[i],
                params.amountsIn[i],
                params.minAmountsOut[i],
                0
            );
            
            // Check if this intent was already executed
            if (executedIntents[intentHash]) {
                result.failures[i] = FailureReason.OTHER;
                result.failedCount++;
                emit SwapFailed(batchId, i, FailureReason.OTHER);
                continue;
            }
            
            bool valid = MerkleProof.verify(
                params.proofs[i],
                batchIntentRoots[batchId],
                intentHash
            );
            
            if (!valid) {
                result.failures[i] = FailureReason.INVALID_PROOF;
                result.failedCount++;
                emit SwapFailed(batchId, i, FailureReason.INVALID_PROOF);
                continue;
            }
            
            if (tokenBalances[params.users[i]][params.tokensIn[i]] < params.amountsIn[i]) {
                result.failures[i] = FailureReason.INSUFFICIENT_BALANCE;
                result.failedCount++;
                emit SwapFailed(batchId, i, FailureReason.INSUFFICIENT_BALANCE);
                continue;
            }
            
            bytes32 poolKey = getPoolKey(params.tokensIn[i], params.tokensOut[i]);
            LiquidityPool storage pool = pools[poolKey];
            
            if (pool.reserve0 == 0 && pool.reserve1 == 0) {
                result.failures[i] = FailureReason.POOL_NOT_FOUND;
                result.failedCount++;
                emit SwapFailed(batchId, i, FailureReason.POOL_NOT_FOUND);
                continue;
            }
            
            bool isToken0 = params.tokensIn[i] == pool.token0;
            uint256 reserveIn = isToken0 ? pool.reserve0 : pool.reserve1;
            uint256 reserveOut = isToken0 ? pool.reserve1 : pool.reserve0;
            
            uint256 amountOut = getSwapAmount(params.amountsIn[i], reserveIn, reserveOut);
            
            if (amountOut < params.minAmountsOut[i]) {
                result.failures[i] = FailureReason.SLIPPAGE_TOO_HIGH;
                result.failedCount++;
                emit SwapFailed(batchId, i, FailureReason.SLIPPAGE_TOO_HIGH);
                continue;
            }
            
            // Mark intent as executed
            executedIntents[intentHash] = true;
            
            // Update balances and reserves
            tokenBalances[params.users[i]][params.tokensIn[i]] -= params.amountsIn[i];
            tokenBalances[params.users[i]][params.tokensOut[i]] += amountOut;
            
            if (isToken0) {
                pool.reserve0 += params.amountsIn[i];
                pool.reserve1 -= amountOut;
            } else {
                pool.reserve0 -= amountOut;
                pool.reserve1 += params.amountsIn[i];
            }
            
            emit Swap(params.users[i], params.tokensIn[i], params.tokensOut[i], params.amountsIn[i], amountOut);
            result.successCount++;
        }
        
        emit BatchExecuted(batchId, params.users.length, result.successCount, result.failedCount);
    }
    
    // Check if an intent was included in a batch
    function wasIntentExecuted(
        address user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 timestamp
    ) external view returns (bool) {
        bytes32 intentHash = getIntentHash(user, tokenIn, tokenOut, amountIn, minAmountOut, timestamp);
        return executedIntents[intentHash];
    }
    
    // Get failure reason for a specific swap in a batch
    function getSwapFailureReason(uint256 batchId, uint256 swapIndex) external view returns (FailureReason) {
        return batchResults[batchId].failures[swapIndex];
    }
    
    // Get batch statistics
    function getBatchStats(uint256 batchId) external view returns (uint256 total, uint256 success, uint256 failed) {
        BatchResult storage result = batchResults[batchId];
        return (result.totalProcessed, result.successCount, result.failedCount);
    }
    
    // Change sequencer address (only owner)
    function setSequencer(address newSequencer) external onlyOwner {
        require(newSequencer != address(0), "Cannot be zero address");
        sequencer = newSequencer;
        emit SequencerUpdated(newSequencer);
    }
    
    // Set sequencer active status (only owner)
    function setSequencerActive(bool active) external onlyOwner {
        sequencerActive = active;
        emit SequencerStatusChanged(active);
    }
    
    // Change delay period (only owner)
    function setDelay(uint256 newDelay) external onlyOwner {
        delay = newDelay;
        emit DelayUpdated(newDelay);
    }
    
    // Change emergency timeout (only owner)
    function setEmergencyTimeout(uint256 newTimeout) external onlyOwner {
        emergencyTimeout = newTimeout;
        emit TimeoutUpdated(newTimeout);
    }
    
    // Change fee rate (only owner)
    function setFeeRate(uint256 newFeeRate) external onlyOwner {
        require(newFeeRate <= 50, "Fee cannot exceed 5%"); // Max 5% fee (50/1000)
        feeRate = newFeeRate;
        emit FeeUpdated(newFeeRate);
    }
    
    // Register a new token (only owner)
    function addSupportedToken(address token) external onlyOwner {
        for (uint i = 0; i < supportedTokens.length; i++) {
            if (supportedTokens[i] == token) revert("Token already supported");
        }
        supportedTokens.push(token);
    }
    
    // Helper struct for batch parameters
    struct SwapParams {
        address[] users;
        address[] tokensIn;
        address[] tokensOut;
        uint256[] amountsIn;
        uint256[] minAmountsOut;
        bytes32[][] proofs;
    }
    
    // Hash an intent for verification
    function getIntentHash(
        address user,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 timestamp
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(
            user,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            timestamp
        ));
    }
    
    // Get the ETH balance of a user
    function getETHBalance(address user) external view returns (uint256) {
        return tokenBalances[user][address(0)];
    }
    
    // Get the balance of a specific token for a user
    function getTokenBalance(address user, address token) external view returns (uint256) {
        return tokenBalances[user][token];
    }
    
    // Get multiple token balances for a user in one call
    function getUserBalances(address user, address[] calldata tokens) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](tokens.length);
        
        for (uint i = 0; i < tokens.length; i++) {
            balances[i] = tokenBalances[user][tokens[i]];
        }
        
        return balances;
    }
}
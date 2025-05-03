// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function transfer(address to, uint256 value) external returns (bool);
}

contract TEEAMM is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ─── Constants ───────────────────────────────────────────────────────── */
    uint16  public constant MAX_PROTOCOL_BP = 100;   // 1.00%
    uint256 public constant MAX_BATCH       = 2000;
    uint256 public constant BP_BASE         = 10_000; // Basis points denominator
    
    /* ─── Roles & Config ────────────────────────────────────────────────── */
    address public immutable guardian;
    address public immutable treasury;
    address public sequencer;
    IWETH  public immutable WETH;
    uint16 public protocolFeeBP;

    event ProtocolFeeUpdated(uint16 newBP);
    
    /* ─── Vault balances & nonces ───────────────────────────────────────── */
    mapping(address => mapping(IERC20 => uint256)) public balances;
    mapping(address => uint64)               public userNonce;

    event Deposit(address indexed user, IERC20 indexed token, uint256 amount);
    event DepositETH(address indexed user, uint256 amount);
    event Withdraw(address indexed user, IERC20 indexed token, uint256 amount);
    event WithdrawAll(address indexed user, IERC20 indexed token, uint256 amount);
    event WithdrawETH(address indexed user, uint256 amount);

    /* ─── Pool Enumeration ───────────────────────────────────────────────── */
    bytes32[] public poolList;
    mapping(bytes32 => bool) public poolExists;
    
    event PoolCreated(IERC20 indexed token0, IERC20 indexed token1, bytes32 poolKey);

    /* ─── Liquidity Pools ───────────────────────────────────────────────── */
    struct Pool {
        IERC20  token0;
        IERC20  token1;
        uint128 reserve0;
        uint128 reserve1;
        uint16  feeBP;
        uint256 totalShares;
        mapping(address => uint256) shares;
    }
    mapping(bytes32 => Pool) private pools;

    event LiquidityAdded(
        address indexed lp,
        IERC20 indexed token0,
        IERC20 indexed token1,
        uint256 amount0,
        uint256 amount1,
        uint256 shares
    );
    event LiquidityRemoved(
        address indexed lp,
        IERC20 indexed token0,
        IERC20 indexed token1,
        uint256 amount0,
        uint256 amount1,
        uint256 shares
    );

    /* ─── Swap Intents ──────────────────────────────────────────────────── */
    enum FailureReason { NONE, NONCE_MISMATCH, INSUFFICIENT_BALANCE, PRICING_FAILED, EXPIRED }
    struct SwapIntent {
        address user;
        IERC20  tokenIn;
        IERC20  tokenOut;
        uint128 amountIn;
        uint128 minOut;
        bool    directPayout;
        uint64  nonce;
        uint64  deadline;  // New field: timestamp when the swap intent expires
    }

    event Swap(
        address indexed user,
        IERC20 indexed tokenIn,
        IERC20 indexed tokenOut,
        uint256 inAmt,
        uint256 outAmt,
        bool    directPayout,
        uint64  nonce,
        uint256 fee
    );
    event SwapFailed(
        uint256 indexed idx,
        address indexed user,
        FailureReason reason
    );
    event BatchExecuted(uint256 successCount, uint256 failCount);
    event RevenueClaimed(address indexed treasury, IERC20 indexed token, uint256 amount);

    constructor(
        address _sequencer,
        address _guardian,
        address _treasury,
        IWETH _weth,
        uint16  _protocolBP
    ) {
        require(_sequencer != address(0)
             && _guardian  != address(0)
             && _treasury  != address(0)
             && address(_weth) != address(0), "zero address");
        require(_protocolBP <= MAX_PROTOCOL_BP, "protocol fee too high");

        sequencer     = _sequencer;
        guardian      = _guardian;
        treasury      = _treasury;
        WETH          = IWETH(_weth);
        protocolFeeBP = _protocolBP;
    }

    modifier onlySequencer() { require(msg.sender == sequencer, "!sequencer"); _; }
    modifier onlyGuardian()  { require(msg.sender == guardian,  "!guardian");  _; }
    modifier onlyTreasury()  { require(msg.sender == treasury,  "!treasury");  _; }

    /* ===== Helper functions ===== */
    function _getPoolKey(IERC20 tokenA, IERC20 tokenB) internal pure returns (bytes32 poolKey, IERC20 token0, IERC20 token1) {
        (token0, token1) = address(tokenA) < address(tokenB) 
            ? (tokenA, tokenB) 
            : (tokenB, tokenA);
        poolKey = keccak256(abi.encodePacked(address(token0), address(token1)));
        return (poolKey, token0, token1);
    }

    /* =====================================================================
     *  DEPOSIT & WITHDRAW (ERC-20 & ETH)
     * ===================================================================== */
    function deposit(IERC20 token, uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        token.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }
    
    function depositETH() external payable nonReentrant {
        require(msg.value > 0, "zero ETH");
        WETH.deposit{value: msg.value}();
        balances[msg.sender][IERC20(address(WETH))] += msg.value;
        emit DepositETH(msg.sender, msg.value);
    }
    
    function withdraw(IERC20 token, uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        require(balances[msg.sender][token] >= amount, "insufficient balance");
        balances[msg.sender][token] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, token, amount);
    }
    
    function withdrawAll(IERC20 token) external nonReentrant {
        uint256 bal = balances[msg.sender][token];
        require(bal > 0, "no balance");
        balances[msg.sender][token] = 0;
        token.safeTransfer(msg.sender, bal);
        emit WithdrawAll(msg.sender, token, bal);
    }
    
    function withdrawETH(uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        require(balances[msg.sender][IERC20(address(WETH))] >= amount, "insufficient balance");
        balances[msg.sender][IERC20(address(WETH))] -= amount;
        WETH.withdraw(amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit WithdrawETH(msg.sender, amount);
    }

    /* =====================================================================
     *  ADD / REMOVE LIQUIDITY
     * ===================================================================== */
    function addLiquidity(
        IERC20 tokenA,
        IERC20 tokenB,
        uint256 amountA,
        uint256 amountB,
        uint16  feeBP
    ) external nonReentrant returns (uint256 shares) {
        require(tokenA != tokenB, "identical tokens");
        require(feeBP <= MAX_PROTOCOL_BP, "fee too high");
        require(amountA > 0 && amountB > 0, "zero amount");

        (bytes32 poolKey, IERC20 t0, IERC20 t1) = _getPoolKey(tokenA, tokenB);
        uint256 a0 = address(tokenA) < address(tokenB) ? amountA : amountB;
        uint256 a1 = address(tokenA) < address(tokenB) ? amountB : amountA;
        
        Pool storage p = pools[poolKey];
        
        if (p.totalShares == 0) {
            p.token0      = t0;
            p.token1      = t1;
            p.feeBP       = feeBP;
            shares        = a0;
            
            // Register the pool for enumeration
            if (!poolExists[poolKey]) {
                poolExists[poolKey] = true;
                poolList.push(poolKey);
                emit PoolCreated(t0, t1, poolKey);
            }
        } else {
            require(p.feeBP == feeBP, "fee mismatch");
            require(uint256(p.reserve0) * a1 == uint256(p.reserve1) * a0, "unbalanced");
            shares = a0 * p.totalShares / p.reserve0;
        }

        t0.safeTransferFrom(msg.sender, address(this), a0);
        t1.safeTransferFrom(msg.sender, address(this), a1);
        p.reserve0    += uint128(a0);
        p.reserve1    += uint128(a1);
        p.totalShares += shares;
        p.shares[msg.sender] += shares;
        emit LiquidityAdded(msg.sender, t0, t1, a0, a1, shares);
    }
    
    function removeLiquidity(
        IERC20 tokenA,
        IERC20 tokenB,
        uint256 share,
        uint256 minA,
        uint256 minB
    ) external nonReentrant returns (uint256 amountA, uint256 amountB) {
        require(share > 0, "zero share");
        
        // Get pool key and call internal implementation
        (bytes32 poolKey, , ) = _getPoolKey(tokenA, tokenB);
        return _removeLiquidityInternal(poolKey, tokenA, tokenB, share, minA, minB);
    }
    
    function _removeLiquidityInternal(
        bytes32 poolKey,
        IERC20 tokenA,
        IERC20 tokenB,
        uint256 share,
        uint256 minA,
        uint256 minB
    ) private returns (uint256 amountA, uint256 amountB) {
        Pool storage p = pools[poolKey];
        require(p.shares[msg.sender] >= share, "insufficient shares");
        require(tokenA != tokenB, "identical tokens");
        // Calculate amounts based on share proportion
        uint256 amount0 = uint256(p.reserve0) * share / p.totalShares;
        uint256 amount1 = uint256(p.reserve1) * share / p.totalShares;
        
        // Map to user's token order
        if (address(tokenA) == address(p.token0)) {
            amountA = amount0;
            amountB = amount1;
        } else {
            amountA = amount1;
            amountB = amount0;
        }
        
        // Check min amounts
        require(amountA >= minA && amountB >= minB, "slippage");
        
        // Update pool state
        p.reserve0 -= uint128(amount0);
        p.reserve1 -= uint128(amount1);
        p.totalShares -= share;
        p.shares[msg.sender] -= share;
        
        // Transfer tokens
        p.token0.safeTransfer(msg.sender, amount0);
        p.token1.safeTransfer(msg.sender, amount1);
        
        emit LiquidityRemoved(msg.sender, p.token0, p.token1, amount0, amount1, share);
    }

    /* =====================================================================
     *  BATCH SWAP
     * ===================================================================== */
    function batchSwap(SwapIntent[] calldata xs) external onlySequencer {
        require(xs.length > 0 && xs.length <= MAX_BATCH, "invalid batch");
        uint256 ok = 0;
        uint256 fail = 0;
        
        for (uint256 i = 0; i < xs.length; i++) {
            SwapIntent calldata s = xs[i];
            FailureReason reason = FailureReason.NONE;
            
            if (s.nonce != userNonce[s.user]) {
                reason = FailureReason.NONCE_MISMATCH;
            } else if (s.deadline < block.timestamp) {
                reason = FailureReason.EXPIRED;
            } else if (balances[s.user][s.tokenIn] < s.amountIn) {
                reason = FailureReason.INSUFFICIENT_BALANCE;
            } else {
                uint256 protoFee = uint256(s.amountIn) * protocolFeeBP / BP_BASE;
                uint128 tradeIn  = uint128(uint256(s.amountIn) - protoFee);
                (bool okPrice, uint256 outAmt) = _quoteAndUpdate(
                    s.tokenIn, s.tokenOut, tradeIn, s.minOut
                );
                
                if (!okPrice) {
                    reason = FailureReason.PRICING_FAILED;
                } else {
                    balances[s.user][s.tokenIn]     -= s.amountIn;
                    balances[treasury][s.tokenIn]   += protoFee;
                    
                    if (s.directPayout) {
                        s.tokenOut.safeTransfer(s.user, outAmt);
                    } else {
                        balances[s.user][s.tokenOut] += outAmt;
                    }
                    
                    userNonce[s.user] = s.nonce + 1;
                    emit Swap(
                        s.user, s.tokenIn, s.tokenOut,
                        s.amountIn, outAmt, s.directPayout,
                        s.nonce, protoFee
                    );
                    ok++;
                    continue;
                }
            }
            
            emit SwapFailed(i, s.user, reason);
            fail++;
        }
        
        emit BatchExecuted(ok, fail);
    }

    /* ===== Internal pricing and reserve update ===== */
    function _quoteAndUpdate(
        IERC20 inT,
        IERC20 outT,
        uint128 dx,
        uint128 minOut
    ) private returns (bool, uint256 dy) {
        (bytes32 poolKey, IERC20 t0, ) = _getPoolKey(inT, outT);
        Pool storage p = pools[poolKey];
        
        if (p.reserve0 == 0 || p.reserve1 == 0) return (false, 0);
        
        bool in0 = address(inT) == address(t0);
        (uint128 rIn, uint128 rOut) = in0 ? (p.reserve0, p.reserve1) : (p.reserve1, p.reserve0);
        
        // Calculate fee-adjusted amount
        uint256 dxFee = uint256(dx) * (BP_BASE - p.feeBP);
        uint256 numerator = uint256(rOut) * dxFee;
        uint256 denominator = (uint256(rIn) * BP_BASE) + dxFee;
        dy = numerator / denominator;
        
        if (dy < minOut) return (false, 0);
        
        if (in0) { 
            p.reserve0 += dx; 
            p.reserve1 -= uint128(dy); 
        } else { 
            p.reserve0 -= uint128(dy); 
            p.reserve1 += dx; 
        }
        
        return (true, dy);
    }

    /* ===== View functions ===== */
    function getReserves(IERC20 tokenA, IERC20 tokenB) external view returns (uint128, uint128) {
        (bytes32 poolKey, , ) = _getPoolKey(tokenA, tokenB);
        Pool storage p = pools[poolKey];
        return (p.reserve0, p.reserve1);
    }
    
    function getMyLiquidity(IERC20 tokenA, IERC20 tokenB) external view returns (uint256) {
        (bytes32 poolKey, , ) = _getPoolKey(tokenA, tokenB);
        return pools[poolKey].shares[msg.sender];
    }

    function getMyBalance(IERC20 token) external view returns (uint256) {
        return balances[msg.sender][token];
    }

    function getMyNonce() external view returns (uint64) {
        return userNonce[msg.sender];
    }

    function getSequencer() external view returns (address) {
        return sequencer;
    }
    
    /* ===== Pool enumeration functions ===== */
    function getPoolCount() external view returns (uint256) {
        return poolList.length;
    }
    
    function getPoolKeyAtIndex(uint256 index) external view returns (bytes32) {
        require(index < poolList.length, "index out of bounds");
        return poolList[index];
    }
    
    function getPoolByKey(bytes32 poolKey) external view returns (
        IERC20 token0, 
        IERC20 token1, 
        uint128 reserve0, 
        uint128 reserve1,
        uint16 feeBP,
        uint256 totalShares
    ) {
        require(poolExists[poolKey], "pool doesn't exist");
        Pool storage p = pools[poolKey];
        return (p.token0, p.token1, p.reserve0, p.reserve1, p.feeBP, p.totalShares);
    }
    
    function getPoolAtIndex(uint256 index) external view returns (
        IERC20 token0, 
        IERC20 token1, 
        uint128 reserve0, 
        uint128 reserve1,
        uint16 feeBP,
        uint256 totalShares
    ) {
        require(index < poolList.length, "index out of bounds");
        bytes32 poolKey = poolList[index];
        Pool storage p = pools[poolKey];
        return (p.token0, p.token1, p.reserve0, p.reserve1, p.feeBP, p.totalShares);
    }
    
    /* =====================================================================
     *  REVENUE & ADMIN
     * ===================================================================== */
    function claimRevenue(IERC20 token, uint256 amount)
        external onlyTreasury nonReentrant
    {
        require(amount > 0, "zero amount");
        require(balances[treasury][token] >= amount, "insufficient balance");
        balances[treasury][token] -= amount;
        token.safeTransfer(treasury, amount);
        emit RevenueClaimed(treasury, token, amount);
    }
    
    function claimAllRevenue(IERC20 token)
        external onlyTreasury nonReentrant
    {
        uint256 bal = balances[treasury][token];
        require(bal > 0, "no revenue");
        balances[treasury][token] = 0;
        token.safeTransfer(treasury, bal);
        emit RevenueClaimed(treasury, token, bal);
    }
    
    function setProtocolFeeBP(uint16 newBP) external onlyGuardian {
        require(newBP <= MAX_PROTOCOL_BP, "feeBP too high");
        protocolFeeBP = newBP;
        emit ProtocolFeeUpdated(newBP);
    }

    /* =====================================================================
     *  DEBUG
     * ===================================================================== */
    function ping() external pure returns (string memory) {
        return "pong";
    }
    
    /* =====================================================================
     *  FALLBACK FUNCTIONS
     * ===================================================================== */
    // Ensure the contract can receive ETH when WETH.withdraw is called
    receive() external payable {}
}
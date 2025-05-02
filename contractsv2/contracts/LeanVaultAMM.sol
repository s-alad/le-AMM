// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * LeanVaultAMM v8 – Typed failure reasons
 * ---------------------------------------------------------------------------
 * Enhancements:
 *  • Introduce FailureReason enum to standardize swap failure codes.
 *  • SwapFailed now emits a typed reason instead of raw bytes.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LeanVaultAMM is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ─── Failure reasons ───────────────────────────────────────────────── */
    enum FailureReason {
        NONE,
        NONCE_MISMATCH,
        INSUFFICIENT_BALANCE,
        PRICING_FAILED
    }

    /* ─── Constants ─────────────────────────────────────────────────────── */
    uint16 public constant MAX_FEE_BP = 50; // 0.50% pool fee cap
    uint16 public constant MAX_PROTOCOL_BP = 100; // 1.00% protocol fee cap
    uint256 public constant MAX_BATCH = 2_000; // batch transaction limit

    /* ─── Roles & Config ────────────────────────────────────────────────── */
    address public immutable guardian;
    address public immutable treasury;
    address public sequencer;
    uint16 public protocolFeeBP;

    event SequencerRotated(address indexed newSequencer);
    event ProtocolFeeUpdated(uint16 newBP);

    /* ─── Vault balances & nonces ───────────────────────────────────────── */
    mapping(address => mapping(IERC20 => uint256)) public balances;
    mapping(address => uint64) public userNonce;

    event Deposit(address indexed user, IERC20 indexed token, uint256 amount);
    event Withdraw(address indexed user, IERC20 indexed token, uint256 amount);
    event Sweep(address indexed user, IERC20 indexed token, uint256 amount);

    /* ─── Liquidity Pools ───────────────────────────────────────────────── */
    struct Pool {
        IERC20 token0;
        IERC20 token1;
        uint128 reserve0;
        uint128 reserve1;
        uint16 feeBP;
        uint256 totalShares;
        mapping(address => uint256) shares;
    }
    mapping(IERC20 => mapping(IERC20 => Pool)) private pools;

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
    struct SwapIntent {
        address user;
        IERC20 tokenIn;
        IERC20 tokenOut;
        uint128 amountIn;
        uint128 minOut;
        bool vaultOut;
        uint64 nonce;
    }

    event Swap(
        address indexed user,
        IERC20 indexed tokenIn,
        IERC20 indexed tokenOut,
        uint256 inAmt,
        uint256 outAmt,
        bool vaultOut,
        uint64 nonce,
        uint256 fee
    );
    event SwapFailed(
        uint256 indexed idx,
        address indexed user,
        FailureReason reason
    );
    event BatchExecuted(uint256 successCount, uint256 failCount);
    event RevenueClaimed(
        address indexed treasury,
        IERC20 indexed token,
        uint256 amount
    );

    constructor(
        address _sequencer,
        address _guardian,
        address _treasury,
        uint16 _protocolBP
    ) {
        require(
            _sequencer != address(0) &&
                _guardian != address(0) &&
                _treasury != address(0),
            "zero address"
        );
        require(_protocolBP <= MAX_PROTOCOL_BP, "protocol fee too high");

        sequencer = _sequencer;
        guardian = _guardian;
        treasury = _treasury;
        protocolFeeBP = _protocolBP;
    }

    modifier onlySequencer() {
        require(msg.sender == sequencer, "!sequencer");
        _;
    }
    modifier onlyGuardian() {
        require(msg.sender == guardian, "!guardian");
        _;
    }
    modifier onlyTreasury() {
        require(msg.sender == treasury, "!treasury");
        _;
    }

    /* =====================================================================
     *  DEPOSIT & WITHDRAW
     * ===================================================================== */
    function deposit(IERC20 token, uint256 amount) external nonReentrant {
        token.safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    function withdraw(IERC20 token, uint256 amount) external nonReentrant {
        balances[msg.sender][token] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, token, amount);
    }

    function sweep(IERC20 token) external nonReentrant {
        uint256 bal = balances[msg.sender][token];
        require(bal > 0, "no balance");
        balances[msg.sender][token] = 0;
        token.safeTransfer(msg.sender, bal);
        emit Sweep(msg.sender, token, bal);
    }

    /* =====================================================================
     *  ADD / REMOVE LIQUIDITY
     * ===================================================================== */
    function addLiquidity(
        IERC20 tokenA,
        IERC20 tokenB,
        uint256 amountA,
        uint256 amountB,
        uint16 feeBP
    ) external nonReentrant returns (uint256 shares) {
        require(tokenA != tokenB, "identical tokens");
        require(feeBP <= MAX_FEE_BP, "fee too high");

        (IERC20 t0, IERC20 t1, uint256 a0, uint256 a1) = address(tokenA) <
            address(tokenB)
            ? (tokenA, tokenB, amountA, amountB)
            : (tokenB, tokenA, amountB, amountA);

        Pool storage p = pools[t0][t1];
        if (p.totalShares == 0) {
            p.token0 = t0;
            p.token1 = t1;
            p.feeBP = feeBP;
            shares = a0;
        } else {
            require(p.feeBP == feeBP, "fee mismatch");
            require(
                uint256(p.reserve0) * a1 == uint256(p.reserve1) * a0,
                "unbalanced"
            );
            shares = (a0 * p.totalShares) / p.reserve0;
        }

        t0.safeTransferFrom(msg.sender, address(this), a0);
        t1.safeTransferFrom(msg.sender, address(this), a1);
        p.reserve0 += uint128(a0);
        p.reserve1 += uint128(a1);
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
        (IERC20 t0, IERC20 t1) = address(tokenA) < address(tokenB)
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        Pool storage p = pools[t0][t1];
        uint256 userShares = p.shares[msg.sender];
        require(userShares >= share && share > 0, "invalid shares");
        amountA = (uint256(p.reserve0) * share) / p.totalShares;
        amountB = (uint256(p.reserve1) * share) / p.totalShares;
        require(amountA >= minA && amountB >= minB, "slippage");
        p.reserve0 -= uint128(amountA);
        p.reserve1 -= uint128(amountB);
        p.totalShares -= share;
        p.shares[msg.sender] = userShares - share;
        t0.safeTransfer(msg.sender, amountA);
        t1.safeTransfer(msg.sender, amountB);
        emit LiquidityRemoved(msg.sender, t0, t1, amountA, amountB, share);
    }

    /* =====================================================================
     *  BATCH SWAP
     * ===================================================================== */
    function batchSwap(SwapIntent[] calldata xs) external onlySequencer {
        require(xs.length > 0 && xs.length <= MAX_BATCH, "invalid batch");
        uint256 ok;
        uint256 fail;
        for (uint256 i; i < xs.length; ) {
            SwapIntent calldata s = xs[i];
            FailureReason reason = FailureReason.NONE;
            if (s.nonce != userNonce[s.user]) {
                reason = FailureReason.NONCE_MISMATCH;
            } else if (balances[s.user][s.tokenIn] < s.amountIn) {
                reason = FailureReason.INSUFFICIENT_BALANCE;
            } else {
                uint256 protoFee = (uint256(s.amountIn) * protocolFeeBP) /
                    10_000;
                uint128 tradeIn = uint128(uint256(s.amountIn) - protoFee);
                (bool okPrice, uint256 outAmt) = _quote(
                    s.tokenIn,
                    s.tokenOut,
                    tradeIn,
                    s.minOut
                );
                if (!okPrice) {
                    reason = FailureReason.PRICING_FAILED;
                } else {
                    balances[s.user][s.tokenIn] -= s.amountIn;
                    balances[treasury][s.tokenIn] += protoFee;
                    if (s.vaultOut) {
                        balances[s.user][s.tokenOut] += outAmt;
                    } else {
                        s.tokenOut.safeTransfer(s.user, outAmt);
                    }
                    userNonce[s.user] = s.nonce + 1;
                    emit Swap(
                        s.user,
                        s.tokenIn,
                        s.tokenOut,
                        s.amountIn,
                        outAmt,
                        s.vaultOut,
                        s.nonce,
                        protoFee
                    );
                    unchecked {
                        ++ok;
                        ++i;
                    }
                    continue;
                }
            }
            emit SwapFailed(i, s.user, reason);
            unchecked {
                ++fail;
                ++i;
            }
        }
        emit BatchExecuted(ok, fail);
    }

    /* ===== Internal pricing and reserve update ===== */
    function _quote(
        IERC20 inT,
        IERC20 outT,
        uint128 dx,
        uint128 minOut
    ) private returns (bool, uint256 dy) {
        (IERC20 t0, IERC20 t1, bool in0) = address(inT) < address(outT)
            ? (inT, outT, true)
            : (outT, inT, false);
        Pool storage p = pools[t0][t1];
        if (p.reserve0 == 0 || p.reserve1 == 0) return (false, 0);
        (uint128 rIn, uint128 rOut) = in0
            ? (p.reserve0, p.reserve1)
            : (p.reserve1, p.reserve0);
        uint256 dxFee = uint256(dx) * (10_000 - p.feeBP);
        dy = (uint256(rOut) * dxFee) / (uint256(rIn) * 10_000 + dxFee);
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

    /* =====================================================================
     *  REVENUE & ADMIN
     * ===================================================================== */
    function claimRevenue(
        IERC20 token,
        uint256 amount
    ) external onlyTreasury nonReentrant {
        require(amount > 0, "zero amount");
        balances[treasury][token] -= amount;
        token.safeTransfer(treasury, amount);
        emit RevenueClaimed(treasury, token, amount);
    }

    function claimAllRevenue(IERC20 token) external onlyTreasury nonReentrant {
        uint256 bal = balances[treasury][token];
        require(bal > 0, "no revenue");
        balances[treasury][token] = 0;
        token.safeTransfer(treasury, bal);
        emit RevenueClaimed(treasury, token, bal);
    }

    function guardianWithdraw(
        address user,
        IERC20 token
    ) external onlyGuardian nonReentrant {
        uint256 bal = balances[user][token];
        balances[user][token] = 0;
        token.safeTransfer(user, bal);
    }

    function rotateSequencer(address newSeq) external onlyGuardian {
        require(newSeq != address(0), "zero address");
        sequencer = newSeq;
        emit SequencerRotated(newSeq);
    }

    function setProtocolFeeBP(uint16 newBP) external onlyGuardian {
        require(newBP <= MAX_PROTOCOL_BP, "feeBP too high");
        protocolFeeBP = newBP;
        emit ProtocolFeeUpdated(newBP);
    }
}

import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "viem";
import { Address } from "viem";

describe("TEEAMM", () => {

    const DEFAULT_ADDRESS = "0x46E1b359A285Ec33D7c77398125247b97d35C366";

    interface DeployOptions {
        sequencer?: Address;
        guardian?: Address;
        treasury?: Address;
        protocolBP?: number;
    }

    const getClients = async () => {
        const [wc] = await hre.viem.getWalletClients();
        const pc = await hre.viem.getPublicClient();
        return { wc, pc };
    };

    const deployContracts = async (options: DeployOptions = {}) => {
        try {
            const TEEWETH = await hre.viem.deployContract("TEEWETH", []);

            const {
                sequencer = DEFAULT_ADDRESS,
                guardian = DEFAULT_ADDRESS,
                treasury = DEFAULT_ADDRESS,
                protocolBP = 10 // 0.1%
            } = options;

            const TEEAMM = await hre.viem.deployContract("TEEAMM", [
                sequencer,
                guardian,
                treasury,
                TEEWETH.address,
                protocolBP,
            ]);
            return { TEEAMM, TEEWETH };
        } catch (error) {
            console.error("deploy error:", error); throw error;
        }
    };

    it("should deploy the contract successfully", async () => {
        const { TEEAMM, TEEWETH } = await deployContracts();
        expect(TEEAMM.address).to.not.equal(null);
        expect(TEEWETH.address).to.not.equal(null);
        console.log("ADDRESS: ", TEEAMM.address)
        console.log("MWETH: ", TEEWETH.address)
    });

    it("should set the sequencer address correctly", async () => {
        const { TEEAMM } = await deployContracts();
        expect(await TEEAMM.read.getSequencer()).
            to.equal("0x46E1b359A285Ec33D7c77398125247b97d35C366");
    });

    it("should initialize nonce to zero", async () => {
        const { TEEAMM } = await deployContracts();
        expect(await TEEAMM.read.getMyNonce()).to.equal(0n);
    });

    it("should deposit ETH successfully", async () => {
        const { TEEAMM, TEEWETH } = await deployContracts();

        const deposit = parseEther("100");
        const { wc } = await getClients();

        const initial = await TEEAMM.read.balances([
            wc.account.address,
            TEEWETH.address
        ]) as bigint;

        const tx = await TEEAMM.write.depositETH({
            value: deposit,
        });

        const receipt = await (await hre.viem.getPublicClient()).waitForTransactionReceipt({ hash: tx });
        expect(receipt.status).to.equal("success");

        const balance = await TEEAMM.read.balances([
            wc.account.address,
            TEEWETH.address
        ]) as bigint;

        expect(balance).to.equal(initial + deposit);
    });

    it("should withdraw ETH successfully", async () => {
        const { TEEAMM, TEEWETH } = await deployContracts();
        const { wc, pc } = await getClients();
        const amount = parseEther("100");

        // Deposit ETH
        const depositTx = await TEEAMM.write.depositETH({ value: amount });
        await pc.waitForTransactionReceipt({ hash: depositTx });

        // Verify deposit balance
        const balanceAfterDeposit = await TEEAMM.read.balances([wc.account.address, TEEWETH.address]) as bigint;
        expect(balanceAfterDeposit).to.equal(amount);

        // Withdraw ETH
        const withdrawTx = await TEEAMM.write.withdrawETH([amount]);
        await pc.waitForTransactionReceipt({ hash: withdrawTx });

        // Verify balance is zero after withdrawal
        const finalBalance = await TEEAMM.read.balances([wc.account.address, TEEWETH.address]) as bigint;
        expect(finalBalance).to.equal(0n);
    });

    it("should add liquidity for multiple token pairs", async () => {
        // Deploy contracts and additional test tokens
        const { TEEAMM, TEEWETH } = await deployContracts();
        const tk1 = await hre.viem.deployContract("TEETOK", ["Token1", "TKN1"]);
        const tk2 = await hre.viem.deployContract("TEETOK", ["Token2", "TKN2"]);

        const { wc, pc } = await getClients();

        // Mint some test tokens to our wallet
        const mintAmount = parseEther("1000");
        await tk1.write.mint([wc.account.address, mintAmount]);
        await tk2.write.mint([wc.account.address, mintAmount]);

        // Get WETH by directly depositing into TEEWETH
        const ethAmount = parseEther("100");
        await TEEWETH.write.deposit({ value: ethAmount });

        // Approve tokens for TEEAMM contract
        await tk1.write.approve([TEEAMM.address, mintAmount]);
        await tk2.write.approve([TEEAMM.address, mintAmount]);
        await TEEWETH.write.approve([TEEAMM.address, ethAmount]);

        // Define liquidity amounts
        const token1Amount = parseEther("50");
        const token2Amount = parseEther("75");
        const wethAmount = parseEther("25");
        const feeBP = 30; // 0.3%

        // 1. Add liquidity for Token1/TEEWETH
        const tx1 = await TEEAMM.write.addLiquidity([
            tk1.address,
            TEEWETH.address,
            token1Amount,
            wethAmount,
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx1 });

        // Check reserves for Token1/TEEWETH
        const [reserve1_0, reserve1_1] = await TEEAMM.read.getReserves([
            tk1.address,
            TEEWETH.address
        ]) as [bigint, bigint];

        // Verify reserves match the added liquidity
        const [t1, tw] = tk1.address < TEEWETH.address
            ? [token1Amount, wethAmount]
            : [wethAmount, token1Amount];
        expect(reserve1_0).to.equal(t1);
        expect(reserve1_1).to.equal(tw);

        // 2. Add liquidity for Token2/TEEWETH
        const tx2 = await TEEAMM.write.addLiquidity([
            tk2.address,
            TEEWETH.address,
            token2Amount,
            wethAmount,
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx2 });

        // Check reserves for Token2/TEEWETH
        const [reserve2_0, reserve2_1] = await TEEAMM.read.getReserves([
            tk2.address,
            TEEWETH.address
        ]) as [bigint, bigint];

        // Verify reserves match the added liquidity
        const [t2, tw2] = tk2.address < TEEWETH.address
            ? [token2Amount, wethAmount]
            : [wethAmount, token2Amount];
        expect(reserve2_0).to.equal(t2);
        expect(reserve2_1).to.equal(tw2);

        // 3. Add liquidity for Token1/Token2
        const tx3 = await TEEAMM.write.addLiquidity([
            tk1.address,
            tk2.address,
            token1Amount,
            token2Amount,
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx3 });

        // Check reserves for Token1/Token2
        const [reserve3_0, reserve3_1] = await TEEAMM.read.getReserves([
            tk1.address,
            tk2.address
        ]) as [bigint, bigint];

        // Verify reserves match the added liquidity
        const [t1_2, t2_2] = tk1.address < tk2.address
            ? [token1Amount, token2Amount]
            : [token2Amount, token1Amount];
        expect(reserve3_0).to.equal(t1_2);
        expect(reserve3_1).to.equal(t2_2);
    });

    it("should swap token to token successfully", async () => {
        const { wc, pc } = await getClients();

        const { TEEAMM, TEEWETH } = await deployContracts({
            sequencer: wc.account.address,
            protocolBP: 10 // 0.1% protocol fee
        });

        const tk1 = await hre.viem.deployContract("TEETOK", ["Token1", "TK1"]);
        const tk2 = await hre.viem.deployContract("TEETOK", ["Token2", "TK2"]);

        // Mint tokens and set up liquidity
        const mintAmount = 10000n;
        const liquidityAmount = 1000n;
        const swapAmount = 100n;
        await tk1.write.mint([wc.account.address, mintAmount]);
        await tk2.write.mint([wc.account.address, mintAmount]);

        // Approve tokens for TEEAMM
        await tk1.write.approve([TEEAMM.address, mintAmount]);
        await tk2.write.approve([TEEAMM.address, mintAmount]);

        const feeBP = 5; // 0.05%
        const tx = await TEEAMM.write.addLiquidity([
            tk1.address,
            tk2.address,
            liquidityAmount,
            liquidityAmount,
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx });

        // Deposit tokens to be swapped
        await TEEAMM.write.deposit([tk1.address, swapAmount]);

        // Check initial balances
        const initialToken1Balance = await TEEAMM.read.balances([
            wc.account.address, tk1.address
        ]) as bigint;
        const initialToken2Balance = await TEEAMM.read.balances([
            wc.account.address, tk2.address
        ]) as bigint;

        console.log("initialToken1Balance: ", initialToken1Balance);
        console.log("initialToken2Balance: ", initialToken2Balance);

        // Set up swap intent
        const swapIntent = {
            user: wc.account.address,
            tokenIn: tk1.address,
            tokenOut: tk2.address,
            amountIn: swapAmount,
            minOut: 0n,
            directPayout: false,
            nonce: 0n,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 3600)
        };

        // Execute swap as sequencer
        await TEEAMM.write.batchSwap([[{
            user: swapIntent.user,
            tokenIn: swapIntent.tokenIn,
            tokenOut: swapIntent.tokenOut,
            amountIn: swapAmount,
            minOut: 0n,
            directPayout: swapIntent.directPayout,
            nonce: 0n,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 3600)
        }]]);

        // Check final balances
        const finalToken1Balance = await TEEAMM.read.balances([
            wc.account.address, tk1.address
        ]) as bigint;
        const finalToken2Balance = await TEEAMM.read.balances([
            wc.account.address, tk2.address
        ]) as bigint;

        console.log("finalToken1Balance: ", finalToken1Balance);
        console.log("finalToken2Balance: ", finalToken2Balance);

        // Verify token1 was spent and token2 was received
        expect(finalToken1Balance).to.equal(initialToken1Balance - swapAmount);
        console.log("Token2 received: ", finalToken2Balance - initialToken2Balance);
        expect(finalToken2Balance > initialToken2Balance).to.be.true;
    });

    it("should swap token to ETH successfully", async () => {
        // Get wallet client to use as sequencer
        const { wc, pc } = await getClients();

        // Deploy contracts with our address as sequencer
        const { TEEAMM, TEEWETH } = await deployContracts({
            sequencer: wc.account.address,
            protocolBP: 10 // 0.1% protocol fee
        });

        // Deploy test token
        const Token = await hre.viem.deployContract("TEETOK", ["Token", "TKN"]);

        // Mint tokens
        const mintAmount = 10000n;
        await Token.write.mint([wc.account.address, mintAmount]);

        // Deposit ETH to create liquidity
        const ethLiquidityAmount = 1000n; // Increased 10x
        await TEEAMM.write.depositETH({ value: ethLiquidityAmount });

        // Approve tokens for TEEAMM
        await Token.write.approve([TEEAMM.address, mintAmount]);

        // Need to deposit and approve WETH 
        await TEEWETH.write.deposit({ value: ethLiquidityAmount });
        await TEEWETH.write.approve([TEEAMM.address, ethLiquidityAmount]);

        // Add liquidity for Token/WETH pair
        const tokenLiquidityAmount = 1000n; // Increased 10x
        const feeBP = 5; // 0.05%

        const tx = await TEEAMM.write.addLiquidity([
            Token.address,
            TEEWETH.address,
            tokenLiquidityAmount,
            ethLiquidityAmount,
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx });

        // Deposit tokens to be swapped
        const swapAmount = 100n;
        await TEEAMM.write.deposit([Token.address, swapAmount]);

        // Check initial balances
        const initialTokenBalance = await TEEAMM.read.balances([
            wc.account.address, Token.address
        ]) as bigint;
        const initialWethBalance = await TEEAMM.read.balances([
            wc.account.address, TEEWETH.address
        ]) as bigint;

        console.log("initialTokenBalance: ", initialTokenBalance);
        console.log("initialWethBalance: ", initialWethBalance);

        // Set up swap intent
        const swapIntent = {
            user: wc.account.address,
            tokenIn: Token.address,
            tokenOut: TEEWETH.address,
            amountIn: swapAmount,
            minOut: 0n,
            directPayout: false,
            nonce: 0n,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 3600)
        };

        // Execute swap as sequencer
        await TEEAMM.write.batchSwap([[{
            user: swapIntent.user,
            tokenIn: swapIntent.tokenIn,
            tokenOut: swapIntent.tokenOut,
            amountIn: swapAmount,
            minOut: 0n,
            directPayout: swapIntent.directPayout,
            nonce: 0n,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 3600)
        }]]);

        // Check final balances
        const finalTokenBalance = await TEEAMM.read.balances([
            wc.account.address, Token.address
        ]) as bigint;
        const finalWethBalance = await TEEAMM.read.balances([
            wc.account.address, TEEWETH.address
        ]) as bigint;

        console.log("finalTokenBalance: ", finalTokenBalance);
        console.log("finalWethBalance: ", finalWethBalance);
        console.log("WETH received: ", finalWethBalance - initialWethBalance);

        // Verify token was spent and WETH was received
        expect(finalTokenBalance).to.equal(initialTokenBalance - swapAmount);
        expect(finalWethBalance > initialWethBalance).to.be.true;
    });

    it("should swap ETH to token successfully", async () => {
        // Get wallet client to use as sequencer
        const { wc, pc } = await getClients();

        // Deploy contracts with our address as sequencer
        const { TEEAMM, TEEWETH } = await deployContracts({
            sequencer: wc.account.address,
            protocolBP: 10 // 0.1% protocol fee
        });

        // Deploy test token
        const Token = await hre.viem.deployContract("TEETOK", ["Token", "TKN"]);

        // Mint tokens
        const mintAmount = 10000n;
        await Token.write.mint([wc.account.address, mintAmount]);

        // Deposit ETH for liquidity and for swap
        const ethLiquidityAmount = 1000n; // Increased 10x
        const swapAmount = 100n;
        const totalEthAmount = ethLiquidityAmount + swapAmount;
        await TEEAMM.write.depositETH({ value: totalEthAmount });

        // Approve token for TEEAMM
        await Token.write.approve([TEEAMM.address, mintAmount]);

        // Need to deposit and approve WETH
        await TEEWETH.write.deposit({ value: ethLiquidityAmount });
        await TEEWETH.write.approve([TEEAMM.address, ethLiquidityAmount]);

        // Add liquidity for Token/WETH pair
        const tokenLiquidityAmount = 1000n; // Increased 10x
        const feeBP = 5; // 0.05%

        const tx = await TEEAMM.write.addLiquidity([
            Token.address,
            TEEWETH.address,
            tokenLiquidityAmount,
            ethLiquidityAmount,
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx });

        // Check initial balances
        const initialTokenBalance = await TEEAMM.read.balances([
            wc.account.address, Token.address
        ]) as bigint;
        const initialWethBalance = await TEEAMM.read.balances([
            wc.account.address, TEEWETH.address
        ]) as bigint;

        console.log("initialTokenBalance: ", initialTokenBalance);
        console.log("initialWethBalance: ", initialWethBalance);

        // Set up swap intent
        const swapIntent = {
            user: wc.account.address,
            tokenIn: TEEWETH.address,
            tokenOut: Token.address,
            amountIn: swapAmount,
            minOut: 0n,
            directPayout: false,
            nonce: 0n,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 3600)
        };

        // Execute swap as sequencer
        await TEEAMM.write.batchSwap([[{
            user: swapIntent.user,
            tokenIn: swapIntent.tokenIn,
            tokenOut: swapIntent.tokenOut,
            amountIn: swapAmount,
            minOut: 0n,
            directPayout: swapIntent.directPayout,
            nonce: 0n,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 3600)
        }]]);

        // Check final balances
        const finalTokenBalance = await TEEAMM.read.balances([
            wc.account.address, Token.address
        ]) as bigint;
        const finalWethBalance = await TEEAMM.read.balances([
            wc.account.address, TEEWETH.address
        ]) as bigint;

        console.log("finalTokenBalance: ", finalTokenBalance);
        console.log("finalWethBalance: ", finalWethBalance);
        console.log("Token received: ", finalTokenBalance - initialTokenBalance);

        // Verify WETH was spent and token was received
        expect(finalWethBalance).to.equal(initialWethBalance - swapAmount);
        expect(finalTokenBalance > initialTokenBalance).to.be.true;
    });

    it("should remove liquidity successfully", async () => {
        // Get wallet client and public client
        const { wc, pc } = await getClients();

        // Deploy contracts
        const { TEEAMM, TEEWETH } = await deployContracts();

        // Deploy tokens for testing
        const tk1 = await hre.viem.deployContract("TEETOK", ["TokenA", "TKA"]);
        const tk2 = await hre.viem.deployContract("TEETOK", ["TokenB", "TKB"]);

        // Mint tokens to our wallet
        const mintAmount = 1000n;
        await tk1.write.mint([wc.account.address, mintAmount]);
        await tk2.write.mint([wc.account.address, mintAmount]);

        // Approve tokens for TEEAMM
        await tk1.write.approve([TEEAMM.address, mintAmount]);
        await tk2.write.approve([TEEAMM.address, mintAmount]);

        // Log balances
        const genesisTk1Balance = await tk1.read.balanceOf([wc.account.address]) as bigint;
        const genesisTk2Balance = await tk2.read.balanceOf([wc.account.address]) as bigint;
        console.log("Genesis wallet balances:", genesisTk1Balance, genesisTk2Balance);

        // Add liquidity - both tokens with 100 units each
        const addAmount = 100n;
        const feeBP = 5; // 0.05%

        const addTx = await TEEAMM.write.addLiquidity([
            tk1.address,
            tk2.address,
            addAmount,
            addAmount,
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: addTx });

        // Check initial reserves
        const [initReserve0, initReserve1] = await TEEAMM.read.getReserves([
            tk1.address,
            tk2.address
        ]) as [bigint, bigint];

        // Check LP position
        const initialLpPosition = await TEEAMM.read.getMyLiquidity([
            tk1.address,
            tk2.address
        ]) as bigint;

        // Check initial wallet token balances
        const initialTk1Balance = await tk1.read.balanceOf([wc.account.address]) as bigint;
        const initialTk2Balance = await tk2.read.balanceOf([wc.account.address]) as bigint;

        console.log("Initial reserves:", initReserve0, initReserve1);
        console.log("Initial LP position:", initialLpPosition);
        console.log("Initial wallet balances:", initialTk1Balance, initialTk2Balance);

        // Now remove ALL liquidity (100% of LP tokens)
        const removeShare = initialLpPosition;
        const minAmountOut = 90n; // Expect to get at least 90 tokens back (from 100)

        const removeTx = await TEEAMM.write.removeLiquidity([
            tk1.address,
            tk2.address,
            removeShare,
            minAmountOut,
            minAmountOut
        ]);
        await pc.waitForTransactionReceipt({ hash: removeTx });

        // Check updated reserves
        const [finalReserve0, finalReserve1] = await TEEAMM.read.getReserves([
            tk1.address,
            tk2.address
        ]) as [bigint, bigint];

        // Check LP position after removal
        const finalLpPosition = await TEEAMM.read.getMyLiquidity([
            tk1.address,
            tk2.address
        ]) as bigint;

        // Check final wallet token balances
        const finalTk1Balance = await tk1.read.balanceOf([wc.account.address]) as bigint;
        const finalTk2Balance = await tk2.read.balanceOf([wc.account.address]) as bigint;

        console.log("Final reserves:", finalReserve0, finalReserve1);
        console.log("Final LP position:", finalLpPosition);
        console.log("Final wallet balances:", finalTk1Balance, finalTk2Balance);

        // Verify LP tokens were fully burned
        expect(finalLpPosition).to.equal(0n);

        // Verify reserves are now zero
        expect(finalReserve0).to.equal(0n);
        expect(finalReserve1).to.equal(0n);

        // Verify tokens were returned to the wallet (all 100 of each)
        expect(finalTk1Balance).to.equal(initialTk1Balance + addAmount);
        expect(finalTk2Balance).to.equal(initialTk2Balance + addAmount);
    });

    it("should send tokens directly to wallet with directPayout=true", async () => {
        // Get wallet client to use as sequencer
        const { wc, pc } = await getClients();

        // Deploy contracts with our address as sequencer
        const { TEEAMM, TEEWETH } = await deployContracts({
            sequencer: wc.account.address,
            protocolBP: 10 // 0.1% protocol fee
        });

        // Deploy test tokens
        const tk1 = await hre.viem.deployContract("TEETOK", ["Token1", "TK1"]);
        const tk2 = await hre.viem.deployContract("TEETOK", ["Token2", "TK2"]);

        // Mint tokens
        const mintAmount = 10000n;
        await tk1.write.mint([wc.account.address, mintAmount]);
        await tk2.write.mint([wc.account.address, mintAmount]);

        // Approve tokens for TEEAMM
        await tk1.write.approve([TEEAMM.address, mintAmount]);
        await tk2.write.approve([TEEAMM.address, mintAmount]);

        // Set up pool with 1000 tokens each
        const liquidityAmount = 1000n;
        const feeBP = 5; // 0.05%

        const tx = await TEEAMM.write.addLiquidity([
            tk1.address,
            tk2.address,
            liquidityAmount,
            liquidityAmount,
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx });

        // Deposit tokens to be swapped
        const swapAmount = 100n;
        await TEEAMM.write.deposit([tk1.address, swapAmount]);

        // Initial balances
        const initialTEEAMMBalance = await TEEAMM.read.balances([
            wc.account.address, tk1.address
        ]) as bigint;
        const initialWalletBalance = await tk2.read.balanceOf([wc.account.address]) as bigint;
        const initialTEEAMMtk2Balance = await TEEAMM.read.balances([
            wc.account.address, tk2.address
        ]) as bigint;

        console.log("Initial TEEAMM tk1 balance:", initialTEEAMMBalance);
        console.log("Initial wallet tk2 balance:", initialWalletBalance);
        console.log("Initial TEEAMM tk2 balance:", initialTEEAMMtk2Balance);

        // Execute swap with directPayout=true
        await TEEAMM.write.batchSwap([[{
            user: wc.account.address,
            tokenIn: tk1.address,
            tokenOut: tk2.address,
            amountIn: swapAmount,
            minOut: 0n,
            directPayout: true,
            nonce: 0n,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 3600)
        }]]);

        // Final balances
        const finalTEEAMMBalance = await TEEAMM.read.balances([
            wc.account.address, tk1.address
        ]) as bigint;
        const finalWalletBalance = await tk2.read.balanceOf([wc.account.address]) as bigint;
        const finalTEEAMMtk2Balance = await TEEAMM.read.balances([
            wc.account.address, tk2.address
        ]) as bigint;

        console.log("Final TEEAMM tk1 balance:", finalTEEAMMBalance);
        console.log("Final wallet tk2 balance:", finalWalletBalance);
        console.log("Final TEEAMM tk2 balance:", finalTEEAMMtk2Balance);

        // Verify tokens were spent from TEEAMM balance
        expect(finalTEEAMMBalance).to.equal(initialTEEAMMBalance - swapAmount);

        // Verify received tokens went directly to wallet (not TEEAMM balance)
        expect(finalWalletBalance > initialWalletBalance).to.be.true;
        expect(finalTEEAMMtk2Balance).to.equal(initialTEEAMMtk2Balance);

        console.log("Tokens received in wallet:", finalWalletBalance - initialWalletBalance);
    });

    it("should correctly handle batch swaps with mixed success and failure", async () => {
        // Get wallet client to use as sequencer
        const { wc, pc } = await getClients();

        // Deploy contracts with our address as sequencer
        const { TEEAMM, TEEWETH } = await deployContracts({
            sequencer: wc.account.address
        });

        // Deploy test tokens
        const tk1 = await hre.viem.deployContract("TEETOK", ["Token1", "TK1"]);
        const tk2 = await hre.viem.deployContract("TEETOK", ["Token2", "TK2"]);
        const tk3 = await hre.viem.deployContract("TEETOK", ["Token3", "TK3"]);

        // Mint tokens
        const mintAmount = parseEther("10000");
        await tk1.write.mint([wc.account.address, mintAmount]);
        await tk2.write.mint([wc.account.address, mintAmount]);
        await tk3.write.mint([wc.account.address, mintAmount]);

        // Approve tokens for TEEAMM
        await tk1.write.approve([TEEAMM.address, mintAmount]);
        await tk2.write.approve([TEEAMM.address, mintAmount]);
        await tk3.write.approve([TEEAMM.address, mintAmount]);

        // Create two liquidity pools: tk1-tk2 and tk2-tk3
        const liquidityAmount = parseEther("1000");
        const feeBP = 5; // 0.05%

        await TEEAMM.write.addLiquidity([
            tk1.address, tk2.address, liquidityAmount, liquidityAmount, feeBP
        ]);

        await TEEAMM.write.addLiquidity([
            tk2.address, tk3.address, liquidityAmount, liquidityAmount, feeBP
        ]);

        // IMPORTANT: Only deposit EXACTLY enough for our expected successful swaps
        // This way we can be sure no unexpected swaps succeed
        await TEEAMM.write.deposit([tk1.address, parseEther("200")]); // For 2 swaps of 100 each
        await TEEAMM.write.deposit([tk2.address, parseEther("50")]); // Only for one potential swap

        // Get initial balances and nonce
        const initialTk1Balance = await TEEAMM.read.balances([wc.account.address, tk1.address]) as bigint;
        const initialTk2Balance = await TEEAMM.read.balances([wc.account.address, tk2.address]) as bigint;
        const initialTk3Balance = await TEEAMM.read.balances([wc.account.address, tk3.address]) as bigint;
        const initialNonce = await TEEAMM.read.getMyNonce() as bigint;

        console.log("Initial balances:", {
            tk1: initialTk1Balance,
            tk2: initialTk2Balance,
            tk3: initialTk3Balance,
            nonce: initialNonce
        });

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Create a batch with precisely controlled expected outcomes
        const swaps = [
            // Swap 0: SUCCESS - tk1 -> tk2 with valid nonce and sufficient balance
            {
                user: wc.account.address,
                tokenIn: tk1.address,
                tokenOut: tk2.address,
                amountIn: parseEther("100"),
                minOut: 0n,
                directPayout: false,
                nonce: initialNonce,
                deadline
            },
            // Swap 1: SUCCESS - tk1 -> tk2 with next nonce and sufficient balance
            {
                user: wc.account.address,
                tokenIn: tk1.address,
                tokenOut: tk2.address,
                amountIn: parseEther("100"),
                minOut: 0n,
                directPayout: false,
                nonce: initialNonce + 1n,
                deadline
            },
            // Swap 2: FAILURE - Nonce mismatch (skipping a nonce)
            {
                user: wc.account.address,
                tokenIn: tk1.address,
                tokenOut: tk2.address,
                amountIn: parseEther("50"),
                minOut: 0n,
                directPayout: false,
                nonce: initialNonce + 3n, // Wrong nonce (skipping 2)
                deadline
            },
            // Swap 3: FAILURE - Insufficient balance (already used all tk1)
            {
                user: wc.account.address,
                tokenIn: tk1.address,
                tokenOut: tk2.address,
                amountIn: parseEther("50"),
                minOut: 0n,
                directPayout: false,
                nonce: initialNonce + 2n,
                deadline
            },
            // Swap 4: FAILURE - Pricing failure (impossible minOut)
            {
                user: wc.account.address,
                tokenIn: tk2.address,
                tokenOut: tk3.address,
                amountIn: parseEther("50"),
                minOut: parseEther("1000"), // Impossible minOut
                directPayout: false,
                nonce: initialNonce + 2n,
                deadline
            },
        ];

        // Execute the batch swap with all intents
        const batchTx = await TEEAMM.write.batchSwap([swaps]);

        // Get the transaction receipt
        const receipt = await pc.waitForTransactionReceipt({ hash: batchTx });

        // Use the public client to parse logs with the contract ABI
        const swapEvents = await pc.getContractEvents({
            address: TEEAMM.address,
            abi: TEEAMM.abi,
            eventName: 'Swap',
            fromBlock: receipt.blockNumber,
            toBlock: receipt.blockNumber
        });

        const failedEvents = await pc.getContractEvents({
            address: TEEAMM.address,
            abi: TEEAMM.abi,
            eventName: 'SwapFailed',
            fromBlock: receipt.blockNumber,
            toBlock: receipt.blockNumber
        });

        const batchEvents = await pc.getContractEvents({
            address: TEEAMM.address,
            abi: TEEAMM.abi,
            eventName: 'BatchExecuted',
            fromBlock: receipt.blockNumber,
            toBlock: receipt.blockNumber
        });

        // Get final balances and nonce
        const finalTk1Balance = await TEEAMM.read.balances([wc.account.address, tk1.address]) as bigint;
        const finalTk2Balance = await TEEAMM.read.balances([wc.account.address, tk2.address]) as bigint;
        const finalTk3Balance = await TEEAMM.read.balances([wc.account.address, tk3.address]) as bigint;
        const finalNonce = await TEEAMM.read.getMyNonce() as bigint;

        console.log("Final balances:", {
            tk1: finalTk1Balance,
            tk2: finalTk2Balance,
            tk3: finalTk3Balance,
            nonce: finalNonce
        });

        console.log("Events:", {
            swapSuccess: swapEvents.length,
            swapFailed: failedEvents.length,
            batchEvents: batchEvents.length
        });

        // EXPECT EXACTLY 2 SUCCESSFUL SWAPS
        expect(swapEvents.length).to.equal(2, "Should have exactly 2 successful swaps");

        // EXPECT EXACTLY 3 FAILED SWAPS
        expect(failedEvents.length).to.equal(3, "Should have exactly 3 failed swaps");

        // EXPECT EXACTLY 1 BATCH EXECUTED EVENT
        expect(batchEvents.length).to.equal(1, "Should have exactly 1 BatchExecuted event");

        // Verify the BatchExecuted event has the correct success/fail counts
        if (batchEvents.length > 0) {
            const batchEvent = batchEvents[0];
            expect(batchEvent.args.successCount).to.equal(2n);
            expect(batchEvent.args.failCount).to.equal(3n);
        }

        // VERIFY THE EXACT SWAP NONCES & TOKENS

        // First successful swap should be the first one in our array
        expect(swapEvents[0].args.nonce).to.equal(0n);
        expect(swapEvents[0].args.tokenIn?.toLowerCase()).to.equal(tk1.address.toLowerCase());
        expect(swapEvents[0].args.tokenOut?.toLowerCase()).to.equal(tk2.address.toLowerCase());

        // Second successful swap should be the second one in our array
        expect(swapEvents[1].args.nonce).to.equal(1n);
        expect(swapEvents[1].args.tokenIn?.toLowerCase()).to.equal(tk1.address.toLowerCase());
        expect(swapEvents[1].args.tokenOut?.toLowerCase()).to.equal(tk2.address.toLowerCase());


        // Verify token1 was spent for the 2 successful swaps (200 total)
        expect(finalTk1Balance).to.equal(0n, "All tk1 should be spent");

        // Verify token3 balance remained unchanged (all tk2->tk3 swaps failed)
        expect(finalTk3Balance).to.equal(0n, "No tk3 should be received");

        // Verify nonce increased by 2 (for the 2 successful swaps)
        expect(finalNonce).to.equal(initialNonce + 2n, "Nonce should increase by 2");

        // Verify the specific failure reasons if there are expected failed events
        if (failedEvents.length >= 3) {
            // Sort by index to match our original array order
            const failureReasons = failedEvents
                .map(event => ({
                    index: Number(event.args.idx),
                    reason: Number(event.args.reason)
                }))
                .sort((a, b) => a.index - b.index);

            // Enum FailureReason { NONE, NONCE_MISMATCH, INSUFFICIENT_BALANCE, PRICING_FAILED, EXPIRED }
            const NONCE_MISMATCH = 1;
            const INSUFFICIENT_BALANCE = 2;
            const PRICING_FAILED = 3;

            // We expect these specific failures in this order based on our swap intents
            // Swap 2 (index 2) - NONCE_MISMATCH
            expect(failureReasons[0].index).to.equal(2);
            expect(failureReasons[0].reason).to.equal(NONCE_MISMATCH);

            // Swap 3 (index 3) - INSUFFICIENT_BALANCE
            expect(failureReasons[1].index).to.equal(3);
            expect(failureReasons[1].reason).to.equal(INSUFFICIENT_BALANCE);

            // Swap 4 (index 4) - PRICING_FAILED
            expect(failureReasons[2].index).to.equal(4);
            expect(failureReasons[2].reason).to.equal(PRICING_FAILED);
        }
    });

    it("should enforce swap intent deadlines correctly", async () => {
        // Get wallet client to use as sequencer
        const { wc, pc } = await getClients();

        // Deploy contracts with our address as sequencer
        const { TEEAMM, TEEWETH } = await deployContracts({
            sequencer: wc.account.address
        });

        // Deploy test tokens
        const tk1 = await hre.viem.deployContract("TEETOK", ["Token1", "TK1"]);
        const tk2 = await hre.viem.deployContract("TEETOK", ["Token2", "TK2"]);

        // Mint tokens and set up liquidity
        const mintAmount = parseEther("1000");
        await tk1.write.mint([wc.account.address, mintAmount]);
        await tk2.write.mint([wc.account.address, mintAmount]);

        // Approve tokens for TEEAMM
        await tk1.write.approve([TEEAMM.address, mintAmount]);
        await tk2.write.approve([TEEAMM.address, mintAmount]);

        // Create liquidity pool
        const liquidityAmount = parseEther("500");
        const feeBP = 5; // 0.05%
        await TEEAMM.write.addLiquidity([
            tk1.address, tk2.address, liquidityAmount, liquidityAmount, feeBP
        ]);

        // Deposit tokens for swapping
        const swapAmount = parseEther("50");
        await TEEAMM.write.deposit([tk1.address, swapAmount * 2n]); // Deposit enough for 2 swaps

        // Get initial nonce
        const nonce = await TEEAMM.read.getMyNonce() as bigint;

        // Get current timestamp
        const now = Math.floor(Date.now() / 1000);

        // Create two identical swap intents with different deadlines
        const validDeadline = BigInt(now + 3600); // 1 hour in the future
        const expiredDeadline = BigInt(now - 60); // 1 minute in the past

        // Create batch with two swap intents - one valid, one expired
        const swaps = [
            // Swap 0: Should SUCCEED - future deadline
            {
                user: wc.account.address,
                tokenIn: tk1.address,
                tokenOut: tk2.address,
                amountIn: swapAmount,
                minOut: 0n,
                directPayout: false,
                nonce: nonce,
                deadline: validDeadline
            },
            // Swap 1: Should FAIL - expired deadline
            {
                user: wc.account.address,
                tokenIn: tk1.address,
                tokenOut: tk2.address,
                amountIn: swapAmount,
                minOut: 0n,
                directPayout: false,
                nonce: nonce + 1n,
                deadline: expiredDeadline
            }
        ];

        // Execute batch swap
        const batchTx = await TEEAMM.write.batchSwap([swaps]);
        const receipt = await pc.waitForTransactionReceipt({ hash: batchTx });

        // Get events
        const swapEvents = await pc.getContractEvents({
            address: TEEAMM.address,
            abi: TEEAMM.abi,
            eventName: 'Swap',
            fromBlock: receipt.blockNumber,
            toBlock: receipt.blockNumber
        });

        const failedEvents = await pc.getContractEvents({
            address: TEEAMM.address,
            abi: TEEAMM.abi,
            eventName: 'SwapFailed',
            fromBlock: receipt.blockNumber,
            toBlock: receipt.blockNumber
        });

        const batchEvents = await pc.getContractEvents({
            address: TEEAMM.address,
            abi: TEEAMM.abi,
            eventName: 'BatchExecuted',
            fromBlock: receipt.blockNumber,
            toBlock: receipt.blockNumber
        });

        // Verify event counts
        expect(swapEvents.length).to.equal(1, "Should have exactly 1 successful swap");
        expect(failedEvents.length).to.equal(1, "Should have exactly 1 failed swap");
        expect(batchEvents.length).to.equal(1, "Should have exactly 1 batch execution event");

        // Verify batch execution event counts
        expect(batchEvents[0].args.successCount).to.equal(1n);
        expect(batchEvents[0].args.failCount).to.equal(1n);

        // Verify that the successful swap was the one with a valid deadline
        expect(swapEvents[0].args.nonce).to.equal(nonce);

        // Verify that the failed swap was due to an expired deadline
        // FailureReason: NONE = 0, NONCE_MISMATCH = 1, INSUFFICIENT_BALANCE = 2, PRICING_FAILED = 3, EXPIRED = 4
        const EXPIRED = 4;
        expect(failedEvents[0].args.idx).to.equal(1n); // Second swap in the batch (index 1)
        expect(failedEvents[0].args.reason).to.equal(EXPIRED);

        // Verify nonce was only incremented for the successful swap
        const finalNonce = await TEEAMM.read.getMyNonce() as bigint;
        expect(finalNonce).to.equal(nonce + 1n, "Nonce should be incremented by 1");
    });

    it("should correctly handle multi-pool interactions", async () => {
        // Get clients
        const { wc, pc } = await getClients();

        // Deploy contracts
        const { TEEAMM, TEEWETH } = await deployContracts();

        // Deploy three test tokens for multiple pools
        const tokenA = await hre.viem.deployContract("TEETOK", ["TokenA", "TKA"]);
        const tokenB = await hre.viem.deployContract("TEETOK", ["TokenB", "TKB"]);
        const tokenC = await hre.viem.deployContract("TEETOK", ["TokenC", "TKC"]);

        // Mint tokens
        const mintAmount = parseEther("1000");
        await tokenA.write.mint([wc.account.address, mintAmount]);
        await tokenB.write.mint([wc.account.address, mintAmount]);
        await tokenC.write.mint([wc.account.address, mintAmount]);

        // Approve tokens
        await tokenA.write.approve([TEEAMM.address, mintAmount]);
        await tokenB.write.approve([TEEAMM.address, mintAmount]);
        await tokenC.write.approve([TEEAMM.address, mintAmount]);

        // Create multiple pools with different fee levels
        const amountA = parseEther("100");
        const amountB = parseEther("200");
        const amountC = parseEther("300");

        // Create Pool A-B with 0.3% fee
        await TEEAMM.write.addLiquidity([
            tokenA.address, tokenB.address, amountA, amountB, 30 // 0.3% fee
        ]);

        // Create Pool B-C with 0.1% fee
        await TEEAMM.write.addLiquidity([
            tokenB.address, tokenC.address, amountB, amountC, 10 // 0.1% fee
        ]);

        // Create Pool A-C with 0.5% fee
        await TEEAMM.write.addLiquidity([
            tokenA.address, tokenC.address, amountA, amountC, 50 // 0.5% fee
        ]);

        // Verify pools were created and have correct reserves
        const poolCount = await TEEAMM.read.getPoolCount() as bigint;
        expect(poolCount).to.equal(3n, "Should have created 3 pools");

        // Check reserves of each pool
        const [reserveAB_0, reserveAB_1] = await TEEAMM.read.getReserves([
            tokenA.address, tokenB.address
        ]) as [bigint, bigint];

        const [reserveBC_0, reserveBC_1] = await TEEAMM.read.getReserves([
            tokenB.address, tokenC.address
        ]) as [bigint, bigint];

        const [reserveAC_0, reserveAC_1] = await TEEAMM.read.getReserves([
            tokenA.address, tokenC.address
        ]) as [bigint, bigint];

        // Verify reserves match what we added
        // Need to account for token address ordering
        const [expectedAB_0, expectedAB_1] = tokenA.address < tokenB.address
            ? [amountA, amountB]
            : [amountB, amountA];
        const [expectedBC_0, expectedBC_1] = tokenB.address < tokenC.address
            ? [amountB, amountC]
            : [amountC, amountB];
        const [expectedAC_0, expectedAC_1] = tokenA.address < tokenC.address
            ? [amountA, amountC]
            : [amountC, amountA];

        expect(reserveAB_0).to.equal(expectedAB_0, "Pool A-B reserve0 mismatch");
        expect(reserveAB_1).to.equal(expectedAB_1, "Pool A-B reserve1 mismatch");
        expect(reserveBC_0).to.equal(expectedBC_0, "Pool B-C reserve0 mismatch");
        expect(reserveBC_1).to.equal(expectedBC_1, "Pool B-C reserve1 mismatch");
        expect(reserveAC_0).to.equal(expectedAC_0, "Pool A-C reserve0 mismatch");
        expect(reserveAC_1).to.equal(expectedAC_1, "Pool A-C reserve1 mismatch");

        // Remove half of liquidity from Pool A-B
        const lpAmountAB = await TEEAMM.read.getMyLiquidity([
            tokenA.address, tokenB.address
        ]) as bigint;

        const halfLpAmountAB = lpAmountAB / 2n;
        const minAmount = 1n; // Minimal slippage check for test

        await TEEAMM.write.removeLiquidity([
            tokenA.address,
            tokenB.address,
            halfLpAmountAB,
            minAmount,
            minAmount
        ]);

        // Verify reserves for Pool A-B were reduced by half
        const [reserveAB_0_after, reserveAB_1_after] = await TEEAMM.read.getReserves([
            tokenA.address, tokenB.address
        ]) as [bigint, bigint];

        // For bigint comparison, use a tolerance threshold
        const isWithinTolerance = (actual: bigint, expected: bigint, tolerance: bigint): boolean => {
            const diff = actual > expected ? actual - expected : expected - actual;
            return diff <= tolerance;
        };

        // Allow 1% difference due to rounding (1/100th of the original value)
        const tolerance0 = reserveAB_0 / 100n;
        const tolerance1 = reserveAB_1 / 100n;
        const expectedHalfReserve0 = reserveAB_0 / 2n;
        const expectedHalfReserve1 = reserveAB_1 / 2n;

        expect(
            isWithinTolerance(reserveAB_0_after, expectedHalfReserve0, tolerance0),
            `Pool A-B reserve0 not reduced correctly: expected ~${expectedHalfReserve0}, got ${reserveAB_0_after}, diff: ${reserveAB_0_after > expectedHalfReserve0 ? reserveAB_0_after - expectedHalfReserve0 : expectedHalfReserve0 - reserveAB_0_after}`
        ).to.be.true;

        expect(
            isWithinTolerance(reserveAB_1_after, expectedHalfReserve1, tolerance1),
            `Pool A-B reserve1 not reduced correctly: expected ~${expectedHalfReserve1}, got ${reserveAB_1_after}, diff: ${reserveAB_1_after > expectedHalfReserve1 ? reserveAB_1_after - expectedHalfReserve1 : expectedHalfReserve1 - reserveAB_1_after}`
        ).to.be.true;

        // Verify other pools are unaffected
        const [reserveBC_0_after, reserveBC_1_after] = await TEEAMM.read.getReserves([
            tokenB.address, tokenC.address
        ]) as [bigint, bigint];

        const [reserveAC_0_after, reserveAC_1_after] = await TEEAMM.read.getReserves([
            tokenA.address, tokenC.address
        ]) as [bigint, bigint];

        expect(reserveBC_0_after).to.equal(reserveBC_0, "Pool B-C reserves changed unexpectedly");
        expect(reserveBC_1_after).to.equal(reserveBC_1, "Pool B-C reserves changed unexpectedly");
        expect(reserveAC_0_after).to.equal(reserveAC_0, "Pool A-C reserves changed unexpectedly");
        expect(reserveAC_1_after).to.equal(reserveAC_1, "Pool A-C reserves changed unexpectedly");

        // Add more liquidity to Pool B-C
        const additionalAmountB = parseEther("50");
        const additionalAmountC = parseEther("75");

        await TEEAMM.write.addLiquidity([
            tokenB.address,
            tokenC.address,
            additionalAmountB,
            additionalAmountC,
            10 // Same fee as before
        ]);

        // Verify reserves for Pool B-C increased correctly
        const [reserveBC_0_final, reserveBC_1_final] = await TEEAMM.read.getReserves([
            tokenB.address, tokenC.address
        ]) as [bigint, bigint];

        // Calculate expected reserves
        const expectedReserveBC_0 = tokenB.address < tokenC.address
            ? reserveBC_0 + additionalAmountB
            : reserveBC_0 + additionalAmountC;

        const expectedReserveBC_1 = tokenB.address < tokenC.address
            ? reserveBC_1 + additionalAmountC
            : reserveBC_1 + additionalAmountB;

        expect(reserveBC_0_final).to.equal(expectedReserveBC_0, "Pool B-C reserve0 not increased correctly");
        expect(reserveBC_1_final).to.equal(expectedReserveBC_1, "Pool B-C reserve1 not increased correctly");

        // Other pools still unaffected
        const [reserveAB_0_final, reserveAB_1_final] = await TEEAMM.read.getReserves([
            tokenA.address, tokenB.address
        ]) as [bigint, bigint];

        const [reserveAC_0_final, reserveAC_1_final] = await TEEAMM.read.getReserves([
            tokenA.address, tokenC.address
        ]) as [bigint, bigint];

        expect(reserveAB_0_final).to.equal(reserveAB_0_after, "Pool A-B reserves changed unexpectedly");
        expect(reserveAB_1_final).to.equal(reserveAB_1_after, "Pool A-B reserves changed unexpectedly");
        expect(reserveAC_0_final).to.equal(reserveAC_0, "Pool A-C reserves changed unexpectedly");
        expect(reserveAC_1_final).to.equal(reserveAC_1, "Pool A-C reserves changed unexpectedly");
    });
});

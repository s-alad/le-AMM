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
        const [wc] = await hre.viem.getWalletClients();

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
        const [wc] = await hre.viem.getWalletClients();
        const pc = await hre.viem.getPublicClient();
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
        
        const [wc] = await hre.viem.getWalletClients();
        const pc = await hre.viem.getPublicClient();
        
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
        const [wc] = await hre.viem.getWalletClients();
        const pc = await hre.viem.getPublicClient();
        
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
        const [wc] = await hre.viem.getWalletClients();
        const pc = await hre.viem.getPublicClient();
        
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
        const [wc] = await hre.viem.getWalletClients();
        const pc = await hre.viem.getPublicClient();
        
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
        const [wc] = await hre.viem.getWalletClients();
        const pc = await hre.viem.getPublicClient();
        
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
});

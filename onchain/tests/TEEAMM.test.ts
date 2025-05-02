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
                protocolBP = 50
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
        const Token1 = await hre.viem.deployContract("TEETOK", ["hi", "HI"]);
        const Token2 = await hre.viem.deployContract("TEETOK", ["si", "SI"]);
        
        const [wc] = await hre.viem.getWalletClients();
        const pc = await hre.viem.getPublicClient();
        
        // Mint some test tokens to our wallet
        const mintAmount = parseEther("1000");
        await Token1.write.mint([wc.account.address, mintAmount]);
        await Token2.write.mint([wc.account.address, mintAmount]);
        
        // Get TEEWETH by directly depositing into TEEWETH
        const ethAmount = parseEther("100");
        await TEEWETH.write.deposit({ value: ethAmount });
        
        // Approve tokens for TEEAMM contract
        await Token1.write.approve([TEEAMM.address, mintAmount]);
        await Token2.write.approve([TEEAMM.address, mintAmount]);
        await TEEWETH.write.approve([TEEAMM.address, ethAmount]);
        
        // Define liquidity amounts
        const token1Amount = parseEther("50");
        const token2Amount = parseEther("75");
        const wethAmount = parseEther("25");
        const feeBP = 30; // 0.3%
        
        // 1. Add liquidity for Token1/TEEWETH
        const tx1 = await TEEAMM.write.addLiquidity([
            Token1.address, 
            TEEWETH.address, 
            token1Amount, 
            wethAmount, 
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx1 });
        
        // Check reserves for Token1/TEEWETH
        const [reserve1_0, reserve1_1] = await TEEAMM.read.getReserves([
            Token1.address, 
            TEEWETH.address
        ]) as [bigint, bigint];
        
        // Verify reserves match the added liquidity
        const [t1, tw] = Token1.address < TEEWETH.address 
            ? [token1Amount, wethAmount] 
            : [wethAmount, token1Amount];
        expect(reserve1_0).to.equal(t1);
        expect(reserve1_1).to.equal(tw);
        
        // 2. Add liquidity for Token2/TEEWETH
        const tx2 = await TEEAMM.write.addLiquidity([
            Token2.address, 
            TEEWETH.address, 
            token2Amount, 
            wethAmount, 
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx2 });
        
        // Check reserves for Token2/TEEWETH
        const [reserve2_0, reserve2_1] = await TEEAMM.read.getReserves([
            Token2.address, 
            TEEWETH.address
        ]) as [bigint, bigint];
        
        // Verify reserves match the added liquidity
        const [t2, tw2] = Token2.address < TEEWETH.address 
            ? [token2Amount, wethAmount] 
            : [wethAmount, token2Amount];
        expect(reserve2_0).to.equal(t2);
        expect(reserve2_1).to.equal(tw2);
        
        // 3. Add liquidity for Token1/Token2
        const tx3 = await TEEAMM.write.addLiquidity([
            Token1.address, 
            Token2.address, 
            token1Amount, 
            token2Amount, 
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx3 });
        
        // Check reserves for Token1/Token2
        const [reserve3_0, reserve3_1] = await TEEAMM.read.getReserves([
            Token1.address, 
            Token2.address
        ]) as [bigint, bigint];
        
        // Verify reserves match the added liquidity
        const [t1_2, t2_2] = Token1.address < Token2.address 
            ? [token1Amount, token2Amount] 
            : [token2Amount, token1Amount];
        expect(reserve3_0).to.equal(t1_2);
        expect(reserve3_1).to.equal(t2_2);
    });

    it("should swap tokens successfully", async () => {
        // Get wallet client to use as sequencer
        const [wc] = await hre.viem.getWalletClients();
        const pc = await hre.viem.getPublicClient();
        
        // Deploy contracts with our address as sequencer
        const { TEEAMM, TEEWETH } = await deployContracts({
            sequencer: wc.account.address
        });
        
        // Deploy test tokens
        const Token1 = await hre.viem.deployContract("TEETOK", ["Token1", "TK1"]);
        const Token2 = await hre.viem.deployContract("TEETOK", ["Token2", "TK2"]);
        
        // Mint tokens and set up liquidity
        const mintAmount = parseEther("1000");
        const liquidityAmount = parseEther("100");
        await Token1.write.mint([wc.account.address, mintAmount]);
        await Token2.write.mint([wc.account.address, mintAmount]);
        
        // Approve tokens for TEEAMM
        await Token1.write.approve([TEEAMM.address, mintAmount]);
        await Token2.write.approve([TEEAMM.address, mintAmount]);
        
        // Add liquidity
        const feeBP = 30; // 0.3%
        const tx = await TEEAMM.write.addLiquidity([
            Token1.address,
            Token2.address,
            liquidityAmount,
            liquidityAmount,
            feeBP
        ]);
        await pc.waitForTransactionReceipt({ hash: tx });
        
        // Deposit tokens to be swapped
        const swapAmount = parseEther("10");
        await TEEAMM.write.deposit([Token1.address, swapAmount]);
        
        // Check initial balances
        const initialToken1Balance = await TEEAMM.read.balances([
            wc.account.address, Token1.address
        ]) as bigint;
        const initialToken2Balance = await TEEAMM.read.balances([
            wc.account.address, Token2.address
        ]) as bigint;
        
        // Set up swap intent
        const swapIntent = {
            user: wc.account.address,
            tokenIn: Token1.address,
            tokenOut: Token2.address,
            amountIn: swapAmount,
            minOut: 0n, // No minimum for test simplicity
            directPayout: false,
            nonce: 0n // First swap
        };
        
        // Execute swap as sequencer
        await TEEAMM.write.batchSwap([[{
            user: swapIntent.user,
            tokenIn: swapIntent.tokenIn,
            tokenOut: swapIntent.tokenOut,
            amountIn: BigInt(swapAmount),
            minOut: 0n,
            directPayout: swapIntent.directPayout,
            nonce: 0n
        }]]);
        
        // Check final balances
        const finalToken1Balance = await TEEAMM.read.balances([
            wc.account.address, Token1.address
        ]) as bigint;
        const finalToken2Balance = await TEEAMM.read.balances([
            wc.account.address, Token2.address
        ]) as bigint;
        
        // Verify token1 was spent and token2 was received
        expect(finalToken1Balance).to.equal(initialToken1Balance - swapAmount);
        expect(finalToken2Balance > initialToken2Balance).to.be.true;
    });
});

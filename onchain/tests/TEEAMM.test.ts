import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "viem";

describe("TEEAMM", () => {

    const deployContracts = async () => {
        try {
            const TEEWETH = await hre.viem.deployContract("TEEWETH", []);
            console.log("TEEWETH deployed at:", TEEWETH.address);

            const TEEAMM = await hre.viem.deployContract("TEEAMM", [
                "0x46E1b359A285Ec33D7c77398125247b97d35C366", // SEQUENCER
                "0x46E1b359A285Ec33D7c77398125247b97d35C366", // GUARDIAN
                "0x46E1b359A285Ec33D7c77398125247b97d35C366", // TREASURY
                TEEWETH.address,            // WETH - using our deployed MockWETH
                50,                       // PROTOCOL BP
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

        const tx = await TEEAMM.write.depositETH([], {
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
        const depositTx = await TEEAMM.write.depositETH([], { value: amount });
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
});

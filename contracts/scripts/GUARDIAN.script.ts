// GUARDIAN.script.ts - Update sequencer address on deployed TEEAMM contract
import hre from "hardhat";
import { Address } from "viem";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
    // Check the current network
    const networkName = hre.network.name;
    console.log(`Current network: ${networkName}`);

    const TEEAMM_CONTRACT_ADDRESS = "0x8Ca56de06b2e22262B248932b713601Ad6c62D36"
    const NEW_SEQUENCER_ADDRESS = "0x87574F8754e6121888E31bc26E251b88273C4b24"

    // Check required environment variables
    if (!TEEAMM_CONTRACT_ADDRESS) {
        console.error("Missing TEEAMM_CONTRACT_ADDRESS environment variable");
        process.exit(1);
    }

    if (!NEW_SEQUENCER_ADDRESS) {
        console.error("Missing NEW_SEQUENCER_ADDRESS environment variable");
        process.exit(1);
    }

    console.log(`TEEAMM Contract: ${TEEAMM_CONTRACT_ADDRESS}`);
    console.log(`New sequencer address: ${NEW_SEQUENCER_ADDRESS}`);

    try {
        // Connect to the deployed contract
        const teeamm = await hre.viem.getContractAt("TEEAMM", TEEAMM_CONTRACT_ADDRESS);

        // Get wallet client (should be the guardian)
        const [walletClient] = await hre.viem.getWalletClients();

        if (!walletClient.account) {
            throw new Error("No wallet account available");
        }

        // Get the current sequencer address
        const currentSequencer = await teeamm.read.getSequencer() as Address;
        console.log(`Current sequencer address: ${currentSequencer}`);
        console.log(`Guardian address: ${walletClient.account.address}`);

        console.log("Calling updateSequencerAddress...");

        // Call the updateSequencerAddress function as the guardian
        const tx = await teeamm.write.updateSequencerAddress([NEW_SEQUENCER_ADDRESS]);
        console.log(`Transaction sent: ${tx}`);

        // Wait for the transaction to be mined
        const publicClient = await hre.viem.getPublicClient();
        console.log("Waiting for transaction confirmation...");
        const receipt = await publicClient.waitForTransactionReceipt({
            hash: tx,
        });

        console.log(`Transaction status: ${receipt.status}`);

        // Verify the sequencer address was updated
        const updatedSequencer = await teeamm.read.getSequencer() as Address;
        console.log(`Updated sequencer address: ${updatedSequencer}`);

        if (updatedSequencer.toLowerCase() === NEW_SEQUENCER_ADDRESS.toLowerCase()) {
            console.log("✅ Sequencer address updated successfully!");
        } else {
            console.error("❌ Sequencer address update failed!");
        }
    } catch (error: any) {
        console.error("Error updating sequencer address:", error.message);

        // Log potential reason for failure
        if (error.message.includes("!guardian")) {
            console.error("ERROR: Transaction failed because the wallet is not the guardian");
            console.error("Make sure your wallet/private key has the guardian role on the contract");
        }

        process.exit(1);
    }
}

// Run the script
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
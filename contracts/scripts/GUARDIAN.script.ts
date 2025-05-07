import hre from "hardhat";
import { Address } from "viem";
import dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log(`network: ${hre.network.name}`);

    const TEEAMM_CONTRACT_ADDRESS = "0x8Ca56de06b2e22262B248932b713601Ad6c62D36"
    const NEW_SEQUENCER_ADDRESS = "0x87574F8754e6121888E31bc26E251b88273C4b24"

    if (!TEEAMM_CONTRACT_ADDRESS || !NEW_SEQUENCER_ADDRESS) {
        console.error("Missing TEEAMM_CONTRACT_ADDRESS or NEW_SEQUENCER_ADDRESS environment variable");
        process.exit(1);
    } else {
        console.log(`TEEAMM Contract: ${TEEAMM_CONTRACT_ADDRESS}`);
        console.log(`New sequencer address: ${NEW_SEQUENCER_ADDRESS}`);
    }

    try {
        const teeamm = await hre.viem.getContractAt("TEEAMM", TEEAMM_CONTRACT_ADDRESS);

        // wallet client (should be the guardian)
        const [wc] = await hre.viem.getWalletClients();

        if (!wc.account) {
            throw new Error("No wallet account available");
        }

        const cseq = await teeamm.read.getSequencer() as Address;
        console.log(`current sequencer address: ${cseq}`);
        console.log(`guardian address: ${wc.account.address}`);

        console.log("updating sequencer address");
        const tx = await teeamm.write.updateSequencerAddress([NEW_SEQUENCER_ADDRESS]);
        console.log(`txn sent: ${tx}`);

        const pc = await hre.viem.getPublicClient();
        console.log("waiting for transaction confirmation...");
        const receipt = await pc.waitForTransactionReceipt({
            hash: tx,
        });

        console.log(`txn status: ${receipt.status}`);

        const useq = await teeamm.read.getSequencer() as Address;
        console.log(`updated sequencer address: ${useq}`);

        if (useq.toLowerCase() === NEW_SEQUENCER_ADDRESS.toLowerCase()) {
            console.log("OK.");
        } else {
            console.error("FAIL.");
        }
    } catch (error: any) {
        console.error("err updating sequencer address:", error.message);

        if (error.message.includes("!guardian")) {
            console.error("ERROR: txn failed because the wallet is not the guardian");
            console.error("make sure hardhat.config.ts is properly setup");
        }

        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
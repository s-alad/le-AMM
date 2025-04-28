// scripts/deploy.ts
import hre from "hardhat";

async function main() {
  // Get the deployer's address
  const [deployer] = await hre.viem.getWalletClients();
  const ownerAddress = "0xd33dE88B94a56544034bc8c829078eba5DbF68f8"; // Your address
  
  console.log("Deploying contracts with the account:", deployer.account.address);
  console.log("Setting owner to:", ownerAddress);
  
  // Deploy TestToken first
  console.log("Deploying TestToken...");
  const TestToken = await hre.viem.deployContract("TestToken", ["SequencedAMM Token", "SAMM"]);
  console.log("TestToken deployed to:", TestToken.address);
  
  // Deploy SequencedAMM with TestToken address
  console.log("Deploying SequencedAMM...");
  const SequencedAMM = await hre.viem.deployContract("SequencedAMM", [
    ownerAddress, // Owner
    TestToken.address  // Token address
  ]);
  console.log("SequencedAMM deployed to:", SequencedAMM.address);
  
  // Set sequencer (using the owner address as sequencer for simplicity)
  console.log("Setting up sequencer...");
  await SequencedAMM.write.setSequencer([ownerAddress]);
  console.log("Sequencer set to:", ownerAddress);
  
  console.log("Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
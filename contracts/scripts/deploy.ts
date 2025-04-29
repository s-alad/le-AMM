// scripts/deploy.ts
import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  // Get the deployer's address
  const [deployer] = await hre.viem.getWalletClients();
  const ownerAddress = deployer.account.address; // Use the deployer as owner for local testing
  
  console.log("Deploying contracts with the account:", deployer.account.address);
  console.log("Setting owner to:", ownerAddress);
  
  // Deploy TestToken instances (three different tokens)
  console.log("\n=== Deploying Token Contracts ===");
  
  console.log("Deploying TromerToken...");
  const TromerToken = await hre.viem.deployContract("SimpleToken", ["Tromer Token", "TRMR"]);
  console.log("TromerToken deployed to:", TromerToken.address);
  
  console.log("Deploying LeToken...");
  const LeToken = await hre.viem.deployContract("SimpleToken", ["Le Token", "LE"]);
  console.log("LeToken deployed to:", LeToken.address);
  
  console.log("Deploying SimpleToken...");
  const SimpleToken = await hre.viem.deployContract("SimpleToken", ["Simple Token", "SMPL"]);
  console.log("SimpleToken deployed to:", SimpleToken.address);
  
  // Deploy MultiTokenAMM
  console.log("\n=== Deploying AMM Contract ===");
  console.log("Deploying MultiTokenAMM...");
  const MultiTokenAMM = await hre.viem.deployContract("MultiTokenAMM", []);
  console.log("MultiTokenAMM deployed to:", MultiTokenAMM.address);
  
  // Set sequencer (using the owner address as sequencer for simplicity)
  console.log("\n=== Setting up AMM Configuration ===");
  console.log("Setting up sequencer...");
  await MultiTokenAMM.write.setSequencer([ownerAddress]);
  console.log("Sequencer set to:", ownerAddress);
  
  // Add tokens to supported tokens list
  console.log("Adding tokens to supported list...");
  await MultiTokenAMM.write.addSupportedToken([TromerToken.address]);
  console.log("Added TromerToken to supported tokens");
  
  await MultiTokenAMM.write.addSupportedToken([LeToken.address]);
  console.log("Added LeToken to supported tokens");
  
  await MultiTokenAMM.write.addSupportedToken([SimpleToken.address]);
  console.log("Added SimpleToken to supported tokens");
  
  console.log("\n=== Setting Development Timeouts ===");
  // For testing, set a very short delay
  await MultiTokenAMM.write.setDelay([20]); // 20 seconds delay
  console.log("Set delay to 20 seconds");
  
  // Save deployment addresses to .env file for easy testing
  const envContent = `
# Deployment addresses - generated on ${new Date().toISOString()}
TROMER_TOKEN_ADDRESS=${TromerToken.address}
LE_TOKEN_ADDRESS=${LeToken.address}
SIMPLE_TOKEN_ADDRESS=${SimpleToken.address}
MULTI_TOKEN_AMM_ADDRESS=${MultiTokenAMM.address}

# Add your private key here - for local use only
# PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
`;

  const envPath = path.join(__dirname, '../../.env.local');
  fs.writeFileSync(envPath, envContent);
  console.log(`\nContract addresses saved to ${envPath}`);
  
  console.log("\n=== Deployment Summary ===");
  console.log("TromerToken:", TromerToken.address);
  console.log("LeToken:", LeToken.address);
  console.log("SimpleToken:", SimpleToken.address);
  console.log("MultiTokenAMM:", MultiTokenAMM.address);
  console.log("\nDeployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
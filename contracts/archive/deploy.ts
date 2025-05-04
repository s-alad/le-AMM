// scripts/deploy.ts
import { ethers } from 'hardhat';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

async function main() {
  // Load environment variables
  dotenv.config();

  console.log("Deploying contracts with the account:", (await ethers.getSigners())[0].address);

  // Deploy TromerToken
  console.log("Deploying TromerToken...");
  const TromerToken = await ethers.getContractFactory("SimpleToken");
  const tromerToken = await TromerToken.deploy("TromerToken", "TRM");
  await tromerToken.waitForDeployment();
  console.log("TromerToken deployed to:", await tromerToken.getAddress());

  // Deploy LeToken
  console.log("Deploying LeToken...");
  const LeToken = await ethers.getContractFactory("SimpleToken");
  const leToken = await LeToken.deploy("LeToken", "LET");
  await leToken.waitForDeployment();
  console.log("LeToken deployed to:", await leToken.getAddress());

  // Deploy SimpleToken
  console.log("Deploying SimpleToken...");
  const SimpleToken = await ethers.getContractFactory("SimpleToken");
  const simpleToken = await SimpleToken.deploy("SimpleToken", "SMP");
  await simpleToken.waitForDeployment();
  console.log("SimpleToken deployed to:", await simpleToken.getAddress());

  // Deploy MultiTokenAMM
  console.log("Deploying MultiTokenAMM...");
  const MultiTokenAMM = await ethers.getContractFactory("MultiTokenAMM");
  const multiTokenAmm = await MultiTokenAMM.deploy();
  await multiTokenAmm.waitForDeployment();
  console.log("MultiTokenAMM deployed to:", await multiTokenAmm.getAddress());

  // Write contract addresses to .env.local file
  const envFilePath = path.join(__dirname, '../..', '.env.local');
  
  // Read existing .env.local if it exists
  let envContent = '';
  try {
    if (fs.existsSync(envFilePath)) {
      envContent = fs.readFileSync(envFilePath, 'utf8');
    }
  } catch (error) {
    console.log("No existing .env.local file found, creating new one.");
  }

  // Update or add the new contract addresses
  const addressesToAdd = {
    TROMER_TOKEN_ADDRESS: await tromerToken.getAddress(),
    LE_TOKEN_ADDRESS: await leToken.getAddress(),
    SIMPLE_TOKEN_ADDRESS: await simpleToken.getAddress(),
    MULTI_TOKEN_AMM_ADDRESS: await multiTokenAmm.getAddress()
  };

  for (const [key, value] of Object.entries(addressesToAdd)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (envContent.match(regex)) {
      // Update existing variable
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      // Add new variable
      envContent += `\n${key}=${value}`;
    }
  }

  // Write the updated content back to the file
  fs.writeFileSync(envFilePath, envContent.trim());
  console.log(`Contract addresses written to ${envFilePath}`);

  console.log("\nAll contracts deployed successfully!");
}

// We recommend this pattern to be able to use async/await everywhere
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const Factory = await hre.ethers.getContractFactory("SequencedAMM");

  // ⚡ You need to pass two constructor arguments here
  const amm = await Factory.deploy(
    deployer.address,             // initialOwner
    "0x0000000000000000000000000000000000000000" // tokenAddress (use dummy address for now if no real ERC20)
  );

  await amm.deployed();

  console.log("🔨 SequencedAMM deployed to:", amm.address);
}

main().catch(console.error);

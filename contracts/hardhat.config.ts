import type { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ignition-viem";

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const GUARDIAN_PRIVATE_KEY = process.env.GUARDIAN_PRIVATE_KEY;

if (!SEPOLIA_RPC_URL || !GUARDIAN_PRIVATE_KEY) {
  console.log("SEPOLIA_RPC_URL", SEPOLIA_RPC_URL);
  console.log("GUARDIAN_PRIVATE_KEY", GUARDIAN_PRIVATE_KEY);
  throw new Error("SEPOLIA_RPC_URL and GUARDIAN_PRIVATE_KEY must be set");
} else {
  console.log("SEPOLIA_RPC_URL", SEPOLIA_RPC_URL);
  console.log("SEQUENCER_PRIV_HEX", GUARDIAN_PRIVATE_KEY);
}

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [GUARDIAN_PRIVATE_KEY],
    },
  },
};

export default config;

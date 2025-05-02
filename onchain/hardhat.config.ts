import type { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ignition-viem";

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.SEQUENCER_PRIV_HEX;

if (!SEPOLIA_RPC_URL || !PRIVATE_KEY) {
  throw new Error("RPC_URL and PRIVATE_KEY must be set");
} else {
  console.log("SEPOLIA_RPC_URL", SEPOLIA_RPC_URL);
  console.log("PRIVATE_KEY", PRIVATE_KEY);
}

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY],
    },
  },
};

export default config;

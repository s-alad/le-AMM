import type { HardhatUserConfig } from "hardhat/config";
import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ignition-viem";

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const SEQUENCER_PRIV_HEX = process.env.SEQUENCER_PRIV_HEX;

if (!SEPOLIA_RPC_URL || !SEQUENCER_PRIV_HEX) {
  console.log("SEPOLIA_RPC_URL", SEPOLIA_RPC_URL);
  console.log("SEQUENCER_PRIV_HEX", SEQUENCER_PRIV_HEX);
  throw new Error("SEPOLIA_RPC_URL and SEQUENCER_PRIV_HEX must be set");
} else {
  console.log("SEPOLIA_RPC_URL", SEPOLIA_RPC_URL);
  console.log("SEQUENCER_PRIV_HEX", SEQUENCER_PRIV_HEX);
}

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [SEQUENCER_PRIV_HEX],
    },
  },
};

export default config;

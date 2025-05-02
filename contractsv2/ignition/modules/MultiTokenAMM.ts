// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

const ONE_GWEI: bigint = parseEther("0.001");

export default buildModule("MultiTokenAMMModule", (m) => {
  const multiTokenAMM = m.contract("MultiTokenAMM", []);

  m.call(multiTokenAMM, "ping", []);

  return { multiTokenAMM };
});

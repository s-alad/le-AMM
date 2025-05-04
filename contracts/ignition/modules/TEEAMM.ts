// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";
import hre from "hardhat";
import assert from "assert";

const SEQUENCER_ADDRESS = "0xF3c3a9917f532f244453204FB1FD98C913f05061";

export default buildModule("TEEAMMModule", (m) => {

  const TEEWETH = m.contract("TEEWETH", []);

  const _TEEAMM = m.contract("TEEAMM", [
    SEQUENCER_ADDRESS, // SEQUENCER
    SEQUENCER_ADDRESS, // GUARDIAN
    SEQUENCER_ADDRESS, // TREASURY
    TEEWETH,
    50, // PROTOCOL BP
  ]);

  m.call(_TEEAMM, "ping", []);

  return { _TEEAMM };
});
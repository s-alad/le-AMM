// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";
import hre from "hardhat";
import assert from "assert";

export default buildModule("TEEAMMModule", (m) => {

  const TEEWETH = m.contract("TEEWETH", []);

  const _TEEAMM = m.contract("TEEAMM", [
    "0x46E1b359A285Ec33D7c77398125247b97d35C366", // SEQUENCER
    "0x46E1b359A285Ec33D7c77398125247b97d35C366", // GUARDIAN
    "0x46E1b359A285Ec33D7c77398125247b97d35C366", // TREASURY
    TEEWETH,
    50, // PROTOCOL BP
  ]);

  m.call(_TEEAMM, "ping", []);

  return { _TEEAMM };
});
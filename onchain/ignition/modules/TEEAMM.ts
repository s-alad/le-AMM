// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";
import hre from "hardhat";
import assert from "assert";

export default buildModule("TEEAMMModule", (m) => {
  const _TEEAMM = m.contract("TEEAMM", [
    "0x46E1b359A285Ec33D7c77398125247b97d35C366", // SEQUENCER
    "0x46E1b359A285Ec33D7c77398125247b97d35C366", // GUARDIAN
    "0x46E1b359A285Ec33D7c77398125247b97d35C366", // TREASURY
    "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH
    50, // PROTOCOL BP
  ]);

  m.call(_TEEAMM, "ping", []);

  return { _TEEAMM };
});
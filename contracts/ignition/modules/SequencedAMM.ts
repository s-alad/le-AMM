// ignition/modules/SequencedAMM.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SequencedAMMModule = buildModule("SequencedAMMModule", (m) => {
  // Deploy the TestToken first
  const testToken = m.contract("TestToken", ["SequencedAMM Token", "SAMM"]);
  
  // Get the owner parameter with a fallback to the deployer
  const owner = m.getParameter("owner", m.deployer);
  
  // Deploy the SequencedAMM using the TestToken address
  const sequencedAMM = m.contract(
    "SequencedAMM", 
    [owner, testToken.address]
  );
  
  // Set up the sequencer (using owner as sequencer by default)
  const sequencer = m.getParameter("sequencer", owner);
  const setSequencer = m.call(sequencedAMM, "setSequencer", [sequencer]);
  
  // Return all contract instances and transactions
  return { testToken, sequencedAMM, setSequencer };
});

export default SequencedAMMModule;
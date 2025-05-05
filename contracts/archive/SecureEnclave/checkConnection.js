const { ethers } = require('ethers');
require('dotenv').config();

const ABI = require('./SequencedAMM.json').abi;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.SEQUENCER_PRIVATE_KEY;
const RPC_URL = "https://sepolia.infura.io/v3/38bbf9a479ef42619303a6091845df6f";

async function checkConnection() {
  try {
    console.log("RPC URL:", RPC_URL);
    console.log("Contract address:", CONTRACT_ADDRESS);
    
    // Fixed for ethers v6
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    console.log("Provider created");
    
    // Check network
    const network = await provider.getNetwork();
    console.log("Connected to network:", network.name, `(chainId: ${network.chainId})`);
    
    // Check if contract exists
    const code = await provider.getCode(CONTRACT_ADDRESS);
    if (code === '0x') {
      console.log("ERROR: No contract found at the specified address!");
    } else {
      console.log("Contract exists at the specified address");
    }
    
    // Create contract instance
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    
    // Check sequencer status
    const currentSequencer = await contract.sequencer();
    console.log("Current sequencer address:", currentSequencer);
    
    // Check wallet
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log("Wallet address:", wallet.address);
    console.log("Is wallet the sequencer?", currentSequencer.toLowerCase() === wallet.address.toLowerCase());
    
  } catch (error) {
    console.error("Connection error:", error.message);
  }
}

checkConnection(); 
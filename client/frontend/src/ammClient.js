import { ethers } from 'ethers';
import TEEAMM_JSON from './abi/TEEAMM.json';
import TEEWETH_JSON from './abi/TEEWETH.json';

// Extract the ABIs from the JSON files
const TEEAMM_ABI = TEEAMM_JSON.abi;  // Access the 'abi' property
const TEEWETH_ABI = TEEWETH_JSON.abi;  // Access the 'abi' property

// Contract addresses
export const TEEAMM_ADDRESS = "0x0D5EbFb1880BD60D6aFae0034bb49f48B0E91E77";
export const TEEWETH_ADDRESS = "0x5a768ed8724322496721Ee3C6e581f62448DDB9d";

// Create provider using ethers v6 syntax
export const provider = window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null;

// Get the main AMM contract
export async function getAmmContract() {
  if (!window.ethereum || !provider) {
    throw new Error("Ethereum provider not found. Please install MetaMask.");
  }
  
  try {
    const signer = await provider.getSigner();
    return new ethers.Contract(TEEAMM_ADDRESS, TEEAMM_ABI, signer);
  } catch (error) {
    console.error("Failed to get AMM contract:", error);
    throw error;
  }
}

// Get the WETH contract
export async function getWethContract() {
  if (!window.ethereum || !provider) {
    throw new Error("Ethereum provider not found. Please install MetaMask.");
  }
  
  try {
    const signer = await provider.getSigner();
    return new ethers.Contract(TEEWETH_ADDRESS, TEEWETH_ABI, signer);
  } catch (error) {
    console.error("Failed to get WETH contract:", error);
    throw error;
  }
}

export async function getUserBalance(address) {
  if (!address) throw new Error('No address passed to getUserBalance');

  const contract = await getAmmContract();
  const balance = await contract.ethBalances(address);
  return balance;
}

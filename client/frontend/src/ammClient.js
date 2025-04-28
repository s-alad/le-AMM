import { ethers } from 'ethers';
import SequencedAMM from './abi/SequencedAMM.json';

export const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);

export async function getAmmContract() {
  if (!window.ethereum) throw new Error('MetaMask not installed');

  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  const signer = await browserProvider.getSigner();
  
  const contractAddress = import.meta.env.VITE_AMM_ADDRESS;
  if (!contractAddress) throw new Error('VITE_AMM_ADDRESS is not set.');

  console.log('Using contract address:', contractAddress);
  console.log('Using signer:', await signer.getAddress());

  return new ethers.Contract(
    contractAddress,
    SequencedAMM.abi,
    signer
  );
}

export async function getUserBalance(address) {
  if (!address) throw new Error('No address passed to getUserBalance');

  const contract = await getAmmContract();
  const balance = await contract.ethBalances(address);
  return balance;
}

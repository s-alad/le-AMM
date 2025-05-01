import 'dotenv/config';

import { createPublicClient, createWalletClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { parseAbi } from 'viem'

const pc = createPublicClient({ 
  chain: baseSepolia, 
  transport: http('https://sepolia.base.org'), 
}) 

const pk = process.env.SEQUENCER_PRIV_HEX

if (!pk) {
  throw new Error('SEQUENCER_PRIV_HEX is not set')
}

const account = privateKeyToAccount(`0x${pk}`) 

const wc = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http('https://sepolia.base.org')
})

// ABI for MultiTokenAMM contract
const cabi = parseAbi([
  'function getETHBalance(address user) view returns (uint256)',
  'function getTokenBalance(address user, address token) view returns (uint256)',
  'function supportedTokens(uint256 index) view returns (address)',
  'function depositETH() payable',
  'function depositToken(address token, uint256 amount)',
  'function sequencer() view returns (address)',
])

const ca = process.env.MULTITOKEN_AMM_ADDRESS as `0x${string}`

if (!ca) {
  throw new Error('MULTITOKEN_AMM_ADDRESS is not set')
}

// Read ETH balance for a user
async function getETHBalance(userAddress: `0x${string}`) {
  try {
    const balance = await pc.readContract({
      address: ca,
      abi: cabi,
      functionName: 'getETHBalance',
      args: [userAddress]
    })
    
    console.log(`ETH Balance for ${userAddress}:`, balance)
    return balance
  } catch (error) {
    console.error('Error reading ETH balance:', error)
    throw error
  }
}

// Check if the connected account is the sequencer
async function isSequencer() {
  try {
    const sequencerAddress = await pc.readContract({
      address: ca,
      abi: cabi,
      functionName: 'sequencer'
    })
    
    const isSequencer = sequencerAddress.toLowerCase() === account.address.toLowerCase()
    console.log('Is connected account the sequencer:', isSequencer)
    return isSequencer
  } catch (error) {
    console.error('Error checking sequencer status:', error)
    throw error
  }
}

// Deposit ETH to the contract
async function depositETH(amount: bigint) {
  try {
    const hash = await wc.writeContract({
      address: ca,
      abi: cabi,
      functionName: 'depositETH',
      value: amount
    })
    
    console.log('ETH deposit transaction hash:', hash)
    
    // Wait for transaction receipt
    const receipt = await pc.waitForTransactionReceipt({ hash })
    console.log('ETH deposit confirmed:', receipt)
    
    return hash
  } catch (error) {
    console.error('Error depositing ETH:', error)
    throw error
  }
}

// Check if the contract exists at the address
async function checkContractExists() {
  try {
    const code = await pc.getBytecode({ address: ca });
    const exists = code && code !== '0x';
    console.log('Contract exists at address:', exists);
    if (!exists) {
      console.log('Warning: No contract code found at the provided address');
    }
    return exists;
  } catch (error: any) {
    console.error('Error checking contract existence:', error.shortMessage || error.message || error);
    return false;
  }
}

// Get the ETH balance of a wallet (not in the contract)
async function getWalletETHBalance(address: `0x${string}` = account.address) {
  try {
    const balance = await pc.getBalance({
      address,
    });
    
    console.log(`Wallet ETH Balance for ${address}:`, balance);
    console.log(`Wallet ETH Balance (in ETH): ${Number(balance) / 1e18}`);
    return balance;
  } catch (error: any) {
    console.error('Error reading wallet ETH balance:', error.shortMessage || error.message || error);
    throw error;
  }
}

// Example usage
async function main() {
  try {
    console.log('Connected account address:', account.address);
    console.log('Contract address:', ca);
    
    // First check if the contract exists
    await checkContractExists();
    
    // Get wallet ETH balance (not in contract)
    await getWalletETHBalance();
    
    // Check if we're the sequencer
    await isSequencer();

    // Get our own ETH balance in the contract
    await getETHBalance(account.address);

    // Deposit ETH to the contract
    await depositETH(BigInt(0.000025 * 1e18));

    // Get our own ETH balance in the contract
    await getETHBalance(account.address);
    
    console.log('Script execution completed');
  } catch (error) {
    console.error('Error in main:', error);
  }
}

// Export functions
export {
  getETHBalance,
  getWalletETHBalance,
  isSequencer,
  depositETH,
  checkContractExists,
  main
}

// Run main if this file is executed directly
if (import.meta.url === import.meta.resolve('./eth.ts')) {
  main().catch(console.error);
}
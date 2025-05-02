import 'dotenv/config';

import { createPublicClient, createWalletClient, http } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { parseAbi } from 'viem'

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.dev';

const pc = createPublicClient({ 
  chain: sepolia, 
  transport: http(SEPOLIA_RPC_URL), 
}) 

const pk = process.env.SEQUENCER_PRIV_HEX

if (!pk) {
  throw new Error('SEQUENCER_PRIV_HEX is not set')
}

const account = privateKeyToAccount(`0x${pk}`) 

const wc = createWalletClient({
  account,
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL)
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

async function sendEthToWallet(amount: number, to: string) {
  const hash = await wc.sendTransaction({
    account: account,
    to: (to.startsWith('0x') ? to : `0x${to}`) as `0x${string}`,
    value: BigInt(amount * 1e18)
  })
  console.log('ETH send transaction hash:', hash)
}

// Example usage
async function main() {
  try {
    console.log('Connected account address:', account.address);
    console.log('Contract address:', ca);
    
    // First check if the contract exists
    // await checkContractExists();
    
    // Get wallet ETH balance (not in contract)
    await getWalletETHBalance();

    // Send ETH to wallet
    await sendEthToWallet(0.5, "0x660F96F3fb5695b62157473836C501B6f3Ee4cE7");
    
    // Check if we're the sequencer
    // await isSequencer();

    // Get our own ETH balance in the contract
    // await getETHBalance(account.address);

    // Deposit ETH to the contract
    // await depositETH(BigInt(0.000025 * 1e18));

    // Get our own ETH balance in the contract
    // await getETHBalance(account.address);
    
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
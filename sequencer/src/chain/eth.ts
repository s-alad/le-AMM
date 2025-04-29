import { createPublicClient, createWalletClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { parseAbi } from 'viem'

const pc = createPublicClient({ 
  chain: mainnet, 
  transport: http(), 
}) 

const pk = process.env.SEQUENCER_PRIV_HEX

if (!pk) {
  throw new Error('SEQUENCER_PRIV_HEX is not set')
}

const account = privateKeyToAccount(`0x${pk}`) 
 
const wc = createWalletClient({
  account,
  chain: mainnet,
  transport: http()
})

// Example ABI for the contract - replace with your actual contract ABI
const contractAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

// Contract address - replace with your actual contract address
const contractAddress = '0xYourContractAddressHere'

// Read function example - reads data from the contract
async function readContract() {
  try {
    const balance = await pc.readContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'balanceOf',
      args: [account.address]
    })
    
    console.log('Balance:', balance)
    return balance
  } catch (error) {
    console.error('Error reading from contract:', error)
    throw error
  }
}

// Write function example - sends a transaction to the contract
async function writeContract(toAddress: `0x${string}`, amount: bigint) {
  try {
    const hash = await wc.writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'transfer',
      args: [toAddress, amount]
    })
    
    console.log('Transaction hash:', hash)
    
    // Wait for transaction receipt
    const receipt = await pc.waitForTransactionReceipt({ hash })
    console.log('Transaction confirmed:', receipt)
    
    return hash
  } catch (error) {
    console.error('Error writing to contract:', error)
    throw error
  }
}

const accounts = await wc.getAddresses() 
console.log(accounts)

// Example usage:
// await readContract()
// await writeContract('0xRecipientAddress', 1000000000000000000n) // 1 token with 18 decimals
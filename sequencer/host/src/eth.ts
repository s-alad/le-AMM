import 'dotenv/config';

import { createPublicClient, createWalletClient, http } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { parseAbi } from 'viem'

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.dev';

async function main() {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });
}

if (import.meta.url === import.meta.resolve('./eth.ts')) {
  main().catch(console.error);
}
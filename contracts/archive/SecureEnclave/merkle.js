const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const ethers = require('ethers');

// Addresses
const user1Address = "0x33606f5fDA618630f5B297EE84Cce30732dAd48a"; // 0x336
const user2Address = "0xd33dE88B94a56544034bc8c829078eba5DbF68f8"; // 0xd33

// Token addresses (replace with your actual token addresses)
const ETH_ADDRESS = "0x0000000000000000000000000000000000000000"; // ETH is address(0)
const TROMER_TOKEN_ADDRESS = "0x2e15Bf903A3Cb2d09ef3CF4707F075eD258C4f72"; // Replace with actual Tromer Token address
const LE_TOKEN_ADDRESS = "0xaed461F581c0Fe9DEcA169B730aCB2aC3FC55710"; // Replace with actual LeToken address
const SIMPLE_TOKEN_ADDRESS = "0xb8113BE24168AE4c16157523fe31d1cDA586d803"; // Replace with actual Simple Token address

// Create a swap intent matching MultiTokenAMM contract's getIntentHash function
function createIntent(user, tokenIn, tokenOut, amountIn, minAmountOut, timestamp = 0) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'address', 'uint256', 'uint256', 'uint256'], 
    [user, tokenIn, tokenOut, amountIn, minAmountOut, timestamp]
  );
  
  return ethers.keccak256(encoded);
}

// Create two intents based on user balances:
// 1. User2 (0xd33): LeToken → Tromer Token swap (REVERSED direction)
const intent1AmountIn = BigInt("500");    // 50 LeTokens (half their balance)
const intent1MinAmountOut = BigInt("40"); // Expect at least 40 Tromer Tokens

// 2. User1 (0x336): Tromer Token → Simple Token swap
const intent2AmountIn = BigInt("500");    // 50 Tromer Tokens (half their balance)
const intent2MinAmountOut = BigInt("40"); // Expect at least 40 Simple Tokens

// Create intent hashes
const leafHash1 = createIntent(
  user2Address, 
  LE_TOKEN_ADDRESS,       // tokenIn (LeToken)
  TROMER_TOKEN_ADDRESS,   // tokenOut (Tromer Token)
  intent1AmountIn, 
  intent1MinAmountOut
);

const leafHash2 = createIntent(
  user1Address, 
  TROMER_TOKEN_ADDRESS,   // tokenIn (Tromer Token)
  SIMPLE_TOKEN_ADDRESS,   // tokenOut (Simple Token)
  intent2AmountIn, 
  intent2MinAmountOut
);

const leaves = [leafHash1, leafHash2];

// Generate tree
const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
const root = tree.getHexRoot();
const proof1 = tree.getHexProof(leafHash1);
const proof2 = tree.getHexProof(leafHash2);

console.log("Merkle Root:", root);
console.log("\nValues for commitBatchIntents:");
console.log(`intentRoot: "${root}"`);
console.log(`batchSize: ${leaves.length}`);

console.log("\nValues for batchSwap:");
console.log(`Users: ["${user2Address}", "${user1Address}"]`);
console.log(`TokensIn: ["${LE_TOKEN_ADDRESS}", "${TROMER_TOKEN_ADDRESS}"]`);
console.log(`TokensOut: ["${TROMER_TOKEN_ADDRESS}", "${SIMPLE_TOKEN_ADDRESS}"]`);
console.log(`Amounts in: ["${intent1AmountIn.toString()}", "${intent2AmountIn.toString()}"]`);
console.log(`Min amounts out: ["${intent1MinAmountOut.toString()}", "${intent2MinAmountOut.toString()}"]`);
console.log(`\nProofs for user2 (0xd33):`, JSON.stringify(proof1));
console.log(`Proofs for user1 (0x336):`, JSON.stringify(proof2));

// Formatted for easy copy-paste into Remix or other tools
console.log(`\nFormatted params for batchSwap function:`);
console.log(`[["${user2Address}","${user1Address}"],["${LE_TOKEN_ADDRESS}","${TROMER_TOKEN_ADDRESS}"],["${TROMER_TOKEN_ADDRESS}","${SIMPLE_TOKEN_ADDRESS}"],["${intent1AmountIn.toString()}","${intent2AmountIn.toString()}"],["${intent1MinAmountOut.toString()}","${intent2MinAmountOut.toString()}"],[${JSON.stringify(proof1)},${JSON.stringify(proof2)}]]`);
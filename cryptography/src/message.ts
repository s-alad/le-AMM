// message.ts - Test encryption and decryption
import { getPublicKey } from '@noble/secp256k1';
import { randomBytes } from 'node:crypto';
import { SwapRequest } from './constants.js';
import { encryptForSequencer } from './encryption.js';
import { decryptEciesEnvelope } from './decryption.js';

/**
 * Tests the encryption and decryption workflow
 * @returns A promise that resolves to true if the test succeeds
 */
export async function testEncryptionAndDecryption(): Promise<boolean> {
  console.log('Testing encryption and decryption...');

  // 1. Generate a sequencer keypair for testing
  const sequencerPrivateKey = randomBytes(32); // Use Node's crypto for random bytes
  const sequencerPublicKey = getPublicKey(sequencerPrivateKey, false);
  const sequencerPrivHex = sequencerPrivateKey.toString('hex');
  const sequencerPubHex = Buffer.from(sequencerPublicKey).toString('hex');

  console.log(`Generated test sequencer keypair:`);
  console.log(`Private key: ${sequencerPrivHex}`);
  console.log(`Public key: ${sequencerPubHex}`);

  // 2. Create a sample swap request
  const sampleSwap: SwapRequest = {
    address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    amount: '1000000000' // 1000 USDC (with 6 decimals)
  };

  console.log('Sample swap request:', sampleSwap);

  // 3. Encrypt the swap request
  console.log('Encrypting swap request...');
  const encryptedEnvelope = await encryptForSequencer(sampleSwap, sequencerPubHex);
  console.log('Encrypted envelope:', encryptedEnvelope);

  // 4. Decrypt the swap request
  console.log('Decrypting swap request...');
  const decryptedSwap = await decryptEciesEnvelope(encryptedEnvelope, sequencerPrivHex);
  console.log('Decrypted swap request:', decryptedSwap);

  // 5. Verify the decrypted data matches the original
  const isEqual = 
    decryptedSwap.address === sampleSwap.address &&
    decryptedSwap.tokenIn === sampleSwap.tokenIn &&
    decryptedSwap.tokenOut === sampleSwap.tokenOut &&
    decryptedSwap.amount === sampleSwap.amount;

  console.log('Decryption successful:', isEqual);
  return isEqual;
}

// Run the test when this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testEncryptionAndDecryption()
    .then(success => {
      if (!success) {
        console.error('Test failed');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Test error:', err);
      process.exit(1);
    });
} 
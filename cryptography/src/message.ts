import { getPublicKey } from '@noble/secp256k1';
import { randomBytes } from 'node:crypto';
import { SwapRequest } from './constants.js';
import { encryptEciesEnvelope } from './encryption.js';
import { decryptEciesEnvelope } from './decryption.js';

/**
 * tests the encryption and decryption workflow
 */
export async function message(): Promise<boolean> {
  console.log('testing encryption and decryption...');

  const sequencerPrivateKey = randomBytes(32);
  const sequencerPublicKey = getPublicKey(sequencerPrivateKey, false);
  const sequencerPrivHex = sequencerPrivateKey.toString('hex');
  const sequencerPubHex = Buffer.from(sequencerPublicKey).toString('hex');

  console.log(`generated test sequencer keypair:`);
  console.log(`private key: ${sequencerPrivHex}`);
  console.log(`public key: ${sequencerPubHex}`);

  const sample: SwapRequest = {
    address: "0x0000000000000000000000000000000000000000",
    tokenIn: "0x0000000000000000000000000000000000000000",
    tokenOut: "0x0000000000000000000000000000000000000000",
    amountIn: "0",
    amountOut: "0",
    directPayout: false,
    nonce: "0",
    fee: "0"
  };

  console.log('sample:', sample);

  console.log('encrypting swap request...');
  const encrypted = await encryptEciesEnvelope(sample, sequencerPubHex);
  console.log('encrypted:', encrypted);

  console.log('decrypting swap request...');
  const decrypted = await decryptEciesEnvelope(encrypted, sequencerPrivHex);
  console.log('decrypted:', decrypted);

  const eq = 
    decrypted.address === sample.address &&
    decrypted.tokenIn === sample.tokenIn &&
    decrypted.tokenOut === sample.tokenOut &&
    decrypted.amountIn === sample.amountIn &&
    decrypted.amountOut === sample.amountOut &&
    decrypted.directPayout === sample.directPayout &&
    decrypted.nonce === sample.nonce &&
    decrypted.fee === sample.fee;

  console.log('decryption successful:', eq);
  return eq;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  message()
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
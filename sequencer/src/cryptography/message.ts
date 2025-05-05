import { encryptForSequencer } from './encryption.js';
import { decryptEciesEnvelope } from './decryption.js';

// 1) user side
const swap = {
  address : '0x1234',
  tokenIn : 'USDC',
  tokenOut: 'WETH',
  amount  : '25000000'
};
const envelope = await encryptForSequencer(swap);
console.log("envelope", envelope);

// 2) server side
const sequencerPriv = process.env.SEQUENCER_PRIV_HEX;   // 64-hex-char
if (!sequencerPriv) {
throw new Error('SEQUENCER_PRIV_HEX is not set');
}
const opened = await decryptEciesEnvelope(envelope, sequencerPriv);

console.log(opened);   // ⇒ same SwapRequest object

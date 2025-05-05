// encrypt.ts  (browser, Node, or React Native)
//
//   npm add @noble/secp256k1 @noble/hashes
//
import { utils, getSharedSecret, getPublicKey } from '@noble/secp256k1';
import crypto from 'crypto';
import { EncryptedEnvelope } from './decryption';
import { cleanHex, SwapRequest } from './constants';

/** Returns an envelope ready to POST to the sequencer. */
export async function encryptForSequencer(
  swap: SwapRequest,
  sequencerPubHex: string
): Promise<EncryptedEnvelope> {
  /* 1.   Generate an ephemeral key-pair (one-off per message) */
  const ephPriv = utils.randomPrivateKey();           // Uint8Array(32)
  const ephPub  = getPublicKey(ephPriv, false);       // 65-byte, uncompressed

  /* 2.   ECDH → shared secret with sequencer's pub key */
  const shared  = await getSharedSecret(ephPriv, cleanHex(sequencerPubHex), false);

  /* 3.   Derive 32-byte AES-GCM key (SHA-256) */
  const key     = crypto.createHash('sha256').update(shared).digest();

  /* 4.   Encrypt swap JSON with AES-256-GCM */
  const iv      = crypto.randomBytes(12);
  const cipher  = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct      = Buffer.concat([
    cipher.update(JSON.stringify(swap), 'utf8'),
    cipher.final()
  ]);
  const tag     = cipher.getAuthTag();

  /* 5.   Return the envelope the sequencer understands */
  return {
    ephPub : Buffer.from(ephPub).toString('hex'),      // no 0x
    iv     : iv.toString('base64'),
    tag    : tag.toString('base64'),
    data   : ct.toString('base64')
  };
}

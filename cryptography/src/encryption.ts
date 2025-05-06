import { getSharedSecret, getPublicKey } from '@noble/secp256k1';
import { createHash, randomBytes, createCipheriv } from 'node:crypto';
import { cleanHex, EncryptedEnvelope, SwapRequest } from './constants.js';

export async function encryptEciesEnvelope(
  swap: SwapRequest,
  sequencerPubHex: string
): Promise<EncryptedEnvelope> {
  try {
    /* 1.   Generate an ephemeral key-pair (one-off per message) */
    const ephPriv = randomBytes(32);                    // Uint8Array(32)
    const ephPub  = getPublicKey(ephPriv, false);       // 65-byte, uncompressed

    /* 2.   ECDH → shared secret with sequencer's pub key */
    const shared  = await getSharedSecret(ephPriv, cleanHex(sequencerPubHex), false);

    /* 3.   Derive 32-byte AES-GCM key (SHA-256) */
    const key     = createHash('sha256').update(shared).digest();

    /* 4.   Encrypt swap JSON with AES-256-GCM */
    const iv      = randomBytes(12);
    const cipher  = createCipheriv('aes-256-gcm', key, iv);
    const ct      = Buffer.concat([
      cipher.update(JSON.stringify(swap), 'utf8'),
      cipher.final()
    ]);
    const tag     = cipher.getAuthTag();

    return {
      ephPub: Buffer.from(ephPub).toString('hex'),      // no 0x
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ct.toString('base64')
    };
  } catch (error) {
    console.error("error encrypting swap request:", error);
    throw error;
  }
}

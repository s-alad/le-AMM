import { getSharedSecret } from '@noble/secp256k1';
import { createDecipheriv, createHash,  } from 'node:crypto';
import { cleanHex, EncryptedEnvelope, SwapRequest } from './constants.js';

export async function decryptEciesEnvelope(
  env: EncryptedEnvelope | string,
  sequencerPrivHex: string
): Promise<SwapRequest> {
  const o = typeof env === 'string' ? JSON.parse(env) : env;

  /* clean inputs */
  const priv = cleanHex(sequencerPrivHex);   // 64 hex chars, no 0x
  const peer = cleanHex(o.ephPub);           // 130 hex chars, starts with 04

  /* sanity check */
  if (!/^([0-9a-f]{64})$/.test(priv))
    throw new Error('Private key must be 64 hex chars');
  if (!/^04[0-9a-f]{128}$/.test(peer))
    throw new Error('Peer pubkey must be 130 hex chars (uncompressed)');

  /* 1. shared secret */
  const shared = getSharedSecret(
    priv,
    peer,
    false
  );

  /* 2. AES key */
  const key = createHash('sha256').update(shared).digest();

  /* 3. GCM decrypt */
  const iv  = Buffer.from(o.iv,  'base64');
  const tag = Buffer.from(o.tag, 'base64');
  const ct  = Buffer.from(o.data,'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString();

  const obj = JSON.parse(pt) as SwapRequest;
  if (
    typeof obj.user !== 'string' ||
    typeof obj.tokenIn !== 'string' ||
    typeof obj.tokenOut !== 'string' ||
    typeof obj.amountIn !== 'string' ||
    typeof obj.minOut !== 'string' ||
    typeof obj.directPayout !== 'boolean' ||
    typeof obj.nonce !== 'string' ||
    typeof obj.deadline !== 'string'
  ) {
    throw new Error('invalid swap request schema');
  }
  return obj;
}

// decrypt.ts  (server)
//
//   npm add @noble/secp256k1 @noble/hashes
//
import { getSharedSecret } from '@noble/secp256k1';
import { keccak_256 }      from '@noble/hashes/sha3';
import { createDecipheriv, createHash,  } from 'node:crypto'; // Use node: prefix for clarity
import { cleanHex, SwapRequest } from './constants.js';

export interface EncryptedEnvelope {
  ephPub: string;   // hex, uncompressed (65 bytes)
  iv:     string;   // base64
  tag:    string;   // base64
  data:   string;   // base64
}

/** Derives checksum address from a public key – handy sanity check. */
export function pubToAddress(pubHex: string): string {
  const bytes   = Buffer.from(pubHex.slice(4), 'hex');   // drop 0x04
  const hash    = keccak_256(bytes);
  const addrHex = Buffer.from(hash.slice(-20)).toString('hex');
  const addrHash= keccak_256(addrHex);
  let out = '0x';
  for (let i = 0; i < addrHex.length; i++) {
    out +=
      (parseInt(addrHash[i >> 1].toString(16), 16) >> (4 * (1 - (i & 1))) & 0x8)
        ? addrHex[i].toUpperCase()
        : addrHex[i].toLowerCase();
  }
  return out;
}

/** Opens a user envelope with the sequencer PRIVATE key. */
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

  /* 1. Shared secret */
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

  /* 4. Validate payload */
  const obj = JSON.parse(pt) as SwapRequest;
  if (
    typeof obj.address !== 'string' ||
    typeof obj.tokenIn !== 'string' ||
    typeof obj.tokenOut !== 'string' ||
    typeof obj.amount !== 'string'
  ) {
    throw new Error('Bad SwapRequest schema');
  }
  return obj;
}

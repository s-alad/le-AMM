import { keccak_256 } from "@noble/hashes/sha3";

export function cleanHex(hex: string): string {
  return hex.trim()
    .replace(/^0x/, '')
    .toLowerCase();
}

/* Derives checksum address from a public key */
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

export interface EncryptedEnvelope {
  ephPub: string;   // hex, uncompressed (65 bytes)
  iv:     string;   // base64
  tag:    string;   // base64
  data:   string;   // base64
}

export interface SwapRequest {
  address: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  directPayout: boolean;
  nonce: string;
  fee: string;
}
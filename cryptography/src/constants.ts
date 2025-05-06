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
  user: string;         // User's address (ensure it's checksummed later)
  tokenIn: string;      // Address of token being sent in
  tokenOut: string;     // Address of token desired out
  amountIn: string;     // Amount of tokenIn (as string for large numbers)
  minOut: string;       // Minimum amount of tokenOut acceptable (as string)
  directPayout: boolean;// True if output goes direct to user, false if to internal balance
  nonce: string;        // User's nonce for this swap (as string) 
  deadline: string;     // Unix timestamp deadline (as string)
}
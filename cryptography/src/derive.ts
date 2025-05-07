// derive.ts
// ----------
// Usage:
//   1)  npm add @noble/secp256k1 @noble/hashes
//   2)  npx ts-node derive.ts priv.hex
//   3)  npx ts-node derive.ts priv.hex pub.out addr.out
//
// Reads a 64‑hex‑char secp256k1 private key from <privKeyFile>,
// prints the matching public key & address, and saves them to files.
// Optional 2nd & 3rd CLI args let you override output filenames.

import { promises as fs } from 'node:fs';
import { getPublicKey } from '@noble/secp256k1';
import { pubToAddress } from './constants.js';

async function loadPrivKey(file: string): Promise<string> {
  const hex = (await fs.readFile(file, 'utf8')).trim().replace(/^0x/, '');
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Expected 64 hex chars in ${file}. Got "${hex.slice(0, 10)}…"`);
  }
  return hex.toLowerCase();
}

export function privToPub(privHex: string): string {
  const pub = getPublicKey(privHex, false);           // 65 bytes, uncompressed
  return '0x' + Buffer.from(pub).toString('hex');
}

(async () => {
  const [privFile, pubFile = 'pub.hex', addrFile = 'address.txt'] = process.argv.slice(2);
  if (!privFile) {
    console.error('npx tsx derive.ts <privKeyFile> [pubOutFile] [addrOutFile]');
    process.exit(1);
  }

  try {
    const privHex = await loadPrivKey(privFile);
    const pubHex = privToPub(privHex);
    const address = pubToAddress(pubHex);

    console.log('Private : 0x' + privHex);
    console.log('Public  : ' + pubHex);
    console.log('Address : ' + address);

    await fs.writeFile(pubFile, pubHex, { mode: 0o600 });
    await fs.writeFile(addrFile, address + '\n', { mode: 0o644 });

    console.log(`→ wrote public key to ${pubFile}`);
    console.log(`→ wrote address    to ${addrFile}`);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
})();

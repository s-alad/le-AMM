// Sequencer vsock server
// ---------------------
// Exposes the sequencer's public key over vsock for the host to connect to
// Responds to "GET_PUBLIC_KEY" messages with the sequencer's public key
//

import { VsockServer, VsockSocket } from 'node-vsock';
import crypto from 'crypto';
import { getPublicKey } from "@noble/secp256k1";
import { pubToAddress } from "./cryptography/decryption";

console.log("Sequencer starting...")

// Generate a new random private key and corresponding public key
const sequencerPrivHex = crypto.randomBytes(32).toString('hex');
const sequencerPubHex = "0x" + Buffer.from(getPublicKey(sequencerPrivHex, false)).toString("hex");

async function main() {
  const server = new VsockServer();
  const port = 9001;

  server.on('error', (err: Error) => {
    console.log("err:", err);
  });

  server.on('connection', (socket: VsockSocket) => {
    console.log("new socket connection...");

    socket.on('error', (err) => {
      console.log("socket err:", err);
    });

    socket.on('data', (buf: Buffer) => {
      const message = buf.toString().trim();
      console.log('socket recv:', message);

      if (message === "GET_PUBLIC_KEY") {
        console.log("sending public key:", sequencerPubHex);
        socket.writeTextSync(sequencerPubHex);
      } else {
        socket.writeTextSync(`Unknown command: ${message}`);
      }
    });

    socket.on('close', () => {
      console.log("connection closed");
    });
  });

  server.listen(port);

  console.log(`Sequencer listening on port ${port}`);
  console.log(`Public key: ${sequencerPubHex}`);
  console.log(`Address: ${pubToAddress(sequencerPubHex)}`);
}

main();

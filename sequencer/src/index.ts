// Sequencer vsock server
// ---------------------
// handles TEE actions
//

import crypto from 'crypto';
import { getPublicKey } from "@noble/secp256k1";
import { pubToAddress } from "./cryptography/decryption.js";
import { VsockServer, VsockSocket } from 'node-vsock';

console.log("[SEQ] ONLINE");

// generate a new random private key and corresponding public key
const seqpubhex = "0x" + Buffer.from(
  getPublicKey(crypto.randomBytes(32).toString('hex'), false)
).toString("hex");

// create vsock server
const server = new VsockServer();
const port = 9001;

server.on('error', (err: Error) => {
  console.error("[SEQ] server error:", err);
});

server.on('connection', (socket: VsockSocket) => {
  console.log("[SEQ] new connection from host");
  
  socket.on('error', (err) => {
    console.error("[SEQ] socket error:", err);
  });
  
  socket.on('data', (buf: Buffer) => {
    const request = buf.toString();
    console.log("[SEQ] received request:", request);
    
    if (request === 'SEQ_PUBLICKEY') {
      console.log("[SEQ] (publickey) sending public key:", seqpubhex);
      socket.writeTextSync(seqpubhex);
    }

    if (request === 'SEQ_HEARTBEAT') {
      console.log("[SEQ] (heartbeat) sending heartbeat");
      socket.writeTextSync('1');
    }
  });
});

// start the server
server.listen(port);
console.log(`[SEQ] ACTIVE @ ${port}`);
console.log(`[SEQ] PUBLIC KEY: ${seqpubhex}`);
console.log(`[SEQ] ADDRESS: ${pubToAddress(seqpubhex)}`);

// heartbeat every 10 seconds
setInterval(() => {
  console.log("[SEQ] HEARTBEAT");
}, 10000);

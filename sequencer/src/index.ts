// Sequencer vsock server
// ---------------------
// Exposes the sequencer's public key over vsock for the host to connect to
//

import crypto from 'crypto';
import { getPublicKey } from "@noble/secp256k1";
import { pubToAddress } from "./cryptography/decryption.js";
import { VsockServer, VsockSocket } from 'node-vsock';

console.log("Sequencer starting...")

// Generate a new random private key and corresponding public key
const sequencerPrivHex = crypto.randomBytes(32).toString('hex');
const sequencerPubHex = "0x" + Buffer.from(getPublicKey(sequencerPrivHex, false)).toString("hex");

// Create vsock server
const server = new VsockServer();
const port = 9001; // vsock port

server.on('error', (err: Error) => {
  console.error("Server error:", err);
});

server.on('connection', (socket: VsockSocket) => {
  console.log("New connection from host");
  
  socket.on('error', (err) => {
    console.error("Socket error:", err);
  });
  
  socket.on('data', (buf: Buffer) => {
    const request = buf.toString();
    console.log("Received request:", request);
    
    if (request === 'publickey') {
      console.log("Sending public key:", sequencerPubHex);
      socket.writeTextSync(sequencerPubHex);
    }
  });
});

// Start the server
server.listen(port);
console.log(`Sequencer listening on vsock port ${port}`);
console.log(`Public key: ${sequencerPubHex}`);
console.log(`Address: ${pubToAddress(sequencerPubHex)}`);

// Log every 10 seconds that we're alive
setInterval(() => {
  console.log("active");
}, 10000);

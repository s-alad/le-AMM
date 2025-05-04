// Sequencer Express server
// ---------------------
// Exposes the sequencer's public key over HTTP for clients to connect to
// Responds to "/publickey" endpoint with the sequencer's public key
//

import express from 'express';
import crypto from 'crypto';
import { getPublicKey } from "@noble/secp256k1";
import { pubToAddress } from "./cryptography/decryption.js";

console.log("Sequencer starting...")

// Generate a new random private key and corresponding public key
const sequencerPrivHex = crypto.randomBytes(32).toString('hex');
const sequencerPubHex = "0x" + Buffer.from(getPublicKey(sequencerPrivHex, false)).toString("hex");

const app = express();
const port = 4000;

// Middleware to parse JSON bodies
app.use(express.json());

// GET endpoint to retrieve the public key
app.get('/publickey', (req, res) => {
  console.log("sending public key:", sequencerPubHex);
  res.send(sequencerPubHex);
});

// Default route
app.get('/', (req, res) => {
  res.send('sequencer online');
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Sequencer listening on port ${port}`);
  console.log(`Public key: ${sequencerPubHex}`);
  console.log(`Address: ${pubToAddress(sequencerPubHex)}`);
});

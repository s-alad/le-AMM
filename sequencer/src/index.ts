// Sequencer vsock server
// ---------------------
// handles TEE actions
//

import crypto from 'crypto';
import { getPublicKey } from "@noble/secp256k1";
import { pubToAddress } from "./cryptography/decryption.js";
import { VsockServer, VsockSocket } from 'node-vsock';
import { getAttestationDoc, open } from 'aws-nitro-enclaves-nsm-node';
import { decryptEciesEnvelope, EncryptedEnvelope } from "./cryptography/decryption.js";
import { SwapRequest } from "./cryptography/constants.js";

console.log("[SEQ] ONLINE");

// generate a new random private key and corresponding public key
const seqprivatekey = crypto.randomBytes(32).toString('hex');
const seqpubhex = "0x" + Buffer.from(
  getPublicKey(seqprivatekey, false)
).toString("hex");

// generate an attestation document
function attest(): Buffer {
  console.log("[SEQ] generating attestation document");
  try {
    let fd = open();
    let attestDoc = getAttestationDoc(
      fd,
      null,
      Buffer.from(crypto.randomBytes(32)),
      Buffer.from(seqpubhex.substring(2), 'hex')
    );
    return attestDoc;
  } catch (e) {
    console.error("[SEQ] error generating attestation document:", e);
    console.log("error:", e);
    throw e;
  }
}

// Process a swap request by decrypting it
async function swapping(strenvelope: string): Promise<SwapRequest | string> {
  console.log("[SEQ] processing swap request");
  try {
    const envelope: EncryptedEnvelope = JSON.parse(strenvelope);
    const sr = await decryptEciesEnvelope(envelope, seqprivatekey);
    console.log("[SEQ] successfully decrypted swap request:", sr);
    return sr;
  } catch (error: any) {
    console.error("[SEQ] failed to process swap request:", error);
    return `ERROR:${error.message || 'Unknown error processing swap'}`;
  }
}

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
    
    if (request === 'SEQ_ATTESTATION') {
      console.log("[SEQ] (attestation) generating and sending attestation document");
      try {
        const d = attest();
        socket.writeTextSync(d.toString('base64'));
      } catch (error) {
        console.error("[SEQ] attestation error:", error);
        socket.writeTextSync('ERROR');
      }
    }
    
    if (request.startsWith('SEQ_SWAP:')) {
      console.log("[SEQ] received swap request");
      const [, strenvelope] = request.split('SEQ_SWAP:', 2);
      
      swapping(strenvelope).then(result => {
        if (typeof result === 'string') {
          socket.writeTextSync(result);
        } else {
          socket.writeTextSync(JSON.stringify(result));
        }
      }).catch(error => {
        console.error("[SEQ] error processing swap:", error);
        socket.writeTextSync(`ERROR:${error.message || 'Unknown error'}`);
      });
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

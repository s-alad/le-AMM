// Sequencer vsock server
// ---------------------
// handles TEE actions
//

import crypto, { randomBytes } from 'crypto';
import { getPublicKey } from "@noble/secp256k1";
import { pubToAddress, EncryptedEnvelope } from "@cryptography/core/constants";
import { VsockServer, VsockSocket } from 'node-vsock';
import { getAttestationDoc, open, close } from 'aws-nitro-enclaves-nsm-node';
import { decryptEciesEnvelope } from "@cryptography/core/decryption";
import { SwapRequest } from "@cryptography/core/constants";

console.log("[SEQ] ONLINE");

// generate a new random private key and corresponding public key
const seqprivatekey = randomBytes(32);
const seqprivatekeyhex = seqprivatekey.toString('hex');
const seqpubhex = "0x" + Buffer.from(
  getPublicKey(seqprivatekey, false)
).toString("hex");
const seqpubkeybuf = Buffer.from(seqpubhex.substring(2), 'hex');

// generate an attestation document
function attest(nonce: Buffer): Buffer {
  console.log("[SEQ] generating attestation document with nonce");
  let fd = -1;
  try {
    fd = open();
    console.log(`[SEQ] NSM device opened (fd: ${fd})`);
    let attestDoc = getAttestationDoc(
      fd,
      null,
      nonce,
      seqpubkeybuf
    );
    console.log(`[SEQ] Attestation document generated, closing fd: ${fd}`);
    close(fd);
    fd = -1;
    return attestDoc;
  } catch (e) {
    console.error("[SEQ] error generating attestation document:", e);
    if (fd !== -1) {
      console.log(`[SEQ] Closing NSM device (fd: ${fd}) due to error`);
      close(fd);
    }
    throw e;
  }
}


// Process a swap request by decrypting it
async function swapping(strenvelope: string): Promise<SwapRequest | string> {
  console.log("[SEQ] processing swap request");
  try {
    const envelope: EncryptedEnvelope = JSON.parse(strenvelope);
    const sr = await decryptEciesEnvelope(envelope, seqprivatekeyhex);
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
      socket.end();
    }

    if (request === 'SEQ_HEARTBEAT') {
      console.log("[SEQ] (heartbeat) sending heartbeat");
      socket.writeTextSync('1');
      socket.end();
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
      }).finally(() => {
        socket.end();
      });
    }

    if (request.startsWith('SEQ_ATTESTATION:')) {
      const [, noncehex] = request.split(':', 2);
      console.log(`[SEQ] received attestation request with nonce: ${noncehex}`);

      if (!noncehex || noncehex.length === 0) {
        console.error("[SEQ] empty nonce received");
        socket.writeTextSync('ERROR:Empty nonce received');
        socket.end();
        return;
      }

      try {
        const nb = Buffer.from(noncehex, 'hex');
        if (nb.length > 64) throw new Error('Nonce exceeds max length');
        console.log("[SEQ] parsed nonce buffer length:", nb.length);
        const doc = attest(nb);
        console.log(`[SEQ] sending attestation document (base64) to host`);
        socket.writeTextSync(doc.toString('base64'));
      } catch (error) {
        console.error("[SEQ] error:", error);
        socket.writeTextSync(`ERROR:${error instanceof Error ? error.message : 'Attestation failed'}`);
      } finally {
        socket.end();
      }
    }
  });
});

// start the server
server.listen(port);
console.log(`[SEQ] ACTIVE V2 @ ${port}`);
console.log(`[SEQ] PUBLIC KEY: ${seqpubhex}`);
console.log(`[SEQ] ADDRESS: ${pubToAddress(seqpubhex)}`);

// heartbeat every 10 seconds
setInterval(() => {
  const timestamp = new Date().toISOString();
  console.log(`[SEQ] HEARTBEAT ${timestamp}`);
}, 10000);

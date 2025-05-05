// index.ts
// -----------
// host server api:
//   • GET  /info   → sequencer address & public key (for clients to encrypt)
//   • POST /swap   → body = EncryptedEnvelope JSON, returns decrypted SwapRequest
//

import express, { Request, Response, NextFunction } from 'express';
import "dotenv/config";
import { decryptEciesEnvelope, EncryptedEnvelope, pubToAddress } from "./cryptography/decryption";
import { getPublicKey } from "@noble/secp256k1";
import { SwapRequest } from "./cryptography/constants";
import crypto from 'crypto';
import { VsockSocket } from 'node-vsock';

// ---------------------------------------------------------------------------
// config & helpers
// ---------------------------------------------------------------------------

// vsock connection config
const seqcid = 16;
const seqport = 9001;

// sequencer public key
let seqpubkey: string = '';

function handler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => {
        fn(req, res, next).catch(next);
    };
}

// get sequencer public key via vsock
async function spk(): Promise<string> {
    console.log("[HOST] fetching sequencer public key via vsock");
    return new Promise((resolve, reject) => {
        const client = new VsockSocket();
        
        client.on('error', (err: Error) => {
            console.error("vsock client error:", err);
            reject(err);
        });
        
        console.log("[HOST] attempting to connect to sequencer via vsock");
        client.connect(seqcid, seqport, () => {
            console.log("[HOST] connected to sequencer via vsock");
            
            client.writeTextSync('SEQ_PUBLICKEY');
            
            client.on('data', (buf: Buffer) => {
                const publicKey = buf.toString();
                console.log("[HOST] received public key from sequencer:", publicKey);
                client.end();
                resolve(publicKey);
            });
        })
    });
}

// check if the sequencer is alive 
async function beat(): Promise<boolean> {
    console.log("[HOST] sending heartbeat to sequencer");
    return new Promise((resolve, reject) => {
        const client = new VsockSocket();
        
        client.on('error', (err: Error) => {
            console.error("vsock client error:", err);
            reject(err);
        });
        
        console.log("[HOST] attempting to connect to sequencer for heartbeat");
        client.connect(seqcid, seqport, () => {
            console.log("[HOST] connected to sequencer for heartbeat");
            
            client.writeTextSync('SEQ_HEARTBEAT');
            
            client.on('data', (buf: Buffer) => {
                const response = buf.toString();
                console.log("[HOST] received heartbeat response from sequencer:", response);
                client.end();
                
                if (response === '1') {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
        
        // Add a timeout to handle connection issues
        setTimeout(() => {
            reject(new Error("Heartbeat timeout - no response from sequencer"));
        }, 5000);
    });
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", handler(async (_req, res) => {
    const alive = await beat();
    if (alive) {
        res.send("ok");
    } else {
        res.status(500).send("not ok");
    }
}));

app.get("/info", (_req, res) => {
    res.json({
        address: pubToAddress(seqpubkey),
        publicKey: seqpubkey, 
    });
});

// forward /publickey requests to the sequencer via vsock
app.get("/publickey", handler(async (_req, res) => {
    try {
        const pubkey = await spk();
        res.send(pubkey);
    } catch (error) {
        console.error("[HOST] error fetching public key from sequencer:", error);
        res.status(500).json({ error: "failed to fetch public key from sequencer" });
    }
}));

app.post(
    "/attest",
    handler(async (req, res) => {
        return null;
    })
);

app.post(
    "/swap",
    handler(async (req, res) => {
        const envelope: EncryptedEnvelope = req.body;
    })
);

// error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: "internal" });
});

const port = Number(process.env.PORT) || 8080;

// initialize: fetch public key on startup
async function initialize() {
    try {
        seqpubkey = await spk();
        
        // start the express server after we have the public key
        app.listen(port, () => {
            console.log(`[HOST] ACTIVE @ http://localhost:${port}`);
            console.log(`[SEQ] PUBLIC KEY: ${seqpubkey}`);
            console.log(`[SEQ] ADDRESS: ${pubToAddress(seqpubkey)}`);
        });
    } catch (error) {
        console.error("[HOST] failed to fetch sequencer public key:", error);
        console.error("[HOST] TERMINATING");
        process.exit(1);
    }
}

// start the initialization process
initialize();

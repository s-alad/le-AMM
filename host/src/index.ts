// server.ts
// -----------
// Minimal Express API that exposes:
//   • GET  /info   → sequencer address & public key (for clients to encrypt)
//   • POST /swap   → body = EncryptedEnvelope JSON, returns decrypted SwapRequest
//
// Build/run (dev):
//   npm add express dotenv @types/express
//   npx tsx server.ts
//
// Build/run (prod):
//   tsc && node dist/server.js
//

import express, { Request, Response, NextFunction } from 'express';
import "dotenv/config";
import { decryptEciesEnvelope, EncryptedEnvelope, pubToAddress } from "./cryptography/decryption";
import { getPublicKey } from "@noble/secp256k1";
import { SwapRequest } from "./cryptography/constants";
import crypto from 'crypto';
import { VsockSocket } from 'node-vsock';

// ---------------------------------------------------------------------------
// Config & helpers
// ---------------------------------------------------------------------------

// Sequencer connection details
const sequencerCid = 2; // CID for the sequencer VM or container
const sequencerPort = 9001; // vsock port

// These will be populated when fetching from the sequencer
let sequencerPubHex: string = '';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => {
        fn(req, res, next).catch(next);
    };
}

// Function to fetch sequencer public key via vsock
async function fetchSequencerPublicKey(): Promise<string> {
    console.log("Init Fetching sequencer public key via vsock");
    return new Promise((resolve, reject) => {
        const client = new VsockSocket();
        
        client.on('error', (err: Error) => {
            console.error("vsock client error:", err);
            reject(err);
        });
        
        console.log("Attempt Connecting to sequencer via vsock");
        client.connect(sequencerCid, sequencerPort, () => {
            console.log("Connected to sequencer via vsock");
            
            client.writeTextSync('publickey');
            
            client.on('data', (buf: Buffer) => {
                const publicKey = buf.toString();
                console.log("Received public key from sequencer:", publicKey);
                client.end();
                resolve(publicKey);
            });
        });
    });
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.send("ok"));

app.get("/info", (_req, res) => {
    res.json({
        address: pubToAddress(sequencerPubHex),
        publicKey: sequencerPubHex,
    });
});

// Forward /publickey requests to the sequencer via vsock
app.get("/publickey", asyncHandler(async (_req, res) => {
    try {
        const publicKey = await fetchSequencerPublicKey();
        res.send(publicKey);
    } catch (error) {
        console.error("Error fetching public key from sequencer:", error);
        res.status(500).json({ error: "Failed to fetch public key from sequencer" });
    }
}));

app.post(
    "/attest",
    asyncHandler(async (req, res) => {
        // forward to sequencer + reply
        return null;
    })
);

app.post(
    "/swap",
    asyncHandler(async (req, res) => {
        const envelope: EncryptedEnvelope = req.body;

        if (!envelope || typeof envelope !== "object" || !("ephPub" in envelope)) {
            return res.status(400).json({ error: "Body must be an EncryptedEnvelope" });
        }

        /* let swap: SwapRequest;
        try {
            swap = await decryptEciesEnvelope(envelope, sequencerPrivHex);
        } catch (err) {
            return res.status(400).json({ error: (err as Error).message });
        } */

        /* console.log("[Swap]", swap);

        res.json({ ok: true, swap }); */
    })
);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: "internal" });
});

const port = Number(process.env.PORT) || 8080;

// Initialize: fetch public key before starting server
async function initialize() {
    try {
        sequencerPubHex = await fetchSequencerPublicKey();
        
        // Start express server after we have the public key
        app.listen(port, () => {
            console.log(`Host API listening on http://localhost:${port}`);
            console.log(`Sequencer Public key: ${sequencerPubHex}`);
            console.log(`Sequencer Address: ${pubToAddress(sequencerPubHex)}`);
        });
    } catch (error) {
        console.error("Failed to fetch sequencer public key:", error);
        process.exit(1);
    }
}

// Start the initialization process
initialize();

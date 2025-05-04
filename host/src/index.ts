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
import { VsockSocket } from "node-vsock"

// ---------------------------------------------------------------------------
// Config & helpers
// ---------------------------------------------------------------------------

const vsockclient = new VsockSocket();
const cid = 15;
const vsockPort = 9001;

// These will be populated when fetching from the sequencer
let sequencerPubHex: string = '';

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => {
        fn(req, res, next).catch(next);
    };
}

vsockclient.on('error', (err:Error) => {
    console.log("vsock error: ", err)
});

// Function to fetch sequencer public key via vsock
async function fetchSequencerPublicKey(): Promise<string> {
    return new Promise((resolve, reject) => {
        vsockclient.connect(cid, vsockPort, () => {
            console.log("Connected to sequencer via vsock");
            
            // Send a request for the public key
            vsockclient.writeTextSync("GET_PUBLIC_KEY");
            
            vsockclient.on('data', (buf: Buffer) => {
                const pubKey = buf.toString().trim();
                console.log("Received public key from sequencer:", pubKey);
                vsockclient.end();
                resolve(pubKey);
            });
        });

        // Add timeout handling
        setTimeout(() => {
            if (!sequencerPubHex) {
                reject(new Error("Timeout waiting for sequencer public key"));
            }
        }, 5000);
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

app.post(
    "/attest",
    asyncHandler(async (req, res) => {
        // forward to sequencer + reply
        return null;
    }
));

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
            console.log(`Sequencer API listening on http://localhost:${port}`);
            console.log(`Public key  : ${sequencerPubHex}`);
            console.log(`Address     : ${pubToAddress(sequencerPubHex)}`);
        });
    } catch (error) {
        console.error("Failed to fetch sequencer public key:", error);
        process.exit(1);
    }
}

// Start the initialization process
initialize();

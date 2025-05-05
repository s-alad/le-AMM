// index.ts
// -----------
// host server api:
//   • GET  /info   → sequencer address & public key (for clients to encrypt)
//   • POST /swap   → body = EncryptedEnvelope JSON, returns decrypted SwapRequest
//

import express, { Request, Response, NextFunction } from 'express';
import "dotenv/config";
import { decryptEciesEnvelope, EncryptedEnvelope, pubToAddress } from "@cryptography/core/decryption";
import { getPublicKey } from "@noble/secp256k1";
import { SwapRequest } from "@cryptography/core/constants";
import { VsockSocket } from 'node-vsock';
import { encryptForSequencer } from "@cryptography/core/encryption";

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

// generic vsock communication function
async function talk<T>(message: string, timeout = 5000): Promise<T> {
    console.log(`[HOST] sending message to sequencer: ${message}`);
    return new Promise((resolve, reject) => {
        const client = new VsockSocket();
        
        client.on('error', (err: Error) => {
            console.error("[HOST] vsock client error:", err);
            reject(err);
        });
        
        console.log("[HOST] attempting to connect to sequencer via vsock");
        client.connect(seqcid, seqport, () => {
            console.log("[HOST] connected to sequencer via vsock");
            
            client.writeTextSync(message);
            
            client.on('data', (buf: Buffer) => {
                const response = buf.toString();
                console.log(`[HOST] received response from sequencer: ${response}`);
                client.end();
                resolve(response as unknown as T);
            });
        });
        
        // timeout
        setTimeout(() => {
            reject(new Error(`[HOST] timeout - no response from sequencer after ${timeout}ms`));
        }, timeout);
    });
}

// get sequencer public key via vsock
async function spk(): Promise<string> {
    console.log("[HOST] fetching sequencer public key via vsock");
    return talk<string>('SEQ_PUBLICKEY');
}

// check if the sequencer is alive 
async function beat(): Promise<boolean> {
    console.log("[HOST] sending heartbeat to sequencer");
    try {
        const response = await talk<string>('SEQ_HEARTBEAT');
        return response === '1';
    } catch (error) {
        console.error("[HOST] heartbeat failed:", error);
        return false;
    }
}

// get attestation document from sequencer
async function testify(nonceHex: string): Promise<Buffer | null> {
    console.log("[HOST] requesting attestation document from sequencer with nonce:", nonceHex);
    try {
        const message = `SEQ_ATTESTATION:${nonceHex}`;
        const b64r = await talk<string>(message);
        
        if (b64r === 'ERROR') {
            console.error("[HOST] sequencer failed to generate attestation document");
            return null;
        }
        
        return Buffer.from(b64r, 'base64');
    } catch (error) {
        console.error("[HOST] attestation request failed:", error);
        return null;
    }
}

// forward swap request to sequencer for decryption and processing
async function fwdswap(envelope: EncryptedEnvelope): Promise<SwapRequest | null> {
    console.log("[HOST] forwarding encrypted swap request to sequencer");
    try {
        const strenvelope = JSON.stringify(envelope);
        const message = `SEQ_SWAP:${strenvelope}`;
        const response = await talk<string>(message);
        if (response.startsWith('ERROR:')) {
            console.error("[HOST] sequencer failed to process swap:", response.substring(6));
            return null;
        }
        return JSON.parse(response) as SwapRequest;
    } catch (error) {
        console.error("[HOST] swap request failed:", error);
        return null;
    }
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

app.get(
    "/attest",
    handler(async (req, res) => {
        const nonce = req.query.nonce;

        if (!nonce || typeof nonce !== 'string') {
            return res.status(400).json({ error: "Nonce query parameter is required and must be a string" });
        }

        // Optional: Add validation for nonce format (e.g., hex) if needed
        // const hexRegex = /^[0-9a-fA-F]+$/;
        // if (!hexRegex.test(nonce)) {
        //     return res.status(400).json({ error: "Nonce must be a valid hex string" });
        // }

        const testification = await testify(nonce);
        
        if (!testification) {
            return res.status(500).json({ error: "failed to get attestation document from sequencer" });
        }
        
        // return the attestation document
        res.setHeader('Content-Type', 'application/octet-stream');
        return res.send(testification);
    })
);

app.post(
    "/swap",
    handler(async (req, res) => {
        const envelope: EncryptedEnvelope = req.body;
        const sr = await fwdswap(envelope);
        
        if (sr) {
            res.json(sr);
        } else {
            res.status(500).json({ error: "failed to process swap request" });
        }
    })
);

app.get(
    "/test-swap",
    handler(async (_req, res) => {
        try {
            console.log("[HOST] testing swap flow");
            
            // Create a fake swap request
            const testSwap: SwapRequest = {
                address: "0xTestAddress123456789",
                tokenIn: "ETH",
                tokenOut: "USDC",
                amount: "1000000000000000000" // 1 ETH in wei
            };
            
            console.log("[HOST] created test swap request:", testSwap);
            
            // Step 1: Encrypt the swap with the sequencer's public key
            if (!seqpubkey) {
                return res.status(500).json({ error: "Sequencer public key not available" });
            }
            
            console.log("[HOST] encrypting test swap with sequencer public key:", seqpubkey);
            const envelope = await encryptForSequencer(testSwap, seqpubkey);
            
            // Step 2: Forward the encrypted envelope to the sequencer
            console.log("[HOST] forwarding encrypted test swap to sequencer");
            const decryptedSwap = await fwdswap(envelope);
            
            if (!decryptedSwap) {
                return res.status(500).json({ error: "Sequencer failed to decrypt test swap" });
            }
            
            // Step 3: Compare original and decrypted swap to verify integrity
            const swapMatches = 
                decryptedSwap.address === testSwap.address &&
                decryptedSwap.tokenIn === testSwap.tokenIn &&
                decryptedSwap.tokenOut === testSwap.tokenOut &&
                decryptedSwap.amount === testSwap.amount;
            
            // Return test results
            return res.json({
                success: swapMatches,
                original: testSwap,
                decrypted: decryptedSwap,
                message: swapMatches ? 
                    "Swap test successful! The sequencer correctly decrypted the swap." : 
                    "Swap test failed. The decrypted swap doesn't match the original."
            });
        } catch (error: any) {
            console.error("[HOST] test-swap error:", error);
            return res.status(500).json({ error: "Test swap failed", details: error.message });
        }
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
        app.listen(port, '0.0.0.0', () => {
            console.log(`[HOST] ACTIVE V1 @ http://localhost:${port}`);
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

// index.ts
// -----------
// host server api:
//   • GET  /info   → sequencer address & public key (for clients to encrypt)
//   • POST /swap   → body = EncryptedEnvelope JSON, returns decrypted SwapRequest
//

import express, { Request, Response, NextFunction } from 'express';
import "dotenv/config";
import { decryptEciesEnvelope } from "@cryptography/core/decryption";
import { getPublicKey } from "@noble/secp256k1";
import { SwapRequest, EncryptedEnvelope, pubToAddress } from "@cryptography/core/constants";
import { VsockSocket } from 'node-vsock';
import { encryptEciesEnvelope } from "@cryptography/core/encryption";

// ---------------------------------------------------------------------------
// config & helpers
// ---------------------------------------------------------------------------

// vsock connection config
const seqcid = 16;
const seqport = 9001;

let persistentsocket: VsockSocket | null = null;
let persisting = false;

// sequencer public key
let seqpubkey: string = '';

function handler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => {
        fn(req, res, next).catch(next);
    };
}

// generic vsock communication function
async function talk<T>(message: string, timeout = 5000): Promise<T> {
    console.log(`[HOST] sending transient message to sequencer: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    return new Promise((resolve, reject) => {
        let client: VsockSocket | null = new VsockSocket();
        let ctime: NodeJS.Timeout | null = null;
        let rtime: NodeJS.Timeout | null = null;
        let connected = false;

        const cleanup = () => {
            if (ctime) clearTimeout(ctime);
            if (rtime) clearTimeout(rtime);
            if (client) {
                client.removeAllListeners();
                client.end();
                client = null;
            }
        };

        client.on('error', (err: Error) => {
            console.error("[HOST] vsock client error:", err);
            if (!connected) {
                reject(new Error(`[HOST] vsock connection failed: ${err.message}`));
            } else {
                reject(new Error(`[HOST] vsock communication error: ${err.message}`));
            }
            cleanup();
        });

        client.on('close', () => {
            console.log("[HOST] vsock connection closed.");
            cleanup();
        });

        console.log(`[HOST] attempting to connect to vsock cid=${seqcid} port=${seqport}`);

        ctime = setTimeout(() => {
            reject(new Error(`[HOST] vsock connection timeout after ${timeout}ms`));
            cleanup();
        }, timeout);

        client.connect(seqcid, seqport, () => {
            connected = true;
            if (ctime) clearTimeout(ctime);
            console.log("[HOST] connected to sequencer via vsock");

            client!.writeTextSync(message);

            rtime = setTimeout(() => {
                reject(new Error(`[HOST] timeout - no response from sequencer after ${timeout}ms`));
                cleanup();
            }, timeout);

            client!.once('data', (buf: Buffer) => {
                if (rtime) clearTimeout(rtime);
                rtime = null;
                const response = buf.toString();
                console.log(`[HOST] received response from sequencer: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`);
                resolve(response as unknown as T);
                cleanup();
            });
        });
    });
}

// get sequencer public key via vsock
async function spk(): Promise<string> {
    console.log("[HOST] fetching sequencer public key via vsock");
    return talk<string>('SEQ_PUBLICKEY', 6000);
}

// check if the sequencer is alive 
async function beat(): Promise<boolean> {
    console.log("[HOST] sending heartbeat to sequencer");
    try {
        const response = await talk<string>('SEQ_HEARTBEAT', 2000);
        return response === '1';
    } catch (error) {
        console.error("[HOST] heartbeat failed:", error);
        return false;
    }
}

// get attestation document from sequencer
async function testify(noncehex: string): Promise<Buffer | null> {
    console.log("[HOST] requesting attestation document from sequencer with nonce:", noncehex);
    try {
        const message = `SEQ_ATTESTATION:${noncehex}`;
        const b64r = await talk<string>(message, 8000);

        if (b64r.startsWith('ERROR:') || b64r === 'ERROR') {
            console.error("[HOST] sequencer returned error for attestation:", b64r.substring(6));
            return null;
        }

        try {
            return Buffer.from(b64r, 'base64');
        } catch (decodeError) {
            console.error("[HOST] failed to decode base64 attestation document from sequencer:", decodeError);
            console.error("[HOST] received raw response:", b64r);
            return null;
        }

    } catch (error) {
        console.error("[HOST] attestation request failed:", error);
        return null;
    }
}

// forward swap request to sequencer for decryption and processing
async function fwdswap(envelope: EncryptedEnvelope): Promise<boolean> {
    console.log("[HOST] Forwarding encrypted swap request to sequencer");
    try {
        const strenvelope = JSON.stringify(envelope);
        const message = `SEQ_SWAP:${strenvelope}`;
        const response = await talk<string>(message, 6000);

        if (response === "ACK_SWAP_RECEIVED") {
            console.log("[HOST] swap request acknowledged by sequencer.");
            return true;
        } else {
            console.error("[HOST] swap request failed or rejected by sequencer:", response);
            return false;
        }
    } catch (error) {
        console.error("[HOST] swap request communication failed:", error);
        return false;
    }
}

function persist() {
    if (persistentsocket || persisting) {
        console.log("[HOST] persistent connection already active or attempting connection.");
        return;
    }

    persisting = true;
    console.log(`[HOST] attempting to establish persistent connection to cid=${seqcid} port=${seqport}...`);
    const socket = new VsockSocket();

    const listeners = () => {
        socket.on('data', (buf: Buffer) => {
            const message = buf.toString();
            const logMessage = message.length > 100 ? `${message.substring(0, 100)}...` : message;
            console.log(`[HOST] Received data on persistent channel: ${logMessage}`);

            if (message.startsWith('SEQ_BATCH_TX:')) {
                const tx = message.substring('SEQ_BATCH_TX:'.length);
                console.log("[HOST] received batch tx:", tx);
            }
            if (message === 'ACK_PERSIST') {
                console.log("[HOST] ACK_PERSIST from enclave for batch sink.");
            }
        });

        socket.on('close', () => {
            console.warn("[HOST] persistent connection closed. re-connecting...");
            persistentsocket = null;
            persisting = false;
            // schedule reconnect after delay
            setTimeout(persist, 1000);
        });

        socket.on('error', (err: Error) => {
            console.error("[HOST] persistent connection error:", err);
            persistentsocket = null;
            persisting = false;
            if (!socket.destroyed) socket.end();
            // schedule reconnect after delay
            setTimeout(persist, 1000);
        });
    }

    socket.connect(seqcid, seqport, () => {
        console.log("[HOST] persistent connection established. registering...");
        persisting = false;
        persistentsocket = socket;

        try {
            socket.writeTextSync('SEQ_REGISTER_PERSISTENT');
            listeners();
        } catch (e) {
            console.error("[HOST] failed to send registration message:", e);
            persistentsocket = null;
            persisting = false;
            if (!socket.destroyed) socket.end();
            // schedule reconnect after delay
            setTimeout(persist, 1000);
        }
    });

    // handle initial connection error
    socket.once('error', (err: Error) => {
        if (!persistentsocket) {
            console.error("[HOST] initial connection error:", err);
            persisting = false;
            // schedule reconnect after delay
            setTimeout(persist, 1000);
        }
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
        res.status(503).send("not ok");
    }
}));

app.get("/info", (_req, res) => {
res.json({
        address: pubToAddress(seqpubkey),
        publicKey: seqpubkey,
    });
});

app.get("/publickey", handler(async (_req, res) => {
    try {
        const pubkey = await spk();
        res.send(pubkey);
    } catch (error) {
        console.error("[HOST] error fetching public key from sequencer:", error);
        res.status(500).json({ error: "failed to fetch public key from sequencer" });
    }
}));

app.get("/attest", handler(async (req, res) => {
        const nonce = req.query.nonce;

        if (!nonce || typeof nonce !== 'string' || nonce.length === 0) {
            console.warn(`[HOST] /attest bad request: Nonce query parameter is required and must be a non-empty string. Received: ${nonce}`);
            return res.status(400).json({ error: "Nonce query parameter is required and must be a non-empty string" });
        }

        const hexregex = /^[0-9a-fA-F]+$/;
        if (!hexregex.test(nonce) || nonce.length % 2 !== 0 || nonce.length < 32 || nonce.length > 64) {
            console.warn(`[HOST] /attest bad request: Nonce must be a valid hex string with an even number of characters (32-64 characters). Received: ${nonce}`);
            return res.status(400).json({ error: "Nonce must be a valid hex string with an even number of characters (32-64 characters)" });
        }

        console.log(`[HOST] requesting attestation with nonce: ${nonce}`);
        const docbuf = await testify(nonce);

        if (!docbuf) {
            console.error("[HOST] failed to get attestation document from sequencer");
            return res.status(500).json({ error: "Failed to get attestation document from sequencer" });
        }

        console.log(`[HOST] sending attestation document (length: ${docbuf.length})`);
        res.setHeader('Content-Type', 'application/cbor');
        res.setHeader('Content-Disposition', 'attachment; filename="attestation.cbor"');
        return res.status(200).send(docbuf);
    })
);

app.post("/swap", handler(async (req, res) => {
        const envelope: EncryptedEnvelope = req.body;
        if (!envelope || typeof envelope !== 'object' || !envelope.ephPub || !envelope.iv || !envelope.tag || !envelope.data) {
            console.warn("[HOST] /swap bad request: Invalid envelope structure");
            return res.status(400).json({ error: "Invalid swap request envelope structure" });
        }

        console.log("[HOST] forwarding encrypted swap request to sequencer");
        const sr = await fwdswap(envelope);

        if (sr) {
            console.log("[HOST] successfully processed swap request");
            res.json(sr);
        } else {
            console.error("[HOST] failed to process swap request");
            res.status(500).json({ error: "failed to process swap request" });
        }
    })
);

app.get("/test-swap", handler(async (_req, res) => {
    try {
        console.log("[HOST] /test-swap request received");
        const ts: SwapRequest = {
            user: "0x1111111111111111111111111111111111111111",
            tokenIn: "0x2222222222222222222222222222222222222222",
            tokenOut: "0x3333333333333333333333333333333333333333",
            amountIn: "1000000000000000000",
            minOut: "990000000000000000",
            directPayout: false,
            nonce: Math.floor(Math.random() * 10000).toString(),
            deadline: (Math.floor(Date.now() / 1000) + 300).toString()
        };
        console.log("[HOST] created test swap request:", ts);

        if (!seqpubkey) { return res.status(503).json({ error: "Sequencer pubkey unavailable" }); }

        console.log("[HOST] encrypting test swap...");
        const envelope = await encryptEciesEnvelope(ts, seqpubkey);

        console.log("[HOST] forwarding encrypted test swap...");
        const ackReceived = await fwdswap(envelope);

        return res.status(ackReceived ? 200 : 500).json({
            success: ackReceived,
            message: ackReceived
                ? "Test swap successfully sent and acknowledged by sequencer."
                : "Test swap failed: Sequencer did not acknowledge receipt.",
            encryptedEnvelope: envelope
        });
    } catch (error: any) {
        console.error("[HOST] /test-swap critical error:", error);
        return res.status(500).json({ error: "Test swap failed", details: error.message });
    }
})
);

// error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[HOST] Unhandled error:", err.stack || err.message || err);
    res.status(500).json({ error: "internal" });
});

const port = Number(process.env.PORT) || 8080;

// initialize: fetch public key on startup
async function initialize() {
    try {
        seqpubkey = await spk();

        persist();

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

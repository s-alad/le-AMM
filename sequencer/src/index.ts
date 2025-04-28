// server.ts
// -----------
// Minimal Express API that exposes:
//   • GET  /info   → sequencer address & public key (for clients to encrypt)
//   • POST /swap   → body = EncryptedEnvelope JSON, returns decrypted SwapRequest
//
// Build/run (dev):
//   npm add express dotenv @types/express
//   npx ts-node server.ts      # requires SEQUENCER_PRIV_HEX in .env or shell
//
// Build/run (prod):
//   tsc && node dist/server.js
//
// Environment variables (dotenv or shell):
//   SEQUENCER_PRIV_HEX   64‑hex‑char secp256k1 private key (no 0x)
//   PORT                 default 8080

import express, { Request, Response, NextFunction } from 'express';
import "dotenv/config";
import { decryptEciesEnvelope, EncryptedEnvelope, pubToAddress } from "./cryptography/decryption";
import { getPublicKey } from "@noble/secp256k1";
import { SwapRequest } from "./cryptography/constants";
// ---------------------------------------------------------------------------
// Config & helpers
// ---------------------------------------------------------------------------
const sequencerPrivHex = process.env.SEQUENCER_PRIV_HEX?.replace(/^0x/, "").trim();
if (!sequencerPrivHex || sequencerPrivHex.length !== 64) {
    throw new Error("SEQUENCER_PRIV_HEX env var must be a 64‑hex‑char string (without 0x)");
}

const sequencerPubHex = "0x" + Buffer.from(getPublicKey(sequencerPrivHex, false)).toString("hex");

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => {
        fn(req, res, next).catch(next);
    };
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
    "/swap",
    asyncHandler(async (req, res) => {
        const envelope: EncryptedEnvelope = req.body;

        // Basic shape check before decrypt to avoid exceptions spamming logs
        if (!envelope || typeof envelope !== "object" || !("ephPub" in envelope)) {
            return res.status(400).json({ error: "Body must be an EncryptedEnvelope" });
        }

        let swap: SwapRequest;
        try {
            swap = await decryptEciesEnvelope(envelope, sequencerPrivHex);
        } catch (err) {
            return res.status(400).json({ error: (err as Error).message });
        }

        // TODO: hand off to relayer / contract interaction logic here
        console.log("[Swap]", swap);

        res.json({ ok: true, swap });
    })
);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: "internal" });
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => {
    console.log(`Sequencer API listening on http://localhost:${port}`);
    console.log(`Public key  : ${sequencerPubHex}`);
});

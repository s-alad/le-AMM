import crypto, { randomBytes } from 'crypto';
import { encodeFunctionData, isAddress, type Address, keccak256 as viemKeccak256, toBytes, encodeAbiParameters } from 'viem';
import { getPublicKey, sign } from "@noble/secp256k1";
import { pubToAddress, EncryptedEnvelope } from "@cryptography/core/constants";
import { VsockServer, VsockSocket } from 'node-vsock';
import { getAttestationDoc, open, close } from 'aws-nitro-enclaves-nsm-node';
import { decryptEciesEnvelope } from "@cryptography/core/decryption";
import { SwapRequest } from "@cryptography/core/constants";
import { privateKeyToAccount } from 'viem/accounts';

console.log("[SEQ] ONLINE");

// _ STATE ───────────────────────────────────────────────────────────────────────────────────────╮
// #region

const seqprivatekey = randomBytes(32);
const seqprivatekeyhex = seqprivatekey.toString('hex');
const enclaveAccount = privateKeyToAccount(`0x${seqprivatekeyhex}`);
const seqpubhex = "0x" + Buffer.from(getPublicKey(seqprivatekey, false)).toString("hex");
const seqpubkeybuf = Buffer.from(seqpubhex.substring(2), 'hex');
const contract = "";
const teeammabi = [
	{
		"type": "function",
		"name": "batchSwap",
		"inputs": [
			{
				"name": "xs",
				"type": "tuple[]",
				"components": [
					{ "name": "user", "type": "address" },
					{ "name": "tokenIn", "type": "address" },
					{ "name": "tokenOut", "type": "address" },
					{ "name": "amountIn", "type": "uint128" },
					{ "name": "minOut", "type": "uint128" },
					{ "name": "directPayout", "type": "bool" },
					{ "name": "nonce", "type": "uint64" },
					{ "name": "deadline", "type": "uint64" }
				],
				"internalType": "struct TEEAMM.SwapIntent[]"
			},
			{
				"name": "enclaveSignature",
				"type": "bytes",
				"internalType": "bytes"
			}
		],
		"outputs": [],
		"stateMutability": "nonpayable"
	}
] as const;

let vsockconnection: VsockSocket | null = null;
let batch: SwapRequest[] = [];
// #endregion
// ────────────────────────────────────────────────────────────────────────────────────────────────

function checkswap(req: any): req is SwapRequest {
	if (typeof req !== 'object' || req === null) return false;

	if (!isAddress(req.user) || !isAddress(req.tokenIn) || !isAddress(req.tokenOut)) return false;
	if (typeof req.directPayout !== 'boolean') return false;

	try {
		const amountIn = BigInt(req.amountIn);
		const minOut = BigInt(req.minOut);
		const nonce = BigInt(req.nonce);
		const deadline = BigInt(req.deadline);

		if (amountIn < 0n || minOut < 0n || nonce < 0n || deadline < 0n) return false;
		if (amountIn === 0n || minOut === 0n) return false;
	} catch (e) {
		return false;
	}

	return true;
}

async function swapping(strenvelope: string): Promise<boolean> {
	console.log("[SEQ] processing swap request");
	try {
		const envelope: EncryptedEnvelope = JSON.parse(strenvelope);
		const sr = await decryptEciesEnvelope(envelope, seqprivatekeyhex);
		console.log("[SEQ] successfully decrypted swap request for user:", sr.user);
		if (!checkswap(sr)) {
			console.error("[SEQ] invalid swap request received");
			return false;
		}
		batch.push(sr);
		console.log("[SEQ] successfully added swap request to batch");
		return true;
	} catch (error: any) {
		console.error("[SEQ] failed to process swap request:", error);
		return false;
	}
}

async function sendbatch() {
	if (batch.length === 0) {
		console.log("[SEQ][BATCH] no swaps to send");
		return;
	}

	console.log(`[SEQ][BATCH] creating batch transaction for ${batch.length} swaps.`);
	const xbatch = [...batch];
	batch = [];

	try {
		const formatted = xbatch.map((req): {
			user: Address; tokenIn: Address; tokenOut: Address; amountIn: bigint;
			minOut: bigint; directPayout: boolean; nonce: bigint; deadline: bigint
		} => {
			try {
				return {
					user: req.user as Address,
					tokenIn: req.tokenIn as Address,
					tokenOut: req.tokenOut as Address,
					amountIn: BigInt(req.amountIn),
					minOut: BigInt(req.minOut),
					directPayout: req.directPayout,
					nonce: BigInt(req.nonce),
					deadline: BigInt(req.deadline)
				};
			} catch (e) {
				throw new Error(`Error converting swap fields for batch: ${JSON.stringify(req)} - ${e}`);
			}
		});

		// 1. ABI-encode the swap intents array (this is the core data to sign over)
		const abiEncodedIntents = encodeAbiParameters(
			[{
				type: 'tuple[]', name: 'xs', components: [
					{ name: 'user', type: 'address' }, { name: 'tokenIn', type: 'address' },
					{ name: 'tokenOut', type: 'address' }, { name: 'amountIn', type: 'uint128' },
					{ name: 'minOut', type: 'uint128' }, { name: 'directPayout', type: 'bool' },
					{ name: 'nonce', type: 'uint64' }, { name: 'deadline', type: 'uint64' }
				]
			}],
			[formatted] // Pass the array as the value for the single tuple[] parameter
		);

		// 2. Calculate the Keccak256 hash of the encoded intents
		const dataHash = viemKeccak256(abiEncodedIntents);
		console.log(`[SEQ][BATCH] Intents data hash: ${dataHash}`);

		// --- <<< CHANGED: Signing using Viem Account >>> ---
		// 3. Sign the hash using the enclave's account object
		//    `signMessage` with raw hash automatically applies "\x19Ethereum Signed Message:\n32" prefix
		const signatureHex = await enclaveAccount.signMessage({
			message: { raw: dataHash }
		});
		console.log(`[SEQ][BATCH] Enclave signature: ${signatureHex.substring(0, 74)}...`);
		// --- <<< End of Viem Signing Change >>> ---

		// 4. Encode the *complete* call data for batchSwap(SwapIntent[] memory xs, bytes memory enclaveSignature)
		const completeTransactionData = encodeFunctionData({
			abi: teeammabi,
			functionName: 'batchSwap',
			args: [formatted, signatureHex] // Pass BOTH arguments: the intents array and the signature
		});

		console.log(`[SEQ][BATCH] Complete tx data for host: ${completeTransactionData.substring(0, 74)}... (len: ${completeTransactionData.length})`);

		// 5. Send complete tx data to host via persistent connection
		if (vsockconnection && !vsockconnection.destroyed) {
			console.log("[SEQ][BATCH] Sending complete tx data to host...");
			vsockconnection.writeTextSync(`SEQ_BATCH_TX:${completeTransactionData}`);
		} else {
			console.error("[SEQ][BATCH] No persistent host connection. Re-queuing batch.");
			batch.unshift(...xbatch); // Add back
		}

	} catch (error) {
		console.error("[SEQ][BATCH] error creating, encoding, or signing batch transaction:", error);
		console.log("[SEQ][BATCH] re-queuing failed batch due to error.");
		batch.unshift(...xbatch);
	}
}

// _ ATTESATION ──────────────────────────────────────────────────────────────────────────────────╮
// #region

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

// #endregion
// ────────────────────────────────────────────────────────────────────────────────────────────────

// _ SERVER ──────────────────────────────────────────────────────────────────────────────────────╮
// #region

const server = new VsockServer();
const port = 9001;

server.on('error', (err: Error) => console.error("[SEQ] server error:", err));

server.on('connection', (socket: VsockSocket) => {
	console.log("[SEQ] new connection from host");

	socket.once('data', async (buf: Buffer) => {
		const request = buf.toString();
		console.log("[SEQ] received request:", request);

		if (request === 'SEQ_REGISTER_PERSISTENT') {
			console.log("[SEQ] persistent connection requested");
			// clean up old persistent connection if it exists
			if (vsockconnection && !vsockconnection.destroyed) {
				console.warn(`[SEQ] closing previous persistent connection.`);
				vsockconnection.removeAllListeners(); // Prevent memory leaks
				vsockconnection.end();
			}

			// store the new persistent connection
			vsockconnection = socket;

			// add close/error handlers specifically for this persistent socket
			socket.on('close', () => {
				console.warn(`[SEQ] persistent host connection closed.`);
				if (vsockconnection === socket) vsockconnection = null;
			});
			socket.on('error', (err) => {
				console.error(`[SEQ] persistent host connection error:`, err);
				if (vsockconnection === socket) vsockconnection = null;
			});

			// acknowledge registration
			try { console.log("[SEQ] sending ACK_PERSIST"); socket.writeTextSync("ACK_PERSIST"); }
			catch (e) { console.error("[SEQ] Failed to send ACK_PERSIST", e); vsockconnection = null; socket.end(); }

			// --- KEEP ALIVE ---
		} else {
			console.log(`[SEQ] transient connection received`);
			let response: string | null = null;
			try {
				if (request === 'SEQ_PUBLICKEY') {
					console.log("[SEQ] sending public key");
					response = seqpubhex;
				}
				if (request === 'SEQ_HEARTBEAT') {
					console.log("[SEQ] sending heartbeat");
					response = '1';
				}
				if (request.startsWith('SEQ_SWAP:')) {
					console.log("[SEQ] processing swap request");
					const [, strenvelope] = request.split('SEQ_SWAP:', 2);
					const success = await swapping(strenvelope);
					response = success ? "ACK_SWAP_RECEIVED" : "NACK_SWAP_FAILED";
				}
				if (request.startsWith('SEQ_ATTESTATION:')) {
					console.log("[SEQ] processing attestation request");
					const [, noncehex] = request.split(':', 2);
					if (!noncehex || noncehex.length === 0) {
						response = 'ERROR:EMPTY_NONCE';
					} else {
						const nb = Buffer.from(noncehex, 'hex');
						if (nb.length < 16 || nb.length > 64) throw new Error('Nonce length invalid (must be 16-64 bytes)');
						const doc = attest(nb);
						response = doc.toString('base64');
					}
				}
			} catch (error: any) {
				console.error(`[SEQ] error processing transient request:`, error);
				response = `ERROR:${error}`;
			} finally {
				if (!socket.destroyed) {
					if (response) {
						console.log("[SEQ] sending response:", response);
						try { socket.writeTextSync(response); } catch (e) { console.error("[SEQ] error sending response:", e); }
					}
					socket.end();
				}
			}

		}
	});
});

server.listen(port);
console.log(`[SEQ] ACTIVE V3 @ ${port}`);
console.log(`[SEQ] PUBLIC KEY: ${seqpubhex}`);
console.log(`[SEQ] ADDRESS: ${pubToAddress(seqpubhex)}`);
// #endregion
// ───────────────────────────────────────────────────────────────────────────────────────────────

// _ TIMERS ───────────────────────────────────────────────────────────────────────────────────────╮
// #region

setInterval(async () => { // batching
	if (batch.length > 0) {
		console.log("[SEQ][BATCH] processing batch of size:", batch.length);
		await sendbatch();
	}
}, 10000);

setInterval(async () => { // heartbeat
	const timestamp = new Date().toISOString();
	console.log(`[SEQ] HEARTBEAT ${timestamp}`);
}, 10000);

// #endregion
// ────────────────────────────────────────────────────────────────────────────────────────────────
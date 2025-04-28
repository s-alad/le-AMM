# Sequencer Service

This service acts as a sequencer for a decentralized exchange. It receives encrypted swap requests, decrypts them using the sequencer's private key, and executes the swaps on behalf of users.

## Features

- Express server to receive encrypted requests
- Decryption of swap requests using the sequencer's private key
- Execution of swap transactions on an Ethereum blockchain
- Secure handling of user swap requests

## Setup

1. Install dependencies:
```
npm install
```

2. Create a `.env` file based on the example structure below:
```
# Server configuration
PORT=3000

# Ethereum configuration
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
CHAIN_ID=11155111

# Sequencer key for decryption and wallet
SEQUENCER_PRIVATE_KEY=your_private_key_here

# Contract address
SWAP_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
```

3. Build the project:
```
npm run build
```

4. Start the server:
```
npm start
```

For development, you can use:
```
npm run dev
```

## API Endpoints

### POST /api/swap

Receives encrypted swap requests.

Request body:
```json
{
  "iv": "initialization vector used for encryption",
  "encryptedData": "encrypted swap request data"
}
```

The encrypted data, when decrypted, should be a JSON string with the following structure:
```json
{
  "fromToken": "0x...",
  "toToken": "0x...",
  "amount": "1000000000000000000",
  "minAmountOut": "900000000000000000",
  "userAddress": "0x...",
  "deadline": 1677777777,
  "nonce": "unique identifier"
}
```

### GET /health

Health check endpoint to verify the server is running.

## Security Considerations

- The sequencer's private key is used for both decryption and signing transactions. Ensure it is kept secure.
- Only the sequencer should have permission to call the swap function on the contract.
- Nonces are used to prevent replay attacks.
- Request deadlines prevent old requests from being processed. 
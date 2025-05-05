import { ethers } from 'ethers';
import { TOKEN_ADDRESSES } from './tokens';

// Simple ERC20 ABI with mint function
const TEST_TOKEN_ABI = [
  "function mint(address to, uint256 amount) returns (bool)",
  "function mintFor(address to, uint256 amount) returns (bool)", // Some tokens use this pattern
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

export async function mintTestTokens(amount = "1000") {
  try {
    // Connect to provider (MetaMask)
    if (!window.ethereum) {
      throw new Error("MetaMask not installed");
    }
    
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const account = await signer.getAddress();
    
    console.log(`Connected to wallet: ${account}`);
    console.log(`Minting ${amount} tokens of each type...`);
    
    // Define tokens to mint
    const tokens = [
      { address: TOKEN_ADDRESSES.TromerToken, symbol: 'TromerToken' },
      { address: TOKEN_ADDRESSES.LeToken, symbol: 'LeToken' },
      { address: TOKEN_ADDRESSES.SimpleToken, symbol: 'SimpleToken' }
    ];
    
    // Mint each token
    for (const token of tokens) {
      try {
        const tokenContract = new ethers.Contract(token.address, TEST_TOKEN_ABI, signer);
        const decimals = await tokenContract.decimals();
        const amountToMint = ethers.parseUnits(amount, decimals);
        
        console.log(`Attempting to mint ${amount} ${token.symbol}...`);
        
        // Try different mint function signatures - some tokens use different patterns
        try {
          const tx = await tokenContract.mint(account, amountToMint);
          await tx.wait();
          console.log(`Successfully minted ${amount} ${token.symbol} to ${account}`);
        } catch (mintError) {
          // Try alternative mint function
          try {
            const tx = await tokenContract.mintFor(account, amountToMint);
            await tx.wait();
            console.log(`Successfully minted ${amount} ${token.symbol} to ${account} using mintFor`);
          } catch (mintForError) {
            throw new Error(`Both mint functions failed: ${mintError.message}`);
          }
        }
      } catch (error) {
        console.error(`Failed to mint ${token.symbol}: ${error.message}`);
      }
    }
    
    return { success: true, message: "Tokens minted successfully!" };
  } catch (error) {
    console.error("Error minting tokens:", error);
    return { success: false, message: error.message };
  }
}
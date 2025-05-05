import React, { useState } from 'react';
import { mintTestTokens } from './mintTestTokens';

const MintButton = ({ onMintComplete }) => {
  const [isMinting, setIsMinting] = useState(false);
  const [mintAmount, setMintAmount] = useState("1000");
  const [showMintInput, setShowMintInput] = useState(false);
  const [message, setMessage] = useState(null);
  
  const handleMint = async () => {
    setIsMinting(true);
    setMessage("Minting tokens...");
    
    try {
      const result = await mintTestTokens(mintAmount);
      setMessage(result.message);
      if (result.success && onMintComplete) {
        onMintComplete();
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setIsMinting(false);
    }
  };
  
  return (
    <div className="mint-container">
      {showMintInput ? (
        <div className="mint-input-group">
          <input
            type="text"
            className="mint-amount-input"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            placeholder="Amount to mint"
          />
          <button 
            className="btn-outline mint-btn"
            onClick={handleMint}
            disabled={isMinting}
          >
            {isMinting ? "Minting..." : "Mint Tokens"}
          </button>
          <button 
            className="btn-text" 
            onClick={() => setShowMintInput(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button 
          className="btn-outline mint-btn"
          onClick={() => setShowMintInput(true)}
        >
          Mint Test Tokens
        </button>
      )}
      
      {message && <div className="mint-message">{message}</div>}
    </div>
  );
};

export default MintButton;
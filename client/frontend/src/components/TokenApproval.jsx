import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import TokenABI from '../abi/Token.json';  // Import the full ABI

// Simple ERC20 ABI with just the functions we need
const ERC20_ABI = [
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)"
];

export function TokenApproval({ tokenAddress, spenderAddress, amountNeeded, onApprovalComplete }) {
  const [approvalStatus, setApprovalStatus] = useState('checking'); // checking, needed, pending, complete, error
  
  // Check if approval is needed
  async function checkApproval() {
    if (!window.ethereum || !tokenAddress || !spenderAddress) return;
    
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();
      
      const tokenContract = new ethers.Contract(tokenAddress, TokenABI, provider);
      const allowance = await tokenContract.allowance(userAddress, spenderAddress);
      
      if (allowance.lt(amountNeeded)) {
        setApprovalStatus('needed');
      } else {
        setApprovalStatus('complete');
        onApprovalComplete();
      }
    } catch (error) {
      console.error("Error checking token approval:", error);
      setApprovalStatus('error');
    }
  }
  
  // Request approval
  async function requestApproval() {
    if (!window.ethereum || !tokenAddress || !spenderAddress) return;
    
    setApprovalStatus('pending');
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      
      const tokenContract = new ethers.Contract(tokenAddress, TokenABI, signer);
      
      // Approve a very large amount (effectively unlimited)
      const tx = await tokenContract.approve(
        spenderAddress, 
        ethers.constants.MaxUint256
      );
      
      await tx.wait();
      setApprovalStatus('complete');
      onApprovalComplete();
    } catch (error) {
      console.error("Error approving token:", error);
      setApprovalStatus('error');
    }
  }
  
  useEffect(() => {
    checkApproval();
  }, [tokenAddress, spenderAddress, amountNeeded]);
  
  // Render different UI based on approval status
  if (approvalStatus === 'checking') {
    return <div className="approval-status">Checking approval...</div>;
  }
  
  if (approvalStatus === 'needed') {
    return (
      <div className="approval-needed">
        <p>Token approval required before swapping</p>
        <button className="btn-primary" onClick={requestApproval}>Approve Token</button>
      </div>
    );
  }
  
  if (approvalStatus === 'pending') {
    return <div className="approval-pending">Approval in progress... Please confirm in your wallet</div>;
  }
  
  if (approvalStatus === 'error') {
    return (
      <div className="approval-error">
        <p>Error checking/setting approval</p>
        <button className="btn-primary" onClick={checkApproval}>Retry</button>
      </div>
    );
  }
  
  return null; // Approval complete, don't render anything
}
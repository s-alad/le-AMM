import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import TokenABI from '../abi/Token.json';  // Import the full ABI
import { provider } from '../ammClient';

const MINIMAL_ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

export function TokenApproval({ tokenAddress, spenderAddress, amountNeeded, onApprovalComplete }) {
  const [approvalStatus, setApprovalStatus] = useState('checking'); // checking, needed, pending, complete, error
  
  // Check if approval is needed
  async function checkApproval() {
    if (!window.ethereum || !tokenAddress || !spenderAddress || !provider) return;
    
    try {
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      
      const tokenContract = new ethers.Contract(tokenAddress, MINIMAL_ERC20_ABI, provider);
      const allowance = await tokenContract.allowance(userAddress, spenderAddress);
      
      if (allowance < amountNeeded) {
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
    if (!window.ethereum || !tokenAddress || !spenderAddress || !provider) return;
    
    setApprovalStatus('pending');
    try {
      const signer = await provider.getSigner();
      const tokenContract = new ethers.Contract(tokenAddress, MINIMAL_ERC20_ABI, signer);
      
      // Use ethers v6 syntax which doesn't need overrides object
      const tx = await tokenContract.approve(
        spenderAddress,
        ethers.MaxUint256 // Approve unlimited amount
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
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { getAmmContract } from './ammClient';
import DepositForm from './DepositForm';
import WithdrawForm from './WithdrawForm';

export default function App() {
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState('');
  const [status, setStatus] = useState('🛑 Wallet not connected');

  const connectWallet = async () => {
    if (!window.ethereum) {
      setStatus('🔴 Please install MetaMask');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
      setStatus('🟢 Wallet connected: ' + accounts[0]);
      fetchBalance(accounts[0]);
    } catch (err) {
      setStatus('🔴 Wallet connection failed: ' + (err.message || err));
    }
  };

  const fetchBalance = async (address) => {
    try {
      const contract = await getAmmContract();
      const balanceWei = await contract.ethBalances(address);
      const balanceEth = ethers.formatEther(balanceWei);
      setBalance(balanceEth);
    } catch (err) {
      setStatus('🔴 Failed to fetch balance: ' + (err.message || err));
    }
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 20 }}>
      <h1>Andrews DApp (Sepolia)</h1>

      <section style={{ marginBottom: 20 }}>
        <button onClick={connectWallet} style={{ padding: '8px 16px', marginBottom: 20 }}>
          Connect Wallet
        </button>
        <p>{status}</p>

        {account && (
          <>
            <h2>Your ETH Balance in AMM Contract:</h2>
            <p>{balance ? `${balance} ETH` : 'Fetching...'}</p>
          </>
        )}
      </section>

      <section style={{ marginBottom: 40 }}>
        <DepositForm />
      </section>

      <hr />

      <section style={{ marginTop: 40 }}>
        <WithdrawForm />
      </section>
    </main>
  );
}

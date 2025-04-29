import { useEffect, useState } from 'react';
import { ethers }               from 'ethers';
import { getAmmContract, provider } from './ammClient';
import AnimatedBackground       from './AnimatedBackground';
import './App.css';

export default function App() {
  const networks = [
    { name: 'Sepolia Testnet', chainId: '0xaa36a7' },
  ];
  const assets = ['SepoliaETH'];

  // UI state
  const [account,       setAccount]       = useState(null);
  const [status,        setStatus]        = useState('Wallet not connected');
  const [fromNet,       setFromNet]       = useState(networks[0]);
  const [toNet,         setToNet]         = useState(networks[0]);
  const [fromAsset,     setFromAsset]     = useState(assets[0]);
  const [toAsset,       setToAsset]       = useState(assets[0]);
  const [amount,        setAmount]        = useState('');
  const [walletBalance, setWalletBalance] = useState('0.0');
  const [showModal,     setShowModal]     = useState(false);
  const [closing,       setClosing]       = useState(false);


  // Connect MetaMask
  const connectMetaMask = async () => {
    if (!window.ethereum) {
      setStatus('🔴 Please install MetaMask');
      return;
    }
    try {
      const [acct] = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      setAccount(acct);
      setStatus('🟢 Connected');
      setShowModal(false);
    } catch (e) {
      setStatus('🔴 Connection failed');
    }
  };

  // Show wallet choice
  const handleConnectClick = () => {
    if (!account) {
      setShowModal(true);
      setClosing(false);

    }
  };

  const closeModal = () => {
    setClosing(true);
    setTimeout(() => {
      setShowModal(false);
    }, 400); // matches CSS animation duration
  };


  // Swap direction
  const swapDirection = () => {
    setFromNet(prev => {
      setToNet(prev);
      return toNet;
    });
    setFromAsset(prev => {
      setToAsset(prev);
      return toAsset;
    });
  };

  // Perform the “swap”
  const handleSwap = async () => {
    if (!account) {
      handleConnectClick();
      return;
    }
    setStatus('⏳ Swapping…');
    try {
      const ctr = await getAmmContract();
      await ctr.depositETH({ value: ethers.parseEther(amount || '0') });
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: toNet.chainId }],
      });
      await ctr.withdrawETH(ethers.parseEther(amount || '0'));
      setStatus('✅ Swap complete!');
    } catch (e) {
      console.error(e);
      setStatus('❌ Swap failed');
    }
  };

  // Fetch balance after connecting
  useEffect(() => {
    if (!account) return;
    (async () => {
      try {
        const bal = await provider.getBalance(account);
        setWalletBalance(ethers.formatEther(bal));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [account]);

  return (
    <div className="app-wrapper">
      <AnimatedBackground />

      <header className="swap-logo">
        <img
          src="/public/leamm.png"
          alt="LeAMM Swap"
          style={{ height: 64, borderRadius: '50%' }}
        />
      </header>

      <div className="card swap-card">
        {/* ─── From / To panel ─── */}
        <div className="swap-panel">
          {/* FROM */}
          <div className="swap-section">
            <span className="swap-label">From</span>
            <div className="swap-row">
              <div className="select-wrapper">
                <select
                  className="select asset-selector"
                  value={fromNet.name}
                  onChange={e =>
                    setFromNet(
                      networks.find(n => n.name === e.target.value)
                    )
                  }
                >
                  {networks.map(n => (
                    <option key={n.name}>{n.name}</option>
                  ))}
                </select>
              </div>
              <div className="select-wrapper">
                <select
                  className="select asset-selector"
                  value={fromAsset}
                  onChange={e => setFromAsset(e.target.value)}
                >
                  {assets.map(a => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* TOGGLE */}
          <button
            className="btn-outline swap-toggle"
            onClick={swapDirection}
          >
            ⇅
          </button>

          {/* TO */}
          <div className="swap-section">
            <span className="swap-label">To</span>
            <div className="swap-row">
              <div className="select-wrapper">
                <select
                  className="select asset-selector"
                  value={toNet.name}
                  onChange={e =>
                    setToNet(
                      networks.find(n => n.name === e.target.value)
                    )
                  }
                >
                  {networks.map(n => (
                    <option key={n.name}>{n.name}</option>
                  ))}
                </select>
              </div>
              <div className="select-wrapper">
                <select
                  className="select asset-selector"
                  value={toAsset}
                  onChange={e => setToAsset(e.target.value)}
                >
                  {assets.map(a => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Amount panel ─── */}
        <div className="amount-panel">
          <span className="swap-label">Amount</span>
          <div className="amount-controls swap-row">
            <input
              className="input amount-input"
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
            <button
              className="btn-minmax"
              onClick={() => setAmount(walletBalance)}
              disabled={!account}
              title={`Your balance: ${walletBalance} ETH`}
            >
              MAX
            </button>
          </div>
        </div>

        {/* ─── Action ─── */}
        <button
          className="btn-primary"
          onClick={handleSwap}
        >
          {account ? 'Swap Now' : 'Connect Wallet'}
        </button>
        <p className="status-text">{status}</p>

        {/* Inline modal */}
        {showModal && (
          <div className={`card-modal ${closing ? 'closing' : ''}`}>
            <button className="modal-close" onClick={closeModal}>
              ×
            </button>
            <h2>Connect a Wallet</h2>
            <button className="btn-outline" onClick={connectMetaMask}>
              MetaMask
            </button>
            <button
              className="btn-outline"
              onClick={() => {
                alert('Other wallets not implemented yet');
                closeModal();
              }}
            >
              Other Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

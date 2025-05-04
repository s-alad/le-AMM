import { useEffect, useState } from 'react';
import { ethers }               from 'ethers';
import { getAmmContract, provider } from './ammClient';
import AnimatedBackground       from './AnimatedBackground';
import { TokenApproval }        from './components/TokenApproval';
import { TOKEN_ADDRESSES } from './components/tokens';
import './App.css';



export default function App() {
  const networks = [
    { name: 'Sepolia Testnet', chainId: '0xaa36a7' },
  ];
  const assets = [
    'SepoliaETH', 
    'TromerToken', 
    'LeToken', 
    'SimpleToken'
  ];

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
  const [isApproved,    setIsApproved]    = useState(false);
  const [ammContractAddress, setAmmContractAddress] = useState('');
  const [tokenBalances, setTokenBalances] = useState({});


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
    }, 400); 
  };


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

  const handleSwap = async () => {
    if (!account) {
      handleConnectClick();
      return;
    }
    
    const isFromToken = fromAsset !== 'SepoliaETH';
    const isToToken = toAsset !== 'SepoliaETH';
    
    if (isFromToken && !isApproved) {
      return;
    }
    
    setStatus('⏳ Swapping…');
    try {
      const ctr = await getAmmContract();
      
      if (!isFromToken && !isToToken) {
        await ctr.depositETH({ value: ethers.parseEther(amount || '0') });
        await ctr.withdrawETH(ethers.parseEther(amount || '0'));
      } 
      else if (!isFromToken && isToToken) {
        await ctr.depositETH({ value: ethers.parseEther(amount || '0') });
        const tokenAddress = getTokenAddressFromSymbol(toAsset);
        await ctr.swapExactETHForTokens(
          ethers.parseEther(amount || '0'),
          tokenAddress,
          0,
          { gasLimit: 300000 }
        );
      }
      else if (isFromToken && !isToToken) {
        const tokenAddress = getTokenAddressFromSymbol(fromAsset);
        await ctr.swapExactTokensForETH(
          tokenAddress,
          ethers.parseEther(amount || '0'),
          0,
          { gasLimit: 300000 }
        );
      }
      else {
        const fromTokenAddress = getTokenAddressFromSymbol(fromAsset);
        const toTokenAddress = getTokenAddressFromSymbol(toAsset);
        await ctr.swapExactTokensForTokens(
          fromTokenAddress,
          toTokenAddress,
          ethers.parseEther(amount || '0'),
          0,
          { gasLimit: 300000 }
        );
      }
      
      setStatus('✅ Swap complete!');
      
      setIsApproved(false);
      
      fetchBalances();
    } catch (e) {
      console.error(e);
      setStatus(`❌ Swap failed: ${e.message}`);
      setIsApproved(false);
    }
  };

  const fetchBalances = async () => {
    if (!account) return;
    
    try {
      const ethBalance = await provider.getBalance(account);
      setWalletBalance(ethers.formatEther(ethBalance));
      
      const balances = { 'SepoliaETH': ethers.formatEther(ethBalance) };
      
      for (const asset of assets) {
        if (asset !== 'SepoliaETH') {
          const tokenAddress = getTokenAddressFromSymbol(asset);
          const tokenContract = new ethers.Contract(
            tokenAddress,
            ["function balanceOf(address) view returns (uint256)"],
            provider
          );
          
          try {
            const balance = await tokenContract.balanceOf(account);
            balances[asset] = ethers.formatEther(balance);
          } catch (e) {
            console.error(`Error fetching balance for ${asset}:`, e);
            balances[asset] = '0.0';
          }
        }
      }
      
      setTokenBalances(balances);
    } catch (e) {
      console.error("Error fetching balances:", e);
    }
  };

  useEffect(() => {
    if (account) {
      fetchBalances();
    }
  }, [account]);

  const getAssetBalance = (asset) => {
    return tokenBalances[asset] || '0.0';
  };

  useEffect(() => {
    async function getAmmAddress() {
      try {
        const contract = await getAmmContract();
        const address = await contract.getAddress();
        setAmmContractAddress(address);
      } catch (e) {
        console.error("Failed to get AMM contract address:", e);
      }
    }
    
    getAmmAddress();
  }, []);

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
                  onChange={e => {
                    setFromAsset(e.target.value);
                    setIsApproved(false);
                  }}
                >
                  {assets.map(a => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="balance-display">
              Balance: {getAssetBalance(fromAsset)} {fromAsset}
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
            <div className="balance-display">
              Balance: {getAssetBalance(toAsset)} {toAsset}
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
              onClick={() => setAmount(getAssetBalance(fromAsset))}
              disabled={!account}
              title={`Your balance: ${getAssetBalance(fromAsset)} ${fromAsset}`}
            >
              MAX
            </button>
          </div>
        </div>

        {/* Add TokenApproval component before the swap button */}
        {account && fromAsset !== 'SepoliaETH' && amount && !isApproved && (
          <TokenApproval 
            tokenAddress={getTokenAddressFromSymbol(fromAsset)}
            spenderAddress={ammContractAddress}
            amountNeeded={ethers.parseEther(amount || '0')}
            onApprovalComplete={() => setIsApproved(true)}
          />
        )}

        {/* ─── Action ─── */}
        <button
          className="btn-primary"
          onClick={handleSwap}
          disabled={(fromAsset !== 'SepoliaETH' && !isApproved && amount > 0) || amount <= 0}
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

// Helper function to convert token symbols to addresses
function getTokenAddressFromSymbol(symbol) {
  return TOKEN_ADDRESSES[symbol] || ethers.constants.AddressZero;
}

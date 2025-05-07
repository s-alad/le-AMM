import { useEffect, useState } from 'react';
import { ethers }               from 'ethers';
import { getAmmContract, provider } from './ammClient';
import AnimatedBackground       from './AnimatedBackground';
import { TokenApproval }        from './components/TokenApproval';
import { TOKEN_ADDRESSES } from './components/tokens';
import MintButton from './components/MintButton';
import './App.css';

const TEEAMM_ADDRESS = '0x0D5EbFb1880BD60D6aFae0034bb49f48B0E91E77';


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
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('0');
  const [isCalculating, setIsCalculating] = useState(false);
  const [priceImpact, setPriceImpact] = useState('0');
  const [reserves, setReserves] = useState({ reserve0: '0', reserve1: '0' });
  const [swapping, setSwapping] = useState(false);
  const [fromAmountInput, setFromAmountInput] = useState('');
  const [toAmountInput, setToAmountInput] = useState('');
  const [activeInput, setActiveInput] = useState('from');
  const [slippageTolerance, setSlippageTolerance] = useState(0.5); // Default 0.5%
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const [customSlippage, setCustomSlippage] = useState('');


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
    const tempFromAsset = fromAsset;
    setFromAsset(toAsset);
    setToAsset(tempFromAsset);
    
    const tempFromAmount = fromAmountInput;
    setFromAmountInput(toAmountInput);
    setToAmountInput(tempFromAmount);
    
    if (activeInput === 'from') {
      setAmount(toAmountInput);
    } else {
      setAmount(fromAmountInput);
    }
  };

  const calculateMinimumOut = (expectedAmount) => {
    if (!expectedAmount || expectedAmount === '0') return '0';
    const amount = parseFloat(expectedAmount);
    return (amount * (100 - slippageTolerance) / 100).toFixed(6);
  };

  const SlippageSettings = () => {
    const handleCustomSlippageChange = (e) => {
      const value = e.target.value;
      if (value === '' || (/^\d*\.?\d*$/.test(value) && parseFloat(value) <= 100)) {
        setCustomSlippage(value);
      }
    };

    const applyCustomSlippage = () => {
      if (customSlippage && parseFloat(customSlippage) > 0) {
        setSlippageTolerance(parseFloat(customSlippage));
      }
      setShowSlippageSettings(false);
    };

    const selectSlippage = (value) => {
      setSlippageTolerance(value);
      setCustomSlippage('');
    };

    return (
      <div className="slippage-settings">
        <div className="slippage-header">
          <h4>Slippage Tolerance</h4>
          <button className="close-btn" onClick={() => setShowSlippageSettings(false)}>×</button>
        </div>
        <div className="slippage-options">
          <button 
            className={slippageTolerance === 0.1 ? "selected" : ""} 
            onClick={() => selectSlippage(0.1)}
          >
            0.1%
          </button>
          <button 
            className={slippageTolerance === 0.5 ? "selected" : ""} 
            onClick={() => selectSlippage(0.5)}
          >
            0.5%
          </button>
          <button 
            className={slippageTolerance === 1.0 ? "selected" : ""} 
            onClick={() => selectSlippage(1.0)}
          >
            1.0%
          </button>
          <div className="custom-slippage">
            <input
              type="text"
              placeholder="Custom"
              value={customSlippage}
              onChange={handleCustomSlippageChange}
            />
            <span className="percentage">%</span>
            <button onClick={applyCustomSlippage}>Apply</button>
          </div>
        </div>
        <div className="slippage-info">
          Your transaction will revert if the price changes unfavorably by more than this percentage.
        </div>
      </div>
    );
  };

  const SwapSettings = () => {
    return (
      <div className="swap-settings">
        <button 
          className="settings-btn" 
          onClick={() => setShowSlippageSettings(!showSlippageSettings)}
          title="Adjust Slippage Tolerance"
        >
          <span className="settings-icon">⚙️</span>
          <span className="settings-text">Change Slippage</span>
        </button>
        {showSlippageSettings && <SlippageSettings />}
      </div>
    );
  };

  const handleSwap = async () => {
    if (!account) {
      setShowModal(true);
      setClosing(false);
      return;
    }
    
    try {
      setSwapping(true);
      setStatus('Swapping...');
      
      const fromTokenAddress = getTokenAddressFromSymbol(fromAsset);
      const toTokenAddress = getTokenAddressFromSymbol(toAsset);
      
      // Calculate minimum output based on slippage tolerance
      const minOutputAmount = calculateMinimumOut(toAmountInput);
      const minOutputAmountWei = ethers.parseEther(minOutputAmount);
      
      console.log(`Expected output: ${toAmountInput} ${toAsset}`);
      console.log(`Minimum output (${slippageTolerance}% slippage): ${minOutputAmount} ${toAsset}`);
      
      const ammContract = await getAmmContract();
      const amountWei = ethers.parseEther(amount); // Use 'amount' instead of 'fromAmount'
      
      // Approve if needed (for non-ETH tokens)
      if (fromAsset !== 'SepoliaETH') {
        const tokenContract = new ethers.Contract(
          fromTokenAddress,
          MINIMAL_ERC20_ABI,
          await provider.getSigner()
        );
        
        const currentAllowance = await tokenContract.allowance(account, TEEAMM_ADDRESS);
        if (currentAllowance < amountWei) {
          const tx = await tokenContract.approve(TEEAMM_ADDRESS, ethers.MaxUint256);
          await tx.wait();
        }
      }
      
      // Deposit funds
      if (fromAsset === 'SepoliaETH') {
        const tx = await ammContract.depositETH({ value: amountWei });
        await tx.wait();
      } else {
        const tx = await ammContract.deposit(fromTokenAddress, amountWei);
        await tx.wait();
      }
      
      // Execute swap
      // Note: In a production app, this would be called by the sequencer
      // For demonstration, you might need a different approach
      
      // After swap
      setStatus('Swap completed!');
      setAmount('');
      setOutputAmount('0');
      fetchBalances();
      
    } catch (error) {
      console.error('Swap error:', error);
      setStatus('Swap failed: ' + error.message);
    } finally {
      setSwapping(false);
    }
  };

  // Minimal ERC20 ABI - just the functions we need
  const MINIMAL_ERC20_ABI = [
    // Read-only functions
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function allowance(address owner, address spender) view returns (uint256)",
    
    // Write functions
    "function transfer(address to, uint amount) returns (bool)",
    "function approve(address spender, uint amount) returns (bool)"
  ];

  const fetchBalances = async () => {
    if (!account) return;
    
    try {
      // Get ETH balance
      const ethBalance = await provider.getBalance(account);
      const formattedEthBalance = ethers.formatEther(ethBalance);
      
      const balances = { 'SepoliaETH': formattedEthBalance };
      setWalletBalance(formattedEthBalance);
      
      // Get token balances
      for (const asset of assets) {
        if (asset !== 'SepoliaETH') {
          try {
            const tokenAddress = getTokenAddressFromSymbol(asset);
            console.log(`Fetching balance for ${asset} at address ${tokenAddress}`);
            
            if (!tokenAddress || tokenAddress === 'native' || tokenAddress === ethers.ZeroAddress) {
              console.warn(`Invalid address for ${asset}: ${tokenAddress}`);
              balances[asset] = '0.0';
              continue;
            }
            
            // Use minimal ABI for all tokens
            const tokenContract = new ethers.Contract(
              tokenAddress,
              MINIMAL_ERC20_ABI,
              provider
            );
            
            // Get balance and decimals - with more robust error handling
            let decimals = 18; // Default to 18 if we can't get decimals
            try {
              decimals = await tokenContract.decimals();
              console.log(`${asset} decimals: ${decimals}`);
            } catch (error) {
              console.warn(`Could not get decimals for ${asset}, using default of 18`);
            }
            
            const balance = await tokenContract.balanceOf(account);
            console.log(`${asset} raw balance: ${balance.toString()}`);
            
            // Format the balance with proper decimals
            balances[asset] = ethers.formatUnits(balance, decimals);
            console.log(`${asset} formatted balance: ${balances[asset]}`);
          } catch (e) {
            console.error(`Error fetching balance for ${asset}:`, e);
            balances[asset] = '0.0';
          }
        }
      }
      
      setTokenBalances(balances);
      console.log("All balances loaded:", balances);
    } catch (e) {
      console.error("Error in fetchBalances:", e);
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

  const calculateToAmount = async (fromToken, toToken, fromAmount) => {
    if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) === 0) {
      setToAmountInput('');
      return;
    }

    setIsCalculating(true);
    
    try {
      // Get token addresses
      const fromTokenAddress = getTokenAddressFromSymbol(fromToken);
      const toTokenAddress = getTokenAddressFromSymbol(toToken);
      
      if (fromTokenAddress === toTokenAddress) {
        setToAmountInput(fromAmount);
        setIsCalculating(false);
        return;
      }

      // Get the AMM contract
      const ammContract = await getAmmContract();
      
      // Use the contract's quote function if available
      try {
        // Parse input amount to wei
        const amountIn = ethers.parseEther(fromAmount);
        
        // Try to use the contract's quote function directly
        const amountOut = await ammContract.quote(fromTokenAddress, toTokenAddress, amountIn);
        const expectedOut = ethers.formatEther(amountOut);
        
        console.log(`Expected output from contract: ${expectedOut} ${toToken}`);
        setToAmountInput(expectedOut);
      } catch (quoteError) {
        console.warn("Quote function failed, falling back to manual calculation:", quoteError);
        
        // Get current reserves
        const [reserve0, reserve1] = await ammContract.getReserves(fromTokenAddress, toTokenAddress);
        
        // Check if pool exists
        if (reserve0.toString() === '0' || reserve1.toString() === '0') {
          console.log('Pool doesn\'t exist or has no liquidity');
          setToAmountInput('');
          setIsCalculating(false);
          return;
        }
        
        // Determine direction (token0/token1)
        const orderedAddresses = fromTokenAddress.toLowerCase() < toTokenAddress.toLowerCase() 
          ? [fromTokenAddress, toTokenAddress] 
          : [toTokenAddress, fromTokenAddress];
        
        const isInputToken0 = fromTokenAddress.toLowerCase() === orderedAddresses[0].toLowerCase();
        
        // Get input/output reserves based on direction
        const inReserve = isInputToken0 ? reserve0 : reserve1;
        const outReserve = isInputToken0 ? reserve1 : reserve0;
        
        // Parse input amount to wei
        const amountIn = ethers.parseEther(fromAmount);

        // Calculate fee
        const feeBP = 30; // 0.3% - this should ideally be fetched from the contract
        const protocolFeeBP = 10; // 0.1% - this should ideally be fetched from the contract
        
        // Adjust input for protocol fee
        const inputAfterProtocolFee = amountIn - (amountIn * BigInt(protocolFeeBP) / BigInt(10000));
        
        // Calculate fee-adjusted amount
        const feeAdjustedInput = inputAfterProtocolFee * BigInt(10000 - feeBP) / BigInt(10000);
        
        // Calculate output using constant product formula: x * y = k
        // (y * dx) / (x + dx)
        const numerator = outReserve * feeAdjustedInput;
        const denominator = inReserve + feeAdjustedInput;
        const expectedOut = numerator / denominator;
        
        console.log(`Expected output (manual calc): ${ethers.formatEther(expectedOut)} ${toToken}`);
        setToAmountInput(ethers.formatEther(expectedOut));
      }
    } catch (error) {
      console.error('Error calculating output amount:', error);
      setToAmountInput('');
    } finally {
      setIsCalculating(false);
    }
  };

  const calculateFromAmount = async (fromToken, toToken, toAmount) => {
    if (!fromToken || !toToken || !toAmount || parseFloat(toAmount) === 0) {
      setFromAmountInput('');
      return;
    }

    setIsCalculating(true);
    
    try {
      // Get token addresses
      const fromTokenAddress = getTokenAddressFromSymbol(fromToken);
      const toTokenAddress = getTokenAddressFromSymbol(toToken);
      
      if (fromTokenAddress === toTokenAddress) {
        setFromAmountInput(toAmount);
        setIsCalculating(false);
        return;
      }

      // Get the AMM contract
      const ammContract = await getAmmContract();
      
      // Use the contract's getAmountIn function if available
      try {
        // Parse desired output amount to wei
        const amountOut = ethers.parseEther(toAmount);
        
        // Try to use the contract's getAmountIn function directly (if it exists)
        const amountIn = await ammContract.getAmountIn(fromTokenAddress, toTokenAddress, amountOut);
        const requiredInput = ethers.formatEther(amountIn);
        
        console.log(`Required input from contract: ${requiredInput} ${fromToken}`);
        setFromAmountInput(requiredInput);
      } catch (quoteError) {
        console.warn("getAmountIn function failed, falling back to manual calculation:", quoteError);
        
        // Get current reserves
        const [reserve0, reserve1] = await ammContract.getReserves(fromTokenAddress, toTokenAddress);
        
        // Check if pool exists
        if (reserve0.toString() === '0' || reserve1.toString() === '0') {
          console.log('Pool doesn\'t exist or has no liquidity');
          setFromAmountInput('');
          setIsCalculating(false);
          return;
        }
        
        // Determine direction (token0/token1)
        const orderedAddresses = fromTokenAddress.toLowerCase() < toTokenAddress.toLowerCase() 
          ? [fromTokenAddress, toTokenAddress] 
          : [toTokenAddress, fromTokenAddress];
        
        const isInputToken0 = fromTokenAddress.toLowerCase() === orderedAddresses[0].toLowerCase();
        
        // Get input/output reserves based on direction
        const inReserve = isInputToken0 ? reserve0 : reserve1;
        const outReserve = isInputToken0 ? reserve1 : reserve0;
        
        // Parse desired output amount to wei
        const amountOut = ethers.parseEther(toAmount);
        
        // Account for fees
        const feeBP = 30; // 0.3%
        const protocolFeeBP = 10; // 0.1%
        
        // Make sure output amount isn't too large
        if (amountOut >= outReserve) {
          console.log('Requested output exceeds reserves');
          setFromAmountInput('');
          setIsCalculating(false);
          return;
        }
        
        // Calculate required input (without fees)
        const numerator = inReserve * amountOut;
        const denominator = outReserve - amountOut;
        let requiredInput = numerator / denominator;
        
        // Account for fees
        requiredInput = requiredInput * BigInt(10000) / BigInt(10000 - feeBP);
        requiredInput = requiredInput * BigInt(10000) / BigInt(10000 - protocolFeeBP);
        
        console.log(`Required input (manual calc): ${ethers.formatEther(requiredInput)} ${fromToken}`);
        setFromAmountInput(ethers.formatEther(requiredInput));
      }
    } catch (error) {
      console.error('Error calculating input amount:', error);
      setFromAmountInput('');
    } finally {
      setIsCalculating(false);
    }
  };

  // Simplified event handlers
  const handleFromAmountChange = (e) => {
    setActiveInput('from');
    const value = e.target.value;
    setFromAmountInput(value);
    setAmount(value);
    
    if (value && parseFloat(value) > 0) {
      calculateToAmount(fromAsset, toAsset, value);
    } else {
      setToAmountInput('');
    }
  };

  const handleToAmountChange = (e) => {
    setActiveInput('to');
    const value = e.target.value;
    setToAmountInput(value);
    
    if (value && parseFloat(value) > 0) {
      calculateFromAmount(fromAsset, toAsset, value);
    } else {
      setFromAmountInput('');
    }
  };

  // Update useEffects
  useEffect(() => {
    if (activeInput === 'from' && fromAmountInput && parseFloat(fromAmountInput) > 0) {
      calculateToAmount(fromAsset, toAsset, fromAmountInput);
    } else if (activeInput === 'to' && toAmountInput && parseFloat(toAmountInput) > 0) {
      calculateFromAmount(fromAsset, toAsset, toAmountInput);
    }
  }, [fromAsset, toAsset]);

  // Add this function to refresh token balances after minting
  const handleMintComplete = () => {
    fetchBalances();
  };

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
              <input
                className="input amount-input"
                type="number"
                placeholder="0.0"
                value={fromAmountInput}
                onChange={handleFromAmountChange}
              />
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
                  value={toAsset}
                  onChange={e => setToAsset(e.target.value)}
                >
                  {assets.map(a => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </div>
              <input
                className="input amount-input"
                type="number"
                placeholder="0.0"
                value={toAmountInput}
                onChange={handleToAmountChange}
              />
            </div>
            <div className="balance-display">
              Balance: {getAssetBalance(toAsset)} {toAsset}
            </div>
          </div>
        </div>

        {/* Add TokenApproval component before the swap button */}
        {account && fromAsset !== 'SepoliaETH' && fromAmountInput && !isApproved && (
          <TokenApproval 
            tokenAddress={getTokenAddressFromSymbol(fromAsset)}
            spenderAddress={ammContractAddress}
            amountNeeded={ethers.parseEther(fromAmountInput || '0')}
            onApprovalComplete={() => setIsApproved(true)}
          />
        )}

        {/* Add this above the swap button */}
        {parseFloat(toAmountInput) > 0 && (
          
          <div className="expected-min-output">
            <div className="swap-header">
              <SwapSettings />
            </div>
            <div>Expected output: {parseFloat(toAmountInput).toFixed(6)} {toAsset}</div>
            <div>Minimum received: {calculateMinimumOut(toAmountInput)} {toAsset}</div>
            {parseFloat(priceImpact) > 0 && (
              <div className="exchange-rate">
                1 {fromAsset} = {(parseFloat(toAmountInput) / parseFloat(fromAmountInput)).toLocaleString(undefined, {maximumFractionDigits: 6})} {toAsset}
              </div>
            )}
            <div className="slippage-indicator">Slippage tolerance: {slippageTolerance}%</div>
            
          </div>
        )}

        {/* ─── Action ─── */}
        <button
          className="btn-primary"
          onClick={handleSwap}
          disabled={(fromAsset !== 'SepoliaETH' && !isApproved && parseFloat(fromAmountInput) > 0) || parseFloat(fromAmountInput) <= 0}
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

        {/* MintButton at the bottom of the card */}
        <div className="mint-button-container">
          <MintButton onMintComplete={handleMintComplete} />
        </div>
      </div>
    </div>
  );
}
// Helper function to convert token symbols to addresses
function getTokenAddressFromSymbol(symbol) {
  return TOKEN_ADDRESSES[symbol] || ethers.constants.AddressZero;
}


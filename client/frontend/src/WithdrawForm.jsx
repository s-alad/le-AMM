import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { getAmmContract } from './ammClient'    // ← same helper import

export default function WithdrawForm() {
  const [contract, setContract] = useState(null)
  const [amount,   setAmount]   = useState('0.01')
  const [status,   setStatus]   = useState('')

  useEffect(() => {
    async function init() {
      if (!window.ethereum) {
        setStatus('🔴 Please install MetaMask')
        return
      }
      try {
        const ctr = await getAmmContract()
        setContract(ctr)
        setStatus('🟢 Contract ready')
      } catch (err) {
        setStatus('🔴 ' + (err.reason || err.message))
      }
    }
    init()
  }, [])

  const withdraw = async () => {
    if (!contract) {
      setStatus('🔴 Contract not ready')
      return
    }
    try {
      setStatus(`⏳ Withdrawing ${amount} ETH…`)
      const tx = await contract.withdrawETH(ethers.parseEther(amount))
      await tx.wait()
      setStatus('✅ Withdrawal confirmed!')
    } catch (err) {
      setStatus('❌ ' + (err.reason || err.message))
    }
  }
  
  return (
    <div style={{ padding: 20, maxWidth: 400, border: '1px solid #ddd' }}>
      <h2>Withdraw ETH</h2>
      <label>
        Amount:{' '}
        <input
          type="number"
          step="0.001"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{ width: 80, marginRight: 8 }}
        />
      </label>
      <button onClick={withdraw} disabled={!contract} style={{ padding: '4px 12px' }}>
        Withdraw
      </button>
      <p>{status}</p>
    </div>
  )
}

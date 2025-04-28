import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { getAmmContract } from './ammClient'    // ← adjust this path if you moved ammClient.js

export default function DepositForm() {
  const [contract, setContract] = useState(null)
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

  const deposit = async () => {
    if (!contract) {
      setStatus('🔴 Contract not ready')
      return
    }
    try {
      setStatus('⏳ Sending 0.01 ETH…')
      const tx = await contract.depositETH({
        value: ethers.parseEther('0.01')
      })
            await tx.wait()
      setStatus('✅ Deposit confirmed!')
    } catch (err) {
      setStatus('❌ ' + (err.reason || err.message))
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 400, border: '1px solid #ddd' }}>
      <h2>Deposit 0.01 ETH</h2>
      <button
        onClick={deposit}
        disabled={!contract}
        style={{ padding: 8, fontSize: 16 }}
      >
        Deposit
      </button>
      <p>{status}</p>
    </div>
  )
}

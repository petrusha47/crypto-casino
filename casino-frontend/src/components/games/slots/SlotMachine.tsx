'use client'
import { useState } from 'react'
import api from '@/lib/api'
import { SlotSpinResult } from '@/types'
import { useBalanceStore } from '@/store/balance'

const SYMBOLS = ['7️⃣', 'BAR', '🔔', '🍉', '🍇', '🍒', '🍋']

export default function SlotMachine() {
  const [betRub, setBetRub] = useState(100)
  const [clientSeed, setClientSeed] = useState(() => Math.random().toString(36).slice(2, 12))
  const [result, setResult] = useState<SlotSpinResult | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [error, setError] = useState('')
  const { fetch: fetchBalance } = useBalanceStore()

  const spin = async () => {
    if (spinning) return
    setSpinning(true)
    setError('')
    try {
      const res = await api.post<SlotSpinResult>('/api/games/slots/spin', { betRub, clientSeed })
      setResult(res.data)
      await fetchBalance()
      setClientSeed(Math.random().toString(36).slice(2, 12))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Ошибка')
    } finally {
      setSpinning(false)
    }
  }

  const emptyReels: number[][] = Array(5).fill([0, 0, 0])

  return (
    <div className="max-w-xl mx-auto">
      {/* Reels */}
      <div className="card mb-6">
        <div className="flex justify-center gap-2 mb-4">
          {(result?.reels ?? emptyReels).map((reel, ri) => (
            <div
              key={ri}
              className={`flex flex-col gap-1 bg-casino-bg border border-casino-border rounded-lg p-2 w-16 items-center ${spinning ? 'animate-pulse' : ''}`}
            >
              {(reel as number[]).map((sym, si) => (
                <div
                  key={si}
                  className={`text-2xl h-10 w-10 flex items-center justify-center rounded
                    ${si === 1 ? 'bg-casino-border scale-110 border border-casino-purple' : ''}`}
                >
                  {SYMBOLS[sym]}
                </div>
              ))}
            </div>
          ))}
        </div>

        {result && (
          <div className="text-center">
            {result.winRub > 0 ? (
              <div>
                <p className="neon-text-cyan text-2xl font-bold">
                  +{result.winRub.toLocaleString('ru-RU')} ₽
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {result.lines.length} выигрышных линий
                </p>
              </div>
            ) : (
              <p className="text-gray-500">Нет выигрыша</p>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="card space-y-4">
        <div className="flex gap-2 flex-wrap">
          {[50, 100, 200, 500, 1000].map((v) => (
            <button
              key={v}
              onClick={() => setBetRub(v)}
              className={`px-3 py-1.5 rounded border text-sm font-medium transition-all ${
                betRub === v
                  ? 'border-casino-cyan text-casino-cyan bg-casino-cyan/10'
                  : 'border-casino-border text-gray-400 hover:border-casino-purple'
              }`}
            >
              {v} ₽
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Client Seed</label>
          <input value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} className="input-field text-sm" />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button onClick={spin} disabled={spinning} className="btn-primary w-full py-3 text-lg">
          {spinning ? '⏳ Крутим...' : '🎰 Крутить'}
        </button>
      </div>

      {result && (
        <div className="card mt-4 text-xs text-gray-500 space-y-1">
          <p><span className="text-gray-400">Server seed hash:</span> {result.serverSeedHash}</p>
          <p><span className="text-gray-400">Server seed:</span> {result.serverSeed}</p>
          <p><span className="text-gray-400">Client seed:</span> {result.clientSeed}</p>
          <p><span className="text-gray-400">Nonce:</span> {result.nonce}</p>
        </div>
      )}
    </div>
  )
}

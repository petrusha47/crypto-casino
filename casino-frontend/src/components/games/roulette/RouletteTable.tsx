'use client'
import { useState } from 'react'
import api from '@/lib/api'
import { useBalanceStore } from '@/store/balance'
import { BetType, RouletteBet, RouletteResult } from '@/types'

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])

const OUTSIDE_BETS: Array<{ type: BetType; label: string; payout: string }> = [
  { type: 'red', label: '🔴 Красное', payout: '2x' },
  { type: 'black', label: '⚫ Чёрное', payout: '2x' },
  { type: 'even', label: 'Чёт', payout: '2x' },
  { type: 'odd', label: 'Нечет', payout: '2x' },
  { type: 'dozen1', label: '1–12', payout: '3x' },
  { type: 'dozen2', label: '13–24', payout: '3x' },
  { type: 'dozen3', label: '25–36', payout: '3x' },
  { type: 'column1', label: 'Колонка 1', payout: '3x' },
  { type: 'column2', label: 'Колонка 2', payout: '3x' },
  { type: 'column3', label: 'Колонка 3', payout: '3x' },
]

export default function RouletteTable() {
  const [chipValue, setChipValue] = useState(100)
  const [bets, setBets] = useState<RouletteBet[]>([])
  const [clientSeed] = useState(() => Math.random().toString(36).slice(2, 12))
  const [result, setResult] = useState<RouletteResult | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [error, setError] = useState('')
  const { fetch: fetchBalance } = useBalanceStore()

  const addBet = (type: BetType, number?: number) => {
    setBets((prev) => {
      const existing = prev.find((b) => b.type === type && b.number === number)
      if (existing) {
        return prev.map((b) =>
          b.type === type && b.number === number
            ? { ...b, amountRub: b.amountRub + chipValue }
            : b,
        )
      }
      return [...prev, { type, number, amountRub: chipValue }]
    })
  }

  const spin = async () => {
    if (bets.length === 0 || spinning) return
    setSpinning(true)
    setError('')
    try {
      const res = await api.post<RouletteResult>('/api/games/roulette/bet', { clientSeed, bets })
      setResult(res.data)
      await fetchBalance()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Ошибка')
    } finally {
      setSpinning(false)
    }
  }

  const totalBet = bets.reduce((s, b) => s + b.amountRub, 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {result && (
        <div className="card text-center">
          <div className="flex items-center justify-center gap-4">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold
                ${result.outcome === 0 ? 'bg-green-700' : RED_NUMBERS.has(result.outcome) ? 'bg-red-700' : 'bg-gray-800'}`}
            >
              {result.outcome}
            </div>
            <div>
              {result.winRub > 0 ? (
                <p className="neon-text-cyan text-2xl font-bold">+{result.winRub.toLocaleString('ru-RU')} ₽</p>
              ) : (
                <p className="text-gray-400 text-xl">Проигрыш</p>
              )}
              <p className="text-gray-500 text-sm">Ставка: {result.totalBet.toLocaleString('ru-RU')} ₽</p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <p className="text-gray-400 text-sm mb-3">Нажмите на число для ставки (straight bet)</p>
        <div className="grid gap-0.5 mb-3" style={{ gridTemplateColumns: 'repeat(13, 1fr)' }}>
          <button
            onClick={() => addBet('straight', 0)}
            className="bg-green-800 hover:bg-green-600 text-white text-xs rounded p-1 text-center"
          >
            0
          </button>
          {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => addBet('straight', n)}
              className={`text-white text-xs rounded p-1 text-center hover:opacity-80 transition-opacity
                ${RED_NUMBERS.has(n) ? 'bg-red-700' : 'bg-gray-800'}`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-5 gap-1 mt-2">
          {OUTSIDE_BETS.map(({ type, label, payout }) => (
            <button
              key={type}
              onClick={() => addBet(type)}
              className="border border-casino-border rounded p-2 text-xs text-gray-300 hover:border-casino-purple hover:text-white transition-colors text-center"
            >
              <div>{label}</div>
              <div className="text-casino-cyan">{payout}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex gap-2 flex-wrap">
          {[50, 100, 200, 500].map((v) => (
            <button
              key={v}
              onClick={() => setChipValue(v)}
              className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                chipValue === v
                  ? 'border-casino-cyan text-casino-cyan bg-casino-cyan/10'
                  : 'border-casino-border text-gray-400'
              }`}
            >
              {v} ₽
            </button>
          ))}
        </div>

        {bets.length > 0 && (
          <div className="text-sm text-gray-400">
            Ставок: {bets.length} · Итого: <span className="text-white">{totalBet} ₽</span>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button onClick={() => setBets([])} className="btn-danger flex-1 py-2.5" disabled={spinning}>
            Очистить
          </button>
          <button onClick={spin} disabled={spinning || bets.length === 0} className="btn-primary flex-1 py-2.5">
            {spinning ? '⏳ Крутим...' : '🎡 Крутить'}
          </button>
        </div>
      </div>

      {result && (
        <div className="card text-xs text-gray-600 space-y-1">
          <p><span className="text-gray-400">Server hash:</span> {result.serverSeedHash}</p>
          <p><span className="text-gray-400">Server seed:</span> {result.serverSeed}</p>
        </div>
      )}
    </div>
  )
}

'use client'
import { useState } from 'react'
import api from '@/lib/api'
import { useBalanceStore } from '@/store/balance'
import { BlackjackStartResult, BlackjackActionResult } from '@/types'

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']
const SUITS = ['♠','♥','♦','♣']
const RED_SUIT_INDICES = new Set([1, 2])

function CardDisplay({ cardIdx }: { cardIdx: number }) {
  const rank = RANKS[cardIdx % 13]
  const suitIdx = Math.floor(cardIdx / 13)
  const suit = SUITS[suitIdx]
  const isRed = RED_SUIT_INDICES.has(suitIdx)
  return (
    <div className={`w-14 h-20 rounded-lg border-2 flex flex-col items-center justify-center font-bold text-lg
      bg-white shadow-lg ${isRed ? 'text-red-600 border-red-200' : 'text-gray-900 border-gray-200'}`}>
      <div className="text-sm leading-none">{rank}</div>
      <div className="text-xl">{suit}</div>
    </div>
  )
}

function handValue(cards: number[]): number {
  const FACE = [11,2,3,4,5,6,7,8,9,10,10,10,10]
  let total = cards.reduce((s, c) => s + FACE[c % 13], 0)
  let aces = cards.filter(c => c % 13 === 0).length
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

type GameStatus = 'idle' | 'playing' | 'done'

export default function BlackjackTable() {
  const [betRub, setBetRub] = useState(200)
  const [clientSeed] = useState(() => Math.random().toString(36).slice(2, 12))
  const [gameStatus, setGameStatus] = useState<GameStatus>('idle')
  const [playerHand, setPlayerHand] = useState<number[]>([])
  const [dealerHand, setDealerHand] = useState<number[]>([])
  const [dealerVisible, setDealerVisible] = useState<number | null>(null)
  const [winRubs, setWinRubs] = useState<number[]>([])
  const [serverInfo, setServerInfo] = useState<{ hash: string; seed?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { fetch: fetchBalance } = useBalanceStore()

  const startGame = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post<BlackjackStartResult>('/api/games/blackjack/start', { betRub, clientSeed })
      setPlayerHand(res.data.playerHand)
      setDealerVisible(res.data.dealerVisible)
      setDealerHand([])
      setWinRubs([])
      setServerInfo({ hash: res.data.serverSeedHash })
      if (res.data.status === 'done') {
        setGameStatus('done')
        setWinRubs(res.data.winRubs ?? [])
        setServerInfo({ hash: res.data.serverSeedHash, seed: res.data.serverSeed })
        await fetchBalance()
      } else {
        setGameStatus('playing')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const doAction = async (action: 'hit' | 'stand' | 'double' | 'split') => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post<BlackjackActionResult>('/api/games/blackjack/action', { action })
      setPlayerHand(res.data.playerHand)
      setDealerHand(res.data.dealerHand)
      setWinRubs(res.data.winRubs)
      if (res.data.status === 'done') {
        setGameStatus('done')
        setServerInfo((prev) => prev ? { ...prev, seed: res.data.serverSeed } : null)
        await fetchBalance()
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const totalWin = winRubs.reduce((s, v) => s + v, 0)
  const net = totalWin - betRub

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="card">
        <div className="mb-8">
          <p className="text-gray-400 text-sm mb-2">
            Дилер {dealerHand.length > 0 ? `(${handValue(dealerHand)})` : dealerVisible !== null ? '(?)' : ''}
          </p>
          <div className="flex gap-2">
            {dealerHand.length > 0
              ? dealerHand.map((c, i) => <CardDisplay key={i} cardIdx={c} />)
              : dealerVisible !== null
              ? (
                <>
                  <CardDisplay cardIdx={dealerVisible} />
                  <div className="w-14 h-20 rounded-lg border-2 border-dashed border-casino-border flex items-center justify-center text-gray-600">?</div>
                </>
              )
              : <div className="text-gray-600 py-8">—</div>
            }
          </div>
        </div>

        <div>
          <p className="text-gray-400 text-sm mb-2">
            Вы {playerHand.length > 0 ? `(${handValue(playerHand)})` : ''}
          </p>
          <div className="flex gap-2">
            {playerHand.length > 0
              ? playerHand.map((c, i) => <CardDisplay key={i} cardIdx={c} />)
              : <div className="text-gray-600 py-8">—</div>
            }
          </div>
        </div>

        {gameStatus === 'done' && winRubs.length > 0 && (
          <div className={`mt-6 text-center text-xl font-bold ${net > 0 ? 'neon-text-cyan' : net === 0 ? 'text-yellow-400' : 'text-red-400'}`}>
            {net > 0 ? `✅ Выигрыш +${net.toLocaleString('ru-RU')} ₽`
              : net === 0 ? '🤝 Ничья'
              : `❌ Проигрыш -${betRub.toLocaleString('ru-RU')} ₽`}
          </div>
        )}
      </div>

      <div className="card space-y-4">
        {gameStatus === 'idle' && (
          <>
            <div className="flex gap-2 flex-wrap">
              {[100, 200, 500, 1000].map((v) => (
                <button key={v} onClick={() => setBetRub(v)}
                  className={`px-3 py-1.5 rounded border text-sm ${betRub === v ? 'border-casino-cyan text-casino-cyan' : 'border-casino-border text-gray-400'}`}>
                  {v} ₽
                </button>
              ))}
            </div>
            <button onClick={startGame} disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'Начинаем...' : `♠️ Начать игру (${betRub} ₽)`}
            </button>
          </>
        )}

        {gameStatus === 'playing' && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => doAction('hit')} disabled={loading} className="btn-primary py-3">Ещё карту</button>
            <button onClick={() => doAction('stand')} disabled={loading} className="btn-cyan py-3">Стоп</button>
            <button onClick={() => doAction('double')} disabled={loading}
              className="border border-yellow-600 text-yellow-400 rounded py-3 hover:bg-yellow-900/20 transition-colors">
              Удвоить
            </button>
            <button onClick={() => doAction('split')} disabled={loading}
              className="border border-casino-border text-gray-400 rounded py-3 hover:border-casino-purple transition-colors">
              Split
            </button>
          </div>
        )}

        {gameStatus === 'done' && (
          <button onClick={() => setGameStatus('idle')} className="btn-primary w-full py-3">Новая игра</button>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      {serverInfo && (
        <div className="card text-xs text-gray-600 space-y-1">
          <p><span className="text-gray-400">Server seed hash:</span> {serverInfo.hash}</p>
          {serverInfo.seed && <p><span className="text-gray-400">Server seed:</span> {serverInfo.seed}</p>}
        </div>
      )}
    </div>
  )
}

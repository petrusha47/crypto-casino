'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useBalanceStore } from '@/store/balance'
import { getSocket } from '@/lib/socket'
import type { Socket } from 'socket.io-client'

type Phase = 'idle' | 'betting' | 'running' | 'crashed'

interface CrashRound {
  phase: Phase
  roundId?: string
  serverSeedHash?: string
  multiplier: number
  crashPoint?: number
  serverSeed?: string
}

export default function CrashGame() {
  const { getAccessToken } = useAuthStore()
  const { fetch: fetchBalance } = useBalanceStore()
  const socketRef = useRef<Socket | null>(null)

  const [round, setRound] = useState<CrashRound>({ phase: 'idle', multiplier: 1 })
  const [betRub, setBetRub] = useState(100)
  const [hasBet, setHasBet] = useState(false)
  const [lastResult, setLastResult] = useState<{ multiplier: number; winRub: number } | null>(null)
  const [error, setError] = useState('')
  const [bettingCountdown, setBettingCountdown] = useState(0)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return
    const socket = getSocket(token)
    socketRef.current = socket

    socket.on('crash:state', (data: { phase: Phase; roundId?: string }) => {
      setRound((r) => ({ ...r, phase: data.phase, roundId: data.roundId }))
    })

    socket.on('crash:betting', (data: { roundId: string; serverSeedHash: string; durationMs: number }) => {
      setRound({ phase: 'betting', roundId: data.roundId, serverSeedHash: data.serverSeedHash, multiplier: 1 })
      setHasBet(false)
      setLastResult(null)
      setBettingCountdown(Math.ceil(data.durationMs / 1000))
    })

    socket.on('crash:started', () => {
      setRound((r) => ({ ...r, phase: 'running', multiplier: 1 }))
      setBettingCountdown(0)
    })

    socket.on('crash:tick', (data: { multiplier: number }) => {
      setRound((r) => ({ ...r, multiplier: data.multiplier }))
    })

    socket.on('crash:crashed', (data: { crashPoint: number; serverSeed: string }) => {
      setRound((r) => ({ ...r, phase: 'crashed', crashPoint: data.crashPoint, serverSeed: data.serverSeed }))
      setHasBet(false)
      fetchBalance()
    })

    socket.on('crash:cashout_confirmed', (data: { multiplier: number; winRub: number }) => {
      setLastResult(data)
      setHasBet(false)
      fetchBalance()
    })

    socket.on('crash:error', (data: { message: string }) => {
      setError(data.message)
      setTimeout(() => setError(''), 3000)
    })

    return () => {
      socket.off('crash:state')
      socket.off('crash:betting')
      socket.off('crash:started')
      socket.off('crash:tick')
      socket.off('crash:crashed')
      socket.off('crash:cashout_confirmed')
      socket.off('crash:error')
    }
  }, [getAccessToken, fetchBalance])

  useEffect(() => {
    if (bettingCountdown <= 0) return
    const t = setTimeout(() => setBettingCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [bettingCountdown])

  const placeBet = () => {
    if (!socketRef.current || hasBet) return
    socketRef.current.emit('crash:bet', { betRub })
    setHasBet(true)
  }

  const cashout = () => {
    if (!socketRef.current) return
    socketRef.current.emit('crash:cashout')
  }

  const getMultiplierColor = () => {
    if (round.phase === 'crashed') return 'text-red-400'
    if (round.multiplier >= 5) return 'text-yellow-400'
    if (round.multiplier >= 2) return 'text-casino-cyan'
    return 'text-white'
  }

  const token = getAccessToken()

  if (!token) {
    return (
      <div className="card text-center text-gray-400 py-12">
        Войдите для игры
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="card text-center py-12">
        <div className={`text-7xl font-bold font-mono transition-colors ${getMultiplierColor()}`}>
          {round.phase === 'crashed'
            ? `💥 ${round.crashPoint?.toFixed(2)}x`
            : `${round.multiplier.toFixed(2)}x`}
        </div>
        <div className="mt-4 text-gray-400 text-sm">
          {round.phase === 'idle' && 'Ожидание...'}
          {round.phase === 'betting' && `Приём ставок: ${bettingCountdown}с`}
          {round.phase === 'running' && '🚀 Летим!'}
          {round.phase === 'crashed' && (
            <span>
              Краш на {round.crashPoint?.toFixed(2)}x
              {round.serverSeed && (
                <span className="block text-xs mt-1 text-gray-600">seed: {round.serverSeed.slice(0, 16)}...</span>
              )}
            </span>
          )}
        </div>
        {lastResult && (
          <div className="mt-4 text-casino-cyan font-bold">
            ✅ Кешаут на {lastResult.multiplier.toFixed(2)}x → +{lastResult.winRub.toLocaleString('ru-RU')} ₽
          </div>
        )}
      </div>

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
              disabled={hasBet || round.phase === 'running'}
            >
              {v} ₽
            </button>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={placeBet}
            disabled={hasBet || round.phase !== 'betting'}
            className="btn-primary flex-1 py-3"
          >
            {hasBet ? '✅ Ставка принята' : `Поставить ${betRub} ₽`}
          </button>
          <button
            onClick={cashout}
            disabled={!hasBet || round.phase !== 'running'}
            className="btn-cyan flex-1 py-3"
          >
            Кешаут {hasBet && round.phase === 'running' ? `(${round.multiplier.toFixed(2)}x)` : ''}
          </button>
        </div>
      </div>

      {round.serverSeedHash && (
        <div className="card text-xs text-gray-600 space-y-1">
          <p><span className="text-gray-400">Round ID:</span> {round.roundId}</p>
          <p><span className="text-gray-400">Server seed hash:</span> {round.serverSeedHash}</p>
        </div>
      )}
    </div>
  )
}

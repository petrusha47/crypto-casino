'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useBalanceStore } from '@/store/balance'
import { getSocket } from '@/lib/socket'
import type { Socket } from 'socket.io-client'

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']
const SUITS = ['♠','♥','♦','♣']
const RED_SUITS = new Set([1, 2])

function CardDisplay({ cardIdx }: { cardIdx: number }) {
  if (cardIdx === -1) {
    return (
      <div className="w-10 h-14 rounded border-2 border-dashed border-casino-border bg-casino-bg flex items-center justify-center text-gray-600 text-lg">
        ?
      </div>
    )
  }
  const rank = RANKS[cardIdx % 13]
  const suitIdx = Math.floor(cardIdx / 13)
  const suit = SUITS[suitIdx]
  const isRed = RED_SUITS.has(suitIdx)
  return (
    <div className={`w-10 h-14 rounded border-2 flex flex-col items-center justify-center font-bold
      bg-white shadow ${isRed ? 'text-red-600 border-red-200' : 'text-gray-900 border-gray-200'}`}>
      <div className="text-xs leading-none">{rank}</div>
      <div className="text-sm">{suit}</div>
    </div>
  )
}

interface PlayerState {
  userId: string
  seat: number
  stackRub: number
  currentBet: number
  folded: boolean
  allIn: boolean
  holeCards: number[]
  cardCount: number
}

interface TableState {
  tableId: string
  players: PlayerState[]
  communityCards: number[]
  pot: number
  currentBet: number
  minBet: number
  phase: string
  currentPlayerIdx: number
}

export default function PokerTable({ tableId }: { tableId: string }) {
  const router = useRouter()
  const { user, getAccessToken } = useAuthStore()
  const { fetch: fetchBalance } = useBalanceStore()
  const socketRef = useRef<Socket | null>(null)

  const [tableState, setTableState] = useState<TableState | null>(null)
  const [joined, setJoined] = useState(false)
  const [raiseAmount, setRaiseAmount] = useState(0)
  const [error, setError] = useState('')
  const [turnTimeout, setTurnTimeout] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return
    const socket = getSocket(token)
    socketRef.current = socket

    socket.on('poker:state', (state: TableState) => {
      setTableState(state)
      setRaiseAmount(state.minBet * 2)
    })

    socket.on('poker:error', (data: { message: string }) => {
      setError(data.message)
      setTimeout(() => setError(''), 4000)
    })

    socket.on('poker:your_turn', (data: { userId: string; timeoutAt: number }) => {
      setTurnTimeout(data.timeoutAt)
    })

    return () => {
      socket.off('poker:state')
      socket.off('poker:error')
      socket.off('poker:your_turn')
    }
  }, [getAccessToken])

  // Countdown
  useEffect(() => {
    if (!turnTimeout) return
    const interval = setInterval(() => {
      const left = Math.max(0, Math.ceil((turnTimeout - Date.now()) / 1000))
      setTimeLeft(left)
      if (left === 0) { clearInterval(interval); setTurnTimeout(null) }
    }, 500)
    return () => clearInterval(interval)
  }, [turnTimeout])

  const joinTable = useCallback(() => {
    if (!socketRef.current) return
    socketRef.current.emit('poker:join', { tableId })
    setJoined(true)
  }, [tableId])

  const sendAction = (type: string, amount?: number) => {
    if (!socketRef.current) return
    socketRef.current.emit('poker:action', { tableId, action: { type, amount } })
  }

  const leaveTable = () => {
    if (socketRef.current) {
      socketRef.current.emit('poker:leave', { tableId })
      socketRef.current.off('poker:state')
      socketRef.current.off('poker:error')
      socketRef.current.off('poker:your_turn')
    }
    fetchBalance()
    router.push('/games/poker')
  }

  const myPlayer = tableState?.players.find((p) => p.userId === user?.id)
  const currentPlayer = tableState ? tableState.players[tableState.currentPlayerIdx] : null
  const isMyTurn = currentPlayer?.userId === user?.id && tableState?.phase !== 'waiting'

  if (!getAccessToken()) {
    return <div className="card text-center text-gray-400 py-12">Войдите для игры</div>
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Table header */}
      <div className="card flex items-center justify-between">
        <div>
          <span className="text-gray-400 text-sm">Фаза:</span>{' '}
          <span className="text-white font-bold uppercase">{tableState?.phase ?? 'ожидание'}</span>
          {tableState && (
            <span className="ml-4 text-gray-400 text-sm">
              Банк: <span className="text-casino-cyan font-bold">{tableState.pot} ₽</span>
            </span>
          )}
        </div>
        {joined && <button onClick={leaveTable} className="btn-danger text-sm py-1 px-3">Выйти</button>}
      </div>

      {/* Community cards */}
      {tableState && tableState.communityCards.length > 0 && (
        <div className="card">
          <p className="text-gray-400 text-sm mb-2">Общие карты</p>
          <div className="flex gap-2">
            {tableState.communityCards.map((c, i) => <CardDisplay key={i} cardIdx={c} />)}
          </div>
        </div>
      )}

      {/* Players */}
      <div className="grid grid-cols-2 gap-3">
        {tableState?.players.map((player) => (
          <div key={player.userId}
            className={`card ${player.userId === user?.id ? 'border-casino-cyan' : ''}
              ${currentPlayer?.userId === player.userId && tableState.phase !== 'waiting' ? 'border-casino-purple shadow-glow-sm-purple' : ''}
              ${player.folded ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${player.userId === user?.id ? 'text-casino-cyan' : 'text-white'}`}>
                {player.userId === user?.id ? `${user.username} (ты)` : `Игрок ${player.seat + 1}`}
              </span>
              <span className="text-xs text-gray-400">{player.stackRub} ₽</span>
            </div>
            <div className="flex gap-1">
              {player.holeCards.map((c, i) => <CardDisplay key={i} cardIdx={c} />)}
            </div>
            {player.currentBet > 0 && (
              <p className="text-xs text-yellow-400 mt-1">Ставка: {player.currentBet} ₽</p>
            )}
            {player.folded && <p className="text-xs text-red-400 mt-1">Фолд</p>}
            {player.allIn && <p className="text-xs text-orange-400 mt-1">All-in</p>}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="card space-y-3">
        {!joined ? (
          <button onClick={joinTable} className="btn-primary w-full py-3">
            🃏 Войти за стол
          </button>
        ) : isMyTurn ? (
          <>
            {turnTimeout && (
              <div className="text-center text-yellow-400 text-sm">
                Ваш ход — {timeLeft}с
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => sendAction('fold')} className="btn-danger py-2.5">Фолд</button>
              <button onClick={() => sendAction('check')} className="btn-cyan py-2.5">Чек</button>
              <button onClick={() => sendAction('call')} className="btn-primary py-2.5">
                Колл ({tableState?.currentBet ?? 0} ₽)
              </button>
              <button onClick={() => sendAction('allin')} className="border border-yellow-600 text-yellow-400 rounded py-2.5 hover:bg-yellow-900/20 transition-colors">
                All-in
              </button>
              <div className="col-span-2 flex gap-2">
                <input
                  type="number"
                  value={raiseAmount}
                  onChange={(e) => setRaiseAmount(Number(e.target.value))}
                  className="input-field text-sm flex-1"
                  min={tableState?.currentBet ? tableState.currentBet + 1 : tableState?.minBet}
                />
                <button onClick={() => sendAction('raise', raiseAmount)} className="btn-primary px-3">
                  Рейз
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-center text-gray-400 text-sm py-2">
            {tableState?.phase === 'waiting' ? 'Ожидание игроков...' : 'Ход другого игрока'}
          </p>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {myPlayer && (
          <p className="text-xs text-gray-500 text-center">
            Ваш стек: <span className="text-white">{myPlayer.stackRub} ₽</span>
          </p>
        )}
      </div>
    </div>
  )
}

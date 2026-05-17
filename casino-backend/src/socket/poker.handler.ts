import { Server, Socket } from 'socket.io'
import { prisma } from '../config/prisma'
import { redis } from '../config/redis'
import { creditBalance, debitBalance } from '../services/balance.service'
import { BalanceTxType } from '@prisma/client'
import {
  createTableState,
  addPlayer,
  removePlayer,
  startHand,
  applyAction,
  resolveShowdown,
  PokerTableState,
} from '../games/poker/table'

const ACTION_TIMEOUT_MS = 30_000

export function registerPokerHandler(io: Server): void {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user?.userId as string | undefined
    if (!userId) return

    socket.on('poker:join', async ({ tableId }: { tableId: string }) => {
      try {
        const table = await prisma.pokerTable.findUnique({ where: { id: tableId } })
        if (!table) { socket.emit('poker:error', { message: 'Table not found' }); return }

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { balanceRub: true } })
        if (!user) { socket.emit('poker:error', { message: 'User not found' }); return }

        const buyIn = Number(table.minBetRub) * 20
        try {
          await debitBalance({ userId, amountRub: buyIn, type: BalanceTxType.GAME_LOSS, comment: 'Poker buy-in' })
        } catch {
          socket.emit('poker:error', { message: 'Insufficient balance for buy-in' }); return
        }

        let state = await getTableState(tableId)
        if (!state) {
          state = createTableState(tableId, Number(table.minBetRub), Number(table.maxBetRub))
        }

        state = addPlayer(state, { userId, stackRub: buyIn })
        await saveTableState(tableId, state)

        socket.join(`poker:${tableId}`)
        io.to(`poker:${tableId}`).emit('poker:state', sanitizeState(state, userId))

        // Start hand if ≥2 players and waiting
        if (state.players.length >= 2 && state.phase === 'waiting') {
          const started = startHand(state)
          await saveTableState(tableId, started)
          broadcastState(io, tableId, started)
          scheduleActionTimeout(io, tableId, started)
        }
      } catch (err) {
        socket.emit('poker:error', { message: 'Failed to join table' })
      }
    })

    socket.on('poker:action', async ({ tableId, action }: { tableId: string; action: { type: string; amount?: number } }) => {
      try {
        let state = await getTableState(tableId)
        if (!state) { socket.emit('poker:error', { message: 'Table not found' }); return }
        if (state.phase === 'waiting' || state.phase === 'showdown') {
          socket.emit('poker:error', { message: 'No active hand' }); return
        }

        state = applyAction(state, userId, action as any)

        if (state.phase === 'showdown') {
          const results = resolveShowdown(state)
          for (const r of results) {
            await creditBalance({ userId: r.winnerId, amountRub: r.potWon, type: BalanceTxType.GAME_WIN, comment: 'Poker win' })
          }
          // Reset to waiting
          state.phase = 'waiting'
          state.pot = 0
          state.communityCards = []
          state.players = state.players.map((p) => ({ ...p, holeCards: [], currentBet: 0, folded: false, allIn: false }))
        }

        await saveTableState(tableId, state)
        broadcastState(io, tableId, state)

        if (state.phase !== 'waiting') {
          scheduleActionTimeout(io, tableId, state)
        }
      } catch (err: any) {
        socket.emit('poker:error', { message: err.message ?? 'Action failed' })
      }
    })

    socket.on('poker:leave', async ({ tableId }: { tableId: string }) => {
      try {
        let state = await getTableState(tableId)
        if (!state) return

        const player = state.players.find((p) => p.userId === userId)
        if (player && player.stackRub > 0) {
          await creditBalance({ userId, amountRub: player.stackRub, type: BalanceTxType.GAME_WIN, comment: 'Poker cash-out' })
        }

        state = removePlayer(state, userId)
        await saveTableState(tableId, state)
        socket.leave(`poker:${tableId}`)
        io.to(`poker:${tableId}`).emit('poker:state', sanitizeState(state, ''))
      } catch {
        socket.emit('poker:error', { message: 'Failed to leave table' })
      }
    })
  })
}

async function getTableState(tableId: string): Promise<PokerTableState | null> {
  const raw = await redis.get(`poker:table:${tableId}`)
  return raw ? JSON.parse(raw) : null
}

async function saveTableState(tableId: string, state: PokerTableState): Promise<void> {
  await redis.set(`poker:table:${tableId}`, JSON.stringify(state))
}

function broadcastState(io: Server, tableId: string, state: PokerTableState): void {
  for (const player of state.players) {
    io.to(`poker:${tableId}`).emit('poker:state', sanitizeState(state, player.userId))
  }
}

function sanitizeState(state: PokerTableState, viewerUserId: string) {
  return {
    ...state,
    deck: undefined,
    players: state.players.map((p) => ({
      userId: p.userId,
      seat: p.seat,
      stackRub: p.stackRub,
      currentBet: p.currentBet,
      folded: p.folded,
      allIn: p.allIn,
      holeCards: p.userId === viewerUserId ? p.holeCards : p.holeCards.map(() => -1),
      cardCount: p.holeCards.length,
    })),
  }
}

function scheduleActionTimeout(io: Server, tableId: string, state: PokerTableState): void {
  const currentPlayer = state.players[state.currentPlayerIdx]
  if (!currentPlayer) return

  io.to(`poker:${tableId}`).emit('poker:your_turn', {
    userId: currentPlayer.userId,
    timeoutAt: Date.now() + ACTION_TIMEOUT_MS,
  })

  setTimeout(async () => {
    const current = await getTableState(tableId)
    if (!current) return
    if (current.lastActionAt !== state.lastActionAt) return

    try {
      const next = applyAction(current, currentPlayer.userId, { type: 'fold' })
      await saveTableState(tableId, next)
      broadcastState(io, tableId, next)
    } catch {}
  }, ACTION_TIMEOUT_MS)
}

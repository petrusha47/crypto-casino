import { createHash } from 'crypto'
import { Server } from 'socket.io'
import { redis } from '../config/redis'
import { prisma } from '../config/prisma'
import { generateServerSeed, hashServerSeed } from './provablyFair.service'
import { debitBalance, creditBalance } from './balance.service'
import { BalanceTxType } from '@prisma/client'

const BETTING_PHASE_MS = 5_000
const TICK_INTERVAL_MS = 100
const BETWEEN_ROUNDS_MS = 7_000
const GROWTH_RATE = 0.06

export function computeCrashPoint(serverSeedHash: string): number {
  const h = parseInt(serverSeedHash.slice(0, 8), 16)
  if (h % 33 === 0) return 1.0
  return Math.max(1.0, Math.floor((0.97 / (1 - h / 0xffffffff)) * 100) / 100)
}

export function computeMultiplier(elapsedMs: number): number {
  const seconds = elapsedMs / 1000
  return Math.round(Math.pow(Math.E, GROWTH_RATE * seconds) * 100) / 100
}

export function startCrashGame(io: Server): void {
  runRound(io)
}

async function runRound(io: Server): Promise<void> {
  const serverSeed = generateServerSeed()
  const serverSeedHash = hashServerSeed(serverSeed)
  const crashPoint = computeCrashPoint(serverSeedHash)

  const dbRound = await prisma.crashRound.create({
    data: { hash: serverSeedHash, crashPoint, startedAt: new Date() },
  })

  await redis.set('crash:phase', 'betting')
  await redis.set('crash:round_id', dbRound.id)
  await redis.set('crash:server_seed', serverSeed)
  await redis.set('crash:crash_point', String(crashPoint))

  io.emit('crash:betting', { roundId: dbRound.id, serverSeedHash, durationMs: BETTING_PHASE_MS })

  await delay(BETTING_PHASE_MS)

  const startTime = Date.now()
  await redis.set('crash:phase', 'running')
  await redis.set('crash:start_time', String(startTime))

  io.emit('crash:started', { roundId: dbRound.id })

  const tickTimer = setInterval(async () => {
    const elapsed = Date.now() - startTime
    const currentMultiplier = computeMultiplier(elapsed)

    if (currentMultiplier >= crashPoint) {
      clearInterval(tickTimer)
      await handleCrash(io, dbRound.id, serverSeed, crashPoint)
      setTimeout(() => runRound(io), BETWEEN_ROUNDS_MS)
      return
    }

    io.emit('crash:tick', { multiplier: currentMultiplier, elapsed })
  }, TICK_INTERVAL_MS)
}

async function handleCrash(
  io: Server,
  roundId: string,
  serverSeed: string,
  crashPoint: number,
): Promise<void> {
  await redis.set('crash:phase', 'crashed')

  const betKeys = await redis.keys('crash:bets:*')
  for (const key of betKeys) {
    await redis.del(key)
  }

  await prisma.crashRound.update({
    where: { id: roundId },
    data: { crashedAt: new Date() },
  })

  io.emit('crash:crashed', { crashPoint, serverSeed, roundId })
}

export async function placeCrashBet(
  io: Server,
  userId: string,
  betRub: number,
): Promise<{ error?: string }> {
  const phase = await redis.get('crash:phase')
  if (phase !== 'betting') return { error: 'Betting phase is over' }

  const existing = await redis.get(`crash:bets:${userId}`)
  if (existing) return { error: 'Already placed a bet this round' }

  try {
    await debitBalance({ userId, amountRub: betRub, type: BalanceTxType.GAME_LOSS, comment: 'Crash bet' })
  } catch {
    return { error: 'Insufficient balance' }
  }

  const roundId = await redis.get('crash:round_id')
  if (roundId) {
    await prisma.crashBet.create({
      data: { userId, roundId, betRub },
    })
  }

  await redis.set(`crash:bets:${userId}`, JSON.stringify({ betRub }), 'EX', 300)
  io.emit('crash:bet_placed', { userId })
  return {}
}

export async function cashoutCrash(
  userId: string,
): Promise<{ error?: string; multiplier?: number; winRub?: number }> {
  const phase = await redis.get('crash:phase')
  if (phase !== 'running') return { error: 'Cannot cashout now' }

  const betData = await redis.get(`crash:bets:${userId}`)
  if (!betData) return { error: 'No active bet' }

  const startTime = parseInt((await redis.get('crash:start_time')) ?? '0', 10)
  const elapsed = Date.now() - startTime
  const multiplier = computeMultiplier(elapsed)

  const { betRub } = JSON.parse(betData) as { betRub: number }
  const winRub = Math.round(betRub * multiplier * 100) / 100

  await redis.del(`crash:bets:${userId}`)
  await creditBalance({
    userId,
    amountRub: winRub,
    type: BalanceTxType.GAME_WIN,
    comment: `Crash cashout at ${multiplier}x`,
  })

  const roundId = await redis.get('crash:round_id')
  if (roundId) {
    await prisma.crashBet.updateMany({
      where: { userId, roundId },
      data: { cashoutAt: multiplier, profitRub: winRub - betRub },
    })
  }

  return { multiplier, winRub }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

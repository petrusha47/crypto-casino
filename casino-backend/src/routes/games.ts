import { Router } from 'express'
import { z } from 'zod'
import { BalanceTxType } from '@prisma/client'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../config/prisma'
import { redis } from '../config/redis'
import { debitBalance, creditBalance, InsufficientFundsError } from '../services/balance.service'
import { generateServerSeed, hashServerSeed } from '../services/provablyFair.service'
import { spin as slotsSpin } from '../games/slots'
import { spinWheel, calculateTotalWin, RouletteBet } from '../games/roulette'
import {
  shuffleShoe,
  handValue,
  isBust,
  isBlackjack,
  dealerShouldHit,
  settleHand,
  BlackjackSession,
  cardValue,
} from '../games/blackjack'

export const gamesRouter = Router()

// ─── SLOTS ───────────────────────────────────────────────────────────────────

const slotsSpinSchema = z.object({
  betRub: z.number().positive(),
  clientSeed: z.string().min(1).max(64),
})

gamesRouter.post('/slots/spin', requireAuth, async (req, res) => {
  const parsed = slotsSpinSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { betRub, clientSeed } = parsed.data
  const userId = req.user!.userId
  const serverSeed = generateServerSeed()
  const serverSeedHash = hashServerSeed(serverSeed)

  try {
    await debitBalance({ userId, amountRub: betRub, type: BalanceTxType.GAME_LOSS, comment: 'Slots bet' })
  } catch (err) {
    if (err instanceof InsufficientFundsError) return res.status(402).json({ error: 'Insufficient balance' })
    throw err
  }

  const nonce = 1
  const result = slotsSpin(serverSeed, clientSeed, nonce, betRub)

  if (result.winRub > 0) {
    await creditBalance({ userId, amountRub: result.winRub, type: BalanceTxType.GAME_WIN, comment: 'Slots win' })
  }

  await prisma.gameRound.create({
    data: {
      userId,
      game: 'SLOTS',
      betRub,
      winRub: result.winRub,
      serverSeedHash,
      serverSeed,
      clientSeed,
      nonce,
      result: JSON.parse(JSON.stringify({ reels: result.reels, lines: result.lines, winMultiplier: result.winMultiplier })),
    },
  })

  res.json({ ...result, serverSeedHash })
})

// ─── ROULETTE ────────────────────────────────────────────────────────────────

const rouletteBetSchema = z.object({
  clientSeed: z.string().min(1).max(64),
  bets: z
    .array(
      z.object({
        type: z.enum(['straight', 'red', 'black', 'odd', 'even', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3']),
        number: z.number().int().min(0).max(36).optional(),
        amountRub: z.number().positive(),
      }),
    )
    .min(1),
})

gamesRouter.post('/roulette/bet', requireAuth, async (req, res) => {
  const parsed = rouletteBetSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { clientSeed, bets } = parsed.data
  const userId = req.user!.userId
  const totalBet = bets.reduce((s, b) => s + b.amountRub, 0)
  const serverSeed = generateServerSeed()
  const serverSeedHash = hashServerSeed(serverSeed)
  const nonce = 1

  try {
    await debitBalance({ userId, amountRub: totalBet, type: BalanceTxType.GAME_LOSS, comment: 'Roulette bet' })
  } catch (err) {
    if (err instanceof InsufficientFundsError) return res.status(402).json({ error: 'Insufficient balance' })
    throw err
  }

  const outcome = spinWheel(serverSeed, clientSeed, nonce)
  const winRub = calculateTotalWin(bets as RouletteBet[], outcome)

  if (winRub > 0) {
    await creditBalance({ userId, amountRub: winRub, type: BalanceTxType.GAME_WIN, comment: 'Roulette win' })
  }

  await prisma.gameRound.create({
    data: {
      userId,
      game: 'ROULETTE',
      betRub: totalBet,
      winRub,
      serverSeedHash,
      serverSeed,
      clientSeed,
      nonce,
      result: { outcome, bets },
    },
  })

  res.json({ outcome, winRub, totalBet, serverSeedHash })
})

// ─── BLACKJACK ────────────────────────────────────────────────────────────────

const bjStartSchema = z.object({
  betRub: z.number().positive(),
  clientSeed: z.string().min(1).max(64),
})

const bjActionSchema = z.object({
  action: z.enum(['hit', 'stand', 'double', 'split']),
})

gamesRouter.post('/blackjack/start', requireAuth, async (req, res) => {
  const parsed = bjStartSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { betRub, clientSeed } = parsed.data
  const userId = req.user!.userId

  const existing = await redis.get(`bj:session:${userId}`)
  if (existing) {
    const sess: BlackjackSession = JSON.parse(existing)
    if (sess.status === 'playing') return res.status(409).json({ error: 'Game already in progress' })
  }

  try {
    await debitBalance({ userId, amountRub: betRub, type: BalanceTxType.GAME_LOSS, comment: 'Blackjack bet' })
  } catch (err) {
    if (err instanceof InsufficientFundsError) return res.status(402).json({ error: 'Insufficient balance' })
    throw err
  }

  const serverSeed = generateServerSeed()
  const serverSeedHash = hashServerSeed(serverSeed)

  let shoe: number[]
  let shoePos = 0
  const shoeData = await redis.get(`bj:shoe:${userId}`)
  if (shoeData) {
    const s = JSON.parse(shoeData)
    if (s.shoePos > 234) {
      shoe = shuffleShoe(serverSeed, clientSeed, 0)
    } else {
      shoe = s.shoe
      shoePos = s.shoePos
    }
  } else {
    shoe = shuffleShoe(serverSeed, clientSeed, 0)
  }

  const draw = () => shoe[shoePos++]
  const playerHand = [draw(), draw()]
  const dealerHand = [draw(), draw()]

  const playerBJ = isBlackjack(playerHand)
  const dealerBJ = isBlackjack(dealerHand)
  const isDone = playerBJ || dealerBJ

  const session: BlackjackSession = {
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce: 1,
    shoe,
    shoePos,
    playerHands: [playerHand],
    activeHandIdx: 0,
    dealerHand,
    bets: [betRub],
    status: isDone ? 'done' : 'playing',
    winRubs: [],
  }

  if (isDone) {
    const pVal = handValue(playerHand)
    const dVal = handValue(dealerHand)
    const winRub = settleHand(pVal, dVal, betRub, playerBJ)
    session.winRubs = [winRub]
    if (winRub > 0) {
      await creditBalance({ userId, amountRub: winRub, type: BalanceTxType.GAME_WIN, comment: 'Blackjack win' })
    }
    await prisma.gameRound.create({
      data: {
        userId, game: 'BLACKJACK', betRub, winRub,
        serverSeedHash, serverSeed, clientSeed, nonce: 1,
        result: { playerHand, dealerHand, winRub, reason: playerBJ ? 'blackjack' : 'dealer_blackjack' },
      },
    })
    await redis.setex(`bj:shoe:${userId}`, 86400, JSON.stringify({ shoe, shoePos }))
    return res.json({
      status: 'done', playerHand, dealerHand, winRub, serverSeedHash,
      dealerVisible: dealerHand[0],
    })
  }

  await redis.setex(`bj:session:${userId}`, 3600, JSON.stringify(session))
  await redis.setex(`bj:shoe:${userId}`, 86400, JSON.stringify({ shoe, shoePos }))

  res.json({
    status: 'playing',
    playerHand,
    dealerVisible: dealerHand[0],
    playerValue: handValue(playerHand),
    serverSeedHash,
  })
})

gamesRouter.post('/blackjack/action', requireAuth, async (req, res) => {
  const parsed = bjActionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { action } = parsed.data
  const userId = req.user!.userId

  const raw = await redis.get(`bj:session:${userId}`)
  if (!raw) return res.status(404).json({ error: 'No active blackjack game' })

  const session: BlackjackSession = JSON.parse(raw)
  if (session.status === 'done') return res.status(409).json({ error: 'Game already finished' })

  const { shoe, playerHands, activeHandIdx, dealerHand, bets } = session
  let { shoePos } = session
  const draw = () => shoe[shoePos++]
  const activeHand = playerHands[activeHandIdx]

  if (action === 'hit') {
    activeHand.push(draw())
    session.shoePos = shoePos

    if (isBust(activeHand)) {
      if (activeHandIdx + 1 < playerHands.length) {
        session.activeHandIdx++
        await redis.setex(`bj:session:${userId}`, 3600, JSON.stringify(session))
        return res.json({ status: 'playing', playerHand: activeHand, playerValue: handValue(activeHand), busted: true })
      }
      return settleBJSession(session, userId, res)
    }

    await redis.setex(`bj:session:${userId}`, 3600, JSON.stringify(session))
    return res.json({ status: 'playing', playerHand: activeHand, playerValue: handValue(activeHand) })
  }

  if (action === 'stand') {
    if (activeHandIdx + 1 < playerHands.length) {
      session.activeHandIdx++
      await redis.setex(`bj:session:${userId}`, 3600, JSON.stringify(session))
      return res.json({ status: 'playing', activeHandIdx: session.activeHandIdx })
    }
    return settleBJSession(session, userId, res)
  }

  if (action === 'double') {
    const bet = bets[activeHandIdx]
    try {
      await debitBalance({ userId, amountRub: bet, type: BalanceTxType.GAME_LOSS, comment: 'Blackjack double' })
    } catch (err) {
      if (err instanceof InsufficientFundsError) return res.status(402).json({ error: 'Insufficient balance' })
      throw err
    }
    session.bets[activeHandIdx] = bet * 2
    activeHand.push(draw())
    session.shoePos = shoePos
    if (activeHandIdx + 1 < playerHands.length) {
      session.activeHandIdx++
      await redis.setex(`bj:session:${userId}`, 3600, JSON.stringify(session))
      return res.json({ status: 'playing', playerHand: activeHand, doubled: true })
    }
    return settleBJSession(session, userId, res)
  }

  if (action === 'split') {
    if (activeHand.length !== 2 || cardValue(activeHand[0]) !== cardValue(activeHand[1])) {
      return res.status(400).json({ error: 'Cannot split: hand is not a pair' })
    }
    const bet = bets[activeHandIdx]
    try {
      await debitBalance({ userId, amountRub: bet, type: BalanceTxType.GAME_LOSS, comment: 'Blackjack split' })
    } catch (err) {
      if (err instanceof InsufficientFundsError) return res.status(402).json({ error: 'Insufficient balance' })
      throw err
    }
    const hand1 = [activeHand[0], draw()]
    const hand2 = [activeHand[1], draw()]
    session.shoePos = shoePos
    playerHands.splice(activeHandIdx, 1, hand1, hand2)
    session.bets.splice(activeHandIdx, 1, bet, bet)
    await redis.setex(`bj:session:${userId}`, 3600, JSON.stringify(session))
    return res.json({ status: 'playing', playerHands: session.playerHands, activeHandIdx: session.activeHandIdx })
  }

  return res.status(400).json({ error: 'Unknown action' })
})

async function settleBJSession(session: BlackjackSession, userId: string, res: any) {
  const { shoe, playerHands, bets, dealerHand, serverSeed, serverSeedHash, clientSeed } = session
  let shoePos = session.shoePos
  const draw = () => shoe[shoePos++]

  const anyAlive = playerHands.some((h) => !isBust(h))
  if (anyAlive) {
    while (dealerShouldHit(dealerHand)) dealerHand.push(draw())
  }

  const dVal = handValue(dealerHand)
  let totalWin = 0
  const winRubs: number[] = []

  for (let i = 0; i < playerHands.length; i++) {
    const pVal = handValue(playerHands[i])
    const w = settleHand(pVal, dVal, bets[i], false)
    winRubs.push(w)
    totalWin += w
  }

  if (totalWin > 0) {
    await creditBalance({ userId, amountRub: totalWin, type: BalanceTxType.GAME_WIN, comment: 'Blackjack win' })
  }

  const totalBet = bets.reduce((s, b) => s + b, 0)
  await prisma.gameRound.create({
    data: {
      userId, game: 'BLACKJACK', betRub: totalBet, winRub: totalWin,
      serverSeedHash, serverSeed, clientSeed, nonce: session.nonce,
      result: { playerHands, dealerHand, winRubs },
    },
  })

  await redis.del(`bj:session:${userId}`)
  await redis.setex(`bj:shoe:${userId}`, 86400, JSON.stringify({ shoe, shoePos }))

  return res.json({
    status: 'done',
    playerHand: playerHands[session.activeHandIdx] ?? playerHands[0],
    playerHands,
    dealerHand,
    dealerValue: dVal,
    winRubs,
    totalWin,
    serverSeed,
  })
}

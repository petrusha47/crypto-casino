import { Router } from 'express'
import { TableStatus } from '@prisma/client'
import { prisma } from '../config/prisma'
import { requireAuth } from '../middleware/auth'

export const userRouter = Router()

userRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, username: true, role: true, balanceRub: true, createdAt: true },
  })
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

userRouter.get('/balance', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { balanceRub: true },
  })
  res.json({ balanceRub: user?.balanceRub ?? 0 })
})

userRouter.get('/poker-tables', requireAuth, async (_req, res) => {
  const tables = await prisma.pokerTable.findMany({
    where: { status: { not: TableStatus.FINISHED } },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, maxPlayers: true, minBetRub: true, maxBetRub: true, status: true },
  })
  res.json(tables)
})

userRouter.get('/rounds', requireAuth, async (req, res) => {
  const rounds = await prisma.gameRound.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, game: true, betRub: true, winRub: true, serverSeedHash: true, serverSeed: true, clientSeed: true, nonce: true, result: true, createdAt: true },
  })
  res.json(rounds)
})

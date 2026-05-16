import { Router } from 'express'
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

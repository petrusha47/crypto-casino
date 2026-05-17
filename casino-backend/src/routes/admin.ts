import { Router } from 'express'
import { Role, WithdrawalStatus } from '@prisma/client'
import { prisma } from '../config/prisma'
import { requireRole } from '../middleware/admin'

export const adminRouter = Router()

const ADMIN_SUPPORT = [Role.ADMIN, Role.SUPPORT]

// GET /api/admin/stats — ADMIN + SUPPORT
adminRouter.get('/stats', requireRole(...ADMIN_SUPPORT), async (req, res) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const [totalUsers, balanceAgg, pendingAgg, roundsToday, roundsWeek, topPlayers] = await Promise.all([
      prisma.user.count(),
      prisma.user.aggregate({ _sum: { balanceRub: true } }),
      prisma.withdrawalRequest.aggregate({
        where: { status: WithdrawalStatus.PENDING },
        _count: { _all: true },
        _sum: { amountRub: true },
      }),
      prisma.gameRound.count({ where: { createdAt: { gte: today } } }),
      prisma.gameRound.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.findMany({
        orderBy: { balanceRub: 'desc' },
        take: 5,
        select: { username: true, balanceRub: true },
      }),
    ])

    res.json({
      totalUsers,
      totalBalanceRub: Number(balanceAgg._sum.balanceRub ?? 0),
      pendingWithdrawals: pendingAgg._count._all,
      pendingWithdrawalsRub: Number(pendingAgg._sum.amountRub ?? 0),
      roundsToday,
      roundsWeek,
      topPlayers: topPlayers.map(p => ({ username: p.username, balanceRub: Number(p.balanceRub) })),
    })
  } catch (err) {
    console.error('Admin stats error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

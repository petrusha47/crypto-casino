import { Router } from 'express'
import { Role, WithdrawalStatus, BalanceTxType } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { requireRole } from '../middleware/admin'
import { creditBalance, debitBalance, InsufficientFundsError } from '../services/balance.service'

export const adminRouter = Router()

const ADMIN_SUPPORT = [Role.ADMIN, Role.SUPPORT]
const ADMIN_ONLY = [Role.ADMIN]

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

// GET /api/admin/users?page=1&search= — ADMIN + SUPPORT
adminRouter.get('/users', requireRole(...ADMIN_SUPPORT), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const search = (req.query.search as string | undefined)?.trim()
    const pageSize = 20

    const where = search
      ? { OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { username: { contains: search, mode: 'insensitive' as const } },
        ]}
      : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, username: true, role: true, balanceRub: true, isBanned: true, createdAt: true },
      }),
      prisma.user.count({ where }),
    ])

    res.json({ users: users.map(u => ({ ...u, balanceRub: Number(u.balanceRub) })), total, page, pageSize })
  } catch (err) {
    console.error('Admin users list error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/users/:id — ADMIN + SUPPORT
adminRouter.get('/users/:id', requireRole(...ADMIN_SUPPORT), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, username: true, role: true, balanceRub: true, isBanned: true, telegramId: true, createdAt: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found' })

    const recentTxns = await prisma.balanceTransaction.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, type: true, amountRub: true, comment: true, createdAt: true },
    })

    res.json({
      user: { ...user, balanceRub: Number(user.balanceRub) },
      recentTxns: recentTxns.map(t => ({ ...t, amountRub: Number(t.amountRub) })),
    })
  } catch (err) {
    console.error('Admin user detail error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/users/:id/ban — ADMIN only
adminRouter.patch('/users/:id/ban', requireRole(...ADMIN_ONLY), async (req, res) => {
  try {
    const parsed = z.object({ isBanned: z.boolean() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'isBanned must be boolean' })

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isBanned: parsed.data.isBanned },
      select: { id: true, username: true, isBanned: true },
    })
    res.json({ user })
  } catch (err) {
    console.error('Admin ban error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/users/:id/role — ADMIN only
adminRouter.patch('/users/:id/role', requireRole(...ADMIN_ONLY), async (req, res) => {
  try {
    const parsed = z.object({ role: z.nativeEnum(Role) }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid role' })

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: parsed.data.role },
      select: { id: true, username: true, role: true },
    })
    res.json({ user })
  } catch (err) {
    console.error('Admin role error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/users/:id/credit — ADMIN only
adminRouter.post('/users/:id/credit', requireRole(...ADMIN_ONLY), async (req, res) => {
  try {
    const parsed = z.object({ amountRub: z.number().positive(), comment: z.string().optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'amountRub must be positive' })

    await creditBalance({
      userId: req.params.id,
      amountRub: parsed.data.amountRub,
      type: BalanceTxType.ADMIN_CREDIT,
      comment: parsed.data.comment,
    })
    res.json({ success: true })
  } catch (err) {
    console.error('Admin credit error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/users/:id/debit — ADMIN only
adminRouter.post('/users/:id/debit', requireRole(...ADMIN_ONLY), async (req, res) => {
  try {
    const parsed = z.object({ amountRub: z.number().positive(), comment: z.string().optional() }).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'amountRub must be positive' })

    await debitBalance({
      userId: req.params.id,
      amountRub: parsed.data.amountRub,
      type: BalanceTxType.ADMIN_DEBIT,
      comment: parsed.data.comment,
    })
    res.json({ success: true })
  } catch (err) {
    if (err instanceof InsufficientFundsError) return res.status(400).json({ error: 'Insufficient balance' })
    console.error('Admin debit error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

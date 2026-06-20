import { Router } from 'express'
import { Role, WithdrawalStatus, BalanceTxType, TableStatus } from '@prisma/client'
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

// GET /api/admin/withdrawals?status=PENDING — ADMIN + SUPPORT
adminRouter.get('/withdrawals', requireRole(...ADMIN_SUPPORT), async (req, res) => {
  try {
    const statusParam = (req.query.status as string | undefined) ?? 'PENDING'
    const where = statusParam === 'ALL' ? {} : { status: statusParam as WithdrawalStatus }

    const withdrawals = await prisma.withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true, email: true } } },
    })

    res.json({
      withdrawals: withdrawals.map(w => ({
        ...w,
        amountRub: Number(w.amountRub),
      })),
    })
  } catch (err) {
    console.error('Admin withdrawals list error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const reviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), reviewNote: z.string().optional() }),
  z.object({ action: z.literal('reject'), reviewNote: z.string().min(1) }),
])

// PATCH /api/admin/withdrawals/:id/review — ADMIN + SUPPORT
adminRouter.patch('/withdrawals/:id/review', requireRole(...ADMIN_SUPPORT), async (req, res) => {
  try {
    const parsed = reviewSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

    const { action, reviewNote } = parsed.data
    const status = action === 'approve' ? WithdrawalStatus.APPROVED : WithdrawalStatus.REJECTED

    const withdrawal = await prisma.withdrawalRequest.update({
      where: { id: req.params.id },
      data: {
        status,
        reviewedBy: req.user!.userId,
        reviewNote: reviewNote ?? null,
        reviewedAt: new Date(),
      },
      select: { id: true, status: true, reviewedBy: true, reviewNote: true, reviewedAt: true, amountRub: true, trc20Address: true },
    })

    res.json({ withdrawal: { ...withdrawal, amountRub: Number(withdrawal.amountRub) } })
  } catch (err) {
    console.error('Admin withdrawal review error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const tableSchema = z.object({
  name: z.string().min(1).max(50),
  minBetRub: z.number().positive(),
  maxBetRub: z.number().positive(),
  maxPlayers: z.number().int().min(2).max(9),
  rake: z.number().min(0).max(0.1),
})

// GET /api/admin/tables — ADMIN only
adminRouter.get('/tables', requireRole(...ADMIN_ONLY), async (_req, res) => {
  try {
    const tables = await prisma.pokerTable.findMany({ orderBy: { id: 'asc' } })
    res.json({ tables: tables.map(t => ({ ...t, minBetRub: Number(t.minBetRub), maxBetRub: Number(t.maxBetRub) })) })
  } catch (err) {
    console.error('Admin tables list error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/tables — ADMIN only
adminRouter.post('/tables', requireRole(...ADMIN_ONLY), async (req, res) => {
  try {
    const parsed = tableSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

    const { name, minBetRub, maxBetRub, maxPlayers, rake } = parsed.data
    if (minBetRub > maxBetRub) return res.status(400).json({ error: 'minBetRub must be ≤ maxBetRub' })

    const table = await prisma.pokerTable.create({
      data: { name, minBetRub, maxBetRub, maxPlayers, rake, status: TableStatus.WAITING },
    })
    res.status(201).json({ table: { ...table, minBetRub: Number(table.minBetRub), maxBetRub: Number(table.maxBetRub) } })
  } catch (err) {
    console.error('Admin table create error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/tables/:id — ADMIN only
adminRouter.patch('/tables/:id', requireRole(...ADMIN_ONLY), async (req, res) => {
  try {
    const parsed = tableSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

    const table = await prisma.pokerTable.update({
      where: { id: req.params.id },
      data: parsed.data,
    })
    res.json({ table: { ...table, minBetRub: Number(table.minBetRub), maxBetRub: Number(table.maxBetRub) } })
  } catch (err) {
    console.error('Admin table update error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/admin/tables/:id — ADMIN only
adminRouter.delete('/tables/:id', requireRole(...ADMIN_ONLY), async (req, res) => {
  try {
    await prisma.pokerTable.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    console.error('Admin table delete error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/admin/users/:id — ADMIN only
adminRouter.delete('/users/:id', requireRole(...ADMIN_ONLY), async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    console.error('Admin user delete error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/transactions?page=1&type= — ADMIN + SUPPORT
adminRouter.get('/transactions', requireRole(...ADMIN_SUPPORT), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const type = req.query.type as string | undefined
    const pageSize = 50
    const where = type ? { type: type as BalanceTxType } : {}

    const [txns, total] = await Promise.all([
      prisma.balanceTransaction.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true, email: true } } },
      }),
      prisma.balanceTransaction.count({ where }),
    ])

    res.json({
      txns: txns.map(t => ({
        id: t.id,
        type: t.type,
        amountRub: Number(t.amountRub),
        comment: t.comment,
        createdAt: t.createdAt,
        user: t.user,
      })),
      total,
      page,
      pageSize,
    })
  } catch (err) {
    console.error('Admin transactions error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

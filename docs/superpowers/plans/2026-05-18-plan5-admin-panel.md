# ZW Casino Admin Panel — Implementation Plan (Plan 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional admin panel — backend REST API under `/api/admin` and frontend pages under `/admin/*` — covering user management, withdrawal processing, poker table CRUD, and a live stats dashboard.

**Architecture:** Single `src/routes/admin.ts` backend file mounted at `/api/admin` with `requireAuth` globally and `requireRole` per-endpoint. Six Next.js 14 client-component pages under `src/app/admin/` with a shared sidebar layout. No new DB migrations — all schema fields already exist.

**Tech Stack:** Express, Prisma, Zod, Vitest, Supertest (backend); Next.js 14 App Router, Tailwind, Axios, Zustand (frontend).

---

## File Map

```
casino-backend/
  src/
    routes/
      admin.ts                  CREATE — all admin endpoints
      user.ts                   MODIFY — add /poker-tables and /rounds endpoints
    app.ts                      MODIFY — register adminRouter
    tests/routes/
      admin.routes.test.ts      CREATE — all admin route tests

casino-frontend/
  src/
    app/
      admin/
        layout.tsx              CREATE — sidebar nav + role guard
        page.tsx                MODIFY — replace stub with real dashboard
        users/
          page.tsx              CREATE — users table + search
          [id]/page.tsx         CREATE — user detail + actions
        withdrawals/
          page.tsx              CREATE — withdrawal processing
        tables/
          page.tsx              CREATE — poker table CRUD
```

---

## Task 1: Backend — Admin router scaffold + stats + missing user endpoints

**Files:**
- Create: `casino-backend/src/routes/admin.ts`
- Modify: `casino-backend/src/routes/user.ts`
- Modify: `casino-backend/src/app.ts`
- Create: `casino-backend/src/tests/routes/admin.routes.test.ts`

- [ ] **Step 1: Write the failing tests for stats endpoint and 403 checks**

Create `casino-backend/src/tests/routes/admin.routes.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../app'
import { prisma } from '../../config/prisma'

const app = createApp()

let userToken: string
let supportToken: string
let adminToken: string
let adminUserId: string

beforeEach(async () => {
  const uid = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

  // Clean up
  const emails = [`u${uid}@a.test`, `s${uid}@a.test`, `ad${uid}@a.test`]
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } })
  const ids = users.map(u => u.id)
  await prisma.withdrawalRequest.deleteMany({ where: { userId: { in: ids } } })
  await prisma.balanceTransaction.deleteMany({ where: { userId: { in: ids } } })
  await prisma.depositAddress.deleteMany({ where: { userId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })

  // Create USER
  const userReg = await request(app).post('/api/auth/register').send({
    email: `u${uid}@a.test`, username: `usr${uid}`.slice(0, 20), password: 'Password1!',
  })
  userToken = userReg.body.accessToken

  // Create SUPPORT
  const suppReg = await request(app).post('/api/auth/register').send({
    email: `s${uid}@a.test`, username: `sup${uid}`.slice(0, 20), password: 'Password1!',
  })
  const suppId = suppReg.body.user.id
  await prisma.user.update({ where: { id: suppId }, data: { role: 'SUPPORT' } })
  // Re-login to get token with updated role
  const suppLogin = await request(app).post('/api/auth/login').send({
    email: `s${uid}@a.test`, password: 'Password1!',
  })
  supportToken = suppLogin.body.accessToken

  // Create ADMIN
  const adminReg = await request(app).post('/api/auth/register').send({
    email: `ad${uid}@a.test`, username: `adm${uid}`.slice(0, 20), password: 'Password1!',
  })
  adminUserId = adminReg.body.user.id
  await prisma.user.update({ where: { id: adminUserId }, data: { role: 'ADMIN' } })
  const adminLogin = await request(app).post('/api/auth/login').send({
    email: `ad${uid}@a.test`, password: 'Password1!',
  })
  adminToken = adminLogin.body.accessToken
})

describe('Admin access control', () => {
  it('USER gets 403 on /api/admin/stats', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })

  it('no token gets 401 on /api/admin/stats', async () => {
    const res = await request(app).get('/api/admin/stats')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/admin/stats', () => {
  it('SUPPORT can access stats', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${supportToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      totalUsers: expect.any(Number),
      totalBalanceRub: expect.any(Number),
      pendingWithdrawals: expect.any(Number),
      pendingWithdrawalsRub: expect.any(Number),
      roundsToday: expect.any(Number),
      roundsWeek: expect.any(Number),
      topPlayers: expect.any(Array),
    })
  })

  it('ADMIN can access stats', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/pavel/crypto-casino/casino-backend && npx vitest run src/tests/routes/admin.routes.test.ts 2>&1 | tail -20
```

Expected: FAIL — `404` instead of `403` (route not registered yet).

- [ ] **Step 3: Create `src/routes/admin.ts` with stats endpoint**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { Role, WithdrawalStatus, TableStatus } from '@prisma/client'
import { prisma } from '../config/prisma'
import { requireRole } from '../middleware/admin'
import { creditBalance, debitBalance, InsufficientFundsError } from '../services/balance.service'
import { BalanceTxType } from '@prisma/client'

export const adminRouter = Router()

const ADMIN_SUPPORT = [Role.ADMIN, Role.SUPPORT]
const ADMIN_ONLY = [Role.ADMIN]

// GET /api/admin/stats — ADMIN + SUPPORT
adminRouter.get('/stats', requireRole(...ADMIN_SUPPORT), async (req, res) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

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
})
```

- [ ] **Step 4: Register adminRouter in `src/app.ts`**

Add import and route after the games route:

```typescript
import { adminRouter } from './routes/admin'
```

Add inside `createApp()` after `app.use('/api/games', gamesRouter)`:

```typescript
app.use('/api/admin', requireAuth, adminRouter)
```

Also add `requireAuth` to the import from `'./middleware/auth'`:
```typescript
import { requireAuth } from './middleware/auth'
```

- [ ] **Step 5: Add missing user endpoints to `src/routes/user.ts`**

Append to the existing file:

```typescript
userRouter.get('/poker-tables', requireAuth, async (_req, res) => {
  const tables = await prisma.pokerTable.findMany({
    where: { status: { not: TableStatus.FINISHED } },
    orderBy: { createdAt: 'asc' },
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
```

Add `TableStatus` to the import at the top of `user.ts`:
```typescript
import { TableStatus } from '@prisma/client'
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/pavel/crypto-casino/casino-backend && npx vitest run src/tests/routes/admin.routes.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 7: Commit and push**

```bash
git -C /Users/pavel/crypto-casino add casino-backend/src/routes/admin.ts casino-backend/src/routes/user.ts casino-backend/src/app.ts casino-backend/src/tests/routes/admin.routes.test.ts
git -C /Users/pavel/crypto-casino commit -m "feat: add admin router (stats) and missing user endpoints (poker-tables, rounds)"
git -C /Users/pavel/crypto-casino push origin main
```

---

## Task 2: Backend — User management endpoints

**Files:**
- Modify: `casino-backend/src/routes/admin.ts`
- Modify: `casino-backend/src/tests/routes/admin.routes.test.ts`

- [ ] **Step 1: Add tests for user management endpoints**

Append to `casino-backend/src/tests/routes/admin.routes.test.ts`:

```typescript
describe('GET /api/admin/users', () => {
  it('SUPPORT can list users', async () => {
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${supportToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ users: expect.any(Array), total: expect.any(Number), page: 1, pageSize: 20 })
  })

  it('USER gets 403', async () => {
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })

  it('search by username returns matching users', async () => {
    const res = await request(app)
      .get('/api/admin/users?search=adm')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.users.some((u: { username: string }) => u.username.includes('adm'))).toBe(true)
  })
})

describe('GET /api/admin/users/:id', () => {
  it('returns user detail with recentTxns', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${adminUserId}`)
      .set('Authorization', `Bearer ${supportToken}`)
    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(adminUserId)
    expect(res.body.recentTxns).toBeInstanceOf(Array)
  })

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/admin/users/nonexistent-id')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/users/:id/ban', () => {
  it('ADMIN can ban a user', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminUserId}/ban`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isBanned: true })
    expect(res.status).toBe(200)
    expect(res.body.user.isBanned).toBe(true)
  })

  it('SUPPORT gets 403 on ban', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminUserId}/ban`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ isBanned: true })
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/admin/users/:id/role', () => {
  it('ADMIN can change role', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'SUPPORT' })
    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('SUPPORT')
  })

  it('returns 400 for invalid role', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'SUPERADMIN' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/users/:id/credit', () => {
  it('ADMIN can credit balance', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${adminUserId}/credit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amountRub: 500, comment: 'Test credit' })
    expect(res.status).toBe(200)
    const user = await prisma.user.findUnique({ where: { id: adminUserId } })
    expect(Number(user!.balanceRub)).toBe(500)
  })

  it('returns 400 for non-positive amount', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${adminUserId}/credit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amountRub: 0 })
    expect(res.status).toBe(400)
  })

  it('SUPPORT gets 403 on credit', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${adminUserId}/credit`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ amountRub: 100 })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/admin/users/:id/debit', () => {
  it('ADMIN can debit balance', async () => {
    await prisma.user.update({ where: { id: adminUserId }, data: { balanceRub: 1000 } })
    const res = await request(app)
      .post(`/api/admin/users/${adminUserId}/debit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amountRub: 300 })
    expect(res.status).toBe(200)
    const user = await prisma.user.findUnique({ where: { id: adminUserId } })
    expect(Number(user!.balanceRub)).toBe(700)
  })

  it('returns 400 when balance insufficient', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${adminUserId}/debit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amountRub: 99999 })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/pavel/crypto-casino/casino-backend && npx vitest run src/tests/routes/admin.routes.test.ts 2>&1 | tail -30
```

Expected: FAIL — routes return 404.

- [ ] **Step 3: Add user management endpoints to `src/routes/admin.ts`**

Append after the stats endpoint:

```typescript
// GET /api/admin/users?page=1&search= — ADMIN + SUPPORT
adminRouter.get('/users', requireRole(...ADMIN_SUPPORT), async (req, res) => {
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
})

// GET /api/admin/users/:id — ADMIN + SUPPORT
adminRouter.get('/users/:id', requireRole(...ADMIN_SUPPORT), async (req, res) => {
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
})

// PATCH /api/admin/users/:id/ban — ADMIN only
adminRouter.patch('/users/:id/ban', requireRole(...ADMIN_ONLY), async (req, res) => {
  const { isBanned } = z.object({ isBanned: z.boolean() }).parse(req.body)
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isBanned },
    select: { id: true, username: true, isBanned: true },
  })
  res.json({ user })
})

// PATCH /api/admin/users/:id/role — ADMIN only
adminRouter.patch('/users/:id/role', requireRole(...ADMIN_ONLY), async (req, res) => {
  const parsed = z.object({ role: z.nativeEnum(Role) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid role' })

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { role: parsed.data.role },
    select: { id: true, username: true, role: true },
  })
  res.json({ user })
})

// POST /api/admin/users/:id/credit — ADMIN only
adminRouter.post('/users/:id/credit', requireRole(...ADMIN_ONLY), async (req, res) => {
  const parsed = z.object({ amountRub: z.number().positive(), comment: z.string().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'amountRub must be positive' })

  await creditBalance({
    userId: req.params.id,
    amountRub: parsed.data.amountRub,
    type: BalanceTxType.ADMIN_CREDIT,
    comment: parsed.data.comment,
  })
  res.json({ success: true })
})

// POST /api/admin/users/:id/debit — ADMIN only
adminRouter.post('/users/:id/debit', requireRole(...ADMIN_ONLY), async (req, res) => {
  const parsed = z.object({ amountRub: z.number().positive(), comment: z.string().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'amountRub must be positive' })

  try {
    await debitBalance({
      userId: req.params.id,
      amountRub: parsed.data.amountRub,
      type: BalanceTxType.ADMIN_DEBIT,
      comment: parsed.data.comment,
    })
    res.json({ success: true })
  } catch (err) {
    if (err instanceof InsufficientFundsError) return res.status(400).json({ error: 'Insufficient balance' })
    throw err
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/pavel/crypto-casino/casino-backend && npx vitest run src/tests/routes/admin.routes.test.ts 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git -C /Users/pavel/crypto-casino add casino-backend/src/routes/admin.ts casino-backend/src/tests/routes/admin.routes.test.ts
git -C /Users/pavel/crypto-casino commit -m "feat: admin user management endpoints (list, detail, ban, role, credit, debit)"
git -C /Users/pavel/crypto-casino push origin main
```

---

## Task 3: Backend — Withdrawal review endpoint

**Files:**
- Modify: `casino-backend/src/routes/admin.ts`
- Modify: `casino-backend/src/tests/routes/admin.routes.test.ts`

- [ ] **Step 1: Add tests for withdrawal endpoints**

Append to `casino-backend/src/tests/routes/admin.routes.test.ts`:

```typescript
describe('GET /api/admin/withdrawals', () => {
  it('SUPPORT can list withdrawals', async () => {
    const res = await request(app)
      .get('/api/admin/withdrawals')
      .set('Authorization', `Bearer ${supportToken}`)
    expect(res.status).toBe(200)
    expect(res.body.withdrawals).toBeInstanceOf(Array)
  })

  it('filters by status=ALL', async () => {
    const res = await request(app)
      .get('/api/admin/withdrawals?status=ALL')
      .set('Authorization', `Bearer ${supportToken}`)
    expect(res.status).toBe(200)
  })

  it('USER gets 403', async () => {
    const res = await request(app)
      .get('/api/admin/withdrawals')
      .set('Authorization', `Bearer ${userToken}`)
    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/admin/withdrawals/:id/review', () => {
  let withdrawalId: string

  beforeEach(async () => {
    // Create a withdrawal request directly (bypasses balance check)
    const uid = `${Date.now()}${Math.random().toString(36).slice(2, 5)}`
    const reg = await request(app).post('/api/auth/register').send({
      email: `wd${uid}@a.test`, username: `wdU${uid}`.slice(0, 20), password: 'Password1!',
    })
    const wdUserId = reg.body.user.id
    await prisma.user.update({ where: { id: wdUserId }, data: { balanceRub: 5000 } })
    const wd = await prisma.withdrawalRequest.create({
      data: { userId: wdUserId, amountRub: 1000, trc20Address: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9' },
    })
    withdrawalId = wd.id
  })

  it('ADMIN can approve withdrawal', async () => {
    const res = await request(app)
      .patch(`/api/admin/withdrawals/${withdrawalId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' })
    expect(res.status).toBe(200)
    expect(res.body.withdrawal.status).toBe('APPROVED')
    expect(res.body.withdrawal.reviewedBy).toBe(adminUserId)
  })

  it('SUPPORT can reject withdrawal with note', async () => {
    const res = await request(app)
      .patch(`/api/admin/withdrawals/${withdrawalId}/review`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ action: 'reject', reviewNote: 'Invalid address' })
    expect(res.status).toBe(200)
    expect(res.body.withdrawal.status).toBe('REJECTED')
    expect(res.body.withdrawal.reviewNote).toBe('Invalid address')
  })

  it('returns 400 when rejecting without reviewNote', async () => {
    const res = await request(app)
      .patch(`/api/admin/withdrawals/${withdrawalId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'reject' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid action', async () => {
    const res = await request(app)
      .patch(`/api/admin/withdrawals/${withdrawalId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'delete' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/pavel/crypto-casino/casino-backend && npx vitest run src/tests/routes/admin.routes.test.ts 2>&1 | tail -20
```

Expected: new withdrawal tests FAIL with 404.

- [ ] **Step 3: Add withdrawal endpoints to `src/routes/admin.ts`**

Append after the debit endpoint:

```typescript
// GET /api/admin/withdrawals?status=PENDING — ADMIN + SUPPORT
adminRouter.get('/withdrawals', requireRole(...ADMIN_SUPPORT), async (req, res) => {
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
})

const reviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), reviewNote: z.string().optional() }),
  z.object({ action: z.literal('reject'), reviewNote: z.string().min(1) }),
])

// PATCH /api/admin/withdrawals/:id/review — ADMIN + SUPPORT
adminRouter.patch('/withdrawals/:id/review', requireRole(...ADMIN_SUPPORT), async (req, res) => {
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
})
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/pavel/crypto-casino/casino-backend && npx vitest run src/tests/routes/admin.routes.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git -C /Users/pavel/crypto-casino add casino-backend/src/routes/admin.ts casino-backend/src/tests/routes/admin.routes.test.ts
git -C /Users/pavel/crypto-casino commit -m "feat: admin withdrawal review endpoints (list, approve/reject)"
git -C /Users/pavel/crypto-casino push origin main
```

---

## Task 4: Backend — Poker table CRUD

**Files:**
- Modify: `casino-backend/src/routes/admin.ts`
- Modify: `casino-backend/src/tests/routes/admin.routes.test.ts`

- [ ] **Step 1: Add tests for poker table CRUD**

Append to `casino-backend/src/tests/routes/admin.routes.test.ts`:

```typescript
describe('Poker table CRUD', () => {
  let tableId: string

  it('ADMIN can create a table', async () => {
    const res = await request(app)
      .post('/api/admin/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Table', minBetRub: 100, maxBetRub: 5000, maxPlayers: 6, rake: 0.05 })
    expect(res.status).toBe(201)
    expect(res.body.table.name).toBe('Test Table')
    tableId = res.body.table.id
  })

  it('SUPPORT gets 403 on table create', async () => {
    const res = await request(app)
      .post('/api/admin/tables')
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ name: 'X', minBetRub: 100, maxBetRub: 1000, maxPlayers: 6, rake: 0.05 })
    expect(res.status).toBe(403)
  })

  it('returns 400 when minBetRub > maxBetRub', async () => {
    const res = await request(app)
      .post('/api/admin/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad', minBetRub: 5000, maxBetRub: 100, maxPlayers: 6, rake: 0.05 })
    expect(res.status).toBe(400)
  })

  it('ADMIN can list tables', async () => {
    const res = await request(app)
      .get('/api/admin/tables')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.tables).toBeInstanceOf(Array)
  })

  it('ADMIN can update a table', async () => {
    // Create a table first
    const create = await request(app)
      .post('/api/admin/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Edit Me', minBetRub: 100, maxBetRub: 1000, maxPlayers: 4, rake: 0.05 })
    const id = create.body.table.id

    const res = await request(app)
      .patch(`/api/admin/tables/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated', maxPlayers: 6 })
    expect(res.status).toBe(200)
    expect(res.body.table.name).toBe('Updated')
    expect(res.body.table.maxPlayers).toBe(6)
  })

  it('ADMIN can delete a table', async () => {
    const create = await request(app)
      .post('/api/admin/tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Delete Me', minBetRub: 100, maxBetRub: 1000, maxPlayers: 6, rake: 0.05 })
    const id = create.body.table.id

    const res = await request(app)
      .delete(`/api/admin/tables/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(204)

    const check = await prisma.pokerTable.findUnique({ where: { id } })
    expect(check).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/pavel/crypto-casino/casino-backend && npx vitest run src/tests/routes/admin.routes.test.ts 2>&1 | tail -20
```

Expected: new table tests FAIL with 404.

- [ ] **Step 3: Add poker table CRUD to `src/routes/admin.ts`**

Append after the withdrawal review endpoint:

```typescript
const tableSchema = z.object({
  name: z.string().min(1).max(50),
  minBetRub: z.number().positive(),
  maxBetRub: z.number().positive(),
  maxPlayers: z.number().int().min(2).max(9),
  rake: z.number().min(0).max(0.1),
})

// GET /api/admin/tables — ADMIN only
adminRouter.get('/tables', requireRole(...ADMIN_ONLY), async (_req, res) => {
  const tables = await prisma.pokerTable.findMany({ orderBy: { createdAt: 'asc' } })
  res.json({ tables: tables.map(t => ({ ...t, minBetRub: Number(t.minBetRub), maxBetRub: Number(t.maxBetRub) })) })
})

// POST /api/admin/tables — ADMIN only
adminRouter.post('/tables', requireRole(...ADMIN_ONLY), async (req, res) => {
  const parsed = tableSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { name, minBetRub, maxBetRub, maxPlayers, rake } = parsed.data
  if (minBetRub > maxBetRub) return res.status(400).json({ error: 'minBetRub must be ≤ maxBetRub' })

  const table = await prisma.pokerTable.create({
    data: { name, minBetRub, maxBetRub, maxPlayers, rake, status: TableStatus.WAITING },
  })
  res.status(201).json({ table: { ...table, minBetRub: Number(table.minBetRub), maxBetRub: Number(table.maxBetRub) } })
})

// PATCH /api/admin/tables/:id — ADMIN only
adminRouter.patch('/tables/:id', requireRole(...ADMIN_ONLY), async (req, res) => {
  const parsed = tableSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const table = await prisma.pokerTable.update({
    where: { id: req.params.id },
    data: parsed.data,
  })
  res.json({ table: { ...table, minBetRub: Number(table.minBetRub), maxBetRub: Number(table.maxBetRub) } })
})

// DELETE /api/admin/tables/:id — ADMIN only
adminRouter.delete('/tables/:id', requireRole(...ADMIN_ONLY), async (req, res) => {
  await prisma.pokerTable.delete({ where: { id: req.params.id } })
  res.status(204).send()
})
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/pavel/crypto-casino/casino-backend && npx vitest run src/tests/routes/admin.routes.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/pavel/crypto-casino/casino-backend && npm test 2>&1 | tail -20
```

Expected: all suites pass. Fix any regressions.

- [ ] **Step 6: Commit and push**

```bash
git -C /Users/pavel/crypto-casino add casino-backend/src/routes/admin.ts casino-backend/src/tests/routes/admin.routes.test.ts
git -C /Users/pavel/crypto-casino commit -m "feat: admin poker table CRUD endpoints"
git -C /Users/pavel/crypto-casino push origin main
```

---

## Task 5: Frontend — Admin layout + dashboard

**Files:**
- Create: `casino-frontend/src/app/admin/layout.tsx`
- Modify: `casino-frontend/src/app/admin/page.tsx`

- [ ] **Step 1: Write `src/app/admin/layout.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

const NAV = [
  { href: '/admin', label: 'Дашборд' },
  { href: '/admin/users', label: 'Пользователи' },
  { href: '/admin/withdrawals', label: 'Выводы' },
  { href: '/admin/tables', label: 'Столы' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const pathname = usePathname()

  if (!user || user.role === 'USER') return null

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-48 flex-shrink-0 border-r border-casino-border bg-casino-dark p-4 flex flex-col gap-1">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-4">Admin</p>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded text-sm transition-colors ${
              pathname === item.href
                ? 'text-casino-cyan bg-casino-cyan/10'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {item.label}
          </Link>
        ))}
        <div className="mt-auto pt-4 border-t border-casino-border">
          <Link href="/" className="block px-3 py-2 text-xs text-gray-600 hover:text-gray-400">
            ← На сайт
          </Link>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `src/app/admin/page.tsx` as real dashboard**

```tsx
'use client'
import { useEffect, useState } from 'react'
import axios from 'axios'
import api from '@/lib/api'

interface Stats {
  totalUsers: number
  totalBalanceRub: number
  pendingWithdrawals: number
  pendingWithdrawalsRub: number
  roundsToday: number
  roundsWeek: number
  topPlayers: { username: string; balanceRub: number }[]
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.get<Stats>('/api/admin/stats', { signal: controller.signal })
      .then((r) => setStats(r.data))
      .catch((err) => { if (!axios.isCancel(err)) setError('Не удалось загрузить статистику') })
    return () => controller.abort()
  }, [])

  if (error) return <p className="text-red-400">{error}</p>
  if (!stats) return <p className="text-gray-400">Загрузка...</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Дашборд</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Пользователей" value={stats.totalUsers.toLocaleString('ru-RU')} />
        <StatCard label="Суммарный баланс" value={`${stats.totalBalanceRub.toLocaleString('ru-RU')} ₽`} />
        <StatCard
          label="Выводы ожидают"
          value={`${stats.pendingWithdrawals} (${stats.pendingWithdrawalsRub.toLocaleString('ru-RU')} ₽)`}
        />
        <StatCard label="Раундов за неделю" value={stats.roundsWeek.toLocaleString('ru-RU')} />
      </div>

      <div className="card">
        <h2 className="text-lg font-bold text-white mb-4">Топ игроков по балансу</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left">
              <th className="pb-2">#</th>
              <th className="pb-2">Игрок</th>
              <th className="pb-2 text-right">Баланс</th>
            </tr>
          </thead>
          <tbody>
            {stats.topPlayers.map((p, i) => (
              <tr key={p.username} className="border-t border-casino-border">
                <td className="py-2 text-gray-600">{i + 1}</td>
                <td className="py-2 text-white">{p.username}</td>
                <td className="py-2 text-right text-casino-cyan">{p.balanceRub.toLocaleString('ru-RU')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/pavel/crypto-casino/casino-frontend && npx tsc --noEmit 2>&1
```

Fix any errors.

- [ ] **Step 4: Commit and push**

```bash
git -C /Users/pavel/crypto-casino add casino-frontend/src/app/admin/
git -C /Users/pavel/crypto-casino commit -m "feat: admin layout sidebar + dashboard with live stats"
git -C /Users/pavel/crypto-casino push origin main
```

---

## Task 6: Frontend — Users list + user detail

**Files:**
- Create: `casino-frontend/src/app/admin/users/page.tsx`
- Create: `casino-frontend/src/app/admin/users/[id]/page.tsx`

- [ ] **Step 1: Write `src/app/admin/users/page.tsx`**

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import axios from 'axios'
import api from '@/lib/api'

interface AdminUser {
  id: string
  email: string
  username: string
  role: string
  balanceRub: number
  isBanned: boolean
  createdAt: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Debounce search input 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadUsers = useCallback(() => {
    const controller = new AbortController()
    setLoading(true)
    api.get<{ users: AdminUser[]; total: number; page: number; pageSize: number }>(
      `/api/admin/users?page=${page}&search=${encodeURIComponent(debouncedSearch)}`,
      { signal: controller.signal },
    )
      .then((r) => { setUsers(r.data.users); setTotal(r.data.total) })
      .catch((err) => { if (!axios.isCancel(err)) setError('Ошибка загрузки') })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [page, debouncedSearch])

  useEffect(() => { loadUsers() }, [loadUsers])

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Пользователи</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        className="input-field max-w-sm"
        placeholder="Поиск по email или username..."
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-casino-border">
              <th className="pb-3 pr-4">Пользователь</th>
              <th className="pb-3 pr-4">Email</th>
              <th className="pb-3 pr-4">Роль</th>
              <th className="pb-3 pr-4">Баланс</th>
              <th className="pb-3 pr-4">Статус</th>
              <th className="pb-3">Зарегистрирован</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">Загрузка...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">Нет пользователей</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-b border-casino-border hover:bg-white/5 cursor-pointer">
                <td className="py-3 pr-4">
                  <Link href={`/admin/users/${u.id}`} className="text-casino-cyan hover:underline font-medium">
                    {u.username}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-gray-400">{u.email}</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    u.role === 'ADMIN' ? 'bg-red-900/30 text-red-400' :
                    u.role === 'SUPPORT' ? 'bg-yellow-900/30 text-yellow-400' :
                    'bg-gray-800 text-gray-400'
                  }`}>{u.role}</span>
                </td>
                <td className="py-3 pr-4 text-white">{u.balanceRub.toLocaleString('ru-RU')} ₽</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.isBanned ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'}`}>
                    {u.isBanned ? 'Забанен' : 'Активен'}
                  </span>
                </td>
                <td className="py-3 text-gray-500 text-xs">{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-primary py-1 px-3 text-sm disabled:opacity-50"
          >
            ←
          </button>
          <span className="text-gray-400 text-sm">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-primary py-1 px-3 text-sm disabled:opacity-50"
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write `src/app/admin/users/[id]/page.tsx`**

```tsx
'use client'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'

interface AdminUserDetail {
  id: string
  email: string
  username: string
  role: string
  balanceRub: number
  isBanned: boolean
  createdAt: string
}

interface TxnRow {
  id: string
  type: string
  amountRub: number
  comment?: string
  createdAt: string
}

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: 'Депозит', ADMIN_CREDIT: 'Начисление (admin)', ADMIN_DEBIT: 'Списание (admin)',
  GAME_WIN: 'Выигрыш', GAME_LOSS: 'Ставка', WITHDRAWAL: 'Вывод',
}
const POSITIVE_TYPES = new Set(['DEPOSIT', 'ADMIN_CREDIT', 'GAME_WIN'])

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const adminUser = useAuthStore((s) => s.user)
  const isAdmin = adminUser?.role === 'ADMIN'

  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [txns, setTxns] = useState<TxnRow[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const [creditAmount, setCreditAmount] = useState('')
  const [creditComment, setCreditComment] = useState('')
  const [debitAmount, setDebitAmount] = useState('')
  const [debitComment, setDebitComment] = useState('')
  const [selectedRole, setSelectedRole] = useState('')

  const load = () => {
    api.get<{ user: AdminUserDetail; recentTxns: TxnRow[] }>(`/api/admin/users/${id}`)
      .then((r) => { setUser(r.data.user); setTxns(r.data.recentTxns); setSelectedRole(r.data.user.role) })
      .catch(() => setError('Не удалось загрузить пользователя'))
  }

  useEffect(() => { load() }, [id])

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const toggleBan = async () => {
    if (!user) return
    await api.patch(`/api/admin/users/${id}/ban`, { isBanned: !user.isBanned })
    flash(user.isBanned ? 'Разбанен' : 'Забанен')
    load()
  }

  const changeRole = async () => {
    await api.patch(`/api/admin/users/${id}/role`, { role: selectedRole })
    flash('Роль изменена')
    load()
  }

  const credit = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.post(`/api/admin/users/${id}/credit`, { amountRub: Number(creditAmount), comment: creditComment || undefined })
    flash(`Зачислено ${creditAmount} ₽`)
    setCreditAmount(''); setCreditComment('')
    load()
  }

  const debit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post(`/api/admin/users/${id}/debit`, { amountRub: Number(debitAmount), comment: debitComment || undefined })
      flash(`Списано ${debitAmount} ₽`)
      setDebitAmount(''); setDebitComment('')
      load()
    } catch (err) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.error ?? 'Ошибка')
    }
  }

  if (error) return <p className="text-red-400">{error}</p>
  if (!user) return <p className="text-gray-400">Загрузка...</p>

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/admin/users')} className="text-gray-500 hover:text-white text-sm">← Назад</button>
        <h1 className="text-2xl font-bold text-white">{user.username}</h1>
      </div>

      {msg && <p className="text-green-400 text-sm bg-green-900/20 border border-green-800 rounded px-3 py-2">{msg}</p>}

      {/* User info */}
      <div className="card space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-gray-400">Email</span><span className="text-white">{user.email}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Роль</span><span className="text-white">{user.role}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Баланс</span><span className="text-casino-cyan font-bold">{user.balanceRub.toLocaleString('ru-RU')} ₽</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Статус</span><span className={user.isBanned ? 'text-red-400' : 'text-green-400'}>{user.isBanned ? 'Забанен' : 'Активен'}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">ID</span><span className="text-gray-600 font-mono text-xs">{user.id}</span></div>
      </div>

      {/* Admin actions */}
      {isAdmin && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Ban */}
          <div className="card">
            <h3 className="font-bold text-white mb-3">Бан</h3>
            <button onClick={toggleBan} className={user.isBanned ? 'btn-primary w-full' : 'btn-danger w-full'}>
              {user.isBanned ? 'Разбанить' : 'Забанить'}
            </button>
          </div>

          {/* Role */}
          <div className="card">
            <h3 className="font-bold text-white mb-3">Роль</h3>
            <div className="flex gap-2">
              <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="input-field flex-1 text-sm">
                <option value="USER">USER</option>
                <option value="SUPPORT">SUPPORT</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <button onClick={changeRole} className="btn-primary px-3 text-sm">Сохранить</button>
            </div>
          </div>

          {/* Credit */}
          <div className="card">
            <h3 className="font-bold text-white mb-3">Зачислить</h3>
            <form onSubmit={credit} className="space-y-2">
              <input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} className="input-field text-sm" placeholder="Сумма ₽" min={1} required />
              <input type="text" value={creditComment} onChange={(e) => setCreditComment(e.target.value)} className="input-field text-sm" placeholder="Комментарий (необязательно)" />
              <button type="submit" className="btn-cyan w-full text-sm">Зачислить</button>
            </form>
          </div>

          {/* Debit */}
          <div className="card">
            <h3 className="font-bold text-white mb-3">Списать</h3>
            <form onSubmit={debit} className="space-y-2">
              <input type="number" value={debitAmount} onChange={(e) => setDebitAmount(e.target.value)} className="input-field text-sm" placeholder="Сумма ₽" min={1} required />
              <input type="text" value={debitComment} onChange={(e) => setDebitComment(e.target.value)} className="input-field text-sm" placeholder="Комментарий (необязательно)" />
              <button type="submit" className="btn-danger w-full text-sm">Списать</button>
            </form>
          </div>
        </div>
      )}

      {/* Transactions */}
      <div className="card">
        <h2 className="text-lg font-bold text-white mb-4">Последние транзакции</h2>
        {txns.length === 0 ? (
          <p className="text-gray-500 text-sm">Нет транзакций</p>
        ) : (
          <div className="space-y-1">
            {txns.map((tx) => {
              const isPos = POSITIVE_TYPES.has(tx.type)
              return (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-casino-border last:border-0">
                  <div>
                    <p className="text-sm text-white">{TYPE_LABEL[tx.type] ?? tx.type}</p>
                    {tx.comment && <p className="text-xs text-gray-500">{tx.comment}</p>}
                    <p className="text-xs text-gray-600">{new Date(tx.createdAt).toLocaleString('ru-RU')}</p>
                  </div>
                  <span className={`font-bold text-sm ${isPos ? 'text-casino-cyan' : 'text-red-400'}`}>
                    {isPos ? '+' : '-'}{Math.abs(tx.amountRub).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/pavel/crypto-casino/casino-frontend && npx tsc --noEmit 2>&1
```

Fix any errors.

- [ ] **Step 4: Commit and push**

```bash
git -C /Users/pavel/crypto-casino add casino-frontend/src/app/admin/users/
git -C /Users/pavel/crypto-casino commit -m "feat: admin users list and user detail pages"
git -C /Users/pavel/crypto-casino push origin main
```

---

## Task 7: Frontend — Withdrawals page

**Files:**
- Create: `casino-frontend/src/app/admin/withdrawals/page.tsx`

- [ ] **Step 1: Write `src/app/admin/withdrawals/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import axios from 'axios'
import api from '@/lib/api'

interface Withdrawal {
  id: string
  amountRub: number
  trc20Address: string
  status: string
  createdAt: string
  reviewNote?: string
  user: { username: string; email: string }
}

const STATUS_TABS = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const
type StatusTab = typeof STATUS_TABS[number]

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Ожидает', APPROVED: 'Одобрен', REJECTED: 'Отклонён',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'text-yellow-400 bg-yellow-900/30',
  APPROVED: 'text-green-400 bg-green-900/30',
  REJECTED: 'text-red-400 bg-red-900/30',
}

export default function AdminWithdrawalsPage() {
  const [tab, setTab] = useState<StatusTab>('PENDING')
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal state
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve')
  const [reviewNote, setReviewNote] = useState('')
  const [reviewError, setReviewError] = useState('')

  const load = () => {
    const controller = new AbortController()
    setLoading(true)
    api.get<{ withdrawals: Withdrawal[] }>(`/api/admin/withdrawals?status=${tab}`, { signal: controller.signal })
      .then((r) => setWithdrawals(r.data.withdrawals))
      .catch((err) => { if (!axios.isCancel(err)) setError('Ошибка загрузки') })
      .finally(() => setLoading(false))
    return controller
  }

  useEffect(() => { const c = load(); return () => c.abort() }, [tab])

  const openModal = (id: string, action: 'approve' | 'reject') => {
    setReviewing(id)
    setReviewAction(action)
    setReviewNote('')
    setReviewError('')
  }

  const submitReview = async () => {
    if (!reviewing) return
    if (reviewAction === 'reject' && !reviewNote.trim()) {
      setReviewError('Укажите причину отказа')
      return
    }
    try {
      await api.patch(`/api/admin/withdrawals/${reviewing}/review`, {
        action: reviewAction,
        reviewNote: reviewNote.trim() || undefined,
      })
      setReviewing(null)
      load()
    } catch (err) {
      if (axios.isAxiosError(err)) setReviewError(err.response?.data?.error ?? 'Ошибка')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Выводы средств</h1>

      {/* Status tabs */}
      <div className="flex gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-4 py-1.5 rounded text-sm transition-colors ${
              tab === s ? 'bg-casino-purple text-white' : 'text-gray-400 hover:text-white border border-casino-border'
            }`}
          >
            {s === 'ALL' ? 'Все' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-casino-border">
              <th className="pb-3 pr-4">Игрок</th>
              <th className="pb-3 pr-4">Сумма</th>
              <th className="pb-3 pr-4">TRC20 адрес</th>
              <th className="pb-3 pr-4">Дата</th>
              <th className="pb-3 pr-4">Статус</th>
              <th className="pb-3">Действие</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">Загрузка...</td></tr>
            ) : withdrawals.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">Нет заявок</td></tr>
            ) : withdrawals.map((w) => (
              <tr key={w.id} className="border-b border-casino-border">
                <td className="py-3 pr-4">
                  <p className="text-white">{w.user.username}</p>
                  <p className="text-xs text-gray-500">{w.user.email}</p>
                </td>
                <td className="py-3 pr-4 font-bold text-casino-cyan">{w.amountRub.toLocaleString('ru-RU')} ₽</td>
                <td className="py-3 pr-4 font-mono text-xs text-gray-400 break-all max-w-32">{w.trc20Address}</td>
                <td className="py-3 pr-4 text-gray-500 text-xs">{new Date(w.createdAt).toLocaleString('ru-RU')}</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[w.status] ?? 'text-gray-400 bg-gray-800'}`}>
                    {STATUS_LABEL[w.status] ?? w.status}
                  </span>
                  {w.reviewNote && <p className="text-xs text-gray-600 mt-1 max-w-32 truncate" title={w.reviewNote}>{w.reviewNote}</p>}
                </td>
                <td className="py-3">
                  {w.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button onClick={() => openModal(w.id, 'approve')} className="btn-cyan text-xs py-1 px-2">Одобрить</button>
                      <button onClick={() => openModal(w.id, 'reject')} className="btn-danger text-xs py-1 px-2">Отклонить</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Review modal */}
      {reviewing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card w-full max-w-md mx-4">
            <h2 className="text-lg font-bold text-white mb-4">
              {reviewAction === 'approve' ? '✅ Одобрить вывод' : '❌ Отклонить вывод'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 block mb-1">
                  {reviewAction === 'reject' ? 'Причина отказа (обязательно)' : 'Комментарий (необязательно)'}
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="input-field w-full h-24 resize-none text-sm"
                  placeholder={reviewAction === 'reject' ? 'Укажите причину...' : 'Необязательно...'}
                />
              </div>
              {reviewError && <p className="text-red-400 text-sm">{reviewError}</p>}
              <div className="flex gap-3">
                <button onClick={submitReview} className={reviewAction === 'approve' ? 'btn-cyan flex-1' : 'btn-danger flex-1'}>
                  Подтвердить
                </button>
                <button onClick={() => setReviewing(null)} className="border border-casino-border text-gray-400 rounded px-4 py-2 hover:text-white transition-colors">
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/pavel/crypto-casino/casino-frontend && npx tsc --noEmit 2>&1
```

Fix any errors.

- [ ] **Step 3: Commit and push**

```bash
git -C /Users/pavel/crypto-casino add casino-frontend/src/app/admin/withdrawals/
git -C /Users/pavel/crypto-casino commit -m "feat: admin withdrawals page with approve/reject modal"
git -C /Users/pavel/crypto-casino push origin main
```

---

## Task 8: Frontend — Poker tables CRUD + final build

**Files:**
- Create: `casino-frontend/src/app/admin/tables/page.tsx`

- [ ] **Step 1: Write `src/app/admin/tables/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import axios from 'axios'
import api from '@/lib/api'

interface PokerTable {
  id: string
  name: string
  minBetRub: number
  maxBetRub: number
  maxPlayers: number
  rake: number
  status: string
}

interface TableForm {
  name: string
  minBetRub: string
  maxBetRub: string
  maxPlayers: string
  rake: string
}

const EMPTY_FORM: TableForm = { name: '', minBetRub: '', maxBetRub: '', maxPlayers: '6', rake: '5' }

const STATUS_COLOR: Record<string, string> = {
  WAITING: 'text-yellow-400 bg-yellow-900/30',
  ACTIVE: 'text-green-400 bg-green-900/30',
  FINISHED: 'text-gray-400 bg-gray-800',
}
const STATUS_LABEL: Record<string, string> = { WAITING: 'Ожидание', ACTIVE: 'Активный', FINISHED: 'Закончен' }

export default function AdminTablesPage() {
  const [tables, setTables] = useState<PokerTable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')

  const [editing, setEditing] = useState<string | null>(null) // tableId or 'new'
  const [form, setForm] = useState<TableForm>(EMPTY_FORM)

  const load = () => {
    api.get<{ tables: PokerTable[] }>('/api/admin/tables')
      .then((r) => setTables(r.data.tables))
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing('new'); setForm(EMPTY_FORM); setFormError('') }

  const openEdit = (t: PokerTable) => {
    setEditing(t.id)
    setForm({
      name: t.name,
      minBetRub: String(t.minBetRub),
      maxBetRub: String(t.maxBetRub),
      maxPlayers: String(t.maxPlayers),
      rake: String(t.rake * 100),
    })
    setFormError('')
  }

  const closeForm = () => { setEditing(null); setFormError('') }

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    const payload = {
      name: form.name,
      minBetRub: Number(form.minBetRub),
      maxBetRub: Number(form.maxBetRub),
      maxPlayers: Number(form.maxPlayers),
      rake: Number(form.rake) / 100,
    }

    try {
      if (editing === 'new') {
        await api.post('/api/admin/tables', payload)
      } else {
        await api.patch(`/api/admin/tables/${editing}`, payload)
      }
      closeForm()
      load()
    } catch (err) {
      if (axios.isAxiosError(err)) setFormError(err.response?.data?.error ?? 'Ошибка')
    }
  }

  const deleteTable = async (id: string, name: string) => {
    if (!confirm(`Удалить стол "${name}"?`)) return
    try {
      await api.delete(`/api/admin/tables/${id}`)
      load()
    } catch {
      setError('Ошибка удаления')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Покерные столы</h1>
        <button onClick={openCreate} className="btn-primary py-2 px-4 text-sm">+ Создать стол</button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Create / Edit form */}
      {editing && (
        <div className="card">
          <h2 className="text-lg font-bold text-white mb-4">{editing === 'new' ? 'Новый стол' : 'Редактировать стол'}</h2>
          <form onSubmit={submitForm} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Название</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field w-full" placeholder="VIP стол" required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Мин. ставка (₽)</label>
              <input type="number" value={form.minBetRub} onChange={(e) => setForm({ ...form, minBetRub: e.target.value })}
                className="input-field w-full" placeholder="100" min={1} required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Макс. ставка (₽)</label>
              <input type="number" value={form.maxBetRub} onChange={(e) => setForm({ ...form, maxBetRub: e.target.value })}
                className="input-field w-full" placeholder="10000" min={1} required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Макс. игроков (2-9)</label>
              <input type="number" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: e.target.value })}
                className="input-field w-full" min={2} max={9} required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Рейк (%)</label>
              <input type="number" value={form.rake} onChange={(e) => setForm({ ...form, rake: e.target.value })}
                className="input-field w-full" placeholder="5" min={0} max={10} step={0.5} required />
            </div>
            {formError && <p className="col-span-2 text-red-400 text-sm">{formError}</p>}
            <div className="col-span-2 flex gap-3">
              <button type="submit" className="btn-primary px-6">{editing === 'new' ? 'Создать' : 'Сохранить'}</button>
              <button type="button" onClick={closeForm} className="border border-casino-border text-gray-400 rounded px-4 py-2 hover:text-white transition-colors">
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-casino-border">
              <th className="pb-3 pr-4">Название</th>
              <th className="pb-3 pr-4">Ставки</th>
              <th className="pb-3 pr-4">Игроков</th>
              <th className="pb-3 pr-4">Рейк</th>
              <th className="pb-3 pr-4">Статус</th>
              <th className="pb-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">Загрузка...</td></tr>
            ) : tables.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">Нет столов</td></tr>
            ) : tables.map((t) => (
              <tr key={t.id} className="border-b border-casino-border">
                <td className="py-3 pr-4 font-medium text-white">{t.name}</td>
                <td className="py-3 pr-4 text-gray-400">
                  {t.minBetRub.toLocaleString('ru-RU')} – {t.maxBetRub.toLocaleString('ru-RU')} ₽
                </td>
                <td className="py-3 pr-4 text-gray-400">{t.maxPlayers}</td>
                <td className="py-3 pr-4 text-gray-400">{(t.rake * 100).toFixed(1)}%</td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[t.status] ?? 'text-gray-400 bg-gray-800'}`}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(t)} className="text-xs text-casino-cyan hover:underline">Изменить</button>
                    <button onClick={() => deleteTable(t.id, t.name)} className="text-xs text-red-400 hover:underline">Удалить</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/pavel/crypto-casino/casino-frontend && npx tsc --noEmit 2>&1
```

Fix any errors.

- [ ] **Step 3: Production build**

```bash
cd /Users/pavel/crypto-casino/casino-frontend && npm run build 2>&1 | tail -30
```

Expected: successful build with all routes compiled. Fix any build errors before committing.

- [ ] **Step 4: Commit and push**

```bash
git -C /Users/pavel/crypto-casino add casino-frontend/src/app/admin/
git -C /Users/pavel/crypto-casino commit -m "feat: admin poker tables CRUD page; frontend build passes"
git -C /Users/pavel/crypto-casino push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Stats: totalUsers, totalBalanceRub, pendingWithdrawals, pendingWithdrawalsRub, roundsToday, roundsWeek, topPlayers
- ✅ Users: list with search/pagination, detail with txn history, ban/unban, role change, credit, debit
- ✅ Withdrawals: list with status filter, approve/reject with reviewNote
- ✅ Poker tables: CRUD (create, list, edit, delete)
- ✅ Role tiers: ADMIN+SUPPORT for reads/withdrawals; ADMIN-only for mutations on users and tables
- ✅ Dashboard: 4 stat cards + top-5 players table
- ✅ Admin layout: sidebar nav with role guard (null for USER role)
- ✅ Missing user endpoints: `/api/user/poker-tables` and `/api/user/rounds` added in Task 1
- ✅ All commits pushed to main

**Placeholder scan:** No TBD, TODO, or vague steps. Every code step contains complete implementations.

**Type consistency:**
- `AdminUser` interface in users/page.tsx matches `/api/admin/users` response shape (`{ users, total, page, pageSize }`)
- `Withdrawal` includes `user: { username, email }` — matches backend `include: { user: ... }`
- `PokerTable` interface matches `{ id, name, minBetRub, maxBetRub, maxPlayers, rake, status }` — matches backend response
- `rake` stored as 0-0.1 in DB, displayed as 0-10% in UI (multiplied by 100) — consistent in both edit form and table display
- `requireRole(...ADMIN_SUPPORT)` and `requireRole(...ADMIN_ONLY)` arrays defined once at the top of admin.ts, used throughout — no duplication risk

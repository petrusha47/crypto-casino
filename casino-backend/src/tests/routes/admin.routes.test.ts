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

  // Create SUPPORT (register then update role + re-login for fresh token)
  const suppReg = await request(app).post('/api/auth/register').send({
    email: `s${uid}@a.test`, username: `sup${uid}`.slice(0, 20), password: 'Password1!',
  })
  const suppId = suppReg.body.user.id
  await prisma.user.update({ where: { id: suppId }, data: { role: 'SUPPORT' } })
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

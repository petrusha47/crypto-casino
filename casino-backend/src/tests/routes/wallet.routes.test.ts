import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../app'
import { prisma } from '../../config/prisma'

const app = createApp()

let accessToken: string
let userId: string

beforeEach(async () => {
  const uid = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`
  // Delete related records first to avoid FK constraint violations
  const testUsers = await prisma.user.findMany({ where: { email: { contains: '@wallet.test' } }, select: { id: true } })
  const testUserIds = testUsers.map(u => u.id)
  await prisma.depositAddress.deleteMany({ where: { userId: { in: testUserIds } } })
  await prisma.withdrawalRequest.deleteMany({ where: { userId: { in: testUserIds } } })
  await prisma.balanceTransaction.deleteMany({ where: { userId: { in: testUserIds } } })
  await prisma.user.deleteMany({ where: { email: { contains: '@wallet.test' } } })

  const reg = await request(app).post('/api/auth/register').send({
    email: `user${uid}@wallet.test`,
    username: `wtest${uid}`.slice(0, 20),
    password: 'Password1!',
  })
  accessToken = reg.body.accessToken
  userId = reg.body.user.id
})

describe('GET /api/wallet/deposit-address', () => {
  it('returns a TRC20 address starting with T', async () => {
    const res = await request(app)
      .get('/api/wallet/deposit-address')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(res.status).toBe(200)
    expect(res.body.address).toMatch(/^T/)
    expect(res.body.address).toHaveLength(34)
  })

  it('returns the same address on second call', async () => {
    const r1 = await request(app)
      .get('/api/wallet/deposit-address')
      .set('Authorization', `Bearer ${accessToken}`)
    const r2 = await request(app)
      .get('/api/wallet/deposit-address')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(r1.body.address).toBe(r2.body.address)
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/wallet/deposit-address')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/wallet/transactions', () => {
  it('returns empty array for new user', async () => {
    const res = await request(app)
      .get('/api/wallet/transactions')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(res.status).toBe(200)
    expect(res.body.transactions).toEqual([])
  })
})

describe('POST /api/wallet/withdraw', () => {
  it('returns 400 when amount exceeds balance', async () => {
    const res = await request(app)
      .post('/api/wallet/withdraw')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amountRub: 1000, trc20Address: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/insufficient/i)
  })

  it('returns 400 for invalid TRC20 address', async () => {
    const res = await request(app)
      .post('/api/wallet/withdraw')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amountRub: 100, trc20Address: '0xinvalidaddress' })

    expect(res.status).toBe(400)
  })

  it('creates withdrawal request when balance is sufficient', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { balanceRub: 5000 },
    })

    const res = await request(app)
      .post('/api/wallet/withdraw')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ amountRub: 1000, trc20Address: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9' })

    expect(res.status).toBe(201)
    expect(res.body.withdrawal.status).toBe('PENDING')
    expect(Number(res.body.withdrawal.amountRub)).toBe(1000)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(Number(user!.balanceRub)).toBe(4000)
  })
})

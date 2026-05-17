import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../app'
import { prisma } from '../../config/prisma'
import { redis } from '../../config/redis'

const app = createApp()
let token: string
let userId: string

beforeEach(async () => {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  // Delete related records first to avoid FK constraint violations
  const testUsers = await prisma.user.findMany({ where: { email: { contains: '@games.test' } }, select: { id: true } })
  const testUserIds = testUsers.map(u => u.id)
  await prisma.gameRound.deleteMany({ where: { userId: { in: testUserIds } } })
  await prisma.balanceTransaction.deleteMany({ where: { userId: { in: testUserIds } } })
  await prisma.user.deleteMany({ where: { email: { contains: '@games.test' } } })
  const reg = await request(app).post('/api/auth/register').send({
    email: `u${uid}@games.test`,
    username: `gtest${uid.replace('-', '').slice(0, 14)}`,
    password: 'Password1!',
  })
  token = reg.body.accessToken
  userId = reg.body.user.id
  await prisma.user.update({ where: { id: userId }, data: { balanceRub: 10000 } })
  await redis.del(`bj:session:${userId}`)
  await redis.del(`bj:shoe:${userId}`)
})

describe('POST /api/games/slots/spin', () => {
  it('returns reels and result', async () => {
    const res = await request(app)
      .post('/api/games/slots/spin')
      .set('Authorization', `Bearer ${token}`)
      .send({ betRub: 100, clientSeed: 'myseed' })
    expect(res.status).toBe(200)
    expect(res.body.reels).toHaveLength(5)
    expect(res.body.winRub).toBeGreaterThanOrEqual(0)
    expect(res.body.serverSeedHash).toHaveLength(64)
  })

  it('deducts bet from balance', async () => {
    await request(app)
      .post('/api/games/slots/spin')
      .set('Authorization', `Bearer ${token}`)
      .send({ betRub: 200, clientSeed: 'seed' })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(Number(user!.balanceRub)).toBeLessThanOrEqual(9800)
  })

  it('returns 400 for invalid bet (negative)', async () => {
    const res = await request(app)
      .post('/api/games/slots/spin')
      .set('Authorization', `Bearer ${token}`)
      .send({ betRub: -100, clientSeed: 'seed' })
    expect(res.status).toBe(400)
  })

  it('returns 402 when balance insufficient', async () => {
    await prisma.user.update({ where: { id: userId }, data: { balanceRub: 0 } })
    const res = await request(app)
      .post('/api/games/slots/spin')
      .set('Authorization', `Bearer ${token}`)
      .send({ betRub: 100, clientSeed: 'seed' })
    expect(res.status).toBe(402)
  })
})

describe('POST /api/games/roulette/bet', () => {
  it('returns outcome and winRub', async () => {
    const res = await request(app)
      .post('/api/games/roulette/bet')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientSeed: 'myseed',
        bets: [{ type: 'red', amountRub: 100 }],
      })
    expect(res.status).toBe(200)
    expect(res.body.outcome).toBeGreaterThanOrEqual(0)
    expect(res.body.outcome).toBeLessThanOrEqual(36)
    expect(res.body.winRub).toBeGreaterThanOrEqual(0)
  })

  it('returns 400 for empty bets array', async () => {
    const res = await request(app)
      .post('/api/games/roulette/bet')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientSeed: 'seed', bets: [] })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/games/blackjack/start', () => {
  it('deals initial 2 cards to player and 1 visible to dealer', async () => {
    const res = await request(app)
      .post('/api/games/blackjack/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ betRub: 200, clientSeed: 'myseed' })
    expect(res.status).toBe(200)
    expect(res.body.playerHand).toHaveLength(2)
    expect(res.body.dealerVisible).toBeDefined()
    expect(res.body.serverSeedHash).toHaveLength(64)
  })

  it('returns 409 if game already in progress', async () => {
    const first = await request(app)
      .post('/api/games/blackjack/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ betRub: 200, clientSeed: 'seed' })
    if (first.body.status === 'done') return // skip if instant BJ
    const res = await request(app)
      .post('/api/games/blackjack/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ betRub: 200, clientSeed: 'seed' })
    expect(res.status).toBe(409)
  })
})

describe('POST /api/games/blackjack/action', () => {
  it('hit adds a card to player hand', async () => {
    const start = await request(app)
      .post('/api/games/blackjack/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ betRub: 200, clientSeed: 'myseed' })
    if (start.body.status === 'done') return

    const res = await request(app)
      .post('/api/games/blackjack/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'hit' })
    expect(res.status).toBe(200)
    expect(res.body.playerHand.length).toBeGreaterThanOrEqual(3)
  })

  it('returns 404 when no active game', async () => {
    const res = await request(app)
      .post('/api/games/blackjack/action')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'hit' })
    expect(res.status).toBe(404)
  })
})

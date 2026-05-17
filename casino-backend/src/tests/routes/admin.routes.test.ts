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

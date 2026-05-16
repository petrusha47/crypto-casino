import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../app'
import { prisma } from '../../config/prisma'

const app = createApp()

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: '@test.casino' } } })
})

describe('POST /api/auth/register', () => {
  it('creates a user and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'alice@test.casino',
      username: 'alice_test',
      password: 'Password1!',
    })
    expect(res.status).toBe(201)
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.user.email).toBe('alice@test.casino')
    expect(res.body.user.passwordHash).toBeUndefined()
  })

  it('returns 409 on duplicate email', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'bob@test.casino', username: 'bob_test', password: 'Password1!',
    })
    const res = await request(app).post('/api/auth/register').send({
      email: 'bob@test.casino', username: 'bob_test2', password: 'Password1!',
    })
    expect(res.status).toBe(409)
  })

  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'not-an-email', username: 'valid_user', password: 'Password1!',
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@test.casino', username: 'valid_user', password: 'short',
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'carol@test.casino', username: 'carol_test', password: 'Password1!',
    })
    const res = await request(app).post('/api/auth/login').send({
      email: 'carol@test.casino', password: 'Password1!',
    })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeDefined()
  })

  it('returns 401 for wrong password', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dave@test.casino', username: 'dave_test', password: 'Password1!',
    })
    const res = await request(app).post('/api/auth/login').send({
      email: 'dave@test.casino', password: 'wrong',
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 for non-existent user', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@test.casino', password: 'Password1!',
    })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/user/me', () => {
  it('returns user for valid token', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'eve@test.casino', username: 'eve_test', password: 'Password1!',
    })
    const res = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('eve@test.casino')
    expect(res.body.passwordHash).toBeUndefined()
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/user/me')
    expect(res.status).toBe(401)
  })
})

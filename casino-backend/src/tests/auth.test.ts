import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, signAccessToken, signRefreshToken, verifyAccessToken } from '../services/auth.service'

describe('hashPassword', () => {
  it('returns a hash different from the input', async () => {
    const hash = await hashPassword('secret123')
    expect(hash).not.toBe('secret123')
    expect(hash.length).toBeGreaterThan(20)
  })
})

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('secret123')
    expect(await verifyPassword('secret123', hash)).toBe(true)
  })

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('secret123')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})

describe('JWT', () => {
  const payload = { userId: 'cltest123', role: 'USER' as const }

  it('access token encodes and verifies userId', () => {
    const token = signAccessToken(payload)
    const decoded = verifyAccessToken(token)
    expect(decoded.userId).toBe('cltest123')
    expect(decoded.role).toBe('USER')
  })

  it('verifyAccessToken throws on tampered token', () => {
    const token = signAccessToken(payload)
    expect(() => verifyAccessToken(token + 'x')).toThrow()
  })
})

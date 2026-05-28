import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encryptPrivateKey, decryptPrivateKey, isValidTRC20Address, getPendingSweepAddresses } from '../services/wallet.service'
import { prisma } from '../config/prisma'

describe('encryptPrivateKey / decryptPrivateKey', () => {
  it('roundtrip returns original key', () => {
    const key = 'a'.repeat(64)
    const encrypted = encryptPrivateKey(key)
    expect(encrypted).not.toBe(key)
    expect(decryptPrivateKey(encrypted)).toBe(key)
  })

  it('encrypted output is base64', () => {
    const encrypted = encryptPrivateKey('b'.repeat(64))
    expect(() => Buffer.from(encrypted, 'base64')).not.toThrow()
  })

  it('two encryptions of same key produce different ciphertext (random IV)', () => {
    const key = 'c'.repeat(64)
    expect(encryptPrivateKey(key)).not.toBe(encryptPrivateKey(key))
  })

  it('throws when decrypting corrupted data', () => {
    expect(() => decryptPrivateKey('bm90YmFzZTY0Y3J5cHRv')).toThrow('Failed to decrypt private key')
  })
})

describe('isValidTRC20Address', () => {
  it('accepts a valid TRC20 address (starts with T, 34 chars)', () => {
    expect(isValidTRC20Address('TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9')).toBe(true)
  })

  it('rejects addresses that do not start with T', () => {
    expect(isValidTRC20Address('0xabc123')).toBe(false)
  })

  it('rejects addresses shorter than 34 chars', () => {
    expect(isValidTRC20Address('Tabc')).toBe(false)
  })
})

describe('getPendingSweepAddresses', () => {
  let testUserId: string

  beforeEach(async () => {
    const uid = `sw${Date.now()}${Math.random().toString(36).slice(2, 5)}`
    const user = await prisma.user.create({
      data: { email: `${uid}@sweep.test`, username: uid.slice(0, 20), passwordHash: 'x' },
    })
    testUserId = user.id
  })

  afterEach(async () => {
    await prisma.depositAddress.deleteMany({ where: { userId: testUserId } })
    await prisma.user.deleteMany({ where: { id: testUserId } })
  })

  it('returns addresses where pendingSweep is true', async () => {
    await prisma.depositAddress.create({
      data: {
        userId: testUserId,
        trc20Address: `T${testUserId.replace(/[^a-zA-Z0-9]/g, '0').padEnd(33, '0').slice(0, 33)}`,
        encryptedKey: encryptPrivateKey('a'.repeat(64)),
        pendingSweep: true,
      },
    })

    const result = await getPendingSweepAddresses()
    const match = result.find(a => a.userId === testUserId)
    expect(match).toBeDefined()
    expect(match?.trc20Address).toBe(`T${testUserId.replace(/[^a-zA-Z0-9]/g, '0').padEnd(33, '0').slice(0, 33)}`)
    expect(match?.encryptedKey).toBeTruthy()
  })

  it('does not return addresses where pendingSweep is false', async () => {
    await prisma.depositAddress.create({
      data: {
        userId: testUserId,
        trc20Address: `T${testUserId.replace(/[^a-zA-Z0-9]/g, '0').padEnd(33, '0').slice(0, 33)}`,
        encryptedKey: encryptPrivateKey('a'.repeat(64)),
        pendingSweep: false,
      },
    })

    const result = await getPendingSweepAddresses()
    expect(result.find(a => a.userId === testUserId)).toBeUndefined()
  })
})

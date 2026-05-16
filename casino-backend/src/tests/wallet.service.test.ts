import { describe, it, expect } from 'vitest'
import { encryptPrivateKey, decryptPrivateKey, isValidTRC20Address } from '../services/wallet.service'

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

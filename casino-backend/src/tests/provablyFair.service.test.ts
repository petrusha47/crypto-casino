import { describe, it, expect } from 'vitest'
import {
  generateServerSeed,
  hashServerSeed,
  generateOutcome,
  generateOutcomes,
} from '../services/provablyFair.service'

describe('generateServerSeed', () => {
  it('returns 64-char hex string', () => {
    const seed = generateServerSeed()
    expect(seed).toHaveLength(64)
    expect(seed).toMatch(/^[0-9a-f]+$/)
  })

  it('returns different value each call', () => {
    expect(generateServerSeed()).not.toBe(generateServerSeed())
  })
})

describe('hashServerSeed', () => {
  it('returns 64-char hex', () => {
    expect(hashServerSeed('anything')).toHaveLength(64)
    expect(hashServerSeed('anything')).toMatch(/^[0-9a-f]+$/)
  })

  it('is deterministic', () => {
    expect(hashServerSeed('seed')).toBe(hashServerSeed('seed'))
  })

  it('changes with input', () => {
    expect(hashServerSeed('a')).not.toBe(hashServerSeed('b'))
  })
})

describe('generateOutcome', () => {
  it('returns float in [0, 1)', () => {
    const r = generateOutcome('server', 'client', 1)
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThan(1)
  })

  it('is deterministic with same inputs', () => {
    expect(generateOutcome('s', 'c', 1)).toBe(generateOutcome('s', 'c', 1))
  })

  it('differs with different nonce', () => {
    expect(generateOutcome('s', 'c', 1)).not.toBe(generateOutcome('s', 'c', 2))
  })

  it('differs with different serverSeed', () => {
    expect(generateOutcome('seed1', 'c', 1)).not.toBe(generateOutcome('seed2', 'c', 1))
  })
})

describe('generateOutcomes', () => {
  it('returns correct count', () => {
    expect(generateOutcomes('s', 'c', 1, 5)).toHaveLength(5)
  })

  it('all values in [0, 1)', () => {
    generateOutcomes('s', 'c', 1, 20).forEach((r) => {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(1)
    })
  })

  it('all values distinct for different indices', () => {
    const outcomes = generateOutcomes('s', 'c', 1, 5)
    expect(new Set(outcomes).size).toBe(5)
  })
})

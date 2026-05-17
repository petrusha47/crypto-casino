import { describe, it, expect } from 'vitest'
import { computeCrashPoint, computeMultiplier } from '../services/crash.service'

describe('computeCrashPoint', () => {
  it('returns value >= 1.00 for any hash', () => {
    const hashes = [
      '0'.repeat(64),
      'f'.repeat(64),
      'a1b2c3d4' + '0'.repeat(56),
    ]
    hashes.forEach((h) => {
      expect(computeCrashPoint(h)).toBeGreaterThanOrEqual(1.0)
    })
  })

  it('returns 1.00 when first 8 hex chars parse to multiple of 33', () => {
    // 0x21000000 = 553648128; 553648128 % 33 === 0
    const cp = computeCrashPoint('21000000' + '0'.repeat(56))
    expect(cp).toBe(1.0)
  })

  it('returns larger values for larger hash prefix (higher h → larger multiplier)', () => {
    const cpLow = computeCrashPoint('00000001' + '0'.repeat(56))
    const cpHigh = computeCrashPoint('fffffffe' + '0'.repeat(56))
    expect(cpHigh).toBeGreaterThan(cpLow)
  })

  it('is deterministic', () => {
    const h = 'abc123' + '0'.repeat(58)
    expect(computeCrashPoint(h)).toBe(computeCrashPoint(h))
  })
})

describe('computeMultiplier', () => {
  it('returns 1.00 at elapsed 0', () => {
    expect(computeMultiplier(0)).toBe(1.0)
  })

  it('grows over time', () => {
    expect(computeMultiplier(5000)).toBeGreaterThan(computeMultiplier(1000))
  })

  it('returns 2-decimal precision', () => {
    const m = computeMultiplier(3000)
    expect(m).toBe(Math.round(m * 100) / 100)
  })
})

import { describe, it, expect } from 'vitest'
import { spin } from '../../games/slots'

describe('slots spin', () => {
  it('returns 5 reels each with 3 symbols', () => {
    const result = spin('server', 'client', 1, 100)
    expect(result.reels).toHaveLength(5)
    result.reels.forEach((reel) => expect(reel).toHaveLength(3))
  })

  it('all symbols are valid (0-6)', () => {
    const result = spin('server', 'client', 1, 100)
    result.reels.flat().forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(6)
    })
  })

  it('winRub is non-negative for any nonce', () => {
    for (let nonce = 1; nonce <= 20; nonce++) {
      const result = spin('server', 'client', nonce, 100)
      expect(result.winRub).toBeGreaterThanOrEqual(0)
    }
  })

  it('is deterministic with same seeds', () => {
    const r1 = spin('deterministic', 'client', 42, 100)
    const r2 = spin('deterministic', 'client', 42, 100)
    expect(r1.reels).toEqual(r2.reels)
    expect(r1.winRub).toBe(r2.winRub)
  })

  it('betRub in result matches input', () => {
    const result = spin('s', 'c', 1, 250)
    expect(result.betRub).toBe(250)
  })

  it('lines array contains valid line indices (0-19)', () => {
    const result = spin('server', 'client', 1, 100)
    result.lines.forEach((line) => {
      expect(line.lineIndex).toBeGreaterThanOrEqual(0)
      expect(line.lineIndex).toBeLessThanOrEqual(19)
      expect(line.count).toBeGreaterThanOrEqual(3)
      expect(line.multiplier).toBeGreaterThan(0)
    })
  })
})

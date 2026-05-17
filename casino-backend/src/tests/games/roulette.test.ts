import { describe, it, expect } from 'vitest'
import { spinWheel, calculateTotalWin, isRed, RouletteBet } from '../../games/roulette'

describe('spinWheel', () => {
  it('returns integer 0-36', () => {
    for (let n = 1; n <= 20; n++) {
      const r = spinWheel('server', 'client', n)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(36)
      expect(Number.isInteger(r)).toBe(true)
    }
  })

  it('is deterministic', () => {
    expect(spinWheel('s', 'c', 1)).toBe(spinWheel('s', 'c', 1))
  })
})

describe('isRed', () => {
  it('0 is not red', () => expect(isRed(0)).toBe(false))
  it('1 is red', () => expect(isRed(1)).toBe(true))
  it('2 is black', () => expect(isRed(2)).toBe(false))
  it('36 is red', () => expect(isRed(36)).toBe(true))
})

describe('calculateTotalWin', () => {
  it('straight bet on winning number returns 36× bet', () => {
    const bets: RouletteBet[] = [{ type: 'straight', number: 7, amountRub: 100 }]
    expect(calculateTotalWin(bets, 7)).toBe(3600)
  })

  it('straight bet on losing number returns 0', () => {
    const bets: RouletteBet[] = [{ type: 'straight', number: 7, amountRub: 100 }]
    expect(calculateTotalWin(bets, 8)).toBe(0)
  })

  it('red bet wins on red, loses on black and 0', () => {
    const bets: RouletteBet[] = [{ type: 'red', amountRub: 100 }]
    expect(calculateTotalWin(bets, 1)).toBe(200)
    expect(calculateTotalWin(bets, 2)).toBe(0)
    expect(calculateTotalWin(bets, 0)).toBe(0)
  })

  it('even bet loses on 0', () => {
    const bets: RouletteBet[] = [{ type: 'even', amountRub: 100 }]
    expect(calculateTotalWin(bets, 0)).toBe(0)
    expect(calculateTotalWin(bets, 2)).toBe(200)
  })

  it('dozen1 bet wins on 1-12, pays 3×', () => {
    const bets: RouletteBet[] = [{ type: 'dozen1', amountRub: 100 }]
    expect(calculateTotalWin(bets, 12)).toBe(300)
    expect(calculateTotalWin(bets, 13)).toBe(0)
  })

  it('column1 wins on numbers where n%3===1 (1,4,7,...)', () => {
    const bets: RouletteBet[] = [{ type: 'column1', amountRub: 100 }]
    expect(calculateTotalWin(bets, 1)).toBe(300)
    expect(calculateTotalWin(bets, 4)).toBe(300)
    expect(calculateTotalWin(bets, 2)).toBe(0)
  })

  it('multiple bets totaled correctly', () => {
    const bets: RouletteBet[] = [
      { type: 'red', amountRub: 50 },
      { type: 'straight', number: 3, amountRub: 10 },
    ]
    // 3 is red: red wins 100, straight wins 360
    expect(calculateTotalWin(bets, 3)).toBe(100 + 360)
  })
})

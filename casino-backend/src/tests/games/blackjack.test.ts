import { describe, it, expect } from 'vitest'
import {
  cardValue,
  handValue,
  isBust,
  isBlackjack,
  dealerShouldHit,
  shuffleShoe,
  settleHand,
} from '../../games/blackjack'

describe('cardValue', () => {
  it('Ace (idx 0) = 11', () => expect(cardValue(0)).toBe(11))
  it('2 (idx 1) = 2', () => expect(cardValue(1)).toBe(2))
  it('10 (idx 9) = 10', () => expect(cardValue(9)).toBe(10))
  it('Jack (idx 10) = 10', () => expect(cardValue(10)).toBe(10))
  it('King (idx 12) = 10', () => expect(cardValue(12)).toBe(10))
  it('works for cards in deck 2 (idx 52+)', () => expect(cardValue(52)).toBe(11))
})

describe('handValue', () => {
  it('Ace + King = 21', () => expect(handValue([0, 12])).toBe(21))
  it('two Aces = 12 (one counted as 1)', () => expect(handValue([0, 52])).toBe(12))
  it('Ace + 6 = 17 (soft)', () => expect(handValue([0, 5])).toBe(17))
  it('Ace + 6 + 8 = 15 (Ace demoted)', () => expect(handValue([0, 5, 7])).toBe(15))
  it('10 + 10 + 2 = 22 (bust)', () => expect(handValue([9, 9, 1])).toBe(22))
})

describe('isBust', () => {
  it('22 is bust', () => expect(isBust([9, 9, 1])).toBe(true))
  it('21 is not bust', () => expect(isBust([0, 12])).toBe(false))
})

describe('isBlackjack', () => {
  it('Ace + King with 2 cards = blackjack', () => expect(isBlackjack([0, 12])).toBe(true))
  it('21 with 3 cards is not blackjack', () => expect(isBlackjack([0, 5, 4])).toBe(false))
  it('20 with 2 cards is not blackjack', () => expect(isBlackjack([9, 12])).toBe(false))
})

describe('dealerShouldHit', () => {
  it('hits on 16', () => expect(dealerShouldHit([9, 5])).toBe(true))
  it('stands on hard 17', () => expect(dealerShouldHit([9, 6])).toBe(false))
  it('stands on soft 17 (Ace + 6)', () => expect(dealerShouldHit([0, 5])).toBe(false))
  it('hits on 13 (2 + Ace)', () => expect(dealerShouldHit([1, 0])).toBe(true))
})

describe('shuffleShoe', () => {
  it('returns 312 cards', () => {
    expect(shuffleShoe('seed', 'client', 1)).toHaveLength(312)
  })

  it('contains all 312 unique card indices', () => {
    const shoe = shuffleShoe('seed', 'client', 1)
    expect(new Set(shoe).size).toBe(312)
    expect(Math.min(...shoe)).toBe(0)
    expect(Math.max(...shoe)).toBe(311)
  })

  it('different seeds produce different orders', () => {
    const s1 = shuffleShoe('seed1', 'c', 1)
    const s2 = shuffleShoe('seed2', 'c', 1)
    expect(s1).not.toEqual(s2)
  })
})

describe('settleHand', () => {
  it('player wins → returns bet × 2', () => {
    expect(settleHand(19, 18, 100, false)).toBe(200)
  })

  it('player loses → returns 0', () => {
    expect(settleHand(18, 20, 100, false)).toBe(0)
  })

  it('push → returns bet', () => {
    expect(settleHand(17, 17, 100, false)).toBe(100)
  })

  it('player busts → returns 0 regardless of dealer', () => {
    expect(settleHand(22, 16, 100, false)).toBe(0)
  })

  it('dealer busts → player wins', () => {
    expect(settleHand(18, 22, 100, false)).toBe(200)
  })

  it('blackjack pays 3:2 → returns bet × 2.5', () => {
    expect(settleHand(21, 18, 100, true)).toBe(250)
  })

  it('blackjack vs blackjack → push', () => {
    expect(settleHand(21, 21, 100, true)).toBe(100)
  })
})

import { describe, it, expect } from 'vitest'
import { createDeck, shuffleDeck, cardRank, cardSuit } from '../../../games/poker/deck'

describe('createDeck', () => {
  it('has 52 unique cards', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(deck).size).toBe(52)
  })
  it('cards are 0-51', () => {
    const deck = createDeck()
    expect(Math.min(...deck)).toBe(0)
    expect(Math.max(...deck)).toBe(51)
  })
})

describe('shuffleDeck', () => {
  it('returns 52 cards', () => expect(shuffleDeck(createDeck()).length).toBe(52))
  it('different result from ordered deck', () => {
    const deck = createDeck()
    const shuffled = shuffleDeck([...deck])
    expect(shuffled).not.toEqual(deck)
  })
  it('still contains all 52 cards', () => {
    expect(new Set(shuffleDeck(createDeck())).size).toBe(52)
  })
})

describe('cardRank / cardSuit', () => {
  it('card 0 = Ace of Spades', () => { expect(cardRank(0)).toBe(14); expect(cardSuit(0)).toBe(0) })
  it('card 1 = 2 of Spades', () => expect(cardRank(1)).toBe(2))
  it('card 12 = King of Spades', () => expect(cardRank(12)).toBe(13))
  it('card 13 = Ace of Hearts', () => { expect(cardRank(13)).toBe(14); expect(cardSuit(13)).toBe(1) })
})

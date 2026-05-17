import { describe, it, expect } from 'vitest'
import { evaluateBest5of7, compareHands, HandRank } from '../../../games/poker/evaluator'

// Helper: build a specific hand from rank+suit (r=2-14, s=0-3)
function card(r: number, s: number): number {
  const rankIdx = r === 14 ? 0 : r - 1  // Ace=0, 2=1, ..., King=12
  return s * 13 + rankIdx
}

describe('evaluateBest5of7', () => {
  it('royal flush beats straight flush', () => {
    // Royal flush: A,K,Q,J,10 of spades + 2 fillers
    const rf = [card(14,0), card(13,0), card(12,0), card(11,0), card(10,0), card(2,1), card(3,2)]
    // Straight flush: 9,8,7,6,5 of hearts + fillers
    const sf = [card(9,1), card(8,1), card(7,1), card(6,1), card(5,1), card(2,2), card(3,3)]
    expect(compareHands(evaluateBest5of7(rf), evaluateBest5of7(sf))).toBeGreaterThan(0)
  })

  it('four of a kind beats full house', () => {
    const quads = [card(7,0), card(7,1), card(7,2), card(7,3), card(2,0), card(3,1), card(4,2)]
    const fh = [card(9,0), card(9,1), card(9,2), card(5,0), card(5,1), card(2,2), card(3,3)]
    expect(compareHands(evaluateBest5of7(quads), evaluateBest5of7(fh))).toBeGreaterThan(0)
  })

  it('flush beats straight', () => {
    const flush = [card(2,0), card(5,0), card(7,0), card(9,0), card(11,0), card(3,1), card(4,2)]
    const straight = [card(5,0), card(6,1), card(7,2), card(8,3), card(9,0), card(2,1), card(3,2)]
    expect(compareHands(evaluateBest5of7(flush), evaluateBest5of7(straight))).toBeGreaterThan(0)
  })

  it('pair beats high card', () => {
    const pair = [card(5,0), card(5,1), card(7,2), card(9,3), card(11,0), card(3,1), card(2,2)]
    const hc = [card(14,0), card(12,1), card(10,2), card(8,3), card(6,0), card(4,1), card(2,2)]
    expect(compareHands(evaluateBest5of7(pair), evaluateBest5of7(hc))).toBeGreaterThan(0)
  })

  it('higher pair wins tiebreaker', () => {
    const pairA = [card(9,0), card(9,1), card(7,2), card(5,3), card(3,0), card(2,1), card(4,2)]
    const pairB = [card(8,0), card(8,1), card(7,2), card(5,3), card(3,0), card(2,1), card(4,2)]
    expect(compareHands(evaluateBest5of7(pairA), evaluateBest5of7(pairB))).toBeGreaterThan(0)
  })
})

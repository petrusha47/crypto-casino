import { cardRank, cardSuit } from './deck'

export interface HandRank {
  rank: number       // 0=HighCard … 9=RoyalFlush
  tiebreakers: number[]
}

function isStraight(ranks: number[]): boolean {
  const sorted = [...new Set(ranks)].sort((a, b) => b - a)
  if (sorted.length < 5) return false
  // Normal straight
  if (sorted[0] - sorted[4] === 4 && sorted.length === 5) return true
  // Wheel: A-2-3-4-5
  if (sorted[0] === 14 && sorted[1] === 5 && sorted[2] === 4 && sorted[3] === 3 && sorted[4] === 2) return true
  return false
}

function straightHighCard(ranks: number[]): number {
  const sorted = [...new Set(ranks)].sort((a, b) => b - a)
  // Wheel A-2-3-4-5: high card is 5
  if (sorted[0] === 14 && sorted[1] === 5) return 5
  return sorted[0]
}

function evaluate5(cards: number[]): HandRank {
  const ranks = cards.map(cardRank).sort((a, b) => b - a)
  const suits = cards.map(cardSuit)

  const flush = suits.every((s) => s === suits[0])
  const straight = isStraight(ranks)

  const freq: Record<number, number> = {}
  ranks.forEach((r) => { freq[r] = (freq[r] ?? 0) + 1 })
  const byFreq = Object.entries(freq)
    .sort(([r1, f1], [r2, f2]) => Number(f2) - Number(f1) || Number(r2) - Number(r1))
    .map(([r]) => Number(r))
  const freqs = Object.values(freq).sort((a, b) => b - a)

  if (flush && straight) {
    const hi = straightHighCard(ranks)
    return { rank: hi === 14 ? 9 : 8, tiebreakers: [hi] }
  }
  if (freqs[0] === 4) return { rank: 7, tiebreakers: byFreq }
  if (freqs[0] === 3 && freqs[1] === 2) return { rank: 6, tiebreakers: byFreq }
  if (flush) return { rank: 5, tiebreakers: ranks }
  if (straight) return { rank: 4, tiebreakers: [straightHighCard(ranks)] }
  if (freqs[0] === 3) return { rank: 3, tiebreakers: byFreq }
  if (freqs[0] === 2 && freqs[1] === 2) return { rank: 2, tiebreakers: byFreq }
  if (freqs[0] === 2) return { rank: 1, tiebreakers: byFreq }
  return { rank: 0, tiebreakers: ranks }
}

export function compareHands(a: HandRank, b: HandRank): number {
  if (a.rank !== b.rank) return a.rank - b.rank
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const diff = (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function evaluateBest5of7(cards: number[]): HandRank {
  let best: HandRank = { rank: -1, tiebreakers: [] }
  // Try all C(7,2)=21 combinations (exclude 2 cards, evaluate remaining 5)
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const hand5 = cards.filter((_, idx) => idx !== i && idx !== j)
      const hr = evaluate5(hand5)
      if (compareHands(hr, best) > 0) best = hr
    }
  }
  return best
}

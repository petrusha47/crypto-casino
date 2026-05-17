import { generateOutcomes } from '../services/provablyFair.service'

const FACE_VALUES = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10]

export function cardValue(cardIndex: number): number {
  return FACE_VALUES[cardIndex % 13]
}

export function handValue(cards: number[]): number {
  let total = cards.reduce((s, c) => s + cardValue(c), 0)
  let aces = cards.filter((c) => c % 13 === 0).length
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return total
}

export function isBust(cards: number[]): boolean {
  return handValue(cards) > 21
}

export function isBlackjack(cards: number[]): boolean {
  return cards.length === 2 && handValue(cards) === 21
}

export function dealerShouldHit(cards: number[]): boolean {
  return handValue(cards) < 17
}

export function shuffleShoe(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const shoe = Array.from({ length: 312 }, (_, i) => i)
  const outcomes = generateOutcomes(serverSeed, clientSeed, nonce, 311)
  for (let i = 311; i > 0; i--) {
    const j = Math.floor(outcomes[311 - i] * (i + 1))
    ;[shoe[i], shoe[j]] = [shoe[j], shoe[i]]
  }
  return shoe
}

// Returns total amount credited back to player (including stake on win)
export function settleHand(
  playerValue: number,
  dealerValue: number,
  betRub: number,
  playerBlackjack: boolean,
): number {
  if (playerValue > 21) return 0
  if (dealerValue > 21) return betRub * 2
  if (playerBlackjack && dealerValue < 21) return Math.round(betRub * 2.5 * 100) / 100
  if (playerBlackjack && dealerValue === 21) return betRub // push (both BJ)
  if (playerValue > dealerValue) return betRub * 2
  if (playerValue < dealerValue) return 0
  return betRub // push
}

export interface BlackjackSession {
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  shoe: number[]
  shoePos: number
  playerHands: number[][]
  activeHandIdx: number
  dealerHand: number[]
  bets: number[]
  status: 'playing' | 'done'
  winRubs: number[]
}

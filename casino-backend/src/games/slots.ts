// src/games/slots.ts
import { generateOutcomes } from '../services/provablyFair.service'

// 7 symbols: 0=SEVEN, 1=BAR, 2=BELL, 3=WATERMELON, 4=GRAPE, 5=CHERRY, 6=LEMON
const REEL_STRIPS: number[][] = [
  [6, 6, 6, 5, 6, 5, 4, 5, 4, 3, 4, 3, 2, 3, 2, 1, 2, 1, 0, 1, 0, 6],
  [6, 6, 5, 6, 5, 4, 5, 4, 3, 4, 3, 2, 3, 2, 1, 2, 1, 0, 1, 0, 6, 6],
  [6, 5, 6, 5, 4, 5, 4, 3, 4, 3, 2, 3, 2, 1, 2, 1, 0, 1, 6, 0, 6, 5],
  [5, 6, 5, 4, 5, 3, 4, 2, 3, 1, 2, 0, 1, 6, 0, 6, 5, 4, 3, 2, 1, 6],
  [6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0, 6, 5, 4, 3, 2, 1, 0, 6],
]

// Each entry: [row for reel0, row for reel1, row for reel2, row for reel3, row for reel4]
const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1], // 0: middle row
  [0, 0, 0, 0, 0], // 1: top row
  [2, 2, 2, 2, 2], // 2: bottom row
  [0, 1, 2, 1, 0], // 3: V down
  [2, 1, 0, 1, 2], // 4: V up
  [0, 0, 1, 2, 2], // 5: diagonal down-right
  [2, 2, 1, 0, 0], // 6: diagonal up-right
  [1, 0, 0, 0, 1], // 7: U top
  [1, 2, 2, 2, 1], // 8: U bottom
  [0, 1, 1, 1, 0], // 9: mound top
  [2, 1, 1, 1, 2], // 10: mound bottom
  [0, 0, 0, 1, 2], // 11: shallow down
  [2, 2, 2, 1, 0], // 12: shallow up
  [1, 0, 1, 2, 1], // 13: zigzag down
  [1, 2, 1, 0, 1], // 14: zigzag up
  [0, 1, 0, 1, 0], // 15: saw top
  [2, 1, 2, 1, 2], // 16: saw bottom
  [0, 0, 1, 0, 0], // 17: dip top
  [2, 2, 1, 2, 2], // 18: dip bottom
  [1, 0, 2, 0, 1], // 19: checkmark
]

// [3-match, 4-match, 5-match] multipliers
const PAYOUTS: Record<number, [number, number, number]> = {
  0: [200, 500, 1000],
  1: [30, 80, 150],
  2: [20, 50, 100],
  3: [15, 35, 75],
  4: [10, 25, 50],
  5: [5, 15, 30],
  6: [3, 8, 15],
}

export interface WinLine {
  lineIndex: number
  symbol: number
  count: number
  multiplier: number
}

export interface SpinResult {
  reels: number[][]
  lines: WinLine[]
  winMultiplier: number
  winRub: number
  betRub: number
}

export function spin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  betRub: number,
): SpinResult {
  const outcomes = generateOutcomes(serverSeed, clientSeed, nonce, 5)

  const stopPositions = outcomes.map((o, i) => Math.floor(o * REEL_STRIPS[i].length))

  const reels: number[][] = stopPositions.map((stop, ri) => {
    const strip = REEL_STRIPS[ri]
    const len = strip.length
    return [strip[stop % len], strip[(stop + 1) % len], strip[(stop + 2) % len]]
  })

  const perLineBet = betRub / 20
  const lines: WinLine[] = []
  let winMultiplier = 0

  for (let li = 0; li < PAYLINES.length; li++) {
    const line = PAYLINES[li]
    const firstSymbol = reels[0][line[0]]
    let matchCount = 1

    for (let ri = 1; ri < 5; ri++) {
      if (reels[ri][line[ri]] === firstSymbol) matchCount++
      else break
    }

    if (matchCount >= 3) {
      const payoutIdx = matchCount - 3
      const multiplier = PAYOUTS[firstSymbol][payoutIdx]
      lines.push({ lineIndex: li, symbol: firstSymbol, count: matchCount, multiplier })
      winMultiplier += multiplier
    }
  }

  const winRub = Math.round(perLineBet * winMultiplier * 100) / 100

  return { reels, lines, winMultiplier, winRub, betRub }
}

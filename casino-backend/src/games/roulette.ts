import { generateOutcome } from '../services/provablyFair.service'

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export type BetType =
  | 'straight'
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'dozen1'
  | 'dozen2'
  | 'dozen3'
  | 'column1'
  | 'column2'
  | 'column3'

export interface RouletteBet {
  type: BetType
  number?: number
  amountRub: number
}

export function isRed(n: number): boolean {
  return RED_NUMBERS.has(n)
}

export function spinWheel(serverSeed: string, clientSeed: string, nonce: number): number {
  return Math.floor(generateOutcome(serverSeed, clientSeed, nonce) * 37)
}

export function getBetPayout(bet: RouletteBet, outcome: number): number {
  if (outcome === 0) {
    return bet.type === 'straight' && bet.number === 0 ? bet.amountRub * 36 : 0
  }
  switch (bet.type) {
    case 'straight':
      return bet.number === outcome ? bet.amountRub * 36 : 0
    case 'red':
      return isRed(outcome) ? bet.amountRub * 2 : 0
    case 'black':
      return !isRed(outcome) ? bet.amountRub * 2 : 0
    case 'odd':
      return outcome % 2 === 1 ? bet.amountRub * 2 : 0
    case 'even':
      return outcome % 2 === 0 ? bet.amountRub * 2 : 0
    case 'dozen1':
      return outcome >= 1 && outcome <= 12 ? bet.amountRub * 3 : 0
    case 'dozen2':
      return outcome >= 13 && outcome <= 24 ? bet.amountRub * 3 : 0
    case 'dozen3':
      return outcome >= 25 && outcome <= 36 ? bet.amountRub * 3 : 0
    case 'column1':
      return outcome % 3 === 1 ? bet.amountRub * 3 : 0
    case 'column2':
      return outcome % 3 === 2 ? bet.amountRub * 3 : 0
    case 'column3':
      return outcome % 3 === 0 ? bet.amountRub * 3 : 0
    default:
      return 0
  }
}

export function calculateTotalWin(bets: RouletteBet[], outcome: number): number {
  return bets.reduce((total, bet) => total + getBetPayout(bet, outcome), 0)
}

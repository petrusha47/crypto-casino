export interface User {
  id: string
  email: string
  username: string
  balanceRub: number
  role: 'USER' | 'SUPPORT' | 'ADMIN'
  telegramId?: string
}

export interface BalanceTransaction {
  id: string
  type: 'DEPOSIT' | 'ADMIN_CREDIT' | 'ADMIN_DEBIT' | 'GAME_WIN' | 'GAME_LOSS' | 'WITHDRAWAL'
  amountRub: number
  comment?: string
  createdAt: string
}

export interface WithdrawalRequest {
  id: string
  amountRub: number
  trc20Address: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: string
}

export interface GameRound {
  id: string
  game: 'SLOTS' | 'ROULETTE' | 'BLACKJACK'
  betRub: number
  winRub: number
  serverSeedHash: string
  serverSeed?: string
  clientSeed: string
  nonce: number
  result: unknown
  createdAt: string
}

export interface SlotSpinResult {
  reels: number[][]
  lines: Array<{ lineIndex: number; symbol: number; count: number; multiplier: number }>
  winMultiplier: number
  winRub: number
  betRub: number
  serverSeedHash: string
  serverSeed: string
  clientSeed: string
  nonce: number
}

export type BetType = 'straight' | 'red' | 'black' | 'even' | 'odd' | 'dozen1' | 'dozen2' | 'dozen3' | 'column1' | 'column2' | 'column3'

export interface RouletteBet {
  type: BetType
  number?: number
  amountRub: number
}

export interface RouletteResult {
  outcome: number
  winRub: number
  totalBet: number
  serverSeedHash: string
  serverSeed: string
}

export interface BlackjackStartResult {
  playerHand: number[]
  dealerVisible: number
  serverSeedHash: string
  status: 'playing' | 'done'
  winRubs?: number[]
  serverSeed?: string
  betRub: number
}

export interface BlackjackActionResult {
  playerHand: number[]
  playerHands?: number[][]
  dealerHand: number[]
  status: 'playing' | 'done'
  winRubs: number[]
  serverSeed?: string
}

export interface PokerTableInfo {
  id: string
  name: string
  maxPlayers: number
  minBetRub: number
  maxBetRub: number
  status: 'WAITING' | 'ACTIVE' | 'FINISHED'
}

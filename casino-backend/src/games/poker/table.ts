import { createDeck, shuffleDeck } from './deck'
import { evaluateBest5of7, compareHands } from './evaluator'

export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export interface PokerPlayer {
  userId: string
  seat: number
  stackRub: number
  holeCards: number[]
  currentBet: number
  folded: boolean
  allIn: boolean
  hasActed: boolean
}

export interface PokerTableState {
  tableId: string
  players: PokerPlayer[]
  deck: number[]
  deckPos: number
  communityCards: number[]
  pot: number
  currentBet: number
  minBet: number
  maxBet: number
  rake: number
  phase: Phase
  dealerIdx: number
  currentPlayerIdx: number
  lastActionAt: number
}

export interface PokerAction {
  type: 'fold' | 'check' | 'call' | 'raise' | 'allin'
  amount?: number
}

export function createTableState(tableId: string, minBet: number, maxBet: number): PokerTableState {
  return {
    tableId,
    players: [],
    deck: [],
    deckPos: 0,
    communityCards: [],
    pot: 0,
    currentBet: 0,
    minBet,
    maxBet,
    rake: 0.05,
    phase: 'waiting',
    dealerIdx: 0,
    currentPlayerIdx: 0,
    lastActionAt: Date.now(),
  }
}

export function addPlayer(state: PokerTableState, player: { userId: string; stackRub: number }): PokerTableState {
  if (state.players.length >= 6) throw new Error('Table is full')
  const seat = state.players.length
  return {
    ...state,
    players: [...state.players, {
      userId: player.userId, seat, stackRub: player.stackRub,
      holeCards: [], currentBet: 0, folded: false, allIn: false, hasActed: false,
    }],
  }
}

export function removePlayer(state: PokerTableState, userId: string): PokerTableState {
  return { ...state, players: state.players.filter((p) => p.userId !== userId) }
}

export function startHand(state: PokerTableState): PokerTableState {
  if (state.players.length < 2) throw new Error('Need at least 2 players')

  const deck = shuffleDeck(createDeck())
  let deckPos = 0
  const draw = () => deck[deckPos++]

  const players: PokerPlayer[] = state.players.map((p) => ({
    ...p, holeCards: [draw(), draw()], currentBet: 0, folded: false, allIn: false, hasActed: false,
  }))

  const n = players.length
  const dealerIdx = (state.dealerIdx + 1) % n
  const sbIdx = (dealerIdx + 1) % n
  const bbIdx = (dealerIdx + 2) % n
  const sbAmount = Math.floor(state.minBet / 2)
  const bbAmount = state.minBet

  // Post blinds
  players[sbIdx].stackRub -= sbAmount
  players[sbIdx].currentBet = sbAmount
  players[bbIdx].stackRub -= bbAmount
  players[bbIdx].currentBet = bbAmount

  const pot = sbAmount + bbAmount
  const firstToAct = (bbIdx + 1) % n

  return {
    ...state,
    deck,
    deckPos,
    players,
    communityCards: [],
    pot,
    currentBet: bbAmount,
    phase: 'preflop',
    dealerIdx,
    currentPlayerIdx: firstToAct,
    lastActionAt: Date.now(),
  }
}

export function applyAction(
  state: PokerTableState,
  userId: string,
  action: PokerAction,
): PokerTableState {
  const player = state.players[state.currentPlayerIdx]
  if (!player || player.userId !== userId) throw new Error('Not your turn')
  if (player.folded || player.allIn) throw new Error('Player cannot act')

  let s = { ...state, players: state.players.map((p) => ({ ...p })) }
  const p = s.players[s.currentPlayerIdx]

  p.hasActed = true

  if (action.type === 'fold') {
    p.folded = true
  } else if (action.type === 'check') {
    if (s.currentBet > p.currentBet) throw new Error('Cannot check — must call or raise')
  } else if (action.type === 'call') {
    const toCall = Math.min(s.currentBet - p.currentBet, p.stackRub)
    p.stackRub -= toCall
    p.currentBet += toCall
    s.pot += toCall
    if (p.stackRub === 0) p.allIn = true
  } else if (action.type === 'raise') {
    const raiseAmount = action.amount ?? s.minBet
    const total = raiseAmount
    if (total <= s.currentBet) throw new Error('Raise must exceed current bet')
    const diff = total - p.currentBet
    if (diff > p.stackRub) throw new Error('Insufficient stack')
    p.stackRub -= diff
    s.pot += diff
    p.currentBet = total
    s.currentBet = total
    if (p.stackRub === 0) p.allIn = true
  } else if (action.type === 'allin') {
    const amount = p.stackRub
    s.pot += amount
    p.currentBet += amount
    p.stackRub = 0
    p.allIn = true
    if (p.currentBet > s.currentBet) s.currentBet = p.currentBet
  }

  s.lastActionAt = Date.now()
  s = advanceTurn(s)
  return s
}

function bettingComplete(state: PokerTableState): boolean {
  const active = state.players.filter((p) => !p.folded)
  // Only 1 active → hand over
  if (active.length === 1) return true
  // All non-folded players have matched currentBet or are all-in, AND have had a chance to act
  return active.every((p) => p.allIn || (p.hasActed && p.currentBet === state.currentBet))
}

function advanceTurn(state: PokerTableState): PokerTableState {
  // Check if only one player remains
  const nonFolded = state.players.filter((p) => !p.folded)
  if (nonFolded.length === 1) {
    return advancePhase(state)
  }

  if (bettingComplete(state)) {
    return advancePhase(state)
  }

  // Find next player to act
  const n = state.players.length
  let next = (state.currentPlayerIdx + 1) % n
  let attempts = 0
  while ((state.players[next].folded || state.players[next].allIn) && attempts < n) {
    next = (next + 1) % n
    attempts++
  }

  // If no eligible player found (all folded or all-in), advance the phase
  if (state.players[next].folded || state.players[next].allIn) {
    return advancePhase(state)
  }

  return { ...state, currentPlayerIdx: next }
}

function advancePhase(state: PokerTableState): PokerTableState {
  const s = { ...state, players: state.players.map((p) => ({ ...p, currentBet: 0, hasActed: false })), currentBet: 0 }
  let deckPos = s.deckPos

  if (s.phase === 'preflop') {
    s.communityCards = [s.deck[deckPos++], s.deck[deckPos++], s.deck[deckPos++]]
    s.deckPos = deckPos
    s.phase = 'flop'
  } else if (s.phase === 'flop') {
    s.communityCards = [...s.communityCards, s.deck[deckPos++]]
    s.deckPos = deckPos
    s.phase = 'turn'
  } else if (s.phase === 'turn') {
    s.communityCards = [...s.communityCards, s.deck[deckPos++]]
    s.deckPos = deckPos
    s.phase = 'river'
  } else {
    // Showdown
    s.phase = 'showdown'
    return s
  }

  // Set first player to act post-flop (first active after dealer)
  const n = s.players.length
  let firstAct = (s.dealerIdx + 1) % n
  let attempts = 0
  while ((s.players[firstAct].folded || s.players[firstAct].allIn) && attempts < n) {
    firstAct = (firstAct + 1) % n
    attempts++
  }
  s.currentPlayerIdx = firstAct

  return s
}

export interface ShowdownResult {
  winnerId: string
  potWon: number
  rake: number
}

export function resolveShowdown(state: PokerTableState): ShowdownResult[] {
  const nonFolded = state.players.filter((p) => !p.folded)

  if (nonFolded.length === 1) {
    const winner = nonFolded[0]
    const rake = Math.round(state.pot * state.rake * 100) / 100
    const potWon = Math.round((state.pot - rake) * 100) / 100
    return [{ winnerId: winner.userId, potWon, rake }]
  }

  // Evaluate hands
  const evaluated = nonFolded.map((p) => ({
    userId: p.userId,
    hand: evaluateBest5of7([...p.holeCards, ...state.communityCards]),
  }))
  evaluated.sort((a, b) => compareHands(b.hand, a.hand))

  const rake = Math.round(state.pot * state.rake * 100) / 100
  const potWon = Math.round((state.pot - rake) * 100) / 100

  // Simple: winner takes all (no split pot for ties for now)
  return [{ winnerId: evaluated[0].userId, potWon, rake }]
}

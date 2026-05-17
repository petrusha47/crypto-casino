import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTableState,
  addPlayer,
  removePlayer,
  startHand,
  applyAction,
  PokerTableState,
  PokerAction,
} from '../../../games/poker/table'

describe('createTableState', () => {
  it('creates a waiting table with empty players', () => {
    const state = createTableState('t1', 100, 5000)
    expect(state.phase).toBe('waiting')
    expect(state.players).toHaveLength(0)
    expect(state.minBet).toBe(100)
  })
})

describe('addPlayer / removePlayer', () => {
  it('adds a player to an available seat', () => {
    const state = createTableState('t1', 100, 5000)
    const next = addPlayer(state, { userId: 'u1', stackRub: 1000 })
    expect(next.players).toHaveLength(1)
    expect(next.players[0].userId).toBe('u1')
  })

  it('rejects player if table full (6 seats)', () => {
    let state = createTableState('t1', 100, 5000)
    for (let i = 0; i < 6; i++) state = addPlayer(state, { userId: `u${i}`, stackRub: 1000 })
    expect(() => addPlayer(state, { userId: 'u7', stackRub: 1000 })).toThrow('Table is full')
  })

  it('removes a player', () => {
    let state = createTableState('t1', 100, 5000)
    state = addPlayer(state, { userId: 'u1', stackRub: 1000 })
    state = removePlayer(state, 'u1')
    expect(state.players).toHaveLength(0)
  })
})

describe('startHand', () => {
  it('requires at least 2 players', () => {
    let state = createTableState('t1', 100, 5000)
    state = addPlayer(state, { userId: 'u1', stackRub: 1000 })
    expect(() => startHand(state)).toThrow('Need at least 2 players')
  })

  it('deals 2 cards to each player and sets phase to preflop', () => {
    let state = createTableState('t1', 100, 5000)
    state = addPlayer(state, { userId: 'u1', stackRub: 1000 })
    state = addPlayer(state, { userId: 'u2', stackRub: 1000 })
    state = startHand(state)
    expect(state.phase).toBe('preflop')
    state.players.forEach((p) => expect(p.holeCards).toHaveLength(2))
  })

  it('posts small and big blinds', () => {
    let state = createTableState('t1', 100, 5000)
    state = addPlayer(state, { userId: 'u1', stackRub: 1000 })
    state = addPlayer(state, { userId: 'u2', stackRub: 1000 })
    state = startHand(state)
    // SB posts half minBet (50), BB posts full minBet (100)
    expect(state.pot).toBeGreaterThanOrEqual(150)
  })
})

describe('applyAction', () => {
  let state: PokerTableState

  beforeEach(() => {
    state = createTableState('t1', 100, 5000)
    state = addPlayer(state, { userId: 'u1', stackRub: 2000 })
    state = addPlayer(state, { userId: 'u2', stackRub: 2000 })
    state = startHand(state)
  })

  it('fold removes player from active hands', () => {
    const currentPlayer = state.players[state.currentPlayerIdx]
    const next = applyAction(state, currentPlayer.userId, { type: 'fold' })
    const player = next.players.find((p) => p.userId === currentPlayer.userId)!
    expect(player.folded).toBe(true)
  })

  it('call matches current bet', () => {
    const currentPlayer = state.players[state.currentPlayerIdx]
    const next = applyAction(state, currentPlayer.userId, { type: 'call' })
    const player = next.players.find((p) => p.userId === currentPlayer.userId)!
    expect(player.currentBet).toBe(state.currentBet)
  })

  it('raise increases current bet', () => {
    const currentPlayer = state.players[state.currentPlayerIdx]
    const next = applyAction(state, currentPlayer.userId, { type: 'raise', amount: 200 })
    expect(next.currentBet).toBe(200)
  })

  it('wrong player cannot act', () => {
    const otherPlayer = state.players.find((p) => p.userId !== state.players[state.currentPlayerIdx].userId)!
    expect(() => applyAction(state, otherPlayer.userId, { type: 'fold' })).toThrow('Not your turn')
  })
})

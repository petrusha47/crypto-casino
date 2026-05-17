export function cardRank(card: number): number {
  const r = card % 13
  return r === 0 ? 14 : r + 1 // Ace=14, 2=2, ..., King=13
}

export function cardSuit(card: number): number {
  return Math.floor(card / 13)
}

export function createDeck(): number[] {
  return Array.from({ length: 52 }, (_, i) => i)
}

export function shuffleDeck(deck: number[]): number[] {
  const d = [...deck]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

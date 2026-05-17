import { createHmac, createHash, randomBytes } from 'crypto'

export function generateServerSeed(): string {
  return randomBytes(32).toString('hex')
}

export function hashServerSeed(serverSeed: string): string {
  return createHash('sha256').update(serverSeed).digest('hex')
}

export function generateOutcome(serverSeed: string, clientSeed: string, nonce: number): number {
  const hmac = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex')
  return parseInt(hmac.slice(0, 8), 16) / 0x100000000
}

export function generateOutcomes(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count: number,
): number[] {
  return Array.from({ length: count }, (_, i) => {
    const hmac = createHmac('sha256', serverSeed)
      .update(`${clientSeed}:${nonce}:${i}`)
      .digest('hex')
    return parseInt(hmac.slice(0, 8), 16) / 0x100000000
  })
}

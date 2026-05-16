import axios from 'axios'
import { redis } from '../config/redis'
import { env } from '../config/env'
import { getAllDepositAddresses } from './wallet.service'
import { getUsdToRubRate } from './cbr.service'
import { creditBalance } from './balance.service'
import { BalanceTxType } from '@prisma/client'

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const USDT_DECIMALS = 6
const MIN_CONFIRMATIONS_MS = 18_000
const MIN_DEPOSIT_USDT = 1
const POLL_INTERVAL_MS = 10_000
const PROCESSED_KEY_TTL = 30 * 24 * 3600

let pollTimer: ReturnType<typeof setInterval> | null = null

export function startTronWatcher(): void {
  if (pollTimer) return
  console.log('TronWatcher: started')
  pollTimer = setInterval(runPoll, POLL_INTERVAL_MS)
}

export function stopTronWatcher(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export async function isAlreadyProcessed(txHash: string): Promise<boolean> {
  return (await redis.exists(`tron:processed:${txHash}`)) === 1
}

export async function markProcessed(txHash: string): Promise<void> {
  await redis.setex(`tron:processed:${txHash}`, PROCESSED_KEY_TTL, '1')
}

export interface DepositParams {
  userId: string
  txHash: string
  amountUsdt: number
}

export async function processDeposit(params: DepositParams): Promise<void> {
  const { userId, txHash, amountUsdt } = params
  const { rate, fallback } = await getUsdToRubRate()
  const amountRub = Math.round(amountUsdt * rate * 100) / 100

  await creditBalance({
    userId,
    amountRub,
    type: BalanceTxType.DEPOSIT,
    refId: txHash,
    cbrRate: rate,
    rateFallback: fallback,
    comment: `USDT deposit: ${amountUsdt} USDT`,
  })

  await markProcessed(txHash)
}

async function runPoll(): Promise<void> {
  try {
    const addresses = await getAllDepositAddresses()
    await Promise.allSettled(addresses.map(({ userId, trc20Address }) =>
      checkAddress(userId, trc20Address)
    ))
  } catch (err) {
    console.error('TronWatcher poll error:', err)
  }
}

async function checkAddress(userId: string, address: string): Promise<void> {
  const headers: Record<string, string> = {}
  if (env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = env.TRONGRID_API_KEY

  const { data } = await axios.get(
    `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`,
    {
      params: { contract_address: USDT_CONTRACT, only_to: true, limit: 50 },
      headers,
      timeout: 8000,
    }
  )

  const txs: TRC20Tx[] = data.data ?? []
  const now = Date.now()

  for (const tx of txs) {
    if (tx.type !== 'Transfer') continue
    if (now - tx.block_timestamp < MIN_CONFIRMATIONS_MS) continue

    const amountUsdt = Number(tx.value) / Math.pow(10, USDT_DECIMALS)
    if (amountUsdt < MIN_DEPOSIT_USDT) continue

    const alreadyDone = await isAlreadyProcessed(tx.transaction_id)
    if (alreadyDone) continue

    await processDeposit({ userId, txHash: tx.transaction_id, amountUsdt })
    console.log(`TronWatcher: ${amountUsdt} USDT → user ${userId} (tx ${tx.transaction_id})`)
  }
}

interface TRC20Tx {
  transaction_id: string
  type: string
  value: string
  block_timestamp: number
  from: string
  to: string
}

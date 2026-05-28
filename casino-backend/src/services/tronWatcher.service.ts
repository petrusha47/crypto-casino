import axios from 'axios'
import { TronWeb } from 'tronweb'
import { redis } from '../config/redis'
import { env } from '../config/env'
import { prisma } from '../config/prisma'
import { getAllDepositAddresses, getPendingSweepAddresses, decryptPrivateKey } from './wallet.service'
import { getUsdToRubRate } from './cbr.service'
import { creditBalance } from './balance.service'
import { BalanceTxType } from '@prisma/client'

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const USDT_DECIMALS = 6
const MIN_CONFIRMATIONS_MS = 18_000
const MIN_DEPOSIT_USDT = 1
const POLL_INTERVAL_MS = 10_000
const PROCESSED_KEY_TTL = 30 * 24 * 3600
const TRX_FOR_FEES = 5_000_000    // 5 TRX in sun units
const SWEEP_WAIT_MS = 3_000

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

  await prisma.depositAddress.updateMany({
    where: { userId },
    data: { pendingSweep: true },
  })
}

async function runPoll(): Promise<void> {
  try {
    const addresses = await getAllDepositAddresses()
    await Promise.allSettled(addresses.map(({ userId, trc20Address }) =>
      checkAddress(userId, trc20Address)
    ))

    const pending = await getPendingSweepAddresses()
    await Promise.allSettled(pending.map(addr =>
      sweepDeposit(addr).catch(err =>
        console.error(`TronWatcher sweep error for ${addr.trc20Address}:`, err)
      )
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

export async function sweepDeposit(addr: {
  userId: string
  trc20Address: string
  encryptedKey: string
}): Promise<void> {
  if (!env.HOT_WALLET_ADDRESS || !env.TRX_RESERVE_KEY) {
    console.warn('TronWatcher sweep: HOT_WALLET_ADDRESS or TRX_RESERVE_KEY not configured, skipping')
    return
  }

  const headers: Record<string, string> = {}
  if (env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = env.TRONGRID_API_KEY

  const { data } = await axios.get(
    `https://api.trongrid.io/v1/accounts/${addr.trc20Address}`,
    { headers, timeout: 8000 },
  )
  const trc20List: Record<string, string>[] = data.data?.[0]?.trc20 ?? []
  const usdtEntry = trc20List.find(b => Object.keys(b)[0] === USDT_CONTRACT)
  const rawBalance = BigInt(usdtEntry ? Object.values(usdtEntry)[0] : '0')
  const amountUsdt = Number(rawBalance) / Math.pow(10, USDT_DECIMALS)

  if (amountUsdt < MIN_DEPOSIT_USDT) {
    await prisma.depositAddress.update({
      where: { trc20Address: addr.trc20Address },
      data: { pendingSweep: false },
    })
    console.log(`TronWatcher sweep: dust (${amountUsdt} USDT) at ${addr.trc20Address}, clearing flag`)
    return
  }

  const reserveWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': env.TRONGRID_API_KEY } : {},
    privateKey: env.TRX_RESERVE_KEY,
  })
  await reserveWeb.trx.sendTransaction(addr.trc20Address, TRX_FOR_FEES)

  await new Promise(resolve => setTimeout(resolve, SWEEP_WAIT_MS))

  const depositWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': env.TRONGRID_API_KEY } : {},
    privateKey: decryptPrivateKey(addr.encryptedKey),
  })

  const { transaction } = await depositWeb.transactionBuilder.triggerSmartContract(
    USDT_CONTRACT,
    'transfer(address,uint256)',
    { feeLimit: 10_000_000 },
    [
      { type: 'address', value: env.HOT_WALLET_ADDRESS },
      { type: 'uint256', value: rawBalance.toString() },
    ],
    addr.trc20Address,
  )
  const signed = await depositWeb.trx.sign(transaction)
  const result = await depositWeb.trx.sendRawTransaction(signed)
  if (!result.result) throw new Error(`USDT sweep failed: ${JSON.stringify(result)}`)

  await prisma.depositAddress.update({
    where: { trc20Address: addr.trc20Address },
    data: { pendingSweep: false },
  })
  console.log(`TronWatcher sweep: ${amountUsdt} USDT swept from ${addr.trc20Address} to hot wallet`)
}

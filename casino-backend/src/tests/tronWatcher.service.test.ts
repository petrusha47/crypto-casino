import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redis } from '../config/redis'
import { processDeposit, isAlreadyProcessed, markProcessed } from '../services/tronWatcher.service'
import * as balanceService from '../services/balance.service'
import * as cbrService from '../services/cbr.service'
import { BalanceTxType } from '@prisma/client'

vi.mock('../services/balance.service')
vi.mock('../services/cbr.service')

const mockedCreditBalance = vi.mocked(balanceService.creditBalance)
const mockedGetRate = vi.mocked(cbrService.getUsdToRubRate)

beforeEach(async () => {
  vi.resetAllMocks()
  await redis.del('tron:processed:test_tx_hash_001')
  await redis.del('tron:processed:test_tx_hash_002')
})

describe('isAlreadyProcessed / markProcessed', () => {
  it('returns false for unknown tx', async () => {
    expect(await isAlreadyProcessed('test_tx_hash_001')).toBe(false)
  })

  it('returns true after marking processed', async () => {
    await markProcessed('test_tx_hash_001')
    expect(await isAlreadyProcessed('test_tx_hash_001')).toBe(true)
  })
})

describe('processDeposit', () => {
  it('credits balance in RUB when given valid USDT amount', async () => {
    mockedGetRate.mockResolvedValue({ rate: 90, fallback: false })
    mockedCreditBalance.mockResolvedValue(undefined)

    await processDeposit({
      userId: 'user_001',
      txHash: 'test_tx_hash_002',
      amountUsdt: 10,
    })

    expect(mockedCreditBalance).toHaveBeenCalledWith({
      userId: 'user_001',
      amountRub: 900,
      type: BalanceTxType.DEPOSIT,
      refId: 'test_tx_hash_002',
      cbrRate: 90,
      rateFallback: false,
      comment: 'USDT deposit: 10 USDT',
    })
  })

  it('rounds RUB amount to 2 decimal places', async () => {
    mockedGetRate.mockResolvedValue({ rate: 92.3333, fallback: false })
    mockedCreditBalance.mockResolvedValue(undefined)

    await processDeposit({ userId: 'user_001', txHash: 'test_tx_hash_002', amountUsdt: 1 })

    const call = mockedCreditBalance.mock.calls[0][0]
    expect(call.amountRub).toBe(92.33)
  })

  it('marks transaction as processed after crediting', async () => {
    mockedGetRate.mockResolvedValue({ rate: 90, fallback: false })
    mockedCreditBalance.mockResolvedValue(undefined)

    await processDeposit({ userId: 'u1', txHash: 'test_tx_hash_002', amountUsdt: 5 })

    expect(await isAlreadyProcessed('test_tx_hash_002')).toBe(true)
  })
})

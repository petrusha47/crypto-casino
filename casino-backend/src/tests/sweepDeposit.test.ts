import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock calls are hoisted — do NOT reference variables declared in this file inside the factory.
// Use vi.fn() inline; retrieve references via vi.mocked() after the imports below.

vi.mock('tronweb', () => ({
  TronWeb: vi.fn().mockImplementation(() => ({
    trx: {
      sendTransaction: vi.fn(),
      sign: vi.fn(),
      sendRawTransaction: vi.fn(),
    },
    transactionBuilder: {
      triggerSmartContract: vi.fn(),
    },
  })),
}))

vi.mock('axios', () => ({ default: { get: vi.fn() } }))

vi.mock('../config/prisma', () => ({
  prisma: {
    depositAddress: {
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

vi.mock('../config/env', () => ({
  env: {
    HOT_WALLET_ADDRESS: 'THotWalletAddress12345678901234567',
    TRX_RESERVE_KEY: '0'.repeat(64),
    TRONGRID_API_KEY: '',
    NODE_ENV: 'test',
  },
}))

vi.mock('../services/wallet.service', () => ({
  decryptPrivateKey: vi.fn().mockReturnValue('a'.repeat(64)),
  getPendingSweepAddresses: vi.fn().mockResolvedValue([]),
  getAllDepositAddresses: vi.fn().mockResolvedValue([]),
  getOrCreateDepositAddress: vi.fn(),
  isValidTRC20Address: vi.fn(),
}))

vi.mock('../services/cbr.service')
vi.mock('../services/balance.service')

// --- Imports (after mocks) ---
import { TronWeb } from 'tronweb'
import axios from 'axios'
import { prisma } from '../config/prisma'
import { sweepDeposit } from '../services/tronWatcher.service'

// --- Typed mock references ---
const MockedTronWeb = vi.mocked(TronWeb)
const mockAxiosGet = vi.mocked(axios.get)
const mockUpdate = vi.mocked(prisma.depositAddress.update)

// Per-instance TronWeb method mocks — we grab them after construction
let mockSendTransaction: ReturnType<typeof vi.fn>
let mockSign: ReturnType<typeof vi.fn>
let mockSendRaw: ReturnType<typeof vi.fn>
let mockTriggerSmartContract: ReturnType<typeof vi.fn>

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

const TEST_ADDR = {
  userId: 'user_sweep_001',
  trc20Address: 'TTestDepositAddr1234567890123456',
  encryptedKey: 'encrypted_key_value',
}

function mockUsdtBalance(rawBalance: string) {
  mockAxiosGet.mockResolvedValueOnce({
    data: {
      data: [{ trc20: [{ [USDT_CONTRACT]: rawBalance }] }],
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()

  // Re-configure TronWeb constructor to return fresh spies each call
  mockSendTransaction = vi.fn().mockResolvedValue({ txid: 'trx_hash_001' })
  mockSign = vi.fn().mockImplementation((tx: unknown) => ({ ...(tx as object), signature: ['sig'] }))
  mockSendRaw = vi.fn().mockResolvedValue({ result: true })
  mockTriggerSmartContract = vi.fn().mockResolvedValue({ transaction: { raw_data: {}, raw_data_hex: '' } })

  MockedTronWeb.mockImplementation(() => ({
    trx: {
      sendTransaction: mockSendTransaction,
      sign: mockSign,
      sendRawTransaction: mockSendRaw,
    },
    transactionBuilder: {
      triggerSmartContract: mockTriggerSmartContract,
    },
  }) as never)

  mockUpdate.mockResolvedValue({} as never)
})

describe('sweepDeposit', () => {
  it('happy path: sends TRX, triggers USDT transfer, clears flag', async () => {
    mockUsdtBalance('10000000') // 10 USDT

    await sweepDeposit(TEST_ADDR)

    expect(mockSendTransaction).toHaveBeenCalledOnce()
    expect(mockTriggerSmartContract).toHaveBeenCalledWith(
      USDT_CONTRACT,
      'transfer(address,uint256)',
      expect.objectContaining({ feeLimit: expect.any(Number) }),
      expect.arrayContaining([
        { type: 'address', value: 'THotWalletAddress12345678901234567' },
        { type: 'uint256', value: '10000000' },
      ]),
      TEST_ADDR.trc20Address,
    )
    expect(mockSendRaw).toHaveBeenCalledOnce()
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { trc20Address: TEST_ADDR.trc20Address },
      data: { pendingSweep: false },
    })
  })

  it('dust balance (< 1 USDT): clears flag without sending', async () => {
    mockUsdtBalance('500000') // 0.5 USDT

    await sweepDeposit(TEST_ADDR)

    expect(mockSendTransaction).not.toHaveBeenCalled()
    expect(mockTriggerSmartContract).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { trc20Address: TEST_ADDR.trc20Address },
      data: { pendingSweep: false },
    })
  })

  it('zero USDT balance: clears flag without sending', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: { data: [{ trc20: [] }] } })

    await sweepDeposit(TEST_ADDR)

    expect(mockSendTransaction).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { trc20Address: TEST_ADDR.trc20Address },
      data: { pendingSweep: false },
    })
  })

  it('TRX send failure: throws, flag not cleared', async () => {
    mockUsdtBalance('10000000')
    mockSendTransaction.mockRejectedValueOnce(new Error('TRX network error'))

    await expect(sweepDeposit(TEST_ADDR)).rejects.toThrow('TRX network error')

    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { pendingSweep: false } }),
    )
  })

  it('USDT sendRawTransaction returns result=false: throws, flag not cleared', async () => {
    mockUsdtBalance('10000000')
    mockSendRaw.mockResolvedValueOnce({ result: false, message: '414f50454e5f415353455453' })

    await expect(sweepDeposit(TEST_ADDR)).rejects.toThrow()

    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { pendingSweep: false } }),
    )
  })
})

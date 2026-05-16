import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '../config/prisma'
import { creditBalance, debitBalance, InsufficientFundsError } from '../services/balance.service'
import { BalanceTxType } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

let userId: string

beforeEach(async () => {
  const user = await prisma.user.create({
    data: {
      email: `bal-${Date.now()}@test.casino`,
      username: `baltest${Date.now()}`,
      balanceRub: new Decimal(0),
    },
  })
  userId = user.id
})

afterEach(async () => {
  await prisma.balanceTransaction.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
})

describe('creditBalance', () => {
  it('increases user balance and creates transaction log', async () => {
    await creditBalance({
      userId,
      amountRub: 1000,
      type: BalanceTxType.ADMIN_CREDIT,
      comment: 'Test credit',
    })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(Number(user!.balanceRub)).toBe(1000)

    const txn = await prisma.balanceTransaction.findFirst({ where: { userId } })
    expect(txn?.type).toBe(BalanceTxType.ADMIN_CREDIT)
    expect(Number(txn?.amountRub)).toBe(1000)
    expect(txn?.comment).toBe('Test credit')
  })

  it('accumulates multiple credits', async () => {
    await creditBalance({ userId, amountRub: 500, type: BalanceTxType.ADMIN_CREDIT })
    await creditBalance({ userId, amountRub: 300, type: BalanceTxType.ADMIN_CREDIT })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(Number(user!.balanceRub)).toBe(800)
  })

  it('stores cbrRate and rateFallback when provided', async () => {
    await creditBalance({
      userId,
      amountRub: 9000,
      type: BalanceTxType.DEPOSIT,
      cbrRate: 90.5,
      rateFallback: false,
    })
    const txn = await prisma.balanceTransaction.findFirst({ where: { userId } })
    expect(Number(txn?.cbrRate)).toBeCloseTo(90.5)
    expect(txn?.rateFallback).toBe(false)
  })
})

describe('debitBalance', () => {
  it('decreases user balance', async () => {
    await creditBalance({ userId, amountRub: 1000, type: BalanceTxType.ADMIN_CREDIT })
    await debitBalance({ userId, amountRub: 400, type: BalanceTxType.GAME_LOSS })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(Number(user!.balanceRub)).toBe(600)
  })

  it('creates a debit transaction log', async () => {
    await creditBalance({ userId, amountRub: 1000, type: BalanceTxType.ADMIN_CREDIT })
    await debitBalance({ userId, amountRub: 400, type: BalanceTxType.GAME_LOSS, comment: 'slots loss' })
    const txns = await prisma.balanceTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    expect(txns).toHaveLength(2)
    expect(txns[1].type).toBe(BalanceTxType.GAME_LOSS)
    expect(txns[1].comment).toBe('slots loss')
  })

  it('throws InsufficientFundsError when balance is zero', async () => {
    await expect(
      debitBalance({ userId, amountRub: 500, type: BalanceTxType.GAME_LOSS })
    ).rejects.toThrow(InsufficientFundsError)
  })

  it('throws InsufficientFundsError when amount exceeds balance', async () => {
    await creditBalance({ userId, amountRub: 100, type: BalanceTxType.ADMIN_CREDIT })
    await expect(
      debitBalance({ userId, amountRub: 101, type: BalanceTxType.GAME_LOSS })
    ).rejects.toThrow('Insufficient funds')
  })

  it('does not modify balance when InsufficientFundsError is thrown', async () => {
    await creditBalance({ userId, amountRub: 100, type: BalanceTxType.ADMIN_CREDIT })
    await expect(
      debitBalance({ userId, amountRub: 200, type: BalanceTxType.GAME_LOSS })
    ).rejects.toThrow()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(Number(user!.balanceRub)).toBe(100)
  })
})

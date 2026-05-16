import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { requireAuth } from '../middleware/auth'
import { getOrCreateDepositAddress, isValidTRC20Address } from '../services/wallet.service'
import { debitBalance, InsufficientFundsError } from '../services/balance.service'
import { BalanceTxType } from '@prisma/client'

export const walletRouter = Router()

walletRouter.get('/deposit-address', requireAuth, async (req, res) => {
  const address = await getOrCreateDepositAddress(req.user!.userId)
  res.json({ address })
})

walletRouter.get('/transactions', requireAuth, async (req, res) => {
  const transactions = await prisma.balanceTransaction.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, type: true, amountRub: true,
      comment: true, refId: true, cbrRate: true,
      rateFallback: true, createdAt: true,
    },
  })
  res.json({ transactions })
})

const withdrawSchema = z.object({
  amountRub: z.number().positive(),
  trc20Address: z.string().min(1),
})

walletRouter.post('/withdraw', requireAuth, async (req, res) => {
  const parsed = withdrawSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { amountRub, trc20Address } = parsed.data

  if (!isValidTRC20Address(trc20Address)) {
    return res.status(400).json({ error: 'Invalid TRC20 address' })
  }

  try {
    await debitBalance({
      userId: req.user!.userId,
      amountRub,
      type: BalanceTxType.WITHDRAWAL,
      comment: `Withdrawal request to ${trc20Address}`,
    })
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return res.status(400).json({ error: 'Insufficient balance' })
    }
    throw err
  }

  const withdrawal = await prisma.withdrawalRequest.create({
    data: {
      userId: req.user!.userId,
      amountRub,
      trc20Address,
    },
    select: { id: true, amountRub: true, trc20Address: true, status: true, createdAt: true },
  })

  res.status(201).json({ withdrawal })
})

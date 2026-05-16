import { BalanceTxType } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '../config/prisma'

interface BalanceOpParams {
  userId: string
  amountRub: number
  type: BalanceTxType
  comment?: string
  refId?: string
  cbrRate?: number
  rateFallback?: boolean
}

export class InsufficientFundsError extends Error {
  constructor() { super('Insufficient funds') }
}

export async function creditBalance(params: BalanceOpParams): Promise<void> {
  const { userId, amountRub, type, comment, refId, cbrRate, rateFallback } = params
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { balanceRub: { increment: new Decimal(amountRub) } },
    }),
    prisma.balanceTransaction.create({
      data: {
        userId,
        type,
        amountRub: new Decimal(amountRub),
        comment,
        refId,
        cbrRate: cbrRate != null ? new Decimal(cbrRate) : null,
        rateFallback: rateFallback ?? false,
      },
    }),
  ])
}

export async function debitBalance(params: BalanceOpParams): Promise<void> {
  const { userId, amountRub, type, comment, refId } = params

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { balanceRub: true },
    })
    if (!user || new Decimal(user.balanceRub).lt(amountRub)) {
      throw new InsufficientFundsError()
    }
    await tx.user.update({
      where: { id: userId },
      data: { balanceRub: { decrement: new Decimal(amountRub) } },
    })
    await tx.balanceTransaction.create({
      data: {
        userId,
        type,
        amountRub: new Decimal(amountRub),
        comment,
        refId,
      },
    })
  })
}

import 'dotenv/config'
import { PrismaClient, BalanceTxType, Role } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

async function main() {
  const USER_ID = 'cmqfkw0nf000bon2e1fa95mhb'
  const AMOUNT = 10_000

  const user = await prisma.user.findUnique({ where: { id: USER_ID } })
  if (!user) {
    console.error(`User ${USER_ID} not found`)
    process.exit(1)
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: USER_ID },
      data: {
        balanceRub: { increment: new Decimal(AMOUNT) },
        role: Role.ADMIN,
      },
    }),
    prisma.balanceTransaction.create({
      data: {
        userId: USER_ID,
        type: BalanceTxType.ADMIN_CREDIT,
        amountRub: new Decimal(AMOUNT),
        comment: 'Demo balance top-up',
      },
    }),
  ])

  const updated = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: { email: true, username: true, role: true, balanceRub: true },
  })
  console.log('Done:', updated)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

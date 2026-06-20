import 'dotenv/config'
import { PrismaClient, Role, BalanceTxType } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const EMAIL = 'admin@zwcasino.com'
  const USERNAME = 'admin'
  const PASSWORD = 'Admin123!'

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } })
  if (existing) {
    console.log('Admin already exists:', existing.email, existing.role)
    return
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  const admin = await prisma.user.create({
    data: {
      email: EMAIL,
      username: USERNAME,
      passwordHash,
      role: Role.ADMIN,
      balanceRub: new Decimal(0),
    },
  })

  console.log('Created admin:', admin.email, admin.id)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

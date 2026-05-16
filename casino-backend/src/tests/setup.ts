import { prisma } from '../config/prisma'
import { redis } from '../config/redis'

afterAll(async () => {
  await prisma.$disconnect()
  await redis.disconnect()
})

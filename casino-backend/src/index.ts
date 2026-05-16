import 'dotenv/config'
import { createServer } from 'http'
import { createApp } from './app'
import { env } from './config/env'
import { prisma } from './config/prisma'
import { redis } from './config/redis'

async function main() {
  await redis.connect()
  await prisma.$connect()

  const app = createApp()
  const httpServer = createServer(app)

  httpServer.listen(env.PORT, () => {
    console.log(`Backend running on http://localhost:${env.PORT}`)
  })
}

main().catch(console.error)

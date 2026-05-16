import 'dotenv/config'
import { createServer } from 'http'
import { createApp } from './app'
import { env } from './config/env'
import { prisma } from './config/prisma'
import { redis } from './config/redis'
import { startTronWatcher } from './services/tronWatcher.service'

async function main() {
  await redis.connect()
  await prisma.$connect()

  const app = createApp()
  const httpServer = createServer(app)

  httpServer.listen(env.PORT, () => {
    console.log(`Backend running on http://localhost:${env.PORT}`)
    if (env.NODE_ENV !== 'test') {
      startTronWatcher()
      console.log('TronWatcher: polling TronGrid every 10s')
    }
  })
}

main().catch(console.error)

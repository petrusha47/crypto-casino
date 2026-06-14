import 'dotenv/config'
import { createServer } from 'http'
import { createApp } from './app'
import { env } from './config/env'
import { prisma } from './config/prisma'
import { redis } from './config/redis'
import { startTronWatcher } from './services/tronWatcher.service'
import { createSocketServer } from './socket/index'
import { registerCrashHandler } from './socket/crash.handler'
import { registerPokerHandler } from './socket/poker.handler'

async function main() {
  const app = createApp()
  const httpServer = createServer(app)
  const io = createSocketServer(httpServer)

  registerCrashHandler(io)
  registerPokerHandler(io)

  await new Promise<void>(resolve => {
    httpServer.listen(env.PORT, () => {
      console.log(`Backend running on port ${env.PORT}`)
      resolve()
    })
  })

  await redis.connect()
  await prisma.$connect()

  if (env.NODE_ENV !== 'test') {
    startTronWatcher()
    console.log('TronWatcher: polling TronGrid every 10s')
  }
}

main().catch(console.error)

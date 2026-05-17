import express, { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { env } from './config/env'
import { authLimiter, defaultLimiter } from './middleware/rateLimiter'
import { requireAuth } from './middleware/auth'
import { authRouter } from './routes/auth'
import { userRouter } from './routes/user'
import { walletRouter } from './routes/wallet'
import { gamesRouter } from './routes/games'
import { adminRouter } from './routes/admin'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
  app.use(compression())
  app.use(express.json())
  app.use(cookieParser())
  app.use(defaultLimiter)

  app.get('/health', (_req, res) => res.json({ status: 'ok' }))
  app.use('/api/auth', authLimiter, authRouter)
  app.use('/api/user', userRouter)
  app.use('/api/wallet', walletRouter)
  app.use('/api/games', gamesRouter)
  app.use('/api/admin', requireAuth, adminRouter)

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}

import express, { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { env } from './config/env'
import { authLimiter, defaultLimiter } from './middleware/rateLimiter'
import { authRouter } from './routes/auth'
import { userRouter } from './routes/user'

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

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}

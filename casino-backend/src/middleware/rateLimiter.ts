import rateLimit from 'express-rate-limit'

const isTest = process.env.NODE_ENV === 'test'

export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
})

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 10,
  message: { error: 'Too many attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

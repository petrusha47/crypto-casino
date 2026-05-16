import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { Role } from '@prisma/client'

const SALT_ROUNDS = 12
const ACCESS_EXPIRES = '15m'
const REFRESH_EXPIRES = '30d'

export interface TokenPayload {
  userId: string
  role: Role
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES })
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES })
}

function assertTokenPayload(decoded: unknown): TokenPayload {
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).userId !== 'string' ||
    typeof (decoded as Record<string, unknown>).role !== 'string'
  ) {
    throw new Error('Invalid token payload')
  }
  return decoded as TokenPayload
}

export function verifyAccessToken(token: string): TokenPayload {
  return assertTokenPayload(jwt.verify(token, env.JWT_ACCESS_SECRET))
}

export function verifyRefreshToken(token: string): TokenPayload {
  return assertTokenPayload(jwt.verify(token, env.JWT_REFRESH_SECRET))
}

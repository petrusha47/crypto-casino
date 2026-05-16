# Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the Express backend with TypeScript, Prisma/PostgreSQL, Redis, email+JWT auth, and atomic balance service — the foundation all other plans depend on.

**Architecture:** Express app in `casino-backend/`, Prisma schema matching the spec, JWT middleware, balance operations as atomic Prisma transactions. Telegram auth is Plan 2. Frontend is Plan 4.

**Tech Stack:** Node.js 20, Express 4, TypeScript 5, Prisma 5, PostgreSQL 15, Redis 7, Vitest, Supertest, bcrypt, jsonwebtoken, Zod

---

## File Map

```
casino-backend/
  src/
    index.ts                  # HTTP + Socket.io server entry
    app.ts                    # Express app (middleware, routes, error handler)
    config/
      env.ts                  # Zod-validated env vars
      prisma.ts               # PrismaClient singleton
      redis.ts                # Redis client singleton
    middleware/
      auth.ts                 # verifyJwt — attaches req.user
      admin.ts                # requireRole('ADMIN') | requireRole('SUPPORT')
      rateLimiter.ts          # express-rate-limit presets
    routes/
      auth.ts                 # POST /api/auth/register|login|refresh
      user.ts                 # GET /api/user/me, /api/user/balance
    services/
      auth.service.ts         # hashPassword, verifyPassword, signTokens, refreshTokens
      balance.service.ts      # creditBalance, debitBalance (Prisma transactions)
    tests/
      auth.test.ts
      balance.test.ts
      routes/
        auth.routes.test.ts
  prisma/
    schema.prisma
  package.json
  tsconfig.json
  vitest.config.ts
  .env.example
```

---

### Task 1: Scaffold `casino-backend`

**Files:**
- Create: `casino-backend/package.json`
- Create: `casino-backend/tsconfig.json`
- Create: `casino-backend/vitest.config.ts`
- Create: `casino-backend/.env.example`

- [ ] **Step 1: Create the backend directory and package.json**

```bash
mkdir -p casino-backend/src/config casino-backend/src/middleware casino-backend/src/routes casino-backend/src/services casino-backend/src/tests/routes casino-backend/prisma
```

- [ ] **Step 2: Write `casino-backend/package.json`**

```json
{
  "name": "casino-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.14.0",
    "bcrypt": "^5.1.1",
    "compression": "^1.7.4",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.3.1",
    "helmet": "^7.1.0",
    "ioredis": "^5.3.2",
    "jsonwebtoken": "^9.0.2",
    "socket.io": "^4.7.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/compression": "^1.7.5",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "prisma": "^5.14.0",
    "supertest": "^7.0.0",
    "tsx": "^4.15.2",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Write `casino-backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "paths": {}
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Write `casino-backend/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/tests/setup.ts'],
    coverage: { provider: 'v8' }
  }
})
```

- [ ] **Step 5: Write `casino-backend/.env.example`**

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/casino"
REDIS_URL="redis://localhost:6379"
JWT_ACCESS_SECRET="change-me-access-32chars-minimum"
JWT_REFRESH_SECRET="change-me-refresh-32chars-minimum"
ENCRYPTION_KEY="change-me-exactly-32-chars-aes256"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
TRONGRID_API_KEY=""
TELEGRAM_BOT_TOKEN=""
```

- [ ] **Step 6: Install dependencies**

```bash
cd casino-backend && npm install
```

Expected: `node_modules` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add casino-backend/
git commit -m "feat: scaffold casino-backend with TypeScript + Vitest"
```

---

### Task 2: Prisma Schema

**Files:**
- Create: `casino-backend/prisma/schema.prisma`

- [ ] **Step 1: Write the Prisma schema**

```prisma
// casino-backend/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  username     String   @unique
  passwordHash String?
  telegramId   String?  @unique
  balanceRub   Decimal  @default(0) @db.Decimal(18, 2)
  role         Role     @default(USER)
  isBanned     Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  depositAddress     DepositAddress?
  balanceTxns        BalanceTransaction[]
  gameRounds         GameRound[]
  withdrawalRequests WithdrawalRequest[]
  crashBets          CrashBet[]

  @@index([email])
  @@index([telegramId])
}

model DepositAddress {
  id           String @id @default(cuid())
  userId       String @unique
  trc20Address String @unique
  encryptedKey String
  user         User   @relation(fields: [userId], references: [id])
}

model BalanceTransaction {
  id           String        @id @default(cuid())
  userId       String
  type         BalanceTxType
  amountRub    Decimal       @db.Decimal(18, 2)
  comment      String?
  refId        String?
  cbrRate      Decimal?      @db.Decimal(10, 4)
  rateFallback Boolean       @default(false)
  createdAt    DateTime      @default(now())
  user         User          @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([type])
}

model WithdrawalRequest {
  id           String           @id @default(cuid())
  userId       String
  amountRub    Decimal          @db.Decimal(18, 2)
  trc20Address String
  status       WithdrawalStatus @default(PENDING)
  reviewedBy   String?
  reviewNote   String?
  createdAt    DateTime         @default(now())
  reviewedAt   DateTime?
  user         User             @relation(fields: [userId], references: [id])

  @@index([status])
}

model GameRound {
  id             String   @id @default(cuid())
  userId         String
  game           GameType
  betRub         Decimal  @db.Decimal(18, 2)
  winRub         Decimal  @db.Decimal(18, 2)
  serverSeedHash String
  serverSeed     String?
  clientSeed     String
  nonce          Int
  result         Json
  createdAt      DateTime @default(now())
  user           User     @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([game])
}

model CrashRound {
  id         String     @id @default(cuid())
  hash       String     @unique
  crashPoint Float
  startedAt  DateTime
  crashedAt  DateTime?
  bets       CrashBet[]
}

model CrashBet {
  id        String     @id @default(cuid())
  userId    String
  roundId   String
  betRub    Decimal    @db.Decimal(18, 2)
  cashoutAt Float?
  profitRub Decimal    @db.Decimal(18, 2) @default(0)
  user      User       @relation(fields: [userId], references: [id])
  round     CrashRound @relation(fields: [roundId], references: [id])

  @@index([userId])
  @@index([roundId])
}

model PokerTable {
  id         String      @id @default(cuid())
  name       String
  maxPlayers Int         @default(6)
  minBetRub  Decimal     @db.Decimal(18, 2)
  maxBetRub  Decimal     @db.Decimal(18, 2)
  rake       Float       @default(0.05)
  status     TableStatus @default(WAITING)
}

enum Role             { USER SUPPORT ADMIN }
enum GameType         { SLOTS ROULETTE BLACKJACK }
enum BalanceTxType    { DEPOSIT ADMIN_CREDIT ADMIN_DEBIT GAME_WIN GAME_LOSS WITHDRAWAL }
enum WithdrawalStatus { PENDING APPROVED REJECTED }
enum TableStatus      { WAITING ACTIVE FINISHED }
```

- [ ] **Step 2: Start PostgreSQL locally (Docker)**

```bash
docker run -d --name casino-pg \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=casino \
  -p 5432:5432 postgres:15-alpine
```

Expected: container ID printed, no errors.

- [ ] **Step 3: Copy `.env.example` to `.env` and set DATABASE_URL**

```bash
cd casino-backend && cp .env.example .env
# Edit .env: DATABASE_URL="postgresql://postgres:password@localhost:5432/casino"
```

- [ ] **Step 4: Run initial migration**

```bash
cd casino-backend && npx prisma migrate dev --name init
```

Expected: Migration created and applied, `prisma generate` runs automatically.

- [ ] **Step 5: Start Redis locally (Docker)**

```bash
docker run -d --name casino-redis -p 6379:6379 redis:7-alpine
```

- [ ] **Step 6: Commit**

```bash
git add casino-backend/prisma/
git commit -m "feat: add Prisma schema with all models"
```

---

### Task 3: Config singletons (env, prisma, redis)

**Files:**
- Create: `casino-backend/src/config/env.ts`
- Create: `casino-backend/src/config/prisma.ts`
- Create: `casino-backend/src/config/redis.ts`
- Create: `casino-backend/src/tests/setup.ts`

- [ ] **Step 1: Write `src/config/env.ts`**

```typescript
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(32),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  TRONGRID_API_KEY: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const env = envSchema.parse(process.env)
```

- [ ] **Step 2: Write `src/config/prisma.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['query'] : [] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 3: Write `src/config/redis.ts`**

```typescript
import Redis from 'ioredis'
import { env } from './env'

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

redis.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') console.error('Redis error:', err)
})
```

- [ ] **Step 4: Write `src/tests/setup.ts`**

```typescript
import { prisma } from '../config/prisma'
import { redis } from '../config/redis'

afterAll(async () => {
  await prisma.$disconnect()
  await redis.disconnect()
})
```

- [ ] **Step 5: Commit**

```bash
git add casino-backend/src/config/ casino-backend/src/tests/setup.ts
git commit -m "feat: add env/prisma/redis config singletons"
```

---

### Task 4: Express app setup

**Files:**
- Create: `casino-backend/src/app.ts`
- Create: `casino-backend/src/index.ts`
- Create: `casino-backend/src/middleware/rateLimiter.ts`

- [ ] **Step 1: Write `src/middleware/rateLimiter.ts`**

```typescript
import rateLimit from 'express-rate-limit'

export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})
```

- [ ] **Step 2: Write `src/app.ts`**

```typescript
import express, { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import { env } from './config/env'
import { defaultLimiter } from './middleware/rateLimiter'
import { authRouter } from './routes/auth'
import { userRouter } from './routes/user'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
  app.use(compression())
  app.use(express.json())
  app.use(defaultLimiter)

  app.get('/health', (_req, res) => res.json({ status: 'ok' }))
  app.use('/api/auth', authRouter)
  app.use('/api/user', userRouter)

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
```

- [ ] **Step 3: Write `src/index.ts`**

```typescript
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
```

- [ ] **Step 4: Verify server starts**

```bash
cd casino-backend && npm run dev
```

Expected: `Backend running on http://localhost:4000`

Visit `http://localhost:4000/health` → `{"status":"ok"}`

- [ ] **Step 5: Commit**

```bash
git add casino-backend/src/app.ts casino-backend/src/index.ts casino-backend/src/middleware/rateLimiter.ts
git commit -m "feat: add Express app with helmet, cors, rate limiting"
```

---

### Task 5: Auth service (register, login, JWT)

**Files:**
- Create: `casino-backend/src/services/auth.service.ts`
- Create: `casino-backend/src/tests/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// casino-backend/src/tests/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { hashPassword, verifyPassword, signAccessToken, signRefreshToken, verifyAccessToken } from '../services/auth.service'

describe('hashPassword', () => {
  it('returns a hash different from the input', async () => {
    const hash = await hashPassword('secret123')
    expect(hash).not.toBe('secret123')
    expect(hash.length).toBeGreaterThan(20)
  })
})

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('secret123')
    expect(await verifyPassword('secret123', hash)).toBe(true)
  })

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('secret123')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})

describe('JWT', () => {
  const payload = { userId: 'cltest123', role: 'USER' as const }

  it('access token encodes and verifies userId', () => {
    const token = signAccessToken(payload)
    const decoded = verifyAccessToken(token)
    expect(decoded.userId).toBe('cltest123')
    expect(decoded.role).toBe('USER')
  })

  it('verifyAccessToken throws on tampered token', () => {
    const token = signAccessToken(payload)
    expect(() => verifyAccessToken(token + 'x')).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd casino-backend && npm test src/tests/auth.test.ts
```

Expected: FAIL — `Cannot find module '../services/auth.service'`

- [ ] **Step 3: Write `src/services/auth.service.ts`**

```typescript
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

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd casino-backend && npm test src/tests/auth.test.ts
```

Expected: PASS — 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add casino-backend/src/services/auth.service.ts casino-backend/src/tests/auth.test.ts
git commit -m "feat: add auth service with bcrypt + JWT"
```

---

### Task 6: Auth middleware + JWT verification

**Files:**
- Create: `casino-backend/src/middleware/auth.ts`
- Create: `casino-backend/src/middleware/admin.ts`

- [ ] **Step 1: Write `src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, TokenPayload } from '../services/auth.service'
import { Role } from '@prisma/client'

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    req.user = verifyAccessToken(header.slice(7))
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
```

- [ ] **Step 2: Write `src/middleware/admin.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'
import { Role } from '@prisma/client'

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add casino-backend/src/middleware/auth.ts casino-backend/src/middleware/admin.ts
git commit -m "feat: add JWT auth middleware and role guard"
```

---

### Task 7: Auth routes (register + login + refresh)

**Files:**
- Create: `casino-backend/src/routes/auth.ts`
- Create: `casino-backend/src/routes/user.ts`
- Create: `casino-backend/src/tests/routes/auth.routes.test.ts`

- [ ] **Step 1: Write the failing route tests**

```typescript
// casino-backend/src/tests/routes/auth.routes.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../app'
import { prisma } from '../../config/prisma'

const app = createApp()

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: '@test.casino' } } })
})

describe('POST /api/auth/register', () => {
  it('creates a user and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'alice@test.casino',
      username: 'alice_test',
      password: 'Password1!',
    })
    expect(res.status).toBe(201)
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.user.email).toBe('alice@test.casino')
    expect(res.body.user.passwordHash).toBeUndefined()
  })

  it('returns 409 on duplicate email', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'bob@test.casino', username: 'bob_test', password: 'Password1!',
    })
    const res = await request(app).post('/api/auth/register').send({
      email: 'bob@test.casino', username: 'bob_test2', password: 'Password1!',
    })
    expect(res.status).toBe(409)
  })
})

describe('POST /api/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'carol@test.casino', username: 'carol_test', password: 'Password1!',
    })
    const res = await request(app).post('/api/auth/login').send({
      email: 'carol@test.casino', password: 'Password1!',
    })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeDefined()
  })

  it('returns 401 for wrong password', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dave@test.casino', username: 'dave_test', password: 'Password1!',
    })
    const res = await request(app).post('/api/auth/login').send({
      email: 'dave@test.casino', password: 'wrong',
    })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd casino-backend && npm test src/tests/routes/auth.routes.test.ts
```

Expected: FAIL — routes not found (404)

- [ ] **Step 3: Write `src/routes/auth.ts`**

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import {
  hashPassword, verifyPassword,
  signAccessToken, signRefreshToken, verifyRefreshToken
} from '../services/auth.service'
import { authLimiter } from '../middleware/rateLimiter'

export const authRouter = Router()

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

authRouter.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { email, username, password } = parsed.data
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  })
  if (existing) return res.status(409).json({ error: 'Email or username already taken' })

  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { email, username, passwordHash },
    select: { id: true, email: true, username: true, role: true, balanceRub: true, createdAt: true },
  })

  const accessToken = signAccessToken({ userId: user.id, role: user.role })
  const refreshToken = signRefreshToken({ userId: user.id, role: user.role })

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000,
  })
  res.status(201).json({ accessToken, user })
})

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { email, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' })
  if (user.isBanned) return res.status(403).json({ error: 'Account banned' })

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  const accessToken = signAccessToken({ userId: user.id, role: user.role })
  const refreshToken = signRefreshToken({ userId: user.id, role: user.role })

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000,
  })
  res.json({
    accessToken,
    user: { id: user.id, email: user.email, username: user.username, role: user.role, balanceRub: user.balanceRub },
  })
})

authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.refreshToken
  if (!token) return res.status(401).json({ error: 'No refresh token' })
  try {
    const payload = verifyRefreshToken(token)
    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user || user.isBanned) return res.status(401).json({ error: 'Unauthorized' })

    const accessToken = signAccessToken({ userId: user.id, role: user.role })
    res.json({ accessToken })
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' })
  }
})
```

- [ ] **Step 4: Write `src/routes/user.ts`**

```typescript
import { Router } from 'express'
import { prisma } from '../config/prisma'
import { requireAuth } from '../middleware/auth'

export const userRouter = Router()

userRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, username: true, role: true, balanceRub: true, createdAt: true },
  })
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

userRouter.get('/balance', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { balanceRub: true },
  })
  res.json({ balanceRub: user?.balanceRub ?? 0 })
})
```

- [ ] **Step 5: Add `cookie-parser` to app (needed for refresh tokens)**

```bash
cd casino-backend && npm install cookie-parser @types/cookie-parser
```

Add to `src/app.ts` after `import compression`:
```typescript
import cookieParser from 'cookie-parser'
```

Add after `app.use(express.json())`:
```typescript
app.use(cookieParser())
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd casino-backend && npm test src/tests/routes/auth.routes.test.ts
```

Expected: PASS — 4 tests pass

- [ ] **Step 7: Commit**

```bash
git add casino-backend/src/routes/ casino-backend/src/tests/routes/
git commit -m "feat: add register/login/refresh auth routes with Zod validation"
```

---

### Task 8: Balance service (atomic credit/debit)

**Files:**
- Create: `casino-backend/src/services/balance.service.ts`
- Create: `casino-backend/src/tests/balance.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// casino-backend/src/tests/balance.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../config/prisma'
import { creditBalance, debitBalance } from '../services/balance.service'
import { BalanceTxType } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

let userId: string

beforeEach(async () => {
  const user = await prisma.user.create({
    data: { email: `bal-${Date.now()}@test.casino`, username: `baltest${Date.now()}`, balanceRub: new Decimal(0) },
  })
  userId = user.id
})

afterEach(async () => {
  await prisma.balanceTransaction.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
})

describe('creditBalance', () => {
  it('increases user balance and creates transaction log', async () => {
    await creditBalance({ userId, amountRub: 1000, type: BalanceTxType.ADMIN_CREDIT, comment: 'Test credit' })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(Number(user!.balanceRub)).toBe(1000)

    const txn = await prisma.balanceTransaction.findFirst({ where: { userId } })
    expect(txn?.type).toBe(BalanceTxType.ADMIN_CREDIT)
    expect(Number(txn?.amountRub)).toBe(1000)
  })

  it('accumulates multiple credits', async () => {
    await creditBalance({ userId, amountRub: 500, type: BalanceTxType.ADMIN_CREDIT })
    await creditBalance({ userId, amountRub: 300, type: BalanceTxType.ADMIN_CREDIT })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(Number(user!.balanceRub)).toBe(800)
  })
})

describe('debitBalance', () => {
  it('decreases user balance', async () => {
    await creditBalance({ userId, amountRub: 1000, type: BalanceTxType.ADMIN_CREDIT })
    await debitBalance({ userId, amountRub: 400, type: BalanceTxType.GAME_LOSS })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(Number(user!.balanceRub)).toBe(600)
  })

  it('throws InsufficientFundsError when balance too low', async () => {
    await expect(
      debitBalance({ userId, amountRub: 500, type: BalanceTxType.GAME_LOSS })
    ).rejects.toThrow('Insufficient funds')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd casino-backend && npm test src/tests/balance.test.ts
```

Expected: FAIL — `Cannot find module '../services/balance.service'`

- [ ] **Step 3: Write `src/services/balance.service.ts`**

```typescript
import { BalanceTxType } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '../config/prisma'

interface BalanceOpParams {
  userId: string
  amountRub: number
  type: BalanceTxType
  comment?: string
  refId?: string
  cbrRate?: number
  rateFallback?: boolean
}

export class InsufficientFundsError extends Error {
  constructor() { super('Insufficient funds') }
}

export async function creditBalance(params: BalanceOpParams): Promise<void> {
  const { userId, amountRub, type, comment, refId, cbrRate, rateFallback } = params
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { balanceRub: { increment: new Decimal(amountRub) } },
    }),
    prisma.balanceTransaction.create({
      data: { userId, type, amountRub: new Decimal(amountRub), comment, refId,
        cbrRate: cbrRate ? new Decimal(cbrRate) : null,
        rateFallback: rateFallback ?? false },
    }),
  ])
}

export async function debitBalance(params: BalanceOpParams): Promise<void> {
  const { userId, amountRub, type, comment, refId } = params

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { balanceRub: true } })
    if (!user || new Decimal(user.balanceRub).lt(amountRub)) {
      throw new InsufficientFundsError()
    }
    await tx.user.update({
      where: { id: userId },
      data: { balanceRub: { decrement: new Decimal(amountRub) } },
    })
    await tx.balanceTransaction.create({
      data: { userId, type, amountRub: new Decimal(amountRub), comment, refId },
    })
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd casino-backend && npm test src/tests/balance.test.ts
```

Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add casino-backend/src/services/balance.service.ts casino-backend/src/tests/balance.test.ts
git commit -m "feat: add atomic balance service with InsufficientFundsError"
```

---

### Task 9: Run full test suite + smoke test

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

```bash
cd casino-backend && npm test
```

Expected: All tests PASS. Count should be ≥ 13.

- [ ] **Step 2: Smoke test the running server**

```bash
# In one terminal:
cd casino-backend && npm run dev

# In another:
curl -s http://localhost:4000/health | jq
# Expected: {"status":"ok"}

curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","username":"smoketest","password":"Password1!"}' | jq .user.email
# Expected: "smoke@test.com"
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: backend core complete — auth, balance, Prisma, Redis"
```

---

## What's Next

This plan delivers a working Express backend with:
- PostgreSQL schema (all models)
- Email + JWT auth (register, login, refresh)
- Atomic balance credit/debit with full audit log
- Role-based middleware

**Remaining plans:**
- **Plan 2:** Wallet & TRC20 (TronGrid watcher, CBR rate, deposit addresses, withdrawal queue)
- **Plan 3:** Game Engines (Provably fair, Slots, Roulette, Blackjack, Crash, Poker)
- **Plan 4:** Frontend (Next.js 14, all pages and game UIs)
- **Plan 5:** Admin Panel (backend routes + frontend admin section)

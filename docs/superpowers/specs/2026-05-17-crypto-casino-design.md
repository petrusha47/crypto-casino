# Crypto Casino Platform — Design Spec
**Date:** 2026-05-17

---

## Overview

Реальная онлайн-казино платформа с депозитами через USDT TRC20 и внутренним балансом в рублях. Пять игр: слоты, краш, покер, рулетка, блэкджек. Вся игровая логика на сервере с провабли-фэйр верификацией.

---

## Tech Stack

| Слой | Технология |
|------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Socket.io-client |
| Backend | Node.js, Express, Socket.io, TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Cache / Real-time state | Redis |
| TRC20 Monitoring | TronGrid API (polling каждые 10 сек) |
| CBR Rate | api.cbr.ru (раз в сутки, кэш в Redis) |
| Auth | JWT (access + refresh tokens), Telegram Login Widget |
| Deploy | Frontend → Vercel, Backend → Railway |

**Репозитории:** `casino-frontend` (Next.js) + `casino-backend` (Express).

---

## Visual Theme

**Neon Cyber** — тёмный фон (`#050510`), неоновые акценты фиолетовый (`#7b2fff`) и голубой (`#00f5ff`). Шрифт monospace/sans-serif. Glow-эффекты на кнопках и балансе.

---

## Authentication

- **Email + пароль** — регистрация с подтверждением email (Nodemailer)
- **Telegram Login Widget** — OAuth через Telegram Bot API
- JWT: access token (15 мин) + refresh token (30 дней, в httpOnly cookie)
- Роли: `USER`, `SUPPORT`, `ADMIN`

---

## Balance System

**Весь баланс — внутренний, в рублях (RUB).**

### Пополнение (USDT TRC20 → RUB)
1. При регистрации пользователю генерируется уникальный TRC20 адрес (хранится в `DepositAddress`, приватный ключ зашифрован AES-256)
2. Бэкенд опрашивает TronGrid API каждые 10 секунд на входящие USDT-транзакции
3. После 6 подтверждений блокчейна:
   - Запрашивается курс ЦБ (USDT/RUB) из Redis-кэша (обновляется раз в сутки с api.cbr.ru)
   - `amount_rub = amount_usdt × cbr_rate`
   - Курс фиксируется в записи транзакции
   - Баланс пользователя увеличивается на `amount_rub`

### Ручное начисление (Admin)
- Администратор через панель может начислить/списать произвольную сумму RUB с комментарием
- Все операции логируются в `BalanceTransaction`

### Вывод
1. Пользователь создаёт `WithdrawalRequest` (сумма RUB, TRC20 адрес для вывода)
2. Статус: `PENDING` → `APPROVED` / `REJECTED`
3. Саппорт/Админ в панели видит очередь, подтверждает вручную
4. При подтверждении: баланс списывается, USDT отправляется на адрес пользователя (или вручную)

---

## Database Schema

```prisma
model User {
  id             String   @id @default(cuid())
  email          String   @unique
  username       String   @unique
  passwordHash   String?
  telegramId     String?  @unique
  balanceRub     Decimal  @default(0) @db.Decimal(18,2)
  role           Role     @default(USER)
  isBanned       Boolean  @default(false)
  createdAt      DateTime @default(now())

  depositAddress    DepositAddress?
  balanceTxns       BalanceTransaction[]
  gameRounds        GameRound[]
  withdrawalRequests WithdrawalRequest[]
  crashBets         CrashBet[]
}

model DepositAddress {
  id             String   @id @default(cuid())
  userId         String   @unique
  trc20Address   String   @unique
  encryptedKey   String
  user           User     @relation(fields: [userId], references: [id])
}

model BalanceTransaction {
  id          String              @id @default(cuid())
  userId      String
  type        BalanceTxType       // DEPOSIT | ADMIN_CREDIT | ADMIN_DEBIT | GAME_WIN | GAME_LOSS | WITHDRAWAL
  amountRub   Decimal             @db.Decimal(18,2)
  comment     String?
  refId       String?             // txHash или gameRound.id
  cbrRate     Decimal?            @db.Decimal(10,4)  // курс ЦБ на момент депозита
  createdAt   DateTime            @default(now())
  user        User                @relation(fields: [userId], references: [id])
}

model WithdrawalRequest {
  id            String            @id @default(cuid())
  userId        String
  amountRub     Decimal           @db.Decimal(18,2)
  trc20Address  String
  status        WithdrawalStatus  @default(PENDING)  // PENDING | APPROVED | REJECTED
  reviewedBy    String?
  reviewNote    String?
  createdAt     DateTime          @default(now())
  reviewedAt    DateTime?
  user          User              @relation(fields: [userId], references: [id])
}

model GameRound {
  id             String   @id @default(cuid())
  userId         String
  game           GameType // SLOTS | ROULETTE | BLACKJACK
  betRub         Decimal  @db.Decimal(18,2)
  winRub         Decimal  @db.Decimal(18,2)
  serverSeedHash String
  serverSeed     String?  // раскрывается после раунда
  clientSeed     String
  nonce          Int
  result         Json
  createdAt      DateTime @default(now())
  user           User     @relation(fields: [userId], references: [id])
}

model CrashRound {
  id          String     @id @default(cuid())
  hash        String     @unique  // провабли-фэйр
  crashPoint  Float
  startedAt   DateTime
  crashedAt   DateTime?
  bets        CrashBet[]
}

model CrashBet {
  id           String      @id @default(cuid())
  userId       String
  roundId      String
  betRub       Decimal     @db.Decimal(18,2)
  cashoutAt    Float?      // множитель при кешауте, null = проигрыш
  profitRub    Decimal     @db.Decimal(18,2) @default(0)
  user         User        @relation(fields: [userId], references: [id])
  round        CrashRound  @relation(fields: [roundId], references: [id])
}

model PokerTable {
  id          String      @id @default(cuid())
  name        String
  maxPlayers  Int         @default(6)
  minBetRub   Decimal     @db.Decimal(18,2)
  maxBetRub   Decimal     @db.Decimal(18,2)
  rake        Float       @default(0.05)  // 5%
  status      TableStatus @default(WAITING)
}

enum Role             { USER SUPPORT ADMIN }
enum GameType         { SLOTS ROULETTE BLACKJACK }
enum BalanceTxType    { DEPOSIT ADMIN_CREDIT ADMIN_DEBIT GAME_WIN GAME_LOSS WITHDRAWAL }
enum WithdrawalStatus { PENDING APPROVED REJECTED }
enum TableStatus      { WAITING ACTIVE FINISHED }
```

---

## Games

### Слоты
- 5 барабанов, 20 линий выплат
- Ставка → сервер генерирует результат через HMAC-SHA256(serverSeed, clientSeed + nonce)
- RTP: 96% (настраивается в `.env`)
- Анимация на клиенте, исход приходит с API

### Краш (Crash)
- Мультиплеерный: новый раунд каждые ~12 сек
- `crashPoint` предопределён хешем, раскрывается после крэша
- Множитель растёт в реальном времени через WebSocket (событие `crash:tick`)
- Игрок нажимает Cashout → сервер фиксирует `cashoutAt`, начисляет `bet × cashoutAt`
- House edge: ~3%

### Покер (Texas Hold'em 6-max)
- Столы до 6 игроков, реальные деньги
- Вся логика на сервере: сдача, ходы, определение победителя
- Состояние стола в Redis, синхрон через WebSocket
- Rake: 5% от банка
- Таймер на ход: 30 сек, автофолд при истечении

### Рулетка (Европейская)
- 37 секторов (0–36)
- Типы ставок: число, цвет, чёт/нечет, дюжина, колонка
- Сервер генерирует число, клиент показывает анимацию колеса
- House edge: ~2.7%

### Блэкджек
- 6 колод, автоперемешивание при < 25% остатка
- Ходы: Hit / Stand / Double / Split
- Дилер стоит на мягкой 17
- House edge: ~0.5%

---

## Provably Fair

Для всех одиночных игр (Слоты, Рулетка, Блэкджек):
1. Сервер генерирует `serverSeed`, отдаёт клиенту `serverSeedHash = SHA256(serverSeed)` до начала игры
2. Клиент задаёт свой `clientSeed`
3. Результат = `HMAC-SHA256(serverSeed, clientSeed:nonce)`
4. После раунда сервер раскрывает `serverSeed` — игрок может верифицировать

Для Crash: chain-hash схема на основе публичного seed'а.

---

## TRC20 Monitoring

- Сервис `TronWatcher` запускается при старте бэкенда
- Каждые 10 сек: `GET https://api.trongrid.io/v1/accounts/{address}/transactions/trc20`
- Фильтрация: только USDT (contract `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`), только входящие, статус SUCCESS
- Минимальный депозит: 1 USDT
- Дублирование защищается через уникальный `tx_hash` в БД

---

## CBR Exchange Rate

- Источник: `https://www.cbr.ru/scripts/XML_daily.asp`
- Парсинг XML, поле `USD` (USDT ≈ USD)
- Кэш в Redis с TTL 86400 сек (24 часа)
- Fallback: последний известный курс из БД если ЦБ недоступен

---

## Admin Panel

Отдельный раздел `/admin` (доступен только роли `ADMIN` / `SUPPORT`).

| Раздел | Функции |
|--------|---------|
| Пользователи | Поиск, просмотр баланса, бан/разбан, ручное начисление/списание RUB |
| Транзакции | История всех депозитов, фильтр по статусу/дате |
| Выводы | Очередь `WithdrawalRequest`, подтверждение / отклонение с комментарием |
| Статистика | Общий P&L казино, активные игроки, GGR по играм |
| Настройки | Лимиты ставок по играм, RTP слотов, включение/выключение игр |

---

## Frontend Routes

```
/                    — Главная (лобби игр)
/auth/login          — Вход (email или Telegram)
/auth/register       — Регистрация
/games/slots         — Слоты
/games/crash         — Краш
/games/poker         — Покер (лобби столов)
/games/poker/[id]    — Стол покера
/games/roulette      — Рулетка
/games/blackjack     — Блэкджек
/wallet              — Баланс, депозит, история, запрос вывода
/profile             — Профиль, история игр, провабли-фэйр верификатор
/admin               — Админ-панель (protected)
```

---

## Backend API (Express)

```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/telegram
POST /api/auth/refresh
GET  /api/user/me
GET  /api/user/balance
GET  /api/wallet/deposit-address
GET  /api/wallet/transactions
POST /api/wallet/withdraw

POST /api/games/slots/spin
POST /api/games/roulette/bet
POST /api/games/blackjack/start
POST /api/games/blackjack/action

WS   /socket         — Crash + Poker

GET  /api/admin/users
POST /api/admin/users/:id/balance
POST /api/admin/users/:id/ban
GET  /api/admin/withdrawals
POST /api/admin/withdrawals/:id/approve
POST /api/admin/withdrawals/:id/reject
GET  /api/admin/stats
```

---

## Error Handling

- Недостаточно баланса → 402 с сообщением
- Неверный JWT → 401, клиент перенаправляется на /auth/login
- TronGrid недоступен → депозит остаётся PENDING, повторная проверка через 60 сек
- ЦБ недоступен → используется последний кэшированный курс, транзакция помечается флагом `rate_fallback: true`
- Все ошибки серверной игровой логики → раунд откатывается, баланс не меняется

---

## Security

- Приватные ключи TRC20 кошельков шифруются AES-256-GCM, ключ в env
- Rate limiting на все эндпоинты (express-rate-limit)
- Helmet.js для security headers
- Все игровые операции — транзакции Prisma (атомарность баланса)
- CORS: только домен фронтенда
- Admin routes: дополнительная проверка роли на уровне middleware

# ZW Casino — Admin Panel Design (Plan 5)

**Date:** 2026-05-18

## Goal

Build a fully functional admin panel for ZW Casino: dashboard with live stats, user management (ban/unban, role change, manual balance adjustments), withdrawal request processing, and poker table CRUD. No Telegram auth in this plan — admins use existing email/password login.

## Architecture

**Approach:** Single admin router on the backend (`src/routes/admin.ts`) mounted at `/api/admin`. Six frontend pages under `/admin/*` with a shared sidebar layout. No new DB migrations needed — all required fields (`isBanned`, `reviewedBy`, `reviewNote`, `PokerTable`, `ADMIN_CREDIT/DEBIT`) already exist in the schema.

**Tech stack:** Express + Prisma (backend), Next.js 14 App Router + Tailwind + Axios (frontend). No new dependencies.

---

## Backend

### File

`casino-backend/src/routes/admin.ts` — all admin endpoints, ~200 lines.

Mounted in `src/index.ts` as:
```typescript
app.use('/api/admin', authMiddleware, adminRouter)
```

### Role permissions

Two tiers, enforced per-endpoint via `requireRole()` middleware:

| Tier | Roles | Endpoints |
|------|-------|-----------|
| READ + withdrawals | ADMIN, SUPPORT | GET stats, GET/search users, GET user detail, GET/PATCH withdrawals |
| FULL | ADMIN only | PATCH ban, PATCH role, POST credit, POST debit, GET/POST/PATCH/DELETE tables |

### Endpoints

```
GET  /api/admin/stats
  Response: { totalUsers, totalBalanceRub, pendingWithdrawals, pendingWithdrawalsRub,
              roundsToday, roundsWeek, topPlayers: [{ username, balanceRub }] }

GET  /api/admin/users?page=1&search=
  Response: { users: User[], total, page, pageSize: 20 }
  Search matches email OR username (case-insensitive ILIKE)

GET  /api/admin/users/:id
  Response: { user: User, recentTxns: BalanceTransaction[20] }

PATCH /api/admin/users/:id/ban           [ADMIN only]
  Body: { isBanned: boolean }
  Response: { user }

PATCH /api/admin/users/:id/role          [ADMIN only]
  Body: { role: 'USER' | 'SUPPORT' | 'ADMIN' }
  Response: { user }
  Validation: role must be valid enum value

POST  /api/admin/users/:id/credit        [ADMIN only]
  Body: { amountRub: number, comment?: string }
  Validation: amountRub > 0
  Creates ADMIN_CREDIT BalanceTransaction, updates user.balanceRub atomically

POST  /api/admin/users/:id/debit         [ADMIN only]
  Body: { amountRub: number, comment?: string }
  Validation: amountRub > 0, sufficient balance
  Creates ADMIN_DEBIT BalanceTransaction, updates user.balanceRub atomically

GET  /api/admin/withdrawals?status=PENDING
  status filter: PENDING | APPROVED | REJECTED | ALL (default: PENDING)
  Response: { withdrawals: WithdrawalRequest & { user: { username, email } }[] }

PATCH /api/admin/withdrawals/:id/review
  Body: { action: 'approve' | 'reject', reviewNote?: string }
  Validation: reviewNote required when action='reject'
  Sets status, reviewedBy (req.user.id), reviewedAt
  Response: { withdrawal }

GET  /api/admin/tables                   [ADMIN only]
  Response: { tables: PokerTable[] }

POST /api/admin/tables                   [ADMIN only]
  Body: { name, minBetRub, maxBetRub, maxPlayers, rake }
  Validation: minBetRub > 0, maxBetRub >= minBetRub, maxPlayers 2-9, rake 0-0.1
  Response: { table }

PATCH /api/admin/tables/:id              [ADMIN only]
  Body: same fields as POST (all optional)
  Response: { table }

DELETE /api/admin/tables/:id             [ADMIN only]
  Deletes table record
  Response: 204
```

### Balance operations

Credit and debit use the existing `creditBalance` / `debitBalance` services from `balance.service.ts`, which wrap operations in a Prisma transaction. `debitBalance` throws `InsufficientFundsError` if balance < amount — return 400.

### Tests

`casino-backend/src/tests/routes/admin.routes.test.ts`:

- USER → 403 on all endpoints
- SUPPORT → 403 on ADMIN-only endpoints (ban, role, credit, debit, tables)
- SUPPORT → 200 on shared endpoints (stats, users list, user detail, withdrawals)
- ADMIN → happy path for every endpoint
- Edge: credit with amountRub ≤ 0 → 400
- Edge: debit exceeding balance → 400
- Edge: reject withdrawal without reviewNote → 400
- Edge: invalid role value → 400

---

## Frontend

### Files

```
casino-frontend/src/app/admin/
  layout.tsx                    — sidebar nav + role guard (returns null for USER)
  page.tsx                      — dashboard: 4 stat cards + top players table
  users/
    page.tsx                    — user table with search input (debounce 300ms)
    [id]/page.tsx               — user detail: txn history + action buttons
  withdrawals/
    page.tsx                    — withdrawal table + status filter + approve/reject modal
  tables/
    page.tsx                    — poker table table + create/edit inline form + delete confirm
```

### Layout (`layout.tsx`)

- Reads `user` from `useAuthStore`
- If `!user || user.role === 'USER'` → `return null` (prevents flash)
- Renders a left sidebar with links: Dashboard, Пользователи, Выводы, Столы, ← На сайт
- Active link highlighted with `text-casino-cyan`

### Dashboard (`page.tsx`)

Fetches `GET /api/admin/stats`. Four stat cards (Neon Cyber `.card` style):
1. Всего пользователей
2. Суммарный баланс (RUB)
3. PENDING выводов (count + sum)
4. Раундов за неделю

Below: top-5 players table (username, balanceRub).

### Users (`users/page.tsx`)

- Search input → debounced 300ms → `GET /api/admin/users?search=...&page=...`
- Table columns: username, email, role badge, balance, статус (Активен/Забанен), дата регистрации
- Click row → navigate to `/admin/users/[id]`
- Pagination: prev/next buttons

### User Detail (`users/[id]/page.tsx`)

Fetches `GET /api/admin/users/:id`. Shows:
- User card: avatar, username, email, ID, role, balanceRub, created
- Action buttons (ADMIN only, hidden for SUPPORT):
  - **Бан / Разбан** — PATCH `/ban`, toggles `isBanned`
  - **Сменить роль** — dropdown (USER/SUPPORT/ADMIN) + confirm → PATCH `/role`
  - **Зачислить** — amount input + comment + submit → POST `/credit`
  - **Списать** — amount input + comment + submit → POST `/debit`
- Recent transactions table (last 20): type label, amount ±, date

SUPPORT role sees the user info and transactions but buttons are hidden.

### Withdrawals (`withdrawals/page.tsx`)

- Status filter tabs: PENDING / APPROVED / REJECTED / ALL
- Table: username, amount, TRC20 address, created, status badge
- Кнопки «Одобрить» / «Отклонить» only on PENDING rows
- On click → modal with textarea for `reviewNote` (required for reject)
- On submit → PATCH `/api/admin/withdrawals/:id/review`, refresh list

### Poker Tables (`tables/page.tsx`)

- Table: name, minBet, maxBet, maxPlayers, rake%, status badge
- «Создать стол» button → inline form below table
- «Редактировать» per row → inline form pre-filled
- «Удалить» per row → confirmation dialog (browser `confirm()`)
- Form fields: название, minBetRub, maxBetRub, maxPlayers (2-9), rake (0-10%)

---

## Scope boundaries (not in Plan 5)

- Telegram authentication
- Real USDT payout on withdrawal approval
- Email notifications to users on withdrawal status change
- Game-level analytics (per-game revenue breakdown)
- Audit log of admin actions

---

## Self-Review

**Placeholder scan:** No TBD or TODO items.

**Internal consistency:**
- `requireRole('ADMIN', 'SUPPORT')` on shared endpoints, `requireRole('ADMIN')` on mutating endpoints — consistent throughout.
- Frontend hides action buttons for SUPPORT role on user detail page — matches backend 403 protection.
- `creditBalance`/`debitBalance` used for credit/debit — consistent with existing game routes.
- `reviewedBy` = `req.user.id` — matches the schema field type (String, foreign key to User.id).

**Scope check:** Focused. Backend: 1 file + 1 test file. Frontend: 6 files. Single implementation plan.

**Ambiguity resolved:**
- DELETE table: hard delete (not status change) — poker tables with no active session can be safely deleted.
- `topPlayers`: top 5 by current `balanceRub` descending.
- `roundsToday`/`roundsWeek`: counts from `GameRound` table only (not CrashBet or PokerTable).
- SUPPORT cannot change roles or manage tables — only reads + withdrawal processing.

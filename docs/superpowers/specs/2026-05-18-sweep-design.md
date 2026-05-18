# ZW Casino — TRC20 Fund Sweep Design (Plan 6)

**Date:** 2026-05-18

## Goal

After a USDT deposit is detected and credited to the user's RUB balance, automatically consolidate the USDT from the individual deposit address into the casino's hot wallet. Sweep failures retry automatically on the next poll cycle via a DB-persisted flag.

## Context

The deposit scanner (`tronWatcher.service.ts`) already exists and runs. It polls TronGrid every 10s, detects incoming USDT transfers, converts to RUB at the CBR rate, and credits user balances. The USDT itself, however, remains scattered across individual user deposit addresses — this plan adds the consolidation step.

## Architecture

All sweep logic lives in `tronWatcher.service.ts` alongside the existing scanner. The poll cycle gains a second phase.

**Per-deposit flow:**
1. `checkAddress` detects USDT tx → `processDeposit` credits RUB balance → sets `pendingSweep = true` on the deposit address record
2. Next poll cycle: `runPoll` phase 2 queries all `pendingSweep = true` addresses → calls `sweepDeposit` for each
3. `sweepDeposit`: send TRX from reserve wallet → wait 3s → read USDT balance → transfer full USDT balance to hot wallet → set `pendingSweep = false`
4. Any step throws → log error, leave flag set, retry on the next cycle

**Two new env vars:**
- `HOT_WALLET_ADDRESS` — TRC20 address where all USDT is consolidated
- `TRX_RESERVE_KEY` — private key of the wallet that funds TRX fees (kept in env, not DB)

---

## Schema

Add `pendingSweep` to `DepositAddress`:

```prisma
model DepositAddress {
  id           String  @id @default(cuid())
  userId       String  @unique
  trc20Address String  @unique
  encryptedKey String
  pendingSweep Boolean @default(false)
  user         User    @relation(fields: [userId], references: [id])
}
```

One migration: `ALTER TABLE "DepositAddress" ADD COLUMN "pendingSweep" BOOLEAN NOT NULL DEFAULT false`.

---

## Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `pendingSweep Boolean @default(false)` to `DepositAddress` |
| `prisma/migrations/<ts>_add_pending_sweep/migration.sql` | Generated migration |
| `src/config/env.ts` | Add `HOT_WALLET_ADDRESS: z.string().min(1)`, `TRX_RESERVE_KEY: z.string().min(1)` |
| `src/services/wallet.service.ts` | Add `getPendingSweepAddresses()` returning `{ userId, trc20Address, encryptedKey }[]` |
| `src/services/tronWatcher.service.ts` | Add `sweepDeposit()`, extend `runPoll()` with phase 2, set flag in `processDeposit()` |
| `src/tests/tronWatcher.service.test.ts` | Extend with sweep unit tests |

---

## Implementation

### Constants (tronWatcher.service.ts)

```typescript
const TRX_FOR_FEES = 5_000_000       // 5 TRX in sun units
const SWEEP_WAIT_MS = 3_000           // wait after TRX send before USDT transfer
// USDT_CONTRACT already defined: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
```

### sweepDeposit(addr)

```
1. Decrypt private key → build TronWeb instance with deposit address key
2. Build TRX reserve TronWeb instance from env.TRX_RESERVE_KEY
3. Send TRX_FOR_FEES sun from reserve wallet to addr.trc20Address
4. Wait SWEEP_WAIT_MS
5. Query USDT balance of addr.trc20Address via TronGrid API
6. If balance < MIN_DEPOSIT_USDT (1 USDT in raw units) → clear pendingSweep, return
7. Call USDT contract `transfer(HOT_WALLET_ADDRESS, balance)` signed with deposit key
8. Set pendingSweep = false in DB
```

On any throw between steps 1–8: log error, do NOT clear flag → automatic retry next cycle.

### runPoll (updated)

```
Phase 1 (existing): getAllDepositAddresses() → Promise.allSettled(checkAddress each)
Phase 2 (new):      getPendingSweepAddresses() → Promise.allSettled(sweepDeposit each)
```

### processDeposit (updated)

After `markProcessed(txHash)`, add:
```typescript
await prisma.depositAddress.update({
  where: { userId },
  data: { pendingSweep: true },
})
```

### getPendingSweepAddresses (wallet.service.ts)

```typescript
export async function getPendingSweepAddresses() {
  return prisma.depositAddress.findMany({
    where: { pendingSweep: true },
    select: { userId: true, trc20Address: true, encryptedKey: true },
  })
}
```

---

## Tests

All in `src/tests/tronWatcher.service.test.ts`, mocking TronWeb and axios:

1. `processDeposit` sets `pendingSweep = true` in DB after crediting balance
2. `sweepDeposit` happy path: sends TRX, waits, reads USDT balance, transfers to hot wallet, clears flag
3. `sweepDeposit` with zero/dust USDT balance: clears flag without sending transfer
4. `sweepDeposit` throws on TRX send: flag remains `true` (retry next cycle)
5. `sweepDeposit` throws on USDT transfer: flag remains `true`

---

## Env var additions

```
HOT_WALLET_ADDRESS=T...          # casino's consolidation wallet (TRC20)
TRX_RESERVE_KEY=...              # private key of TRX-funded reserve wallet
```

Both required (non-optional) — server fails to start without them.

---

## Scope boundaries (not in Plan 6)

- Withdrawal execution (sending USDT out to users) — manual admin flow unchanged
- TRX refill automation for the reserve wallet — ops concern
- Admin UI showing sweep history
- Per-address sweep threshold configuration

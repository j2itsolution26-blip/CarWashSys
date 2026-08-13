# CG Car Wash — POS & Transaction Management System

Production Point-of-Sale for a working car wash. Next.js 15 (App Router) · TypeScript ·
PostgreSQL · Prisma · Auth.js · Tailwind CSS v4. Deploys to Vercel. **No PHP anywhere.**

The cashier flow is five taps:

```
+ New Transaction  →  Vehicle  →  Services  →  Payment  →  Receipt
```

No customer name, phone, email or registration is ever collected. Each walk-in is
`Customer 1`, `Customer 2`, … reset daily, alongside a permanent receipt number
`TXN-000001`.

---

## 1. Setup

### Prerequisites
- Node.js 20+
- A PostgreSQL database (Neon, Supabase, or any Postgres 14+)

### Steps

```bash
npm install
cp .env.example .env        # then edit .env — see below
npm run db:push             # create the schema
npm run db:seed             # roles, permissions, price board, owner account
npm run dev                 # http://localhost:3000
```

### Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Postgres connection used at runtime |
| `DIRECT_URL` | Non-pooled connection used by `prisma migrate`. Same value if your provider has no separate direct URL |
| `AUTH_SECRET` | Session signing key — generate with `npx auth secret` |
| `AUTH_URL` | Deployed origin. Vercel sets this automatically |
| `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` / `SEED_OWNER_NAME` | Bootstrap owner account, used by the seed only |
| `BUSINESS_TIMEZONE` | IANA zone that decides when the daily customer counter resets (default `Asia/Manila`) |
| `NEXT_PUBLIC_BUSINESS_NAME` | Name printed on receipts and the sign-in screen |

Sign in with the seeded owner credentials, then **change the password immediately**
(Staff → Reset password) and create real accounts for your cashiers and washers.

### Commands

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run verify` | Typecheck + lint + tests — run before every deploy |
| `npm run test` | Unit tests in watch mode |
| `npm run db:push` | Sync schema (development) |
| `npm run db:migrate` | Create a migration (production workflow) |
| `npm run db:seed` | Idempotent seed — safe to re-run, never overwrites edited prices |
| `npm run db:studio` | Browse the database |

---

## 2. Deploying to Vercel

1. Push the repository to GitHub and import it in Vercel.
2. Add every environment variable from the table above to the Vercel project.
3. Deploy. The build runs `prisma generate && next build`.
4. Run `npm run db:deploy` (or `db:push`) and `npm run db:seed` once against the
   production database.

The app is entirely server-rendered on demand — no route requires a build-time
database connection.

---

## 3. Architecture

```
src/
├── app/
│   ├── (app)/              Authenticated shell: pos, queue, transactions,
│   │                       dashboard, reports, pricing, services, users, audit
│   ├── login/              Sign-in
│   └── api/                Auth.js handler + transaction read endpoint
├── components/
│   ├── ui/                 Button, Card, fields, modal, alerts, status badge
│   ├── layout/             App shell, theme toggle
│   ├── pos/                Vehicle picker, service picker, payment, receipt
│   ├── queue/              Wash-floor board
│   ├── transactions/       Transaction actions
│   └── admin/              Pricing, catalog and staff managers
├── lib/                    PURE domain layer — no Prisma, no React
│   ├── money.ts            Decimal money primitives
│   ├── pricing/engine.ts   The pricing engine
│   ├── transactions/       Status state machine
│   ├── permissions/        Permission keys and role defaults
│   ├── validation/         Zod boundary schemas
│   ├── auth/               Auth.js config + server guards
│   └── business-date.ts    Timezone-correct business day + numbering
├── server/
│   ├── services/           Business logic, the only code that touches Prisma
│   └── actions/            Server actions — permission → validate → service
└── types/                  DTOs shared across the boundary
```

**The rule that shapes everything:** `lib/` is pure and testable, `server/services/`
owns the database, `server/actions/` is the guarded entry point, and components
never compute anything that money depends on.

---

## 4. The five guarantees

### Prices come from the database, always
There is no price input anywhere in the cashier UI. The browser sends
`{ variantId, items: [{ serviceId, quantity }] }` and **nothing else** — the request
schema is `.strict()`, so a payload carrying a `price` field is rejected outright.
The server reads the live price rows and computes the total itself.

### Historical prices never change
`service_prices` is append-only and effective-dated. Changing Sedan Body Wash
₱135 → ₱150 closes the old row and inserts a new one; a partial-unique index on
`currentKey` makes "exactly one live price per vehicle+service" a database
guarantee. Transaction line items additionally snapshot the price, the service
name and the exact price row they were charged from. Receipts are immutable.

### Money is decimal, never float
Every peso amount is `Decimal(12,2)` in Postgres and a decimal.js value in code.
`0.1 + 0.2` is exactly `0.30`. Amounts cross the wire as strings.

### Duplicates are impossible, not merely unlikely
Opening a transaction and capturing a payment both carry a client-generated
idempotency key with a unique database index. A double-click, a refresh
mid-checkout, or a network retry replays the key and receives the original
result. Concurrent receipt numbers are allocated from a row-locked counter
inside the same transaction that writes the record, so numbers are gapless.

### Authorisation is server-side
Permission checks live in `lib/auth/guards.ts` and run inside every server action
before anything else. Middleware only redirects; hidden buttons are a courtesy.
A cashier calling the price-change action directly gets a 403.

---

## 5. Roles

| | Owner / Admin | Cashier | Washer |
|---|---|---|---|
| Operate POS, take payment | ✓ | ✓ | |
| View own transactions | ✓ | ✓ | |
| View all transactions | ✓ | | |
| Update wash queue | ✓ | ✓ | ✓ |
| Change prices / catalog | ✓ | | |
| Void payments, refunds | ✓ | | |
| Manage staff, reports, audit log | ✓ | | |

Permissions are checked by key, not by role name, so new roles can be composed
without code changes. The last active owner cannot be deactivated or demoted —
the shop can never lock itself out.

---

## 6. Transaction lifecycle

```
PENDING ──┬─→ PAID ──→ QUEUED ─→ WASHING ─→ QUALITY_CHECK ─→ COMPLETED
          │                                       ↑    │
          └─→ QUEUED …                            └────┘  (rework)
                                                  COMPLETED ─→ PAID
   any unpaid state ─→ CANCELLED
```

Both money orders are supported: pay on arrival (the POS default) or pay at
pickup. `status` says where the vehicle is; `paidAt` says where the money is —
a vehicle paid upfront reads as paid throughout the wash. Every transition is
validated against the state machine and recorded in `transaction_status_history`.

---

## 7. Audit log

Append-only. `AuditService` exposes no update and no delete function, so no
application code path can rewrite history. Financial events are written inside
the same database transaction as the change itself — if the payment rolls back,
its audit row rolls back with it.

Recorded: sign-in and failed sign-in, transaction creation/edit/status/cancel,
payment capture and void, price changes (with before → after), catalog changes,
and staff/role changes.

---

## 8. Testing

```bash
npm run test:run
```

79 unit tests over the pure domain layer — the money math, the pricing engine,
the state machine, the permission matrix, and business-date/numbering. They run
in under a second with no database.

Covered: the documented ₱430 Sedan basket, ₱500 cash → ₱70 change, exact cash,
short cash to the centavo, discount caps and floors, duplicate lines, invalid
quantities, every legal and illegal status transition, cashier-cannot-change-prices,
and the timezone boundary where a 23:30 UTC sale belongs to the next Manila
business day.

### Live-database workflow verification

```bash
npm run verify:workflow
```

Drives the real service layer — the same functions the POS screens call —
against the configured database: 57 assertions covering auto-numbering, the
₱430 basket, ₱70 change, short cash, duplicate submits, the status lifecycle,
discount authorisation, historical price protection and the audit trail.

It cleans up after itself: every transaction it creates is deleted and the
counters are reset, so the shop still opens on `Customer 1` / `TXN-000001` with
an empty ledger.

> Runs under the `react-server` export condition (the npm script sets it).
> `server-only` throws on import under plain Node — that guard working as
> intended.

---

## 9. Status

Complete and verified end to end.

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run test:run` | 79/79 |
| `npm run build` | 16 routes built |
| `npm run verify:workflow` | 57/57 against live Postgres |

Schema pushed and seeded: 19 permissions, 4 roles, 6 vehicle categories,
6 services, 29 live prices, 1 owner account, 0 transactions.

**Before going live:** sign in as the seeded owner, change that password, and
create real accounts for your cashiers and washers.

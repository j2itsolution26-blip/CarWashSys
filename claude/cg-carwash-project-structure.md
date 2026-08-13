# CG Car Wash — System Architecture & Project Structure

## Recommended Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **NestJS** (Node.js + TypeScript) | Enterprise structure (modules/DI/decorators) with fast iteration. No PHP. |
| Database | **PostgreSQL** + Prisma ORM | Relational data (categories × services × prices) fits perfectly. |
| Frontend | **React** + TypeScript + Vite + Tailwind + shadcn/ui | Modern admin dashboard + customer-facing booking screen. |
| Auth | JWT + RBAC (Owner / Admin / Cashier / Washer) | Multi-role staff system. |
| Payments | PayMongo / GCash / Cash | Local PH payment methods, extensible to cards. |
| Infra | Docker + docker-compose, GitHub Actions CI/CD | Reproducible deploys, no manual server setup. |
| Architecture | **Modular monolith** (DDD-lite) | Enterprise organization without premature microservice complexity. Splits cleanly later if you franchise. |

---

## Data Model (derived from your price board)

```
VehicleCategory
 ├─ id, name, slug
 ├─ hasSubtiers (true for Motorcycle)
 └─ subtiers[]            e.g. "100cc–125cc", "150cc–200cc", "250cc–300cc", "300cc–1000cc"

Service
 ├─ id, name              Body Wash, Vacuum, Under Wash, Engine Cleaning, Body Wax
 └─ appliesTo[]           which vehicle categories offer this service

Price
 ├─ vehicleCategoryId
 ├─ subtierId (nullable)  only used for Motorcycle
 ├─ serviceId
 └─ amount

Booking
 ├─ id, customerId (nullable — walk-ins allowed)
 ├─ vehicleCategoryId, subtierId
 ├─ services[]            selected line items, snapshotted price at time of booking
 ├─ assignedStaffId
 ├─ status                queued → in_progress → done → paid
 ├─ total
 └─ timestamps

Payment
 ├─ bookingId
 ├─ method                cash | gcash | paymongo | card
 ├─ amount, status
 └─ paidAt

Staff
 ├─ id, name, role         owner | admin | cashier | washer
 └─ isActive

Branch (optional, future-proofing for multi-location)
 └─ id, name, address
```

This model lets you seed your exact price board as data on day one — no hardcoded prices anywhere in code.

---

## Full Project Structure

```
cg-carwash-system/
├── apps/
│   ├── api/                              # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── vehicle-categories/
│   │   │   │   │   ├── dto/
│   │   │   │   │   ├── entities/
│   │   │   │   │   ├── vehicle-categories.controller.ts
│   │   │   │   │   ├── vehicle-categories.service.ts
│   │   │   │   │   └── vehicle-categories.module.ts
│   │   │   │   ├── services/             # wash service catalog
│   │   │   │   ├── pricing/              # category × service price matrix
│   │   │   │   ├── bookings/             # orders / job queue
│   │   │   │   ├── customers/
│   │   │   │   ├── staff/
│   │   │   │   ├── payments/
│   │   │   │   ├── branches/             # optional, multi-location ready
│   │   │   │   ├── reports/              # daily revenue, top services, staff performance
│   │   │   │   ├── notifications/        # SMS/email "vehicle ready" alerts
│   │   │   │   └── auth/                 # JWT, RBAC guards
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   ├── filters/              # global exception filter
│   │   │   │   ├── guards/               # role guards
│   │   │   │   ├── interceptors/         # logging, response shaping
│   │   │   │   └── pipes/                # validation
│   │   │   ├── config/                   # env config, typed config service
│   │   │   ├── database/
│   │   │   │   ├── migrations/
│   │   │   │   └── seeds/                # seeds your exact price board as data
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── test/                         # unit + e2e tests
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                              # React dashboard + booking UI
│       ├── src/
│       │   ├── features/
│       │   │   ├── vehicle-categories/
│       │   │   ├── pricing/
│       │   │   ├── bookings/             # queue board (like a kanban: queued/washing/done)
│       │   │   ├── customers/
│       │   │   ├── staff/
│       │   │   ├── payments/
│       │   │   ├── reports/              # dashboards/charts
│       │   │   └── auth/
│       │   ├── components/               # shared UI: tables, modals, buttons
│       │   ├── layouts/
│       │   ├── hooks/
│       │   ├── lib/                      # api client, formatting utils
│       │   ├── routes/
│       │   ├── store/                    # zustand or redux
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── public/
│       ├── Dockerfile
│       ├── package.json
│       └── vite.config.ts
│
├── packages/                             # shared monorepo code
│   ├── types/                            # shared TS interfaces/DTOs (backend ↔ frontend)
│   ├── ui/                               # shared design-system components (optional)
│   └── config/                           # shared eslint/tsconfig/prettier
│
├── infra/
│   ├── docker-compose.yml                # local dev: api + web + postgres + redis
│   ├── docker-compose.prod.yml
│   └── nginx/
│
├── .github/
│   └── workflows/
│       ├── ci.yml                        # lint, test, build on every PR
│       └── deploy.yml
│
├── docs/
│   ├── architecture.md
│   ├── api-spec.yaml                     # OpenAPI/Swagger, auto-generated from NestJS
│   └── er-diagram.png
│
├── .env.example
├── turbo.json                            # monorepo task runner (Turborepo)
├── package.json                          # root workspace
└── README.md
```

---

## Why this shape is "enterprise"

- **Feature-based modules, not layer-based** — each domain (`bookings`, `pricing`, `staff`) owns its own controller/service/DTO/entity, so the codebase scales by feature count, not by file count in one giant `controllers/` folder.
- **Shared types package** — backend and frontend import the same TypeScript interfaces, so a pricing field change can't silently break the UI.
- **Seeded, not hardcoded, pricing** — your price board becomes rows in a `prices` table. Updating prices is a dashboard action, not a code deploy.
- **RBAC from day one** — owner/admin/cashier/washer roles are enforced at the API layer via guards, not just hidden in the UI.
- **Branch-ready** — even with one location today, the schema has a `branchId` seam so opening a second CG Car Wash location doesn't require a redesign.
- **CI/CD + Docker** — one command spins up the whole stack locally; the same containers deploy to production.

## Suggested build order

1. `vehicle-categories`, `services`, `pricing` modules + seed script (your exact board as data)
2. `auth` + `staff` (roles/login)
3. `bookings` (the core queue: create a job, assign a washer, mark done)
4. `payments` (cash first, GCash/PayMongo after)
5. `reports` (daily totals, busiest service, staff throughput)
6. `notifications` and `branches` (multi-location) — only if actually needed

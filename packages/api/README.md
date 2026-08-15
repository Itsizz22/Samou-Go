# @samou-go/api

Express + TypeScript + Prisma backend for **السموع جو / Samou' Go**.

## Getting started

```bash
npm install
```

```bash
cp packages/api/.env.example packages/api/.env
```

Then create the database and push the schema (from the repo root):

```bash
npm run db:generate && npm run db:push && npm run db:seed
```

`db:generate`/`db:push` target the **SQLite** dev database
(`prisma/schema.sqlite.prisma` → `prisma/dev.db`), so local development needs no
PostgreSQL and no `DATABASE_URL` — see `src/config/env.ts`. The optional
`DATABASE_URL` in `packages/api/.env` is a non-secret placeholder for the Prisma
postinstall only; it is never used for a local connection.

```bash
npm run dev:api
```

The server listens on `http://localhost:4000`; the API is mounted at `/api/v1`.
`GET /health` needs no database and is the container liveness probe.

`npm run db:seed` creates 9 users, 3 stores, 8 categories, 20 products and 3
demo orders. The demo password for every seeded account is `samou1234` — dev
only, never run the seed against production.

With the API running, `npm run test:e2e` drives the whole lifecycle against the
live database: login as all four roles, quote both fee tiers, place an order
with forged money fields, walk `PENDING → DELIVERED` through the state machine,
and assert the negative cases (illegal transitions, cross-store products, other
customers' orders, `role: ADMIN` at registration).

## Endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Liveness, no DB round-trip |
| `GET` | `/api/v1/meta` | — | Live delivery tariff + status/role labels |
| `POST` | `/api/v1/auth/register` | optional | Self-service is `CUSTOMER` only; staff roles require an `ADMIN` token |
| `POST` | `/api/v1/auth/login` | — | Returns a JWT |
| `POST` | `/api/v1/auth/logout` | — | Stateless; the client drops the token |
| `GET` | `/api/v1/auth/me` | ✔ | Current profile |
| `GET` | `/api/v1/stores` | — | Paginated, `?search=&activeOnly=` |
| `GET` | `/api/v1/stores/:storeId` | — | Store + categories + available products |
| `GET` | `/api/v1/stores/:storeId/products` | — | Paginated, `?categoryId=&search=` |
| `POST` | `/api/v1/orders/quote` | — | Prices a basket without writing anything |
| `POST` | `/api/v1/orders` | ✔ customer | Creates the order |
| `GET` | `/api/v1/orders` | ✔ | Role-scoped list |
| `GET` | `/api/v1/orders/:orderId` | ✔ | Role-scoped detail |
| `PATCH` | `/api/v1/orders/:orderId/status` | ✔ | State machine × role × ownership |
| `PATCH` | `/api/v1/orders/:orderId/captain` | ✔ manager/admin | Assign a captain |
| `GET` | `/api/v1/orders/:orderId/events` | optional | SSE status stream (`text/event-stream`). Anonymous streams carry status only; a token adds the ownership check. Browser `EventSource` cannot send a header, so this route sits above the auth gate |

Every response uses one envelope:

```jsonc
{ "success": true,  "data": { } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ ] } }
```

## Rules worth knowing before you edit

**The client never sends money.** `POST /orders` accepts only `storeId`, `items`
and the address. `subtotal`, `deliveryFee` and `totalAmount` are computed server
side from the `products` table. Adding a price field to the request schema would
let anyone buy a fridge for 1 ₪.

**The delivery tariff lives in `@samou-go/shared-types`**, not here — 3 ₪ below 5
items, 5 ₪ from 5 up, counting units rather than distinct products. The amounts
are env-overridable (`DELIVERY_BASE_FEE`, `DELIVERY_BULK_FEE`,
`DELIVERY_BULK_THRESHOLD`); the *rule* is not.

**No GPS for the customer address, by design.** Samou' has no reliable street
numbering, so an order carries `customerAddressText` (neighbourhood / landmark)
plus an optional `addressNote`. GPS is used only operationally: stores pin
`Store.latitude/longitude`, and the `CaptainLocation` model streams the assigned
captain's live position for order tracking — never the customer's destination.

**Money is `Decimal(10,2)` in Postgres**, so Prisma hands back
`Prisma.Decimal`. Convert at the API edge with `decimalToNumber()` — the shared
DTOs are plain `number`, and a `Decimal` would silently serialise as a string.

**Status changes pass three independent gates:** the transition is legal for the
state machine (`canTransitionOrderStatus`), the caller's role may drive into the
target status (`canRoleSetOrderStatus`), and the caller owns that particular
order. The first two live in `shared-types` so the dashboards can grey out
buttons using the same table the server enforces.

**Order numbers** are `SG-YYMMDD-NNNN`, allocated from a same-day count inside
the create transaction. The `UNIQUE` constraint is the real guard; the service
retries a few times on `P2002`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` | `tsc -p tsconfig.json` → `dist/` |
| `npm start` | `node dist/server.js` |
| `npm run prisma:generate` | Generate the **SQLite** client (local `dev.db`) |
| `npm run prisma:push` | Push the SQLite schema to `dev.db` (local schema evolution) |
| `npm run prisma:studio` | Browse the SQLite dev data |
| `npm run prisma:validate` | Validate the **SQLite** schema (local) |
| `npm run prisma:generate:prod` | Generate the **PostgreSQL** client (production) |
| `npm run prisma:validate:prod` | Validate the **PostgreSQL** schema |
| `npm run prisma:deploy` | `prisma migrate deploy` against **PostgreSQL** (production only) |

**Environment split.** Local dev/tests run on SQLite and never touch
Postgres/Neon; local schema evolution is `npm run db:push` (there is no local
migration history). The production PostgreSQL schema (`prisma/schema.prisma`) is
migrated only via `npm run db:deploy` (`prisma migrate deploy`), where
`DATABASE_URL` is injected as a deployment secret — real credentials never live
in a repository `.env`. CI runs validate/generate against the production schema
with a non-secret placeholder URL.

From the repo root, `npm run typecheck` builds `shared-types` then `api` in
dependency order.

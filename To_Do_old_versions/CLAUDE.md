# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Samou' Go** — Hyper-local delivery platform for Samou', Hebron, Palestine. A monorepo with:
- **Shared types package** (`@samou-go/shared-types`) — Single source of truth for enums, domain models, DTOs, and delivery-fee rules
- **Express + Prisma API** (`@samou-go/api`) — PostgreSQL backend with JWT auth, role-based access control
- **API client** (`@samou-go/api-client`) — Browser HTTP client, React hooks
- **7 Vite + React 19 front-ends** (all `@samou-go/web-*`):
  - `web-customer` — Customer shop (port 5173)
  - `web-store-details` — Store details & product menu (port 5174)
  - `web-checkout` — Checkout & order placement (port 5175)
  - `web-order-tracking` — Live order tracking (port 5176)
  - `web-store-manager` — Store manager dashboard (port 5177)
  - `web-captain` — Delivery captain dashboard (port 5178)
  - `web-admin` — Admin dashboard (port 5179)

## Key Architectural Decisions

1. **No GPS by design** — Samou' has no reliable street addressing. Orders carry free-text `customerAddressText` (neighbourhood/landmark) + optional `addressNote`. Captains phone customers. No lat/lng columns exist.

2. **Client never sends money** — `POST /orders` accepts only `storeId`, `items`, and address. `subtotal`, `deliveryFee`, `totalAmount` are computed server-side from DB prices via `calculateDeliveryFee(itemCount)` in `@samou-go/shared-types`.

3. **Money is `Decimal(10,2)` in Postgres** — Prisma returns `Prisma.Decimal`. Convert at API edge with `decimalToNumber()` — shared DTOs are plain `number`.

4. **State machine lives in shared-types** — `ORDER_STATUS_TRANSITIONS` and `ORDER_STATUS_ACTORS` define legal transitions and which role may drive into each status. Both API and dashboards import the same logic.

5. **Order numbers** — `SG-YYMMDD-NNNN` allocated from same-day count inside create transaction. `UNIQUE` constraint is the real guard; service retries on `P2002`.

6. **Delivery tariff** — Single source in `shared-types/src/delivery.ts`:
   - < 5 items → 3 ₪
   - ≥ 5 items → 5 ₪
   - Empty basket → 0 ₪
   - Config overridable via env vars (`DELIVERY_BASE_FEE`, `DELIVERY_BULK_FEE`, `DELIVERY_BULK_THRESHOLD`)

## Commands

Run from **repository root** unless noted:

```bash
# Install all deps
npm install

# Type-check everything (builds shared-types first, then api, then all web apps)
npm run typecheck

# Build shared-types + api only
npm run build

# Database (from root, runs in api workspace)
npm run db:generate    # prisma generate (local SQLite client, dev.db)
npm run db:push        # prisma db push (local SQLite dev.db — local schema evolution)
npm run db:studio      # prisma studio (local SQLite dev.db)
npm run db:seed        # seeds 9 users, 3 stores, 8 categories, 20 products, 3 demo orders
# Production PostgreSQL only (schema.prisma):
npm run db:validate:prod / db:generate:prod / db:deploy   # require DATABASE_URL deployment secret

# Start API (port 4000, API at /api/v1)
npm run dev:api

# Start individual front-ends (each on its own port)
npm run dev:web-customer        # 5173
npm run dev:web-store-details   # 5174
npm run dev:web-checkout        # 5175
npm run dev:web-order-tracking  # 5176
npm run dev:web-store-manager   # 5177
npm run dev:web-captain         # 5178
npm run dev:web-admin           # 5179

# API tests (requires running API + DB)
npm run test:e2e

# Lint / format (run in each workspace directory)
npm run lint
npm run format
npm run format:check
```

### Demo Credentials
After `npm run db:seed`, all seeded accounts use password `samou1234`. Roles: CUSTOMER, STORE_MANAGER, CAPTAIN, ADMIN.

## Important Files

| Path | Purpose |
|------|---------|
| `packages/shared-types/src/enums.ts` | `UserRole`, `OrderStatus`, `PaymentMethod`, state machine, bilingual labels |
| `packages/shared-types/src/delivery.ts` | `calculateDeliveryFee`, `formatCurrency`, `calculateOrderTotals` — **single source of truth** |
| `packages/shared-types/src/models.ts` | Transport-safe domain interfaces (`Order`, `Store`, `Product`, `OrderDetail`, etc.) |
| `packages/shared-types/src/dto.ts` | Request/response DTOs (`CreateOrderInput`, `AuthResponse`, `OrderQuote`, etc.) |
| `packages/api/prisma/schema.prisma` | PostgreSQL schema — enums must match `shared-types/enums.ts` byte-for-byte |
| `packages/api/src/modules/orders/orders.service.ts` | Order creation, pricing, status transitions, captain assignment |
| `packages/api/src/middleware/authenticate.ts` | JWT verification → `req.user` (sub, role, phone) |
| `packages/api-client/src/api.ts` | Typed fetch wrapper + React Query hooks |
| `packages/api-client/src/useAuth.ts` | Auth context + `SignInGate` component |

## Front-End Stack (all 7 apps)
- React 19 + TypeScript + Vite 6
- Tailwind CSS 4 (`@tailwindcss/vite`)
- Radix UI primitives + `class-variance-authority` + `tailwind-merge`
- React Query (`@tanstack/react-query`) via `api-client`
- React Hook Form + Zod 4
- Framer Motion, Sonner toasts, Lucide icons
- `next-themes` for dark mode

## Adding a New Front-End App
1. Create `themes/<Name>/package.json` with `@samou-go/web-<kebab>` name
2. Add workspace to root `package.json` workspaces array
3. Add `dev:web-<kebab>` script to root `package.json`
4. Add CORS origin to `packages/api/.env` (`CORS_ORIGINS`)
5. Run `npm install` from root

## Common Pitfalls

- **Never hardcode delivery fee strings** — Use `formatDeliveryFee()` or `deliveryFeeLabel()` from `shared-types`
- **Never add price fields to order create DTO** — Would allow price manipulation
- **Enum changes** — Must update both `prisma/schema.prisma` AND `shared-types/src/enums.ts` identically
- **Money rounding** — Use `roundMoney()` from `shared-types/delivery.ts` to avoid float drift
- **Decimal → number** — Always convert Prisma `Decimal` at API edge via `decimalToNumber()` in mappers

## Testing Notes

- `npm run test:e2e` runs `packages/api/scripts/e2e-smoke.mjs` against a live DB
- Tests the full lifecycle: login as all 4 roles, quote both fee tiers, place order with forged money fields, walk `PENDING → DELIVERED`, assert negative cases
- Requires running API (`npm run dev:api`) and seeded DB

## Environment

Copy `packages/api/.env.example` → `packages/api/.env` and fill in:
- `DATABASE_URL` — **production only** (PostgreSQL/Neon). Local dev/tests run on
  SQLite (`schema.sqlite.prisma` → `dev.db`) and never use this; keep a
  non-secret placeholder in `.env` so the Prisma postinstall succeeds. In
  production the real value is injected as a deployment secret.
- `JWT_SECRET` — 48+ random bytes (base64url)
- `CORS_ORIGINS` — Comma-separated Vite dev server origins
- `DELIVERY_BASE_FEE`, `DELIVERY_BULK_FEE`, `DELIVERY_BULK_THRESHOLD` — Optional overrides


## Navigation

The 7 Vite apps communicate via URL parameters. There is no shared router — each app is fully independent and served on its own port. Ports below are localhost defaults; override in each app's `.env` via `VITE_*` vars.

### App ports & entry URLs

| App | Default port | Entry URL |
|-----|-------------|-----------|
| `web-customer` | 5173 | `http://localhost:5173/` |
| `web-store-details` | 5174 | `http://localhost:5174/?storeId=<id>` |
| `web-checkout` | 5175 | `http://localhost:5175/?storeId=<id>` |
| `web-order-tracking` | 5176 | `http://localhost:5176/?orderId=<id>` |
| `web-store-manager` | 5177 | `http://localhost:5177/` |
| `web-captain` | 5178 | `http://localhost:5178/` |
| `web-admin` | 5179 | `http://localhost:5179/` |

### Full customer journey (happy path)

```
web-customer (home)
  → click store card  →  web-store-details /?storeId=<id>
  → tap "View Cart"   →  web-checkout /?storeId=<id>
  → place order       →  web-order-tracking /?orderId=<id>
```

### Cross-app environment variables

Each app reads the URLs of the apps it links to from `.env`:

| Variable | Read by | Default |
|----------|---------|---------|
| `VITE_STORE_URL` | `web-customer`, `web-checkout` | `http://localhost:5174` |
| `VITE_CHECKOUT_URL` | `web-store-details` | `http://localhost:5175` |
| `VITE_TRACKING_URL` | `web-checkout` | `http://localhost:5176` |

For a production deployment, set these in each app's build environment or `.env.production` file.

## Unit Tests

```bash
# Run shared-types domain logic tests (Vitest)
npm test

# Watch mode (run inside the package)
npm run test:watch --workspace @samou-go/shared-types
```

Tests live in `packages/shared-types/src/__tests__/` and cover:
- `delivery.test.ts` — `calculateDeliveryFee`, `roundMoney`, `lineTotal`, `calculateOrderTotals`, `formatCurrency`, `formatDeliveryFee`, `isFreeDelivery`
- `enums.test.ts` — `canTransitionOrderStatus`, `canRoleSetOrderStatus`, `isTerminalOrderStatus`, `ORDER_STATUS_SEQUENCE`

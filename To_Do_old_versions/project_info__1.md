# Samou' Go — Codebase Overview

## Summary

Samou' Go is a hyper-local delivery platform for Samou', Hebron, Palestine. It is a TypeScript monorepo consisting of an Express + Prisma backend API, a shared browser HTTP client with React hooks, six Vite + React + Tailwind front-end applications (one per user role/flow), and a shared-types package that defines the contract between them all. The platform handles store catalogue browsing, basket quoting, order placement, and a role-based order state machine (Customer → Store Manager → Captain), all denominated in ILS with a fixed delivery tariff.

## Architecture

- **Primary pattern**: Layered monorepo with NPM workspaces
- **Backend**: Express 4 + Prisma ORM + PostgreSQL — layered as `routes → modules → lib`, with Zod validation at the API edge
- **Frontend**: Six independent Vite + React 18 + Tailwind apps, each consuming `@samou-go/api-client` for typed API calls and `@samou-go/shared-types` for domain models
- **Shared contract**: `packages/shared-types` defines enums, DTOs, models, and the delivery fee calculator — imported by both server and all front-ends
- **State machine**: Order status transitions, role permissions, and bilingual labels are defined once in `shared-types` and enforced server-side with three gates: legal transition, role authorization, and order ownership

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 20.11 |
| Language | TypeScript 5.7 |
| Backend framework | Express 4 |
| ORM | Prisma 6 |
| Database | PostgreSQL (Decimal(10,2) for money) |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Validation | Zod |
| Frontend framework | React 18 + Vite |
| Styling | Tailwind CSS + shared design tokens |
| Icons | Lucide React |
| Package manager | NPM workspaces |

## Directory Structure

```
samou-go/
├── package.json                    — Root workspace config, scripts for dev/build/typecheck across workspaces
├── tsconfig.base.json              — Shared TypeScript compiler options
├── .gitignore
├── DESIGN_SYSTEM.md                — Canonical design-system reference (colors, typography, RTL, components)
│
├── packages/
│   ├── api/                        — Express backend (port 4000, /api/v1)
│   │   ├── src/
│   │   │   ├── server.ts           — HTTP server with graceful shutdown (SIGINT/SIGTERM)
│   │   │   ├── app.ts              — Express app factory (CORS, helmet, morgan, /health probe)
│   │   │   ├── config/env.ts       — Environment variables (DB, JWT, CORS, delivery fees)
│   │   │   ├── lib/prisma.ts       — Prisma client singleton
│   │   │   ├── lib/respond.ts      — Envelope helpers (ok, fail, paginated)
│   │   │   ├── middleware/         — Error handler, 404 handler, authenticate JWT
│   │   │   ├── routes/index.ts     — Mounts all routers under /api/v1
│   │   │   ├── modules/            — Domain modules (auth, stores, orders), each with routes + service
│   │   │   ├── scripts/seed.ts     — Database seeder (9 users, 3 stores, 20 products, 3 demo orders)
│   │   │   └── types/              — Express type augmentations
│   │   ├── prisma/
│   │   │   ├── schema.prisma       — Database schema (User, Store, Category, Product, Order, OrderItem, OrderStatusHistory)
│   │   │   └── migrations/
│   │   ├── scripts/e2e-smoke.mjs   — End-to-end smoke test (login, quote, place order, walk state machine)
│   │   └── .env.example            — Template for DATABASE_URL, JWT_SECRET, CORS_ORIGINS, delivery fee overrides
│   │
│   ├── api-client/                 — Browser HTTP client + React hooks (no CJS, source-only package)
│   │   └── src/
│   │       ├── api.ts              — Typed fetch wrapper: unwraps envelopes, throws ApiError, manages JWT token
│   │       ├── useApi.ts           — useResource (polling-capable), useMutation, and endpoint-specific hooks
│   │       ├── useAuth.ts          — Auth state hook (token verification on mount, signIn, signOut)
│   │       └── SignInGate.tsx      — Login card component (phone + password)
│   │
│   └── shared-types/               — Contract between server and all front-ends
│       └── src/
│           ├── enums.ts            — UserRole, OrderStatus, PaymentMethod, state machine, bilingual labels, status tones
│           ├── models.ts           — Domain interfaces (PublicUser, Store, Product, Order, OrderDetail, etc.)
│           ├── dto.ts              — Request/response shapes (CreateOrderInput, ApiResponse<T>, Paginated<T>, etc.)
│           ├── delivery.ts         — Delivery fee calculator (3₪ / 5₪ tiers), currency formatting, order totals
│           └── index.ts            — Re-exports all above
│
└── themes/                          — Six Vite + React + Tailwind front-end apps
    ├── Customer shop/               — @samou-go/web-customer — Store browsing, cart, checkout
    ├── Store Details & Product Menu_1/ — @samou-go/web-checkout — Product menu + order placement
    ├── Live Order Tracking/         — @samou-go/web-order-tracking — Customer-facing order status (polls /orders/:id)
    ├── Store Manager Dashboard/     — @samou-go/web-store-manager — Accept/prepare orders, manage catalogue
    ├── Delivery Captain Dashboard/  — Captain's pickup & delivery workflow
    └── admin/                       — Admin panel (user management, platform overview)
```

## Key Abstractions

### ApiError (api-client)
- **File**: `packages/api-client/src/api.ts`
- **Responsibility**: Every failure from the API — HTTP errors, network timeouts, malformed responses, validation errors — arrives as an `ApiError` with a machine-readable `code`, bilingual `message`, and optional field-level `details`
- **Interface**: `.code`, `.message`, `.status`, `.details`, `.isOffline`, `.isAborted`, `.isAuthError`, `.fieldError(path)`
- **Lifecycle**: Thrown by `request()` and caught by hooks (`useResource`, `useMutation`, `useAuth`); never thrown raw — always wrapped

### useResource (api-client)
- **File**: `packages/api-client/src/useApi.ts`
- **Responsibility**: Runs a fetcher whenever a key string changes, tracks loading/refreshing/error states, aborts on unmount or key change, and optionally polls at an interval
- **Key design**: Uses a string `key` (not a dependency array) because the loader closure changes identity on every render. The key is typically `JSON.stringify(query)` or a template string
- **Polling**: A separate `useEffect` calls `reload` on an interval — used by the order-tracking screen at ~15s

### OrderStatus state machine (shared-types)
- **File**: `packages/shared-types/src/enums.ts`
- **Responsibility**: Defines every legal transition (`ORDER_STATUS_TRANSITIONS`), which roles may drive into each status (`ORDER_STATUS_ACTORS`), and status metadata (labels, tones, sequence). Enforced server-side with three independent gates: transition legality, role authorization, and order ownership
- **Why const objects, not TypeScript enums**: Prisma generates exactly this shape, so `prismaUser.role` and `UserRole.CUSTOMER` are mutually assignable without casting

### calculateDeliveryFee / calculateOrderTotals (shared-types)
- **File**: `packages/shared-types/src/delivery.ts`
- **Responsibility**: The single source of truth for delivery pricing: fewer than 5 items → 3 ₪, 5+ → 5 ₪. Both the server (order creation) and the checkout screen (quote preview) call the same functions
- **Key invariant**: The client NEVER sends money. `CreateOrderInput` has `storeId`, `items`, and address — no price fields. The server prices from the database

### Envelope pattern
- **File**: `packages/api/src/lib/respond.ts` (server), `packages/api-client/src/api.ts` (client `readEnvelope`)
- **Responsibility**: Every API response is `{ success: true, data }` or `{ success: false, error: { code, message, details } }`. The client unwraps success and throws `ApiError` on failure
- **Why**: Consistent error handling across 6 front-ends with zero per-screen error parsing

### Token management (api-client)
- **File**: `packages/api-client/src/api.ts` (getToken/setToken/clearToken)
- **Responsibility**: JWT stored in `localStorage` with an in-memory cache. Safari private mode fallback: if `localStorage` throws, the in-memory copy carries the session
- **403/401 handling**: The `request()` function drops the token on any 401 response so subsequent calls don't re-send a dead token

## Data Flow

### Order lifecycle (the primary flow)

1. **Customer browses stores**: `useStores()` → `GET /api/v1/stores` → returns `Paginated<Store>`
2. **Customer views menu**: `useStore(storeId)` → `GET /api/v1/stores/:id` → returns `StoreWithCatalogue` (categories + products inlined)
3. **Customer builds cart**: Client-side state, no API calls yet
4. **Checkout quotes delivery fee**: `quoteOrder(input)` → `POST /api/v1/orders/quote` → server calls `calculateDeliveryFee(itemCount)` → returns `OrderQuote` with subtotal, deliveryFee, totalAmount
5. **Customer places order**: `createOrder(input)` → `POST /api/v1/orders` → server validates basket against products table, generates order number (SG-YYMMDD-NNNN), creates order + items + status history in a transaction
6. **Customer tracks order**: `useOrder(orderId, { pollMs: 15000 })` → polls `GET /api/v1/orders/:id` every 15s → renders OrderDetail with status progress
7. **Store Manager accepts**: `updateOrderStatus(orderId, { status: 'ACCEPTED' })` → `PATCH /api/v1/orders/:id/status` → server checks: transition legal? role authorized? owns order? → appends OrderStatusHistory entry
8. **Captain marks delivered**: Same PATCH flow, `ON_THE_WAY → DELIVERED` transition
9. **Tracking updates**: Next poll cycle picks up new status; the `refreshing` flag keeps existing data visible (no skeleton flicker)

### Auth flow

1. **Login**: `signIn({ phone, password })` → `POST /api/v1/auth/login` → JWT returned → stored in localStorage + memory
2. **Session restore**: On mount, `useAuth()` checks for a stored token → calls `GET /api/v1/auth/me` → if 401, drops token → sets `ready=true`
3. **Authenticated requests**: `request()` reads token from storage → attaches `Authorization: Bearer` header → on 401 response, drops token

## Non-Obvious Behaviors & Design Decisions

### The client never sends money
`CreateOrderInput` deliberately omits `subtotal`, `deliveryFee`, and `totalAmount`. The server prices everything from the products table. Adding a price field to the request would let anyone set their own price — a critical security constraint.

### No GPS, by design
Samou' has no reliable street addressing. Orders carry `customerAddressText` (free-text neighbourhood/landmark) and an optional `addressNote`. There is intentionally no latitude/longitude column. The captain phones the customer.

### Money is Decimal(10,2) in Postgres
Prisma returns `Prisma.Decimal` objects. The server converts to `number` at the API edge via `decimalToNumber()`. If this conversion is missed, money serializes as a string like `"12.50"` instead of `12.5`, breaking all front-end display logic.

### Three independent order status gates
Status changes pass three checks that must ALL pass: (1) `canTransitionOrderStatus(from, to)` — is the edge in the state machine? (2) `canRoleSetOrderStatus(role, status)` — is this role allowed to drive into the target? (3) Ownership check — does this user own this order? These functions live in `shared-types` so dashboards can grey out buttons using the same rules the server enforces.

### Order numbers use same-day counters
Format: `SG-YYMMDD-NNNN`. Allocated inside the create transaction with retry on `P2002` (unique constraint violation). The `UNIQUE` constraint is the real guard; the counter is best-effort.

### Polling, not WebSockets
The order tracking screen polls `GET /orders/:id` every ~15 seconds. There is no WebSocket. This was chosen because Samou' runs on patchy mobile data where persistent connections drop frequently. The `useResource` hook's `refreshing` flag keeps existing data visible during polls — no skeleton flicker.

### 12-second fetch timeout
`DEFAULT_TIMEOUT_MS = 12_000` — long enough for slow 3G, short enough that a dead server doesn't freeze a spinner indefinitely. Custom timeout implementation (not `AbortSignal.any`) because older Android WebViews don't support it.

### Safari private mode token handling
`localStorage` access is wrapped in try/catch. In Safari private mode, the in-memory token copy still works for the session even if `localStorage` throws.

### Seed data password
All seeded accounts use password `samou1234`. The seed must never run against production. The e2e smoke test depends on these accounts.

### TypeScript const objects, not enums
`UserRole`, `OrderStatus`, etc. are `const` objects with union types, not TypeScript `enum`s. Prisma generates exactly this shape, so values are mutually assignable without casting. A string `enum` would be nominal and force casts at every boundary.

### Arabic-first bilingual labels
All user-facing labels are Arabic-first with English second (e.g., `"رسوم التوصيل / Delivery Fee"`). The `deliveryFeeLabel()` function builds these from the canonical dictionaries in `shared-types`. No screen may hardcode a label string.

### Graceful shutdown
`server.ts` handles SIGINT/SIGTERM with a 10-second timeout. Stops accepting connections, lets in-flight requests finish, disconnects Prisma, then exits. Without this, `docker stop` could drop a live order write.

### Delivery tariff is env-overridable
The *rule* (fewer than 5 items → 3₪, 5+ → 5₪) lives in `shared-types` and cannot change. The *amounts* are env-overridable via `DELIVERY_BASE_FEE`, `DELIVERY_BULK_FEE`, `DELIVERY_BULK_THRESHOLD`. The `/meta` endpoint returns the live tariff so front-ends don't hardcode amounts.

## Module Reference

| File | Purpose |
|------|---------|
| `packages/api/src/server.ts` | HTTP server entry point, graceful shutdown handlers |
| `packages/api/src/app.ts` | Express app factory: CORS, helmet, morgan, /health probe, API router mount |
| `packages/api/src/config/env.ts` | Environment variable parsing with Zod validation |
| `packages/api/src/lib/prisma.ts` | Prisma client singleton with disconnect helper |
| `packages/api/src/lib/respond.ts` | Response envelope helpers (ok, fail, paginated) |
| `packages/api/src/middleware/error-handler.ts` | Global error handler (Zod errors, Prisma errors, ApiError) |
| `packages/api/src/middleware/authenticate.ts` | JWT verification middleware |
| `packages/api/src/routes/index.ts` | Mounts /auth, /stores, /orders, /meta routers |
| `packages/api/src/modules/auth/` | Registration, login, /me endpoints |
| `packages/api/src/modules/stores/` | Store listing, detail with catalogue, product listing |
| `packages/api/src/modules/orders/` | Quote, create, list, detail, status update, captain assignment |
| `packages/api/prisma/schema.prisma` | Full database schema (7 models, 3 enums) |
| `packages/api/scripts/e2e-smoke.mjs` | End-to-end test: auth → quote → create → walk all statuses → negative cases |
| `packages/api-client/src/api.ts` | Typed HTTP client: all endpoints, ApiError, token management, timeout handling |
| `packages/api-client/src/useApi.ts` | React hooks: useResource (with polling), useMutation, useStore, useOrder, useStores, useOrders |
| `packages/api-client/src/useAuth.ts` | Auth state hook: session restore, signIn, signOut |
| `packages/api-client/src/SignInGate.tsx` | Login form component (phone + password, bilingual) |
| `packages/shared-types/src/enums.ts` | UserRole, OrderStatus, PaymentMethod, state machine, labels, tones |
| `packages/shared-types/src/models.ts` | PublicUser, Store, Product, Order, OrderDetail, OrderSummary, etc. |
| `packages/shared-types/src/dto.ts` | All request/response DTOs: CreateOrderInput, ApiResponse<T>, Paginated<T>, etc. |
| `packages/shared-types/src/delivery.ts` | Delivery fee calculator, currency formatting, order totals |

## Suggested Reading Order

1. **`packages/shared-types/src/enums.ts`** — Start here: understand the domain (roles, order statuses, state machine, labels). Everything else references these.
2. **`packages/shared-types/src/models.ts`** — The data shapes. See what an Order, Store, and User look like at the transport layer.
3. **`packages/shared-types/src/dto.ts`** — Request/response contracts. Note what `CreateOrderInput` does NOT contain (prices).
4. **`packages/api-client/src/api.ts`** — How the front-end talks to the server: fetch wrapper, ApiError, token management, all endpoint functions.
5. **`packages/api-client/src/useApi.ts`** — React integration: how components fetch data, how polling works, how mutations are handled.
6. **`packages/api/src/app.ts`** — Server entry: how the Express app is assembled, what middleware runs, the /health probe.
7. **`packages/api/README.md`** — Endpoint reference, rules, and gotchas for the backend.

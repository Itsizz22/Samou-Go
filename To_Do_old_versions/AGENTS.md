# AGENTS.md

Compact orientation for OpenCode sessions. **Read `CLAUDE.md` first** — it holds the full architecture, commands, and conventions. `DESIGN_SYSTEM.md` is the UI/UX reference (Arabic-first RTL, emerald `#10B981`). There is no `README.md`.

## Workspaces (npm, monorepo)

| Package | Path | Notes |
|---|---|---|
| `@samou-go/shared-types` | `packages/shared-types` | Enums, DTOs, state machine, delivery-fee rules — single source of truth. Vitest unit tests here (`npm test`). |
| `@samou-go/api` | `packages/api` | Express + Prisma, CommonJS, port 4000, routes under `/api/v1`. `tsx watch src/server.ts`. |
| `@samou-go/api-client` | `packages/api-client` | Typed fetch + custom hooks. Consumed as **TS source** — no build step. |
| `@samou-go/ui` | `packages/ui` | Shared primitives: `bootstrapApp`, `DeliveryFee`, chime. Consumed from built `dist/`. |
| `@samou-go/web-*` | `themes/web-*` | 7 independent Vite + React 19 apps, ports 5173–5179. |

## Gotchas

- **`@samou-go/ui` must be built before dev/typecheck of any web app.** Its `exports` point to `dist/`, which is gitignored. After cloning or editing `packages/ui`: `npm run build --workspace @samou-go/ui`.
- **`@samou-go/shared-types` builds on `npm install`** (prepare script). The API (CJS) needs `dist/`; web apps resolve the TS source via the `import` condition. Editing shared-types hot-reloads in Vite but requires `npm run build` (root = shared-types + api only) for the API. For everything: `npm run build:all`.
- **No React Query, no SWR, no websockets.** `api-client` ships `useResource`/`useMutation` returning `{ data, loading, refreshing, error, reload, refresh }`. Polling = `pollMs` option. Retry buttons call `refresh`. (CLAUDE.md's "React Query" line is stale.)
- **Every theme vendors its own `src/lib/delivery.ts`**, and screens import from `@/lib/delivery` — NOT `@samou-go/shared-types`. Changing fee labels/formatting in shared-types does not touch the 7 screens; update each copy too.
- **Routing.** `web-customer` is a consolidated SPA: every customer screen is an internal React Router route (`/stores/:storeId`, `/cart`, `/checkout`, `/orders/:orderId`, …) and the Android hardware back button is mapped to `navigate(-1)` in `App.tsx`. The other six themes still have no shared router and link via URL params (`?storeId=`, `?orderId=`). Add a new app by creating `themes/<kebab>`, wiring workspaces/dev script, and adding its origin to `packages/api/.env` `CORS_ORIGINS`.
- **Client never sends money.** `POST /orders` takes only `storeId`, `items`, address; totals/fees are computed server-side from DB prices.
- **Money = `Decimal(10,2)` in Postgres.** Always convert at the API edge via `decimalToNumber()` (`packages/api/src/lib/decimal.ts`).
- **Enums must match byte-for-byte** between `shared-types/src/enums.ts` and `prisma/schema.prisma`.

## Commands (from root)

```bash
npm run typecheck        # all workspaces (server + web); rebuild shared-types/ui first if changed
npm test                 # shared-types domain tests (Vitest)
npm run db:seed          # idempotent, deterministic IDs; seeded password: samou1234
npm run test:e2e         # needs running API + seeded DB; hits localhost:4000 hardcoded
npm run dev:api          # API, port 4000
npm run dev:web-<app>    # any of customer|store-details|checkout|order-tracking|store-manager|captain|admin
```

Env: API config lives in `packages/api/.env` (copy `.env.example`; `JWT_SECRET` ≥ 32 chars). Each theme reads `VITE_API_URL` with a working default, so local dev needs no `.env`.

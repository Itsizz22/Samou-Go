# AGENTS.md

## Monorepo structure

**Critical ownership & boundaries**
- `@samou-go/shared-types` (packages/shared-types): Enums, DTOs, state machine, delivery-fee rules — single source of truth. Vitest tests (`npm test`). Built automatically on `npm install`.
- `@samou-go/api` (packages/api): Express + Prisma backend, CommonJS, port 4000, routes under `/api/v1`. Entry: `src/server.ts`. DB: Production schema (`schema.prisma`) vs dev (`schema.sqlite.prisma`).
- `@samou-go/api-client` (packages/api-client): Typed fetch + hooks. Consumed as **TS source** (exports → `src/`), no build step.
- `@samou-go/ui` (packages/ui): Shared primitives (`bootstrapApp`, `DeliveryFee`, chime). Consumed from built `dist/` (gitignored). Must be built before dev/typecheck of web apps.
- `@samou-go/web-*` (themes/web-*): 7 independent Vite + React 19 apps, ports 5173–5179.

**Must-know constraints**
- `@samou-go/ui` built before any web app dev/typecheck: `npm run build --workspace @samou-go/ui`
- `@samou-go/shared-types` builds on `npm install` (prepare script). After editing shared-types: `npm run build` (root = shared-types + api) or `npm run build:all` for everything.
- **Enum immutability**: Values in `packages/shared-types/src/enums.ts` MUST match byte-for-byte with `packages/api/prisma/schema.prisma`.
- **Dual Prisma schemas**: Production (`schema.prisma`) with PostgreSQL native types; dev (`schema.sqlite.prisma`) with SQLite stripped types. Keep in sync when a model changes. Always run `npm run db:generate` before starting dev server.
- **Money handling**: `Decimal(10,2)` in Postgres. Convert at API edge via `decimalToNumber()` (`packages/api/src/lib/decimal.ts`). DTOs are plain `number`.
- **Case-insensitive search**: Use `caseInsensitiveContains()` helper in `packages/api/src/lib/prisma.ts`. Never inline `{ contains, mode }` — SQLite fails to typecheck.
- **Client never sends money**: `POST /orders` takes only `storeId`, `items`, address. Totals/fees computed server-side from DB prices.
- **Delivery fee logic**: Every theme vendors its own `src/lib/delivery.ts`. Screens import from `@/lib/delivery`. Fee labels/formatting updated in shared-types, but each theme's delivery.ts must be updated separately.
- **Seed guard**: `seed.ts` refuses to run when `NODE_ENV=production`. Uses deterministic IDs; seeded password `samou1234` (roles: CUSTOMER, STORE_MANAGER, CAPTAIN, ADMIN).
- **Routing differences**: `web-customer` is a consolidated SPA using React Router (`/stores/:storeId`, `/cart`, `/checkout`, `/orders/:orderId`, …); Android hardware back mapped to `navigate(-1)` in `App.tsx`. Other six themes link via URL params (`?storeId=`, `?orderId=`).

## Commands (exact order matters)

**Setup & build**
```bash
npm install               # builds shared-types via prepare script + ui
npm run build             # shared-types + api only (for changes)
npm run build:all         # everything (shared-types + ui + api + all web)
```

**Type checking & verification**
```bash
npm run typecheck         # all workspaces (rebuild shared-types/ui first if changed)
npm run typecheck:all     # full typecheck + build
npm test                  # shared-types domain tests (Vitest)
```

**Database operations**
```bash
npm run db:generate       # local dev → SQLite (schema.sqlite.prisma)
npm run db:validate       # local dev → SQLite (schema.sqlite.prisma)
npm run db:deploy         # PRODUCTION → PostgreSQL (schema.prisma)
npm run db:push           # local SQLite push (no migration history)
npm run db:seed            # idempotent seeding
```

**Development servers**
```bash
npm run dev:api           # API, port 4000
npm run dev:web-<app>     # customer|store-details|checkout|order-tracking|store-manager|captain|admin
```

**Testing**
```bash
npm run test:e2e          # needs running API + seeded DB; hits localhost:4000 hardcoded
```

**Important notes**
- `lint` / `format` / `format:check` exist per-theme (eslint + prettier) — no root lint script.
- `web-*` apps run on ports 5173–5179. Add a new app by creating `themes/<kebab>`, wiring workspaces/dev script, and adding its origin to `packages/api/.env` `CORS_ORIGINS`.
- Themes read `VITE_API_URL` with localhost default; no per-theme `.env` needed for local dev.

## Architecture quirks

**Auth gating**
- Components `useAuth({ allowedRoles: [...] })` or `useRoleRedirect('role')` required in staff components.
- Mount order: `authenticate` middleware before `authorize` before route handlers.
- `optionalAuthenticate` used by public catalogue endpoints.

**Realtime & polling**
- No websockets. Polling = `pollMs` option in `api-client` hooks. Retry buttons call `refresh`.
- Order state transitions driven by API (`PATCH /orders/:id/status`).
- Captain GPS: `navigator.geolocation.watchPosition` emits `captain:location` socket events.

**Testing & data flow**
- Shared-types: Vitest unit tests (`npm test`).
- API: Jest/Vitest with integration tests. Requires seeded DB (`npm run db:seed`).
- E2E: `npm run test:e2e` — runs API in background, hits `localhost:4000`.
- `order-number.ts` manages sequence; seed advances `DailyOrderSequence`.

**Environment & deployment**
- Local SQLite (`dev.db`) never touches production Postgres/Neon.
- Production: `DATABASE_URL` injected as secret (never stored in repo `.env`).
- `packages/api/.env` only non-secret dev config. Copy `.env.example`.
- `config/env.ts` refuses to boot production without `DATABASE_URL`, `JWT_SECRET`, or `SMS_PROVIDER=console`.
- `seed.ts` and `config/env.ts` both refuse production runs.

## Style & conventions

**TypeScript**
- Base config (`tsconfig.base.json`) with strict flags: `noImplicitOverride`, `noUncheckedIndexedAccess`, `composite`. Zero tolerance for `as any` / `@ts-ignore`.
- Composite projects: build `packages/shared-types`, `packages/ui`, `packages/api` as a unit.

**UI**
- Tailwind v4 CSS-first. Tokens registered in `@theme` inside each app's `src/index.css`. No `tailwind.config.js`.
- No raw hex in classNames (`bg-[#10B981]` forbidden). Use semantic classes: `bg-brand`, `text-ink-muted`, `border-line`, `badge-*`.
- RTL: logical properties only (`ps/pe/ms/me/start/end`). Numbers/codes/prices wrapped in `dir="ltr"`. Directional icons flipped with `rtl:rotate-180`.
- **Do not touch** `src/settings/theme.ts` — generator placeholders (`%INJECTED_THEME%`), same in all 7 apps.

**Data flow**
- Products and offers consolidation between `packages/api` and `themes/web-customer`. Ensure sync across store manager controls and customer feeds.

**Navigation**
- `web-customer`: React Router internal, Android back button → `navigate(-1)` in `App.tsx`.
- Other six themes: URL params (`?storeId=`, `?orderId=`).
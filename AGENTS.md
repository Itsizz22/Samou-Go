# AGENTS.md

Samou' Go — hyper-local delivery monorepo for Samou', Hebron (Arabic-first RTL, emerald `#10B981`). No root `README.md`. Historical files in `To_Do_old_versions/`.

## Workspaces (npm monorepo)

| Package | Path | Notes |
|---|---|---|
| `@samou-go/shared-types` | `packages/shared-types` | Enums, DTOs, order state machine, delivery-fee rules — single source of truth. Vitest tests (`npm test`). Builds on `npm install` (prepare script). |
| `@samou-go/api` | `packages/api` | Express + Prisma backend, CommonJS, port 4000, routes under `/api/v1`. Dev: `npm run dev:api`. |
| `@samou-go/api-client` | `packages/api-client` | Typed fetch + hooks. Consumed as **TS source** (exports → `src/`), no build step. |
| `@samou-go/ui` | `packages/ui` | Shared primitives (`bootstrapApp`, `DeliveryFee`, chime). Consumed from built `dist/`. |
| `@samou-go/web-*` | `themes/web-*` | 7 independent Vite + React 19 apps, ports 5173–5179. |

## Gotchas (must-read)

- **`@samou-go/ui` must be built before typecheck/dev of any web app** — its `exports` point to `dist/` (gitignored). After editing `packages/ui`: `npm run build --workspace @samou-go/ui`.
- **`@samou-go/shared-types` builds on `npm install`** (prepare script). The API (CJS) needs `dist/`; web apps resolve TS source via the `import` condition. After editing shared-types: `npm run build` (root = shared-types + api) for the API, or `npm run build:all` for everything.
- **Each theme keeps a `src/lib/delivery.ts` entry point that screens import via `@/lib/delivery`** for path stability, but it is now a thin re-export of `@samou-go/shared-types` (the single source of truth). Fee wording/tariff changes are made once in shared-types and picked up by all 7 themes — never duplicate the fee logic into a theme again.
- **Routing:** `web-customer` is a consolidated SPA using React Router (`/stores/:storeId`, `/cart`, `/checkout`, `/orders/:orderId`, …); Android hardware back → `navigate(-1)` in `App.tsx`. The other six themes have no router and link via URL params (`?storeId=`, `?orderId=`). New app = create `themes/<kebab>` + add to root `workspaces` + root `dev:web-<kebab>` script + origin in `packages/api/.env` `CORS_ORIGINS`.
- **Client never sends money.** `POST /orders` takes only `storeId`, `items`, address; totals/fees computed server-side from DB prices.
- **Money = `Decimal(10,2)` in Postgres.** Convert at the API edge via `decimalToNumber()` (`packages/api/src/lib/decimal.ts`); DTOs are plain `number`.
- **Enums must match byte-for-byte** between `packages/shared-types/src/enums.ts` and `packages/api/prisma/schema.prisma`.
- **Dual Prisma schemas.** `packages/api/prisma/schema.prisma` is the **production PostgreSQL schema** (native `@db.*` types, `url = env("DATABASE_URL")`) and the only one that CI validates and that `prisma migrate deploy` applies. `packages/api/prisma/schema.sqlite.prisma` is the **local-dev variant** (SQLite `file:./dev.db`, native types stripped). Keep in sync when a model changes. Prisma CLI config lives in `packages/api/prisma.config.ts` (default schema = production; the deprecated `package.json#prisma` key is gone — it does `import 'dotenv/config'` because a config file disables Prisma's automatic .env loading). After `npm install`, `@prisma/client` generates from the *production* schema — always run `npm run db:generate` before starting the dev server so the client matches `dev.db`.
- **Env separation (binding).** Local dev/test runs on SQLite and never touches Postgres/Neon. `DATABASE_URL` is only required in production, where it is **injected as a deployment secret** — never store real credentials in any repo `.env`. `packages/api/.env` carries non-secret dev config only; there is no root `.env`. Production DB work is `db:deploy`/`db:generate:prod`/`db:validate:prod` (all pinned to `schema.prisma`); every other `db:*` script is pinned to the SQLite schema. `config/env.ts` refuses to boot production without `DATABASE_URL`.
- **Case-insensitive search is provider-gated.** Postgres-only `mode: 'insensitive'` is emitted via `caseInsensitiveContains()` in `packages/api/src/lib/prisma.ts` — never write `{ contains, mode }` inline, or the SQLite client fails to typecheck.
- **Seed advances the order-number sequence.** `seed.ts` creates demo orders numbered `...-0001..0003` and then bumps `DailyOrderSequence` so real orders start after them. If you change the demo orders, keep the sequence upsert in sync.
- **Production guards.** `seed.ts` refuses to run when `NODE_ENV=production`, and `config/env.ts` refuses to boot production without a `DATABASE_URL`, with the placeholder `JWT_SECRET`, or with `SMS_PROVIDER=console` (which logs OTP codes).

## UI / style rules (binding, from `DESIGN_SYSTEM.md`)

- Tokens are registered in `@theme` inside each app's `src/index.css` — there is NO `tailwind.config.js` (Tailwind v4 CSS-first). `src/theme/tokens.ts` mirrors the palette for inline/SVG use.
- No raw hex in classNames (`bg-[#10B981]` forbidden) and no default green (`bg-green-*`). Use `bg-brand`, `text-ink-muted`, `border-line`, `badge-*`, etc.
- RTL: use logical properties only (`ps/pe/ms/me/start/end`), wrap numbers/codes/prices in `dir="ltr"` islands, flip directional icons with `rtl:rotate-180`.
- **Do not touch `src/settings/theme.ts`** — generator placeholders (`%INJECTED_THEME%`), same in all 7 apps.
- Delivery-fee display goes through each app's `src/lib/delivery.ts` only; never hardcode fee strings.

## Commands (from root)

```bash
npm install               # builds shared-types via prepare script + ui
npm run typecheck         # all workspaces (rebuild shared-types/ui first if changed)
npm run build             # shared-types + api only
npm run build:all         # everything
npm test                  # shared-types domain tests (Vitest)
npm run db:generate       # local dev → SQLite (schema.sqlite.prisma)
npm run db:validate       # local dev → SQLite (schema.sqlite.prisma)
npm run db:deploy         # PRODUCTION → PostgreSQL (schema.prisma)
npm run test:e2e          # needs running API + seeded DB; hits localhost:4000 hardcoded
npm run dev:api           # API, port 4000
npm run dev:web-<app>     # customer|store-details|checkout|order-tracking|store-manager|captain|admin
```

- `lint` / `format` / `format:check` exist per-theme (eslint + prettier) — no root lint script.
- **Schema evolution:** local SQLite = `npm run db:push` (no migration history; `db:migrate` was removed because the committed `prisma/migrations` belong to Postgres). Production PostgreSQL = `npm run db:deploy` (`prisma migrate deploy`) — the only production DB command.
- Seed is idempotent with deterministic IDs; seeded password is `samou1234` (roles CUSTOMER, STORE_MANAGER, CAPTAIN, ADMIN).
- API env: `packages/api/.env` (copy `.env.example`; `JWT_SECRET` ≥ 32 chars). Local SQLite dev needs **no** `DATABASE_URL`; the `.env` placeholder exists only so the Prisma postinstall and prod-schema `validate`/`generate` succeed — it is never used for a connection. Themes read `VITE_API_URL` with a working localhost default, so no per-theme `.env` needed for local dev.
- Strict TS (base): `noUncheckedIndexedAccess`, `noImplicitOverride`, `composite`. Zero tolerance for `as any` / `@ts-ignore`.
# AGENTS.md

Samou' Go — hyper-local delivery monorepo for Samou', Hebron (Arabic-first RTL, emerald `#10B981`). No root `README.md`. Historical instruction files live in `To_Do_old_versions/` (`CLAUDE.md`, `DESIGN_SYSTEM.md`) — read them for full context; `DESIGN_SYSTEM.md` is the binding UI/UX spec.

## Workspaces (npm monorepo)

| Package | Path | Notes |
|---|---|---|
| `@samou-go/shared-types` | `packages/shared-types` | Enums, DTOs, order state machine, delivery-fee rules — single source of truth. Vitest tests here (`npm test`). |
| `@samou-go/api` | `packages/api` | Express + Prisma backend, CommonJS, port 4000, routes under `/api/v1`. Dev: `tsx watch src/server.ts`. |
| `@samou-go/api-client` | `packages/api-client` | Typed fetch + hooks. Consumed as **TS source** (exports → `src/`), no build step. |
| `@samou-go/ui` | `packages/ui` | Shared primitives (`bootstrapApp`, `DeliveryFee`, chime). Consumed from built `dist/`. |
| `@samou-go/web-*` | `themes/web-*` | 7 independent Vite + React 19 apps, ports 5173–5179 (convention, not enforced in vite configs). |

## Gotchas

- **`@samou-go/ui` must be built before typecheck/dev of any web app** — its exports point to `dist/` (gitignored). After cloning or editing it: `npm run build --workspace @samou-go/ui`.
- **`@samou-go/shared-types` builds on `npm install`** (prepare script). The API (CJS) needs `dist/`; web apps resolve TS source via the `import` condition. After editing shared-types: `npm run build` (root = shared-types + api) for the API, or `npm run build:all` for everything.
- **No React Query / SWR / websockets.** `api-client` ships `useResource`/`useMutation` returning `{ data, loading, refreshing, error, reload, refresh }`. Polling = `pollMs` option; retry buttons call `refresh`. (`To_Do_old_versions/CLAUDE.md` mentions React Query — stale.)
- **Every theme vendors its own `src/lib/delivery.ts`** and screens import from `@/lib/delivery`, NOT `@samou-go/shared-types`. Fee changes must be copied into all 7 copies.
- **Routing.** `web-customer` is a consolidated SPA using React Router (`/stores/:storeId`, `/cart`, `/checkout`, `/orders/:orderId`, …); Android hardware back → `navigate(-1)` in `App.tsx`. The other six themes have no router and link via URL params (`?storeId=`, `?orderId=`). New app = create `themes/<kebab>` + add to root `workspaces` + root `dev:web-<kebab>` script + origin in `packages/api/.env` `CORS_ORIGINS`.
- **Client never sends money.** `POST /orders` takes only `storeId`, `items`, address; totals/fees computed server-side from DB prices.
- **Money = `Decimal(10,2)` in Postgres.** Convert at the API edge via `decimalToNumber()` (`packages/api/src/lib/decimal.ts`); DTOs are plain `number`.
- **Enums must match byte-for-byte** between `packages/shared-types/src/enums.ts` and `packages/api/prisma/schema.prisma`.
- **Dual Prisma schemas.** `packages/api/prisma/schema.prisma` is the **production PostgreSQL schema** (native `@db.*` types, `url = env("DATABASE_URL")`) and the only one that CI validates and that `prisma migrate deploy` applies. `packages/api/prisma/schema.sqlite.prisma` is the **local-dev variant** (SQLite `file:./dev.db`, native types stripped). Keep the two files in sync when a model changes. After `npm install`, @prisma/client generates from the *production* schema — always run `npm run db:generate` before starting the dev server so the client matches `dev.db`.
- **Env separation (binding).** Local dev/test runs on SQLite and never touches Postgres/Neon. `DATABASE_URL` is only required in production, where it is **injected as a deployment secret** — never store real credentials in any repo `.env`. `packages/api/.env` carries non-secret dev config only; there is no root `.env`. Production DB work is `db:deploy`/`db:generate:prod`/`db:validate:prod` (all pinned to `schema.prisma`); every other `db:*` script is pinned to the SQLite schema. `config/env.ts` refuses to boot production without `DATABASE_URL`.
- **Case-insensitive search is provider-gated.** Postgres-only `mode: 'insensitive'` is emitted via `caseInsensitiveContains()` in `packages/api/src/lib/prisma.ts` — never write `{ contains, mode }` inline, or the SQLite client fails to typecheck.
- **Seed advances the order-number sequence.** `seed.ts` creates demo orders numbered `...-0001..0003` and then bumps `DailyOrderSequence` so real orders start after them. If you change the demo orders, keep the sequence upsert in sync.
- **Production guards.** `seed.ts` refuses to run when `NODE_ENV=production`, and `config/env.ts` refuses to boot production without a `DATABASE_URL`, with the placeholder `JWT_SECRET`, or with `SMS_PROVIDER=console` (which logs OTP codes).
- **CI.** `.github/workflows/ci.yml` validates + generates the production PostgreSQL schema, then runs typecheck → build → tests. No `continue-on-error` / `|| true` masking.

## UI / style rules (binding, from `DESIGN_SYSTEM.md`)

- Tokens are registered in `@theme` inside each app's `src/index.css` — there is NO `tailwind.config.js` (Tailwind v4 CSS-first). `src/theme/tokens.ts` mirrors the palette for inline/SVG use.
- No raw hex in classNames (`bg-[#10B981]` forbidden) and no default green (`bg-green-*`). Use `bg-brand`, `text-ink-muted`, `border-line`, `badge-*`, etc.
- RTL: use logical properties only (`ps/pe/ms/me/start/end`), wrap numbers/codes/prices in `dir="ltr"` islands, flip directional icons with `rtl:rotate-180`.
- **Do not touch `src/settings/theme.ts`** — generator placeholders (`%INJECTED_THEME%`), same in all 7 apps.
- Delivery-fee display goes through each app's `src/lib/delivery.ts` only; never hardcode fee strings.

## Commands (from root)

```bash
npm install               # builds shared-types via prepare script
npm run typecheck         # all workspaces (rebuild shared-types/ui first if changed)
npm run build             # shared-types + api only
npm run build:all         # everything
npm test                  # shared-types domain tests (Vitest)
npm run db:generate|push|studio|seed   # local dev/tests → SQLite (schema.sqlite.prisma)
npm run db:validate       # local dev/tests → SQLite (schema.sqlite.prisma)
npm run db:deploy|generate:prod|validate:prod  # PRODUCTION → PostgreSQL (schema.prisma)
npm run test:e2e          # needs running API + seeded DB; hits localhost:4000 hardcoded
npm run dev:api           # API, port 4000
npm run dev:web-<app>     # customer|store-details|checkout|order-tracking|store-manager|captain|admin
```

- `lint` / `format` / `format:check` exist per-theme (eslint + prettier) — no root lint script.
- **Schema evolution:** local SQLite = `npm run db:push` (no migration history; `db:migrate` was removed because the committed `prisma/migrations` belong to Postgres). Production PostgreSQL = `npm run db:deploy` (`prisma migrate deploy`) — the only production DB command.
- Seed is idempotent with deterministic IDs; seeded password is `samou1234` (roles CUSTOMER, STORE_MANAGER, CAPTAIN, ADMIN).
- API env: `packages/api/.env` (copy `.env.example`; `JWT_SECRET` ≥ 32 chars). Local SQLite dev needs **no** `DATABASE_URL`; the `.env` placeholder exists only so the Prisma postinstall and prod-schema `validate`/`generate` succeed — it is never used for a connection. Themes read `VITE_API_URL` with a working localhost default, so no per-theme `.env` needed for local dev.
- Strict TS (base): `noUncheckedIndexedAccess`, `noImplicitOverride`, `composite`. Zero tolerance for `as any` / `@ts-ignore`.

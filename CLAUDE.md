# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Samou' Go — hyper-local delivery platform for Samou', Hebron (Palestine). Arabic-first RTL UI, emerald brand (`#10B981`). npm workspaces monorepo, no root `README.md`. `AGENTS.md` holds the same rules in condensed form; historical docs live in `To_Do_old_versions/` (including `DESIGN_SYSTEM.md`, which the code still cites by section).

## Workspaces

| Package | Path | Consumed as |
|---|---|---|
| `@samou-go/shared-types` | `packages/shared-types` | Enums, DTOs, order state machine, delivery-fee rules. `import` → TS source, `require` → `dist/`. Builds via `prepare` on install. |
| `@samou-go/api` | `packages/api` | Express + Prisma, CommonJS, port 4000, mounted at `/api/v1`. |
| `@samou-go/api-client` | `packages/api-client` | Typed fetch + React hooks. **Raw TS source, no build step** — browser-only (`import.meta.env`, `localStorage`), must never be imported by `packages/api`. |
| `@samou-go/ui` | `packages/ui` | Shared primitives (`bootstrapApp`, `AppErrorBoundary`, `DeliveryFee`, chime, map). Resolved from built `dist/` (gitignored). |
| `@samou-go/web-*` | `themes/web-*` | 7 independent Vite + React 19 SPAs. |

Dev ports: web-customer 5173, web-store-details 5174, web-checkout 5175, web-order-tracking 5176, web-store-manager 5177, web-captain 5178, web-admin 5179 (all `strictPort`).

## Commands (from repo root)

```bash
npm install                      # runs prepare → builds shared-types + ui; api postinstall generates both Prisma clients
npm run build                    # tsc -b shared-types + ui + api
npm run build:all                # the above + every workspace build (includes the 7 vite builds)
npm run typecheck                # all workspaces
npm run typecheck:server         # shared-types + api only, forced
npm test                         # shared-types domain tests (Vitest)
npm run test --workspace @samou-go/api   # API unit + integration tests (Vitest)
npm run test:e2e                 # scripts/e2e-smoke.mjs — needs a running, seeded API; localhost:4000 is hardcoded
npm run dev:api                  # API on :4000
npm run dev:web-<app>            # customer|store-details|checkout|order-tracking|store-manager|captain|admin
```

Single test file / single test:

```bash
cd packages/api && npx vitest run src/modules/orders/orders.service.test.ts
cd packages/api && npx vitest run -t "rejects an illegal transition"
```

Tests are colocated as `src/**/*.test.ts` in `packages/api`; shared-types tests live in `packages/shared-types/src/__tests__/`.

Lint/format exist **per theme only** (`eslint`, `prettier`) — there is no root lint script:

```bash
npm run lint --workspace @samou-go/web-customer
npm run format:check --workspace @samou-go/web-customer
```

Database (all wrappers around `packages/api` Prisma scripts):

```bash
npm run db:generate              # LOCAL → schema.sqlite.prisma
npm run db:push                  # LOCAL schema sync (no migration history)
npm run db:seed                  # idempotent, deterministic IDs, password samou1234
npm run db:studio
npm run db:deploy                # PRODUCTION → prisma migrate deploy on schema.prisma
npm run db:generate:prod / db:validate:prod
```

Android (Capacitor, `android/` at root, `appId com.samougo.customer`): `npm run cap:build --workspace @samou-go/web-customer`, then `cap:open`.

## Build-order gotchas

- **Build `@samou-go/ui` before typechecking or running any web app.** Its `exports` point at gitignored `dist/`. After editing `packages/ui`: `npm run build --workspace @samou-go/ui`.
- After editing `shared-types`: `npm run build` (the API's CJS resolution needs `dist/`; web apps get TS source through the `import` condition).
- After `npm install`, `@prisma/client` was last generated from the **production** schema — run `npm run db:generate` before `dev:api` so the client matches `dev.db`.

## Architecture

**Contract flows one way.** `shared-types` sits at the bottom of the graph and imports nothing from the API or a front-end. The API builds responses from its DTOs; `api-client` types its functions from the same DTOs, so a contract break surfaces at compile time.

**API layering** — `src/routes/index.ts` mounts one router per domain module (`auth`, `stores`, `orders`, `users`, `captains`, `admin`, `favorites`, `uploads`, `platform`), plus a public `GET /api/v1/meta` that serves the live tariff and status/role label vocabulary so no front-end hardcodes them. Each module is `*.routes.ts` (auth + `authorize(...)` + `asyncHandler`) → `*.controller.ts` (`parseWith(zodSchema, …)`, then `ok`/`created`) → `*.service.ts` (Prisma, business rules) → `*.mapper.ts` (Prisma row → DTO). `createApp()` in `src/app.ts` wires helmet/CORS/static uploads/`/health`, then `notFoundHandler` then `errorHandler` — order matters.

**Response envelope.** Every success goes out as `{ success: true, data }` via `ok`/`created` in `src/lib/respond.ts`; failures become the error envelope through `HttpError` + `errorHandler`. `api-client` unwraps the envelope and converts every failure — HTTP, network, timeout, malformed body — into an `ApiError` with a machine-readable `code` and a renderable Arabic message.

**Money.** Postgres `Decimal(10,2)`; convert at the API edge with `decimalToNumber()` (`src/lib/decimal.ts`) so DTOs carry plain `number`. **The client never sends money**: `POST /orders` carries only `storeId`, items and address, and the server prices the basket from DB rows.

**Order lifecycle** is data, not scattered `if`s: `ORDER_STATUS_SEQUENCE`, `ORDER_STATUS_TRANSITIONS`, `ORDER_STATUS_ACTORS`, `TERMINAL_ORDER_STATUSES` and `canTransitionOrderStatus()` in `packages/shared-types/src/enums.ts` are shared by server enforcement and client rendering.

**Realtime** — Socket.IO attached in `src/realtime.ts`, JWT-authenticated in the handshake, room per order (`order:<id>`); handlers (`order:join`, `captain:location`, `chat:send`) are split into `src/realtime-handlers.ts` and unit-tested there. Services emit through `emitOrderStatus` / `emitPlatformEvent`.

**Dual Prisma schemas.** `prisma/schema.prisma` is the production PostgreSQL schema (native `@db.*` types, `env("DATABASE_URL")`) — the only one CI validates and `migrate deploy` applies. `prisma/schema.sqlite.prisma` is the local-dev variant (`file:./dev.db`, native types stripped). Keep both in sync on any model change, and keep enums byte-for-byte identical to `packages/shared-types/src/enums.ts`. Prisma CLI config: `packages/api/prisma.config.ts`.

Because of the two providers, **never write `{ contains, mode: 'insensitive' }` inline** — use `caseInsensitiveContains()` from `src/lib/prisma.ts`, which drops `mode` on SQLite (inline usage fails the SQLite typecheck).

**Env separation is binding.** Local dev/test run on SQLite and never touch Neon/Postgres. `DATABASE_URL` is required only in production, injected as a deployment secret; the placeholder in `packages/api/.env` exists purely so Prisma's postinstall and prod-schema `validate`/`generate` succeed. `src/config/env.ts` validates everything with Zod at boot and refuses to start production without `DATABASE_URL`, with a placeholder `JWT_SECRET` (≥32 chars), or with `SMS_PROVIDER=console` (which logs OTP codes). `seed.ts` refuses to run under `NODE_ENV=production` and bumps `DailyOrderSequence` past its demo orders — keep that upsert in sync if you change them.

**Front-end shape.** `web-customer` is a consolidated SPA on React Router (`/stores/:storeId`, `/cart`, `/checkout`, `/orders/:orderId`, …) and maps the Android hardware back button to `navigate(-1)` in `App.tsx`. The other six have no router and pass state via URL params (`?storeId=`, `?orderId=`). Every `main.tsx` calls `bootstrapApp()` from `@samou-go/ui` (light-mode lock, Framer Motion skip in preview mode, broken-image fallback); web-customer passes `allowDarkMode: true` because it owns a theme toggle.

Adding an app: create `themes/<kebab>`, add it to root `workspaces`, add a root `dev:web-<kebab>` script, add its origin to `CORS_ORIGINS` in `packages/api/.env`, and register a `VERCEL_PROJECT_ID_WEB_<UPPER>` secret plus its entry in `.github/workflows/deploy.yml`.

## UI / style rules (binding)

- Tailwind v4 CSS-first: tokens are declared in `@theme` inside each app's `src/index.css`. There is **no `tailwind.config.js`**. `src/theme/tokens.ts` mirrors the palette for inline/SVG use.
- No raw hex in classNames (`bg-[#10B981]` forbidden) and no default Tailwind green (`bg-green-*`). Use semantic tokens: `bg-brand`, `text-ink-muted`, `border-line`, `badge-*`.
- RTL: logical properties only (`ps/pe/ms/me/start/end`), wrap numbers/codes/prices in `dir="ltr"` islands, flip directional icons with `rtl:rotate-180`.
- **Do not edit `src/settings/theme.ts`** in any theme — it holds generator placeholders (`%INJECTED_THEME%`, `%INJECTED_CONTAINER%`) and is identical across all 7 apps.
- Delivery-fee display goes through the theme's `src/lib/delivery.ts`, which is a pure re-export of `@samou-go/shared-types`. Change fee wording or tariff once, in shared-types; never hardcode `"رسوم التوصيل"`, `"Delivery Fee"`, `ILS`, `₪` or a pre-formatted `'3 ILS'`.

## TypeScript

`tsconfig.base.json` is strict with `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `composite`, NodeNext resolution. Zero tolerance for `as any` or `@ts-ignore` — fix the type, or narrow explicitly.

## CI / deploy

`.github/workflows/ci.yml` (push to master + PRs): install → build shared-types & ui → `prisma validate`/`generate` against the **production** schema → `npm run typecheck` → `npm run build` → `npm test` → API tests. Anything that only passes after a manual `ui` build will fail here.

`.github/workflows/deploy.yml` (push to master): builds shared packages and the API, asserts all required secrets exist, runs `prisma migrate deploy` against Neon, builds the 7 SPAs with `VITE_API_URL`, triggers a Render deploy for the API, then deploys each theme's `dist/` to its own Vercel project. The Vercel step `cd`s into `themes/$app` and passes a relative `dist` because each Vercel project's Root Directory is already `themes/$app` — passing the full path duplicates it.

# Samou' Go — Full-Repo Audit Report

> Date: 2026-08-09 · Scope: all workspaces (4 packages + 7 themes) · Node v24.18.0 / npm 11.16.0
> Operating standard: PASS requires explicit command execution evidence. No error suppression (`as any` / `@ts-ignore` / `skip`).

## 1. Final Status

| Phase | Area | Status |
|---|---|---|
| 1 | System discovery & architecture mapping | **PASS** |
| 2 | Baseline execution | **PASS** (1 failure found + fixed) |
| 3 | Dependency & workspace audit | **PASS** (dead dep removed; dev-only vulns remain) |
| 4 | TypeScript & strict type audit | **PASS** |
| 5 | Database & Prisma audit | **PASS** |
| 6 | Seed & environment sanitization | **PASS** (1 bug fixed) |
| 7 | API, auth & RBAC audit | **PASS** |
| 8 | Frontend workspaces | **PASS** |
| 9 | End-to-end workflows | **PASS** |
| 10 | Security & repo hygiene | **PASS** (partial — see REMAINING) |
| 11 | CI/CD & script remediation | **PASS** (workflow folder renamed + CI added) |
| 12 | Final verification & report | **PASS** |

## 2. Build Matrix

| Workspace | Typecheck | Build | Result |
|---|---|---|---|
| @samou-go/shared-types | ✅ | ✅ | PASS |
| @samou-go/api | ✅ | ✅ | PASS |
| @samou-go/api-client | ✅ | n/a (TS source) | PASS |
| @samou-go/ui | ✅ | ✅ | PASS |
| @samou-go/web-customer | ✅ | ✅ (vite 6.4.3) | PASS |
| @samou-go/web-store-details | ✅ | ✅ | PASS |
| @samou-go/web-checkout | ✅ | ✅ | PASS |
| @samou-go/web-order-tracking | ✅ | ✅ | PASS |
| @samou-go/web-store-manager | ✅ | ✅ | PASS |
| @samou-go/web-captain | ✅ | ✅ | PASS |
| @samou-go/web-admin | ✅ | ✅ | PASS |

Commands: `npm run typecheck`, `npm run build`, `npm run build:all` — all exit 0.

## 3. Test Suite Execution

| Suite | Command | Result |
|---|---|---|
| shared-types domain (Vitest) | `npm test` | **PASS** — 76/76 |
| API unit (Vitest) | `npm run test --workspace @samou-go/api` | **PASS** — 91/91 |
| E2E smoke (needs running API + seeded DB) | `npm run test:e2e` | **PASS** — 40/40 |
| Prisma validate (sqlite schema) | `npx prisma validate` | **PASS** |
| Prisma generate | `npm run db:generate` | **PASS** |
| Prisma db push → dev.db | `npm run db:push` | **PASS** |
| Seed (idempotent) | `npm run db:seed` | **PASS** (9 users, 3 stores, 8 cats, 20 products, 3 vouchers, 3 orders) |

## 4. Application Workspaces

| App | Path | Port | Notes |
|---|---|---|---|
| web-customer | themes/web-customer | 5173 | Consolidated SPA (React Router); Android back → `navigate(-1)` |
| web-store-details | themes/web-store-details | 5174 | URL param `?storeId=` |
| web-checkout | themes/web-checkout | 5175 | URL param `?storeId=` |
| web-order-tracking | themes/web-order-tracking | 5176 | URL param `?orderId=` |
| web-store-manager | themes/web-store-manager | 5177 | |
| web-captain | themes/web-captain | 5178 | |
| web-admin | themes/web-admin | 5179 | |

## 5. FIXED Log

| # | Problem | Root cause | Fix | Evidence |
|---|---|---|---|---|
| 1 | `prisma validate` failed (28 errors) | schema datasource switched to SQLite but kept Postgres native types (`@db.VarChar/Text/Decimal/Date`); `dev.db` was empty (0 bytes) | Stripped `@db.*` annotations so the schema validates under SQLite | `prisma validate` → "schema is valid 🚀" |
| 2 | API typecheck failed after regen (3 errors) | SQLite client drops Postgres-only `mode: 'insensitive'` string filter | Added `caseInsensitiveContains()` in `src/lib/prisma.ts` (provider-gated) and replaced inline `{ contains, mode }` in `auth.service.ts` + `stores.service.ts` | `npm run typecheck` exit 0 |
| 3 | `as any` in 2 test files (violates zero-tolerance rule) | hoisted fixtures initialized `order: null as any` | Reordered hoisted blocks so `buildOrder` precedes `state`; base uses `'PENDING'` literal (import-free at hoist time) | API tests 91/91 PASS |
| 4 | E2E `[4] money` FAIL — order creation returned `DUPLICATE_VALUE` (orderNumber) | seed created `SG-…-0001..0003` but never bumped `DailyOrderSequence`, so the first real order reused `…-0001` | Seed now upserts the daily sequence to the max seeded number after creating demo orders | E2E 40/40 PASS |
| 5 | Critical vulnerability (`ws` via socket.io chain) | unused root dep `@heyputer/puter.js` | Removed from `package.json` + lockfile | npm audit critical chain gone |
| 6 | CI completely dead | folder named `.github/workflowS` (GitHub only reads `workflows`); files empty | Renamed to `.github/workflows` (staged `git rm --cached` + re-add) and wrote a functional `ci.yml` (install → prisma validate → typecheck → build → tests) | `git status` shows R/A entries |

## 6. REMAINING PROBLEMS

| Severity | Item | Note |
|---|---|---|
| ~~critical~~ | ~~`vitest` 2.1.9 (dev-only)~~ | **RESOLVED 2026-08-13** — now `vitest@4.1.10`; `npm audit` clean. |
| ~~high~~ | ~~`vite`/`esbuild` inside `vite-node` (dev-only test tooling)~~ | **RESOLVED 2026-08-13** — via the vitest upgrade. |
| ~~moderate~~ | ~~`uuid`/`xcode`/`@capacitor/cli` (dev-only, Android packaging)~~ | **RESOLVED 2026-08-13** — root `@capacitor/cli` pinned to `8.4.2` (the advisory-fixed release; deduped against web-customer). `npm audit` → 0 vulnerabilities. |
| ~~low~~ | ~~`deploy.yml` empty~~ | **RESOLVED 2026-08-13** — full pipeline (build → secret guard → Vercel-link guard → migrate → Render API → 7× Vercel). |
| info | `packages/api/.env` holds only a non-secret local placeholder `DATABASE_URL` | Local dev/test runs on SQLite (`schema.sqlite.prisma` → `prisma/dev.db`); the placeholder exists so `npm install`'s Prisma postinstall and prod-schema `validate`/`generate` succeed — it is never used for a connection. The real Neon URL was removed. `.env` is gitignored. |
| ~~info~~ | ~~`package.json#prisma` config deprecated (Prisma 7)~~ | **RESOLVED 2026-08-13** — migrated to `packages/api/prisma.config.ts` (`import 'dotenv/config'` restores the .env loading Prisma does automatically only without a config file). Deprecation warning gone. |
| info | GitHub Actions CI not verified on GitHub | `.github/workflows/ci.yml` is structurally correct (public dummy `DATABASE_URL` only; zero `continue-on-error`/masking) but no actual runner result exists yet — CI status is **NOT VERIFIED** until a real GitHub Actions run passes. |
| info | Migration↔schema equivalence STATICALLY verified only | `prisma/migrations` (PostgreSQL) cross-checked against `schema.prisma` by inspection; no live/shadow PostgreSQL database was available, so `prisma migrate diff`/`migrate status` equivalence is not machine-verified. |

## 7. Env / secrets audit

- `.env.example` (api) mirrors all required vars with no real credentials. ✅
- No `.env` is tracked; only `*.env.example`. ✅
- No hardcoded secrets in source — only fake test secrets (`unit-test-secret-…`, `integration-test-secret-…`). ✅
- Seeded password `samou1234` is documented and is demo-only (seed refuses production use by contract). ✅
- **Dual-schema environment model (current):** local development/test → SQLite (`schema.sqlite.prisma`); production → PostgreSQL/Neon (`schema.prisma`). ✅
- `packages/api/.env` contains no real credentials — only a non-secret local placeholder `DATABASE_URL` plus non-secret dev config (`JWT_SECRET`, `CORS_ORIGINS`, delivery-fee overrides). The real Neon `DATABASE_URL` was removed. ✅
- The seed no longer prints `DATABASE_URL`; its banner now reads `local SQLite (prisma/dev.db)`. ✅
- Production `DATABASE_URL` is supplied externally as a deployment secret; `config/env.ts` refuses to boot production without it. ✅
- CI uses only a public dummy `DATABASE_URL` (`postgresql://…localhost:5432/dummy_db`); no real credential is reachable in CI. ⚠️ CI itself is **NOT VERIFIED** on GitHub (no runner result yet).

# REFACTOR_PLAN.md

Samou' Go monorepo — evidence-based refactoring and hygiene plan.
Produced from a READ-ONLY, repository-wide analysis. All findings below are anchored to
files and verified by static search before this plan was written. The plan implements only
behavior-preserving, low-risk changes; everything else is documented for a decision.

---

## 1. Executive summary

The repository is in genuinely good shape:

- Clean dependency direction everywhere: `web apps → api-client → API routes → services →
  Prisma`, with `shared-types` at the bottom and `@samou-go/ui` consumed from `dist`.
- Single source of truth honoured: delivery-fee rules (`shared-types/src/delivery.ts`),
  enums, DTOs; all 8 `delivery.ts` mirrors re-export the shared package; provider-gated
  `mode: 'insensitive'` only ever goes through `caseInsensitiveContains()`.
- The security/financial fixes from audit commit `037fb83` (S-1/S-2/S-3, F-1/F-2, C-1/C-2/C-3)
  are verified correct in the code. 199 tests pass (80 shared-types + 119 api). Typecheck
  passes across all 10 workspaces. No `as any` / `@ts-ignore` anywhere.
- No P0 correctness defect exists that this refactor may fix within the safety rules.

Two P0-class findings are **reported but NOT changed** here because fixing them violates the
task's hard constraints (no migration changes, no feature additions):

| P0 | Finding | Why we cannot fix it here |
|---|---|---|
| P0-1 | Production migration history (11 migrations) never creates `CaptainLocation`, `Rating`, `ChatMessage`, `SupportTicket`, `Wallet`, `LedgerEntry`, `Settlement` tables, nor enums `TicketStatus`, `SettlementMethod`, `LedgerEntryType`. `prisma migrate deploy` therefore produces a prod DB that fails at runtime on location/ratings/chat/tickets/wallet/settle routes, and `seed.ts` references those tables. | "DO NOT modify Prisma migrations." Needs a new migration + prod deploy step (ops + data work). |
| P0-2 | No wallet inflow path exists anywhere (`wallet.create`, `balance { increment }`, EARNING/COMMISSION ledger entries are all absent) — `settle` always 400s on a fresh DB. | A feature addition. Needs a business decision (when/where credits are earned). |

Implementation scope (all P1, behavior-preserving, verified by static evidence):

1. Git hygiene — untrack 5 stray artifacts, extend root `.gitignore`.
2. Finish the D-2 mojibake cleanup (4 remaining doc-comment spots).
3. Remove 2 dead exports (`unsupportedMediaType`, `isConfigured`).
4. Deduplicate `SUMMARY_INCLUDE` (orders ↔ admin).
5. Deduplicate the storeId-params schema (favorites ↔ stores).
6. Remove the dead `capacitor-secure-storage-plugin` dependency.
7. Delete the orphaned `scripts/verify-search-a11y.mjs`.
8. Drop the stale `VITE_FIREBASE_*` block from `web-customer/.env.example`.
9. Split `platform.routes.ts` into schemas/service/controller (matches the other modules).
10. Extract the three `realtime.ts` socket handlers into a testable unit.
11. Add the missing tests for the untested critical paths (F-1 settle atomicity, S-1/S-2 socket
    authorization + throttling, chat membership).

Everything else below is `P2`/`P3` (documented, not implemented) or report-only.

---

## 2. Architecture findings

### Verified good
- `packages/api-client` is consumed as TS source (`exports → ./src/index.ts`), browser-only,
  never imported by the API. ✓
- `packages/shared-types` sits at the bottom of the graph; nothing imports the API or a theme. ✓
- `@samou-go/ui` consumed from built `dist`; its `lib`/`components`/`map` sub-path exports used. ✓
- Module layering is consistent for orders/auth/stores/admin/users/captains/favorites:
  `*.routes.ts → *.controller.ts → *.service.ts → prisma`, with `*.schemas.ts` and `*.mapper.ts`.
- The `/api/v1/meta` inline handler in `routes/index.ts` is trivial and acceptable.

### Violations / gaps
- **`modules/platform/platform.routes.ts` is the single module with no layering**: it holds
  zod schemas, `prisma` calls, ownership checks and `decimalToNumber` conversion inline in
  route closures. It is also the **only module with zero test coverage**. → split (item 9).
- **`realtime.ts` embeds three business handlers (order:join, captain:location, chat:send) in
  socket wiring** — untested and untestable without a live socket. → extract (item 10).
- Admin/auth/stores controllers re-check roles already enforced by `authorize()` at the route
  (`requireAuth(req).role !== ADMIN → forbidden` in 13 places, 3 styles). This is deliberate
  defense-in-depth; **kept** (removing it would weaken a security posture, not clean it).
- No circular imports detected in the API package.

---

## 3. Duplication analysis

| Duplication | Locations | Verdict |
|---|---|---|
| `SUMMARY_INCLUDE` (same relation shape for order-summary rows) | `orders.service.ts:41-50` (exported), `admin.service.ts:14-23` (private copy) | **Extract** — admin already imports `toOrderSummary` from `../orders/orders.mapper`, so importing the include too is consistent. Verify no import cycle. |
| storeId params schema | `stores.schemas.ts:26-28` vs `favorites.schemas.ts:3-5` (identical) | **Extract** — favorites reuses `storeIdParamsSchema` from stores.schemas. |
| Order-party membership check `[customerId, captainId, store.managerId].includes(auth.sub)` | `platform.routes.ts:53,62`, `realtime.ts:75` | Report-only. Extraction is possible but touches 3 sites for marginal gain; kept to avoid churn. |
| Order-id param parsing: bare `z.string().min(1).parse(...)` | `platform.routes.ts:41,60` vs the `parseWith(paramsSchema)` chokepoint used by other modules | Fixed as part of the platform split (same 422 `VALIDATION_ERROR` envelope either way). |
| OTP check-and-consume flow (expiry → attempts → bcrypt → consume) | `otp.service.ts` `verifyOtp` (145-186), `adminVerifyStoreOtp` (209-273), `adminVerifyCaptainOtp` (276-334) | Report-only — the three functions differ in their provisioning tail; extracting risks subtle behavior change in a security-critical path. |
| `paginationSchema` defined in `stores.schemas.ts:3-6`, imported by `orders.schemas.ts` | cross-module import | Acceptable; moving it is cosmetic (P3, skipped). |
| `phoneSchema` | single definition in `auth.schemas.ts`, reused 11×; `stores.schemas.ts:64-67` deliberately lax (landlines) | **Intentional difference** — kept. |
| SSE polling (`orders.controller.ts`) vs Socket.IO push (`realtime.ts`) dual live-update paths | both live | **Intentional** (polling fallback + push channel). Kept and documented. |
| Theme `lib/delivery.ts` mirrors (8 files re-exporting shared-types) | all themes + ui | **Intentional (D-7)** — kept. |
| Theme `settings/theme.ts`, `settings/types.d.ts`, `theme/tokens.ts` (×7, byte-identical) | generator placeholders | **Intentional** — do not touch (`src/settings/theme.ts` is generator-owned). |
| `hooks/useApi.ts` shim (×3 themes: web-customer, web-store-details, web-admin) vs direct `@samou-go/api-client` imports (×4 themes) | all identical `export * from '@samou-go/api-client'` | P3 — resolving means ~25 import edits across themes or a generator change; skipped (churn). One 1-line inconsistency (web-admin `DarkModeToggle` direct import) noted, not changed. |

---

## 4. Dead code analysis

| Candidate | Location | Evidence | Action |
|---|---|---|---|
| `capacitor-secure-storage-plugin` dependency | `themes/web-customer/package.json:26` | Zero imports in any source file (grep of all ts/tsx/json); was only consumed by the `secureStorage` removed in D-5. | **Remove** (item 6) |
| `unsupportedMediaType` | `packages/api/src/lib/http-error.ts:73-75` | Definition only; zero importers (grep). | **Remove** (item 3) |
| `isConfigured` | `packages/api/src/lib/sms/types.ts:34-36` | Definition only; zero importers; same logic is inlined in `otp.service.ts:140`. | **Remove** (item 3) |
| `scripts/verify-search-a11y.mjs` (repo root) | tracked; no package.json script, no CI step, no doc reference; sibling one-off audit artifacts are gitignored (`browser-audit-final.mjs`, `.browser-audit-profile/`) | 8-point check (static/dynamic/scripts/build/tests/framework/deploy/docs) → no references. | **Delete** (item 7) |
| `useOrderEvent` hook | `packages/api-client/src/useApi.ts:342` | Defined; zero consumers since C-2 removed all theme usage. But the SSE endpoint it targets is a live API contract and the hook is public API. | **Report-only** — product decision: which theme should consume it, or remove both endpoint+hook together. |
| `env.databaseUrl` | `packages/api/src/config/env.ts:154` | Exported, never read in src (only test mocks set it). Part of the public env surface. | Report-only — keep. |
| `toCategory` / `toOrder` `export` keywords | `stores.mapper.ts:31`, `orders.mapper.ts:36` | Internal-only use. | P3, skipped. |
| `lastLocationWrite` Map | `realtime.ts:14` | Grows unbounded (existing WARNING, pre-audit). | Report-only (behavior change required). |
| `console.log` in src | `server.ts`, `seed.ts`, `sms/generic.ts` | All intentional (boot/shutdown/seed-progress/console SMS gateway). | Kept. |
| `useDarkMode`, `SignInGate`, `roles.ts` helpers, ui components | api-client / ui | All have live consumers. | Kept. |

No unused files, no unused imports, no commented-out code blocks were found in any of the 100
theme source files or in the API package (themes survey agent verified every import resolves).

---

## 5. Dependency findings

- `@types/leaflet` sits in `dependencies` (not `devDependencies`) of `web-customer` and
  `web-admin`. Type-only → should be dev. **P2, package.json-only, safe.** Not implemented
  (would need `npm install` lock churn alongside item 6; kept out to keep the lock diff small).
- Root `@capacitor/cli` + `web-customer` `@capacitor/cli` coexist because `cap:build` resolves
  `npx cap` from the workspace; both pinned 8.4.2. Consistent.
- `@emotion/is-prop-valid` at root is a runtime peer for `framer-motion`. Used. Kept.
- `morgan`, `helmet`, `express-rate-limit`, `zod`, `socket.io`, `sharp`, `bcryptjs` all used.
- No duplicate libraries, no obsolete packages (after item 6).
- `allowScripts` block pins install-script trust for Prisma/esbuild/protobuf. Fine.

---

## 6. API findings

- `platform.routes.ts` → split into `platform.schemas.ts`, `platform.service.ts`,
  `platform.controller.ts`, thin `platform.routes.ts`. Behavior preserved exactly
  (same HTTP verbs, middleware order, status codes, payload shapes; the two bare
  `z.string().min(1).parse(orderId)` become the same validation through a shared
  `orderIdParamsSchema` — the error envelope is byte-equivalent: 422 `VALIDATION_ERROR`).
- `realtime.ts` → handlers extracted to `realtime-handlers.ts` with a minimal
  `(io, socket, auth, payload)` signature; `attachRealtime` stays the wiring point.
  Socket middleware and room semantics unchanged.
- Everything else (asyncHandler everywhere, `ok/created/noContent` envelope, centralized
  Prisma→HTTP error mapping, `Retry-After`, SSE raw writes) is already consistent. The
  400-vs-422 state-violation helpers (`badState` vs `unprocessable` vs `badRequest`) are an
  API contract — **kept as-is**.

---

## 7. Frontend findings

- No dead components, hooks, or imports in the 7 themes (verified exhaustively).
- No hardcoded API URLs (`localhost:4000` / inline `/api/v1`) anywhere; all API access goes
  through `@samou-go/api-client`'s `API_URL`. C-1/C-2 fixes intact.
- `web-store-manager` "reports" tab is a mislabelled profile/settings tab, and two header
  buttons have no `onClick` (SamouGoStoreManager.tsx:405-411, SamouGoCaptain.tsx:569-571);
  `web-store-details` shows a hardcoded 4.8 rating + ETA. **Report-only (UI/product)**, not
  refactoring scope.
- `web-customer/.env.example` still documents `VITE_FIREBASE_*` phone auth that no code
  consumes (Firebase exists only as an API-side SMS provider). → remove the stale block (item 8).

---

## 8. Prisma findings

- Both schemas are logically identical (models, relations, indexes, enums byte-identical);
  only allowed provider differences (`@db.*` types stripped; `DailyOrderSequence.date`:
  `@db.Date` vs `DateTime @id`). **No schema changes planned.**
- Mojibake doc comments remain: `schema.prisma:200`, `:259`, `:339` and `auth.schemas.ts:83`
  (D-2 was only partially completed). → fix as comment-only edits (item 2). This does not
  change schema semantics — `prisma validate` still passes.
- P0-1 (missing migrations) and the `@db.Date` timezone nuance are report-only.
- SQLite/Postgres isolation intact; generated clients stay gitignored under
  `packages/api/generated/`.

---

## 9. Configuration findings

- **Root `.gitignore` gaps**: `.idea/`, `.vscode/` and the repo-root `.uploads/` are not
  ignored (only `packages/api/.uploads/` is), which is why 5 artifacts got tracked:
  `.idea/workspace.xml`, `.vscode/launch.json`, and
  `.uploads/final/product/p-shawarma-chicken/2ea5bee6-…/{lg,md,sm}.webp`.
  → `git rm --cached` + add ignores (item 1).
- `android/app/google-services.json` is tracked and contains a client-side Firebase API key.
  This is standard for a Capacitor/Firebase Android app (`build.gradle` reads it) and Firebase
  API keys are client-shipped by design — **kept**, INFO only.
- `deploy.yml` requires committed `themes/*/.vercel/project.json`, but every theme's
  `.gitignore` ignores `.vercel/` → that workflow step fails on a fresh clone. **Report-only**
  (ops decision; either force-add the links or drop the check).
- Per-theme `vercel.json` differ **intentionally** (`web-customer` needs SPA rewrites for
  React Router; the other 6 are single-screen). Root `vercel.json` (web-customer only) is
  legacy but harmless. Kept.
- `tsconfig.test.json` (api, shared-types) is referenced by each `vitest.config.ts`
  (`typecheck.tsconfig`) — used, kept.
- No real secrets in tracked files (`JWT_SECRET` is a documented placeholder).

---

## 10. Test findings

- 199 tests pass; all API tests mock Prisma (no live DB). Root `npm test` runs only
  shared-types; the API suite runs via `npm run test --workspace @samou-go/api`.
- **Coverage gaps** (no tests at all): `platform` module (all routes incl. F-1 settle),
  `realtime` (S-1 order:join, S-2 captain:location validation/throttle/room-guard, chat
  membership), SSE handler (S-3), and the C-fixes.
- The `orders.concurrency.test.ts` pattern (mocked prisma + `$transaction` fake) is the
  template for the new settle test; `security.integration.test.ts` is the template for
  boot-time HTTP coverage.
- → add `platform.service.test.ts` (settle atomicity + errors) and
  `realtime-handlers.test.ts` (S-1/S-2/chat) (item 11). No existing tests are removed,
  duplicated, or weakened.

---

## 11. Documentation findings

- `AGENTS.md` cites `DESIGN_SYSTEM.md` as binding, but the file lives in
  `To_Do_old_versions/`. **Report-only** (the file is a deliberate historical archive).
- `packages/api/README.md` exists; verify it stays accurate after the platform split (no
  endpoint changes, so no doc churn expected).
- Mojibake (item 2) and the stale `VITE_FIREBASE_*` block (item 8) are the only doc defects
  that are factually wrong vs the implementation and are in scope.

---

## 12. Files recommended for deletion

| File | Priority | Reason |
|---|---|---|
| `scripts/verify-search-a11y.mjs` | P1 | Orphaned one-off audit script; no references anywhere; siblings already gitignored. |
| (untracked, not deleted) `.idea/workspace.xml`, `.vscode/launch.json`, root `.uploads/*.webp` | P1 | Removed from index + ignored; files stay on disk. |

## 13. Files recommended for merging

- None (the favorites/stores schema dedup reuses the exported schema instead of merging files).

## 14. Files recommended for splitting

| File | Split into |
|---|---|
| `packages/api/src/modules/platform/platform.routes.ts` | `platform.schemas.ts`, `platform.service.ts`, `platform.controller.ts`, `platform.routes.ts` |
| `packages/api/src/realtime.ts` | `realtime.ts` (wiring) + `realtime-handlers.ts` (testable handlers) |

## 15. Recommended abstractions

- `platform.service.ts` — mirrors the established orders/auth module pattern (no new pattern).
- `realtime-handlers.ts` — pure, socket-agnostic handler functions (no framework).
- No god-utils, no repositories/ports/adapters, no new dependencies.

---

## 16. Risk level per change

| # | Change | Risk | Rationale |
|---|---|---|---|
| 1 | Git hygiene (untrack + ignore) | Very low | No code impact; files stay on disk. |
| 2 | Mojibake doc-comment fixes | Very low | Comments only; `prisma validate` re-run. |
| 3 | Remove 2 dead exports | Very low | Zero importers (grep-verified); typecheck re-run. |
| 4 | `SUMMARY_INCLUDE` dedup | Low | Identical shapes; verify no import cycle. |
| 5 | storeId params schema dedup | Very low | Identical shapes; favorites already imports other stores schemas. |
| 6 | Remove dead dependency | Low | Lockfile sync via `npm install`; full build re-run. |
| 7 | Delete orphan script | Very low | No references. |
| 8 | `web-customer/.env.example` cleanup | Very low | Doc file; no code reads those vars. |
| 9 | Platform module split | Medium | Mechanical extraction; covered by new settle test + full test suite + typecheck. |
| 10 | Realtime handler extraction | Medium | Mechanical; covered by new handler tests + typecheck. |
| 11 | New tests (settle, realtime) | Very low | Additive; no production code touched by the tests themselves. |

## 17. Dependencies between changes

- 9 depends on nothing (self-contained); 10 self-contained.
- 11 requires 9 and 10 to be complete first (tests target the extracted units).
- 6 touches the npm lockfile → do it after 3-5 so the workspace is already stable, and run the
  full verification gate once afterwards.
- 1, 2, 3, 4, 5, 7, 8 are independent.

## 18. Verification required

After every change group: `npm run typecheck`.
After code changes: `npm run test --workspace @samou-go/api` and `npm test`.
After 2: `npm run db:validate` and `npm run db:validate:prod` (schema still valid).
After 9-10: the new tests + the full api suite.
Final gate (mandatory before reporting done):
`db:validate`, `db:validate:prod`, `db:generate`, `db:generate:prod`, `typecheck`, `build`,
`npm test`, `npm run test --workspace @samou-go/api`, `git diff` inspection.
`test:e2e` requires a running API + seeded DB → reported as `NOT VERIFIED` unless it can run.

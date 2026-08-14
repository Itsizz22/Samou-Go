# REFACTORING_REPORT.md

Samou' Go monorepo — implementation report for `REFACTOR_PLAN.md`.

**Baseline:** commit `037fb83` (clean working tree). **No commits were made.**
**Scope:** the 11 planned P1 items, all behavior-preserving. Everything else in the plan
was documented for decision and deliberately left untouched.

---

## 1. What was done (all 11 items, verified)

| # | Change | Files | Status |
|---|---|---|---|
| 1 | Untracked 5 stray artifacts (3 legacy `.uploads/*.webp`, `.idea/workspace.xml`, `.vscode/launch.json`) and added `/.uploads/`, `/.idea/`, `/.vscode/` to the root `.gitignore` | `.gitignore` + index | ✅ |
| 2 | Finished the D-2 mojibake cleanup (4 remaining corrupted doc comments) | `prisma/schema.prisma` (×3), `modules/auth/auth.schemas.ts` | ✅ |
| 3 | Removed 2 dead exports with zero importers | `lib/http-error.ts` (`unsupportedMediaType`), `lib/sms/types.ts` (`isConfigured`) | ✅ |
| 4 | Deduplicated `SUMMARY_INCLUDE` (admin now imports the orders.service export; identical shape, no import cycle) | `modules/admin/admin.service.ts` | ✅ |
| 5 | Deduplicated the storeId-params schema (favorites now uses `storeIdParamsSchema` from stores.schemas; the one-schema `favorites.schemas.ts` deleted) | `modules/favorites/favorites.controller.ts`, `favorites.schemas.ts` (deleted) | ✅ |
| 6 | Removed the dead `capacitor-secure-storage-plugin` dependency (zero imports since D-5) + `npm install` lockfile sync | `themes/web-customer/package.json`, `package-lock.json` | ✅ |
| 7 | Deleted the orphaned `scripts/verify-search-a11y.mjs` (no package.json/CI/doc references; sibling audit artifacts are already gitignored) | `scripts/verify-search-a11y.mjs` (deleted) | ✅ |
| 8 | Dropped the stale `VITE_FIREBASE_*` block from `web-customer/.env.example` (no theme code reads those vars) | `themes/web-customer/.env.example` | ✅ |
| 9 | Split `platform.routes.ts` into `platform.schemas.ts` / `platform.service.ts` / `platform.controller.ts` / thin `platform.routes.ts`, matching the orders/auth module pattern. The atomic settle moved into `claimSettlement()` inside `$transaction`; parse-ordering preserved exactly (wallet-lookup before body validation); bare `z.parse` consolidated onto `parseWith` (byte-identical 422 `VALIDATION_ERROR`) | `modules/platform/*` | ✅ |
| 10 | Extracted the three socket handlers from `realtime.ts` into `realtime-handlers.ts` with a testable `(io, socket, auth, payload)` signature; `attachRealtime` still owns middleware + wiring | `realtime.ts`, `realtime-handlers.ts` | ✅ |
| 11 | Added 26 tests covering the previously untested critical paths | `modules/platform/platform.service.test.ts`, `realtime-handlers.test.ts` | ✅ |

### What the new tests prove
- **F-1 settle atomicity:** guarded `updateMany` decrement; insufficient balance → 400 with no
  partial writes; two concurrent settlements of one wallet → exactly one wins; ledger entry
  written with `SETTLEMENT` type and negated amount; missing wallet → 404; invalid body → 422.
- **S-1 order:join:** non-string ids ignored; authorized callers join `order:<id>`; unauthorized
  and missing orders never join.
- **S-2 captain:location:** non-captains, out-of-range/malformed coords and bad headings are
  dropped; the write is throttled to one per 5 s per captain; broadcast happens only for the
  order actually assigned to the sender.
- **chat:send:** malformed payloads dropped; non-party members never persist/broadcast;
  customer/captain/manager/admin all allowed; message trimmed before persist.

## 2. Regression check — audit fixes at `037fb83` (S-1 … D-6)

The refactor touched the files implementing S-1/S-2/F-1, so those were re-verified by
test and by diff (logic extracted verbatim).

| Fix | Area | Status |
|---|---|---|
| S-1 | `order:join` room gating | ✅ PASS — logic preserved; now covered by `realtime-handlers.test.ts` |
| S-2 | `captain:location` validation/throttle/assigned-order broadcast | ✅ PASS — logic preserved; now covered by tests |
| S-3 | SSE auth gating (`orders.controller.ts`) | ✅ PASS — untouched |
| F-1 | Atomic wallet settle | ✅ PASS — logic preserved; now covered by `platform.service.test.ts` |
| F-2 | Wallet money converted via `decimalToNumber` (DTO plain numbers) | ✅ PASS — preserved in service/controller |
| C-1 | No hardcoded API URLs in themes | ✅ PASS — untouched |
| C-2 | SSE/messaging never used as an auth channel | ✅ PASS — untouched |
| C-3 | Import-source consistency (api-client) | ✅ PASS — untouched |
| D-1 | No checked-in secrets in code | ✅ PASS — only `.env.example` placeholders remain |
| D-2 | Mojibake cleanup | ✅ **COMPLETED NOW** (was partial at `037fb83`) |
| D-3 | `@types/leaflet` → devDependencies | ⏸ NOT DONE — P2, deliberately skipped to keep the lockfile diff small |
| D-4 | Root `vercel.json` stale | ⏸ NOT DONE — INFO only, harmless |
| D-5 | `secureStorage` removal | ✅ PASS — already applied at baseline; its leftover dependency removed here (item 6) |
| D-6 | `db:generate` after install (AGENTS.md guidance) | ✅ PASS — verified `db:generate`/`db:generate:prod` both succeed |

## 3. Verified-not-changed / deferred findings (from REFACTOR_PLAN.md)

All documented in the plan and intentionally left for a human decision:

- **P0-1 (report-only):** production migration history never creates 6 tables / 3 enums —
  `prisma migrate deploy` produces a broken prod DB. Not fixable here (no migration changes).
- **P0-2 (report-only):** no wallet-credit path exists — `settle` 400s on a fresh DB until a
  crediting feature (earning/commission) is added. Feature decision.
- Report-only: `useOrderEvent` hook (public API, pairs with live SSE endpoint); OTP
  check-and-consume triplication; `platform`/`realtime` party-membership duplication;
  `web-store-manager` mislabelled reports tab + dead `onClick`; `web-store-details`
  hardcoded 4.8 rating/ETA; `deploy.yml` expecting committed `.vercel/project.json` while
  theme `.gitignore`s ignore `.vercel/`; `google-services.json` tracked (INFO, standard for
  Capacitor); `env.databaseUrl` exported but unused; `lastLocationWrite` Map unbounded growth.

## 4. Verification gate — results

| Check | Command | Result |
|---|---|---|
| SQLite schema valid | `npm run db:validate` | ✅ valid |
| Postgres schema valid | `npm run db:validate:prod` | ✅ valid |
| SQLite client generated | `npm run db:generate` | ✅ |
| Postgres client generated | `npm run db:generate:prod` | ✅ |
| Full typecheck (10 workspaces) | `npm run typecheck` | ✅ 0 errors |
| shared-types build+tests | `npm test` | ✅ 80/80 |
| API unit/integration tests | `npm run test --workspace @samou-go/api` | ✅ 145/145 (was 119; +26 new) |
| Full build | `npm run build:all` | ✅ all 7 themes + packages |
| Git diff review | `git status --short` / `git diff` | ✅ matches plan exactly |
| E2E | `npm run test:e2e` | ❔ **NOT VERIFIED** — requires a running API + seeded DB (`localhost:4000` hardcoded); not runnable in this environment |

## 5. Git status (exactly what changed; nothing committed)

```
M  .gitignore                                              # + /.uploads/, /.idea/, /.vscode/
D  .idea/workspace.xml                                     # untracked (file stays on disk)
D  .uploads/final/product/…/{lg,md,sm}.webp                # untracked (files stay on disk)
D  .vscode/launch.json                                     # untracked (file stays on disk)
M  package-lock.json                                       # plugin removed (1 package)
M  packages/api/prisma/schema.prisma                       # mojibake comments only
M  packages/api/src/lib/http-error.ts                      # dead export removed
M  packages/api/src/lib/sms/types.ts                       # dead export removed
M  packages/api/src/modules/admin/admin.service.ts         # SUMMARY_INCLUDE dedup
M  packages/api/src/modules/auth/auth.schemas.ts           # mojibake comment only
M  packages/api/src/modules/favorites/favorites.controller.ts # schema dedup
D  packages/api/src/modules/favorites/favorites.schemas.ts # merged into stores.schemas
M  packages/api/src/modules/platform/platform.routes.ts    # split (thin wiring)
A  packages/api/src/modules/platform/platform.schemas.ts   # new
A  packages/api/src/modules/platform/platform.service.ts   # new
A  packages/api/src/modules/platform/platform.controller.ts # new
A  packages/api/src/modules/platform/platform.service.test.ts # new
M  packages/api/src/realtime.ts                            # handlers extracted
A  packages/api/src/realtime-handlers.ts                   # new
A  packages/api/src/realtime-handlers.test.ts              # new
D  scripts/verify-search-a11y.mjs                           # orphan deleted
M  themes/web-customer/.env.example                        # stale Firebase block removed
M  themes/web-customer/package.json                        # dead dep removed
A  REFACTOR_PLAN.md                                        # planning document
A  REFACTORING_REPORT.md                                   # this document
```

No `.env`, no credentials, no migration files, no generated output were added or changed.
The 5 untracked artifacts remain on disk — only their git tracking was removed.

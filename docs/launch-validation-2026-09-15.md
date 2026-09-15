# Launch validation — 2026-09-15

Historical working record; baseline entries below describe the system BEFORE this work. See mapbox-migration-2026-09-15.md and the final readiness report for current status. NOT a declaration of completion. Evidence statuses: PASS, FAIL, PARTIAL, NOT TESTED, BLOCKED.

## Architecture and safety
- Customer: themes/web-customer (React SPA, Capacitor Android/iOS wrapper).
- Staff: merged customer role routes plus separate web-captain, web-store-manager and web-admin deployments.
- Shared: shared-types (state/pricing), api-client (HTTP/hooks), ui.
- Backend: packages/api, Express/Prisma, PostgreSQL production; isolated SQLite unit/integration fixtures.
- Native push: Firebase Admin -> FCM/APNs; device tokens, notification audit, native tap handling.
- Web push: FAIL at baseline: native-only registration; service worker has no push/click handlers.
- GPS: PARTIAL at baseline: browser watchPosition; explicitly stops when document.hidden; no native background location service found.
- Dispatch: automatic-dispatch.ts, captain-pool.ts, server order guards.
- Deployment: existing GitHub Actions -> Render/Vercel. No deployment performed in this validation yet.
- Backups: manual artifacts/launch-backup.cjs and restore scripts; no scheduled backup workflow found.
- Production-sensitive: orders, store/catalogue/customer/captain records, pricing/state transitions, device tokens, notification sends, live GPS, database migrations, stored media.
- Safety: no reset/seed/bulk delete/production load tests. Existing untracked outputs retained.
- Physical devices: BLOCKED pending availability; adb devices returned no attached devices on this run.
- OTP real delivery: user confirms working; independent handset retest NOT TESTED.

## Working validation checklist
| Area | Status | Evidence / next gate |
|---|---|---|
| Push recipients/provider/token lifecycle | NOT TESTED | Execute baseline and focused regression tests |
| Push foreground/background/terminated/locked/restarted/offline/reconnect | BLOCKED | Real Android/iPhone required; no device connected |
| Web Push permission/subscription/click | FAIL | Missing implementation at baseline |
| Native Android background GPS | FAIL | Only browser watcher; stops hidden |
| iPhone GPS, native vs PWA | NOT TESTED | Native service absent; real device required |
| GPS auth/freshness/rate/privacy | NOT TESTED | Inspect API and execute regressions |
| E2E A delivery / B pickup / C cancellation | NOT TESTED | Dedicated controlled accounts required for deployed flow |
| E2E D substitutions / E multi-store / F reconnect / G edge cases | NOT TESTED | Isolated tests then controlled deployed acceptance |
| Monitoring: errors/latency/providers/dispatch/business/infrastructure | NOT TESTED | Inventory existing telemetry and alert destinations |
| Scheduled encrypted off-device backups and restore | PARTIAL | Historical manual restore; automated schedule not found |
| PostgreSQL dispatch races at 10/25/50 orders | NOT TESTED | Local PostgreSQL binaries available; isolate database |
| PWA manifest/cache/update/privacy | PARTIAL | Service worker exists; inspect invalidation and cache scope |
| iPhone Safari/Home Screen installation/RTL/keyboard/push | BLOCKED | Physical iPhone acceptance required |
| Security: token/SSE/GPS/order/upload | NOT TESTED | Targeted review and tests |
| Build/typecheck/regression | NOT TESTED | Baseline API tests running |
| Deploy and post-deploy smoke | NOT TESTED | Only after validated fixes |

Final acceptance report will use the ten requested sections. No real device state may be marked PASS from mocked tests or provider acceptance.

## Backup destination change (2026-09-15)

User requested replacing Firebase Storage with Vercel after Google confirmed no active billing account. Firebase Cloud Messaging remains in place.

- Implemented `scripts/operations/backup-vercel.cjs`: PostgreSQL custom dump, private Blob upload, authenticated readback and SHA-256 comparison, private latest-success marker. Logs exclude credentials and database contents.
- Added four synthetic tests: correct readback, corrupt readback, public URL rejection and missing readback; all pass. These are not proof of a live upload.
- Daily 02:17 UTC GitHub Actions workflow prepared, guarded by `BACKUP_ENABLED=true`. Requires repository secret `BACKUP_BLOB_READ_WRITE_TOKEN`, existing `DATABASE_URL`, and a dedicated private Vercel Blob store. Never expose the token as `VITE_*` or give browser code access to the backup store.
- Vercel login completed and dedicated private store `samou-go-private-backups` created successfully in IAD1 (store_KHUQWj4MNBJh5KaJ). Dashboard shows Private, 0 B used and 1 GB included. No upload completed; workflow not deployed or enabled. Awaiting authorization to put the store token in repository Actions Secrets.
- Retention deletion remains disabled; agree retention and check account storage limits before enabling the daily schedule.
- Separate completed local restore: 39 tables, 29 users, 13 stores, 6 orders, 639 products. Off-device restore drill remains pending.

### Vercel live result

User explicitly authorized storing the dedicated Blob token in repository Actions Secrets. Secret added without printing it; `BACKUP_ENABLED=true` saved. Backup code deployed in commit 3ebd63c. First run 34998460198 succeeded in 59 seconds: private 79,291,011-byte upload, matching authenticated SHA-256 readback, isolated restoration of 39 tables. Daily 02:17 UTC schedule active; retention is seven newest snapshots after successful restore (1 retained, 0 removed on first run). This supersedes the earlier pending-login/configuration statements. Remaining launch-hardening changes are still local and are not part of that backup commit.

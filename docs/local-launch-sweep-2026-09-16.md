# Local launch readiness sweep — 2026-09-16

## Executive decision

**CONTROLLED PILOT READY, restricted to supervised trials with verified store locations. Not LOCAL PUBLIC LAUNCH READY.** This is a code/automated-test and read-only production audit, not a claim that every device flow has been physically exercised. No provider replacement, redesign, speculative features or destructive production operations were performed.

Baseline: `2ab68c3` on `master`. GitHub CI 35098704510 and deployment 35098704396 succeeded. Production `/health` and `/ready` returned 200; customer home and catalogue rendered, including Mapbox markers. Current fixes and final deployment evidence are recorded below.

## Confirmed defects and minimal repairs

1. **Account switching push privacy — FAIL before / automated PASS after.** A saved-account switch previously changed credentials before the server moved the FCM binding. If new-account registration failed, the old live session retained the device. A real isolated HTTP regression reproduced the retained registration. Explicit account activation now rotates the destination session and suspends/deletes registrations for the previous session's rotation lineage transactionally. A `pushEnabled` field is added to both Prisma schemas and by an additive migration. Ordinary refresh preserves suspension; delayed registration cannot restore it. The other device remains active. Client keeps the existing identity if the activation request fails. Login/OTP while already signed in use the same activation boundary. Saved sign-ins remain reusable. Previously queued FCM messages cannot be recalled.
2. **Legacy GPS read/write mode gates — fixed.** `/platform/orders/:id/location` previously ignored the global capture toggle and did not explicitly exclude pickup or rejected orders; GPS upload did not explicitly exclude pickup. Both now enforce those gates. Existing ownership checks remain. Integration coverage includes capture-off, pickup read and pickup upload rejection.
3. **Malformed/future tracking samples — FAIL before / PASS after.** Invalid legacy coordinates could reach map consumers, and future timestamps were labelled live. Tracking filters invalid points and treats future samples as stale, without route or distance estimates. No coordinates were altered in production.
4. **PostgreSQL validation gap — FAIL before / PASS after.** The opt-in concurrent registration test omitted the now-required refresh credential. Fixed the fixture, changed load sizes to 5/10/20/30, added a real registration-versus-account-activation race. CI now runs this suite against an isolated PostgreSQL 18 service, plus previously omitted client/customer tests. This is test coverage of existing behavior, not a new dispatch policy.

## Scope and evidence matrix

PASS below means the specified automated/read-only check passed. PARTIAL means device/operator work remains. NOT TESTED is not a pass.

| Area | Status | Current evidence and limit |
| --- | --- | --- |
| Customer auth, OTP, session restore, offline errors | PARTIAL | API/client tests cover validation, refresh, concurrent refresh, rejected sessions and transport failures; real OTP delivery and device restart remain field checks |
| Customer home/search/store catalogue/options/cart/checkout | PARTIAL | Production home/catalogue load; domain/API/client/customer tests cover server pricing, notes/options, multi-store totals and submission replay; mobile keyboard and full handset purchase journey remain |
| Customer tracking/chat/reorder/ratings/support/substitution | PARTIAL | Existing lifecycle/party authorization and platform tests pass; no unsolicited production messages/orders were created |
| Store lifecycle/menu/hours/ownership | PARTIAL | Real isolated lifecycle tests, category/options/availability/scheduling and role checks pass; staff device acceptance remains |
| Customer pickup | PARTIAL | Store completes READY_FOR_PICKUP directly to DELIVERED, fee zero, no captain/dispatch/handoff/ON_THE_WAY, exactly-once history and settlement regression passes; latest physical order ID not supplied |
| Standard delivery | PARTIAL | Protected handoff, assignment, status and settlement tests pass; current three-person physical delivery pending |
| Captain capacity/dispatch | PASS automated | PostgreSQL local concurrent assignment and race tests pass; <=3 active, exclusive order owner, pressure/proximity/dedicated/blocked fleet tests pass |
| Firebase recipient/session privacy | PARTIAL | Session ownership, suspension, late registration, rotation, logout and multi-device tests pass. User explicitly confirmed handset availability and logout stops store notifications; no device/version/order/timestamp supplied. New switch repair still needs handset retest |
| Mapbox/OSRM | PARTIAL | Mapbox markers rendered in production; router tests cover geometry, invalid responses, timeouts and no invented ETA. Tracking stage switches store to customer. No authenticated production road-route/device movement was claimed |
| Customer location snapshot | PASS automated | Order A retains A after editing customer profile to B; invalid coordinates rejected; explicit pin/save workflow inspected |
| Store location coverage | FAIL operational | Public catalogue has 12 stores; only 2 have coordinates. Ten missing coordinates are listed below. Editor supports explicit pin/GPS/save and does not save a default center |
| GPS | PARTIAL | Permission/stale samples/rate guards/active assigned order and native lifecycle logic inspected/tests pass; locked-screen physical movement remains |
| PWA | PARTIAL | Manifest/service-worker tests pass; API/auth requests excluded from cache, protected refetch on taps, same worker handles FCM. iPhone Home Screen receipt/tap/offline/keyboard still field checks |
| iOS/TestFlight | PARTIAL | Root Codemagic YAML schema, target/bundle/team/plist checks and 9 release tests pass. No signed cloud IPA or real iPhone runtime proof |
| Android | PARTIAL | Clean current frontend/Capacitor Android sync and Gradle assembleDebug pass; first-frame video and background GPS need handset observation |
| Database consistency | PASS automated | Both schemas updated; server pricing, immutable snapshot, idempotency, lifecycle history and ledger guards covered in isolated suites; no live records rewritten |
| Security | PASS scoped tests | Role/ownership, CORS, uploads, SSE, session isolation tests and repository guard pass; npm audit reports zero known vulnerabilities. Not a penetration-test certification |
| Monitoring | PARTIAL | `/health`, `/ready`, scheduled health run 35094198932 pass. Existing diagnostic failure counters and admin gates inspected. GitHub schedule can be delayed; it is not a guaranteed 15-minute SLA. Operator alert receipt/acknowledgement still needs confirmation |
| Backups | PASS latest run / PARTIAL operational | Scheduled run 35069692861 succeeded, including private upload and isolated restore. Seven-copy retention only after verified restore remains; restore docs and 4 safety tests pass. Operator failure-alert acknowledgement remains |
| Performance | PARTIAL | Foreground polling, SSE abort/reader cleanup, bounded OSRM cache/timeout, GPS throttling and lazy Mapbox loading inspected. Mapbox chunk is ~1.86 MB / ~522 KB gzip; existing Vite chunk warning remains. No hypothetical scale rewrite |
| UX consistency/error handling | PARTIAL | RTL/mobile components and pending/retry paths inspected, production public navigation checked; comprehensive small-phone visual/keyboard inspection remains |
| Older reports | OBSOLETE where superseded | Earlier green suites skipped PostgreSQL cases and did not cover failed FCM synchronization during saved-account switching. Earlier public-launch assumptions are not accepted |

## Missing store locations

Public catalogue read only; no locations guessed or overwritten:

- اللوتس للعطور
- ايكون موبايل
- بلاتينيوم للاتصالات
- سوبر ماركت ابوعزت
- كافي تايم
- كافي خيال
- مشاوريا وعرايس ابو صلاح
- مطعم العائلة
- مطعم وشاورما ابو لحية
- مطعم يافا

An operator/store owner must set and explicitly save the actual entrance, then preview it. Public maps intentionally omit these stores' markers until coordinates exist. Restrict route-dependent trials to verified stores.

## Automated results

- API: 485 passed; 7 PostgreSQL tests are skipped in the ordinary suite and run separately with all 7 passing.
- Shared domain: 123 passed.
- API-client: 44 passed.
- Customer: 31 passed.
- Backup safety: 4 passed.
- iOS release guards: 9 passed; source resources/configuration checks pass.
- Whole-workspace TypeScript and all seven frontend builds: pass (final build log retained locally).
- Android `assembleDebug`: pass; device installation/runtime is not implied.
- Codemagic official schema validation: pass.
- Repository security guard / npm audit: pass / zero known vulnerabilities.
- Integration: real temporary SQLite database plus HTTP lifecycle suite; PostgreSQL tests use only `127.0.0.1:55439/samou_validation` and new validation schemas. Legacy standalone `test:e2e` seed harness was not run against an unknown developer database; its current-flow coverage comes from the isolated HTTP suite.

PostgreSQL observed sample (timings are local, not production SLA):

| Simultaneous attempts | Captains | Assigned | Policy conflicts/rejections | Maximum active | Duplicate ownership |
| --- | --- | --- | --- | --- | --- |
| 5 | 2 | 5 | 0 | 3 | 0 |
| 10 | 4 | 9 | 1 | 3 | 0 |
| 20 | 7 | 14 | 6 | 2 | 0 |
| 30 | 10 | 23 | 7 | 3 | 0 |

A concurrent attempt can be rejected by existing pressure/assignment policy and needs a normal retry; the test does not claim all orders immediately assigned or physical driver acceptance. Separate same-order race and late-device-registration race pass.

## Deployment and rollout

Additive migration `20260916140000_session_push_activation` must run before the new API. Existing GitHub production workflow performs migrations before Render and frontend deployment. No reset, seed, bulk token deletion, password change, order deletion or coordinate overwrite was used. New account-switch protection requires the updated frontend/APK; old installed APKs do not acquire new JavaScript automatically. Signed iOS distribution remains separate through Codemagic.

Final workflow IDs and smoke outcomes will be appended after deployment verification. Download/install the newly built Android pilot package for field retests rather than relying on an old APK.

## Remaining blockers / recommendation

Continue supervised pilot only. Before local public launch: fill actual store locations; retest new account switching, offline failure and multi-device isolation; record pickup completion and a standard delivery; verify lock-screen GPS and notification taps on the target devices; acknowledge a safe operational alert. Complete separate TestFlight signing/device gates before advertising native iOS readiness. Use the adjacent field matrix, with real order IDs and timestamps. Do not turn a code/test pass into a claimed physical pass.

Evidence links: [baseline CI](https://github.com/Itsizz22/Samou-Go/actions/runs/35098704510), [baseline deployment](https://github.com/Itsizz22/Samou-Go/actions/runs/35098704396), [latest inspected backup](https://github.com/Itsizz22/Samou-Go/actions/runs/35069692861), [latest inspected health](https://github.com/Itsizz22/Samou-Go/actions/runs/35094198932).

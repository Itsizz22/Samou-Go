# Controlled pilot operations

## Access and account gate
Production admin read verified an active verified CUSTOMER pilot account, an active verified CAPTAIN currently unavailable, and an active verified STORE_MANAGER with successful previous login. Previous customer/captain 401 is invalid credentials, not a deactivated account (which returns 403 after password verification). Use POST /api/v1/auth/login with canonical 05xxxxxxxx. Do not retry guesses or reset passwords.

Admin can inspect GET /api/v1/admin/pilot/accounts?phone=05xxxxxxxx. It returns existence, role, activation/approval, availability, owned stores and bcrypt-format state; never the hash or password. A configured bcrypt hash does not prove any supplied password is correct. Operator must sign in with the correct credentials; captain turns availability on at the coordinated trial time. Do not auto-enable a real driver.

If needed, create dedicated consenting pilot users through existing flows only: customer registers with owned phone and OTP; admin creates approved captain with an operator-provided phone/password using existing captain management. Reuse a consenting store and verify manager ownership. No fixtures/seed/reset in production, no invented phone numbers.

## Order diagnostics
Admin dashboard → notification log → تشخيص طلب التجربة. Enter the real order id and refresh manually. Authenticated endpoint: GET /api/v1/admin/pilot/orders/:orderId. Never paste bearer tokens into screenshots, tickets or URLs. Response is no-store and inaccessible to customer/captain/store roles.

It combines allowlisted order ids/status/timestamps and immutable destination; current offer/expiry; active captain capacity; authorized tracking and route result; last 50 notification attempts/device-platform counts; and bounded recent GPS/dispatch metadata. No delivery PIN, handoff code, password, OTP, device token, message body or GPS history is exposed. Exact latest coordinates/route are returned only for authorized admin debugging of this order. Keep diagnostic snapshots restricted to the pilot team.

GPS metadata is process-local, last hour, max 500 entries; last 50 matching records per request. It is cleared at restart and is not a durable audit log. Captured timestamp/accuracy are optional for legacy clients. Browser/native clients now send accuracy without increasing upload frequency. Server retains the 20/minute per-captain limiter; rate-limited and invalid uploads are diagnosable. Rejected pre-authentication requests do not gain access to diagnostics.

Dispatch policy records describe future successful offers (pressure/load or distance policy and active count). No retrospective ranking explanation is invented for older orders. Database offer/status history remains the durable source of truth.

## Fault separation
- Database location issue: missing store or immutable customer coordinates. Confirm with owner before saving; never invent a point.
- GPS issue: GPS_DISABLED / GPS_MISSING / GPS_STALE or rejected/rate-limited uploads. Compare device permissions/time/network and server age.
- OSRM issue: fresh GPS/destination but OSRM_UNAVAILABLE_OR_NO_ROUTE or OSRM_NOT_CONFIGURED. Inspect bounded OSRM transport errors and server logs. Never substitute an unlabeled straight line ETA.
- Mapbox issue: diagnostics has fresh valid points and an OK road route, but screen fails to render. Record app release, screenshot and redacted browser error.
- Firebase issue: inspect order notification status/errorCode and registered platform counts. ACCEPTED only means provider acceptance; physically verify receipt and protected order navigation.

## Store location safety
Existing manager profile and first-location prompt now use shared Mapbox StoreLocationEditor. GPS is a draft; manual coordinates/map click/drag preview the store entrance. No point is selected by default; Save is disabled until a valid explicit point exists. Save uses existing ownership-guarded PATCH /stores/:id; saved coordinates appear after reload. Public catalogue and customer map refresh reflect valid approved-store coordinates within the current refresh cycle (up to 60 seconds).

Test a coordinate save only with the actual owner-confirmed location. No production coordinates were changed during preparation. Admin/store ownership API tests must remain passing. This does not add geocoding or a routing provider.

## Alert delivery gate
Existing health workflow checks API, DB readiness and frontend every 15 minutes; two attempts per target, 30-second timeout. Backup remains daily with existing isolated restore and seven-copy retention. GitHub Actions is the existing failure visibility surface, but human receipt is NOT VERIFIED.

A manual production-health workflow input alert_drill (default false) intentionally fails only the workflow, after normal read-only checks. It does not stop API/DB/routing or corrupt a backup. Coordinate with the operator first, confirm their GitHub Actions notification destination/settings, trigger one drill, record delivery/acknowledgement time, then run normally to confirm recovery. Do not claim alarm delivery from the red job icon alone.

Alert destination: awaiting operator confirmation. Automatic escalation: not configured. Pilot procedure: operator acknowledges within five minutes, otherwise test coordinator contacts the nominated backup operator through an agreed channel. Repeated order/dispatch/FCM/OSRM/GPS failures currently require active admin/log observation; external paging for them is not configured. Do not describe this gap as complete monitoring.

Suggested non-noisy thresholds to agree with operator: CRITICAL API/DB failing both probes, backup/restore failure, >=3 unexpected order/dispatch failures in 5 minutes; HIGH >=5 FCM/OSRM/GPS transport failures in 5 minutes. Suppress validation errors, expected capacity conflicts and user permission denial. No alert credentials belong in the repository.

## Evidence and stop rules
Use docs/pilot-field-record.md. Record actual UTC/local timestamps, build/device/OS, expected/actual, PASS/FAIL/PARTIAL/NOT TESTED, evidence, fix and retest. Stop progression after unsafe/incorrect assignment or destination, unexplained totals, or lost/duplicate order; preserve evidence and cancel through allowed normal lifecycle with participants informed. Do not bypass handoff/delivery PINs or mark a physical delivery completed from a script.

No field test or human alert receipt has occurred during preparation. Launch status remains CONTINUE CONTROLLED PILOT; never upgrade based only on automated tests.

## Preparation verification (2026-09-15)

- API: 479 passed; PostgreSQL-only cases require the separate integration job.
- API client: 39 passed. Customer app: 31 passed.
- Full application build and workspace typecheck passed. Repository security guard passed.
- Browser-only location editor trial: empty selection cannot save; latitude 95 is rejected; valid draft does not save automatically; explicit Save invokes the callback with the selected coordinates. This used a temporary local harness with no API writes.
- Browser QA identified and fixed a source/dist language-context mismatch by passing the existing translator into the shared editor.
- No physical delivery, pickup, locked-screen movement, notification receipt or operator alert acknowledgement is claimed.

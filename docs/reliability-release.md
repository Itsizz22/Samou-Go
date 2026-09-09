# Captain reliability release

## Hosting — prepared, NOT applied
On 2026-09-09 the read-only Render audit returned free, one instance, Frankfurt,
not suspended, and no configured health-check path. The owner explicitly chose
not to change billing. `ops/render-always-on.patch.json` is a reviewable proposal
for the existing service, not an automatically applied deployment manifest.
Do not create a second paid service. Before applying, confirm the current Render
plan and monthly price with the owner. Set the existing service health check to
`/health`; retain its environment secrets and deployment settings.

The API runs the preparation scan every 15 seconds and now records its heartbeat
in the database. Free hosting can sleep: an in-process timer cannot prevent that.
The dashboard flags scans older than 60 seconds. Restarted scans reuse durable
leases and due dates; expired countdowns are deliberately not sent late.

## Database and application rollout
1. Generate both Prisma clients; run production migrations before starting the new API.
2. Deploy API and web apps together. Existing APKs still receive notifications but do not report opens.
3. Install the rebuilt Android APK to forward notificationLogId through notification,
   full-screen activity and foreground-service tap intents.
4. In admin → notification log, provider acceptance and recipient open are separate.
   An absent open is unknown, never proof that the device did not display the message.
   Offline opens queue locally (maximum 30), retry on registration/resume/reconnect,
   and are accepted only for the authenticated recipient. Timestamp is server receipt time.

## Reservation withdrawal
Only the owning captain can release ACCEPTED, PREPARING or READY_FOR_PICKUP.
A reason is required. Atomic status/captain guards prevent releasing another
captain's reservation or withdrawing after pickup. The customer order remains
active, history records the reason, store is notified and eligible captains are
notified. Notification failures are recorded separately from reservation success.

## Network recovery
Transient network/timeout/server errors do not clear credentials. Startup offers
retry rather than routing a stored session to login. Reconnection retries active
read resources while preserving previously loaded data; mutations are not replayed.
The connection notice warns that order status may be stale until revalidated.

## Verification
Run API lifecycle/concurrency tests (including 64 reservations), provider payload
and audit tests, shared domain tests, browser session recovery harness, all-workspace
typecheck/build, and Android assembleDebug. Do not load-test the production database.

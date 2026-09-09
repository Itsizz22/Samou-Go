# Captain preparation reservations

## Behavior
- Accepted/preparing/ready DELIVERY orders are visible to eligible active, verified, available captains. Dedicated-store restrictions remain in force.
- POST /orders/:orderId/reserve conditionally assigns an unclaimed order without changing its status. Concurrent losers receive 409; repeating an existing reservation is idempotent.
- The pool continues displaying reservations. Customer contact, precise destination, voice notes and free-text instructions are hidden from other captains. Assigned captains retain access to their jobs when offline.
- Pickup still requires READY_FOR_PICKUP and the existing store handoff code. Time estimates never automatically mark an order ready.
- Store acceptance with an estimate saves estimatedReadyAt. PATCH /orders/:orderId/preparation-time resets the remaining time (5–180 minutes), clears the reminder and informs the assigned captain.
- Admin platform settings expose preparationReminderMinutes (1–30, default 5).
- Preparation reminders use a short notification channel; confirmed readiness retains the full native order alarm. Assigned jobs alert only their captain; unassigned jobs alert the eligible pool.

## Scheduler and reliability
The API process scans every 15 seconds. Due timestamps and two-minute retry leases live in the database, so restarting the process does not forget pending reminders. Conditional lease acquisition coordinates replicas. Cancellation, readiness, reassignment and rescheduling are rechecked before dispatch. Expired estimates are skipped rather than sending an incorrect remaining-time reminder. FCM/APNs expiration prevents delayed delivery of expired reminders.

An always-running API/worker is required for on-time scans. A sleeping/stopped backend cannot run its timer; startup catches up only while the reminder remains useful. Provider acceptance does not prove phone receipt. Push is retryable, not mathematically exactly-once: interruption between provider acceptance and database acknowledgement can cause a repeated notification. Android force-stop, disabled notifications and powered-off phones remain platform constraints.

## Deployment
1. Deploy the PostgreSQL migration 20260909190000_captain_preparation_reservation before the new API.
2. Deploy API and web apps together; do not release the new reservation UI against the old API.
3. Install the rebuilt Android APK for the short preparation-notification channel.
4. Check the configured admin lead time and verify an actual reservation → short reminder → store-ready alarm → pickup on the device.

## Verification (2026-09-09)
- API: 298 tests passed, including real isolated SQLite + HTTP concurrency, privacy, eligibility, rescheduling, lease recovery and targeted readiness notifications.
- Shared domain: 117 tests passed.
- npm run typecheck:all and npm run build:all passed.
- New UI components checked at 360px with touch viewport and mocked HTTP; reservation POST and preparation PATCH verified, no horizontal overflow or page errors.
- Android assembleDebug passed. This change has not been deployed or tested end-to-end against production FCM on the physical phone yet.

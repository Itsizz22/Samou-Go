# Store timing and convenient ordering

Implemented locally, September 2026. Group ordering is explicitly excluded.

## Behaviour

- Existing reorder flow remains in place. It rebuilds a cart using current prices and valid options; unavailable selections are skipped. No duplicate order is placed automatically.
- Existing CONTACT / REMOVE / SUGGEST checkout preferences remain in place. The customer must approve the revised bill; there is no automatic charged substitution.
- A store manager can pause a product for one hour, two hours, until midnight in Asia/Hebron, or until manually enabled. The catalogue shows its automatic return time. Editing the product preserves a pending timer; manually changing availability cancels it.
- Busy mode supports an additional 10–60 minutes of preparation for a chosen 30–180 minute period. The server adds the active delay to the base preparation estimate at acceptance. Customer delivery estimates and checkout show the delay. Selecting OPEN/CLOSED ends the timer.
- A store may opt into scheduled **kitchen start** orders after setting opening/closing hours. A customer with a single-store cart can select a time at least one hour ahead and at most seven days ahead, within the store's hours in Asia/Hebron. Overnight hours are supported; equal opening and closing times mean 24-hour operation. This is not a guaranteed arrival ETA.
- Scheduled orders retain PENDING until accepted by the manager at/after their start time. Early acceptance and assignment are rejected by the API; captains cannot see or receive these orders while pending. A manager receives an initial scheduled-order notice and a due-time reminder. The customer can cancel a scheduled order while it remains PENDING, including if the manager is late.
- Scheduling is currently single-store only, and the store must currently accept orders. Checkout totals are fixed server-side at placement. Existing price-change approval and cancellation rules still apply.

## Persistence and rollout

The PostgreSQL migration `20260915100000_store_timing` only adds nullable/defaulted fields and indexes. It deletes no rows. Apply it before deploying the API. SQLite schema mirrors production; local integration tests create their own temporary database and never touch production or dev.db.

The existing five-second preparation scheduler also expires product and store timers and sends due reminders. No extra Node process is needed. Persisted deadlines survive restarts. Push reminders use a conditional five-minute retry lease; FCM acceptance does not guarantee device delivery. The manager's pending list remains authoritative if push is unavailable.

The migration has not been applied to production, and these changes have not been published. Enable scheduling per store after rollout and confirm its hours. Timer refresh becomes visible after the next normal catalogue refresh.

## Validation

- API integration: product pricing while paused, timer expiry, manual overrides, busy estimates, schedule opt-in, early acceptance prevention, captain isolation, reminder concurrency, scheduled cancellation.
- Unit coverage: lead-time bounds, store timezone, closing boundary, overnight hours; client summer/winter conversion and invalid dates.
- Existing reorder and substitution lifecycle coverage retained.
- Browser component preview at 375px and 1024px: no horizontal overflow; schedule switching, readable controls, pause dialog and return action. Preview was isolated from production writes and removed after testing.

Run logs are in the local `artifacts/timing-*` files. Physical-device notification delivery and production migration are not part of this local verification.

# Shared protection and scheduler ownership

Production uses the existing PostgreSQL database for all eight Express rate-limit policies. No Redis credentials, new paid service, or application-wide quota multiplier is needed. Each policy has its own namespace; account/IP keys are HMAC hashed using the common JWT secret, which must be identical across replicas. Development and normal unit tests retain the memory store.

## Counter behavior

`shared_rate_limits` uses a single parameterized INSERT ... ON CONFLICT ... RETURNING per increment. PostgreSQL time determines window expiry. Limits and response formats stay unchanged. Database failure returns 503 RATE_LIMIT_UNAVAILABLE and Retry-After, never a silent per-process fallback or unlimited access. Expired rows are removed in indexed batches of 1000 by the elected worker once per minute. Requests that hit both the broad and route-specific limiter incur two increments; monitor database write throughput and pool latency before choosing a replica/traffic target. An upstream DDoS/edge gate remains advisable for traffic that exceeds application/database capacity.

## Background worker

The existing order scheduler elects one leader via `background_job_leases`. Each leadership attempt has a random owner token. The 120-second lease is renewed every 20 seconds and retained between five-second scans. Other replicas retry acquisition every five seconds without scanning orders. Clean shutdown stops scans and releases the matching owner; after an abrupt crash, a follower can take over after expiry (up to roughly 125 seconds plus database latency).

A failed renewal or locally elapsed lease stops subsequent work. Checks run between task stages, orders, captain candidates and before push dispatch. Release and renewal compare owner tokens, so a delayed old process cannot delete or renew a successor's lease. Existing per-order reminder claims, optimistic updates and delivery transactions remain in place.

Push delivery crosses an external service boundary: this does not promise exactly-once delivery after a crash during a send. An in-flight external request cannot be revoked; per-order leases and retry logic continue to provide protection. The global lease prevents normal duplicate scans, not an impossible end-to-end exactly-once guarantee.

## Rollout

1. Apply migration `20260920170000_shared_coordination` before starting the new API. GitHub's CI-gated deployment already migrates before deploying Render.
2. Keep the same production database and JWT secret across replicas. There are no new required environment variables.
3. Allow the old API replicas to finish rolling out before relying on shared limits/election: older binaries do not participate.
4. Observe `/ready`, protected API responses and the existing preparation-reminders heartbeat. Test an orderly worker shutdown and a crash takeover in staging before setting availability targets.
5. Do not equate this change with complete replica readiness for unrelated subsystems: local raw-upload staging and Socket.IO delivery still need an appropriate routing/shared transport strategy if traffic is spread across instances. Process-local media concurrency limits deliberately remain local resource budgets.

## Validation

- Unit tests cover closed failure behavior, lease contention, release on failure, and cancellation after renewal loss.
- A dedicated PostgreSQL database is required for races; the test refuses non-local hosts and anything except port 55439/database samou_validation.
- Independent Prisma clients perform 100 simultaneous increments with no lost counts, shared expiry and separate policy namespaces.
- Twenty contenders elect exactly one leader; expiration permits takeover; stale renewal/release cannot affect the successor.
- The PostgreSQL tests are included in the existing CI regression job. No concurrency tests target production.

## Rollback

Rollback code through a new commit and CI. Leave the two additive tables in place; no business data migration or table removal is needed. Rolling back to a memory-counter/scheduler version also removes cross-replica guarantees, so reduce to one replica before doing so.

References: [PostgreSQL atomic UPSERT](https://www.postgresql.org/docs/18/sql-insert.html), [express-rate-limit custom stores](https://github.com/express-rate-limit/express-rate-limit/wiki/Creating-Your-Own-Store).

# Public launch hardening — 20 September 2026

## Changes

- Session refresh has a separate 120/minute IP quota. Password attempts retain the existing 10/15-minute quota.
- Authenticated order submission (5/10 minutes) and quotes (30/5 minutes) use verified account identity; anonymous quotes remain IP limited. The global 1200/minute IP gate still applies.
- Cold durable-media reads coalesce identical requests, admit four active restores and at most 32 waiting restores per process, and reject excess with retryable 503. Cache writes are atomic so static readers cannot see incomplete media.
- Database connection exhaustion (Prisma P2024/P2037) returns 503 DATABASE_BUSY with Retry-After: 5 instead of blaming the request with 400.
- GitHub deployment starts only after successful CI for a master push from this repository. Checkout and Render use the tested SHA. Superseded releases are rejected before deployment.

## Verification

- Dependency audit: zero reported vulnerabilities (full dependency tree at audit time).
- Repository secret/security guard: passed.
- All workspace TypeScript checks and all application builds: passed.
- API: 505 passed, 7 PostgreSQL-only tests skipped locally; CI runs the PostgreSQL regression job with its isolated service database.
- Shared domain rules: 126 passed. API client: 47 passed. Customer: 31 passed.
- Regression: 100 simultaneous cold requests for one media key produce one durable read. Distinct restores are bounded and capacity recovers after failure.
- Local HTTP benchmark on an isolated seeded SQLite database: 1000 catalogue requests / 25 connections, all 200, 333 requests/s, p99 108ms, no transport errors or timeouts.
- Additional 1500 requests / 50 connections: 200 accepted, 1300 deliberately throttled with 429; no transport errors/timeouts and health remained 200.
- These numbers describe this local machine and fixture only; they are not a production Postgres capacity or concurrent-user guarantee. No load was sent to production.

## Remaining operational limits

- Follow-up: production rate-limit counters now use PostgreSQL and the scheduler uses a renewable leader lease; see shared-coordination.md. Media admission remains a per-process resource budget. Other replica concerns (raw-upload routing and Socket.IO transport) still need validation before horizontal scaling.
- Production capacity depends on the actual Render tier, Postgres pool and data size. A staging soak test with production-like resources is still required before promising a throughput target. No billing changes were made.
- Supercode server transport remains operator-approved HTTP as documented in supercode-activation.md. This carries OTP/phone data without transport encryption; move to provider-supported HTTPS (and disable SMS_SUPERCODE_ALLOW_HTTP) before treating privacy/security hardening as complete. Do not silently break the live OTP provider.
- Staff accounts that still use phone numbers/default passwords need strong unique passwords. Existing accounts were not reset or locked.
- This is a code audit and regression pass, not an independent penetration test or physical-iPhone push certification.
- Verify external deployment-provider auto-deploy settings separately: the CI gate here governs the GitHub Actions production workflow.

## Rollback

Revert the hardening commit through Git, run CI, and deploy that new revert commit. The tested-SHA guard deliberately blocks redeploying an old branch head directly. No database migration is included.

## References

- https://github.com/express-rate-limit/express-rate-limit (keyGenerator and per-process store behavior)
- https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql (connection pool configuration)
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run (completion trigger and head SHA)

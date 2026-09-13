# Delivery dispatch and interface review — 2026-09-13

## Result

Store/customer invoice changes must be resolved before acceptance and dispatch. Customer decisions now create history and notify the store. Store acceptance defaults to a 20-minute preparation estimate when none is supplied; manual estimates remain available. Preparation start and actual readiness are recorded separately. Pickup still requires store readiness.

The dispatcher scans every five seconds and persists a 25-second exclusive offer. Expired offers rotate between eligible captains. Reservation, manual assignment, and dispatch lock the same captain record; a captain may have only one active delivery. Offers respect dedicated stores, blocked stores, account verification, availability, and existing work. Reserved orders are not exposed to other captains. Long-unclaimed orders escalate to the store and administrators.

Ranking combines waiting time and an optional fresh-location proximity/preparation hint. The hint uses straight-line distance, not road routing. Missing location falls back to waiting time. Vehicle matching, learned preparation estimates, penalties, offline maps, and route optimization are not implemented by this change.

## Interface and cleanup

- Shared product cards show the complete product image, category, availability, price/discount, and explicit edit/archive actions in both store-manager interfaces.
- Shared accessible selection sheets replace native select presentation across customer, staff, and admin forms; native form values and validation remain supported.
- Captain offers display remaining acceptance time and disable expired acceptance.
- Removed three unreferenced legacy ticket screens and unused support mutation wrappers. The active SupportDesk remains intact.
- Removed unused imports/types/constants, obsolete product-list CSS, and stale generated-client casts. Normalized legacy option JSON and decimal fee mapping.
- SSE order polling avoids overlapping reads and rechecks authenticated viewers' access.

## Verification

- API: 37 suites, 456 tests passed, including lifecycle integration, offer expiry/rotation, competing dispatch, reservation capacity, pending invoice changes, readiness, and concurrency coverage.
- Shared domain rules: 8 suites, 123 tests passed.
- All workspace type checks and full application builds passed; final targeted builds follow the last cleanup.
- Browser component checks cover RTL widths 320/390/768/1280, product actions/images, selection keyboard/focus/form behavior, and customization pricing interactions.
- Dependency audit reported zero vulnerabilities. Repository security checks passed.

These checks are not a guarantee that every possible defect has been eliminated. Database integration ran against isolated local SQLite fixtures; actual PostgreSQL concurrency and production deployment were not tested. SQLite delivery writes are serialized locally to avoid interactive-transaction contention; PostgreSQL retains transactional row locking. Push dispatch tests verify server behavior, not receipt on a physical device.

## Deployment boundary

Publish this work to a separate GitHub branch for review. Do not merge into the production branch automatically. Before a later production release, apply migration `20260913000100_delivery_dispatch`, regenerate the production Prisma client, and validate PostgreSQL dispatch with test accounts. No phone installation or map replacement is part of this release. Existing APK/AAB files built before these changes do not contain the new dispatch interface.

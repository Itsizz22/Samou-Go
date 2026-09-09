# Customer experience improvements

## Behavior

- Reorder adds current available products and validated options to the existing cart. Multi-store requests finish loading before the cart changes; empty or failed requests preserve its contents.
- Product variants have separate cart identities and database rows. Quantities, notes and deletion target the selected variant. The displayed unit price includes addons.
- Pending orders allow customer quantity/note edits using frozen unit prices. Ownership, status and updatedAt are checked atomically against acceptance. Voucher discounts are recalculated without redeeming the voucher again.
- Checkout offers contact/remove/suggest preferences for unavailable products. The manager can propose a replacement basket while the order is pending. The original order remains unchanged until customer approval. Acceptance checks the proposal version and revalidates prices/options/discount. Store acceptance is blocked while a proposal is pending. Any changed price requires a fresh proposal.
- Customer tracking shows the estimated preparation countdown and an overdue explanation, separate store/captain ratings after delivery, and a support link that binds the ticket to its order. Ratings can be corrected without creating duplicate rows.
- Checkout drafts preserve address and notes by account; existing request fingerprints prevent duplicate submissions after an ambiguous network result. Cart persistence and connection recovery were retained.
- Existing saved Home/Work/Other addresses remain available; store opening hours are shown on discovery/home cards. Home availability filtering now respects storeStatus and isAcceptingOrders.
- Customers can disable promotional push notifications while keeping order alerts. Existing send paths use their type; future promotional senders must use PROMOTION, OFFER or MARKETING.
- Captain UI distinguishes available preparation, reserved and ready jobs and explains why an available job can disappear. The store receives a reservation notification. After ten minutes from order creation, unassigned delivery orders in preparation/ready states appear in admin follow-up and trigger an admin alert once.
- Missing product photos have a consistent placeholder; failed image state no longer persists when the image URL changes. Authentic missing product photos still need to be supplied by the stores.

## Rollout

Apply `20260910000200_customer_experience` before deploying the API. This adds preference/proposal/escalation fields and replaces the unique product-per-order index with a nonunique index, retaining existing data. Both Prisma schemas are updated; the migration was compared with Prisma's PostgreSQL schema diff. No production database changes, commits or deployments were performed for this change.

## Verification

API integration tests cover variant pricing, quantity edits, stale/unauthorized edits, proposal approval, changed prices, repeated decisions, notification preferences, escalation and separate ratings. The existing domain suite covers money and order transitions.

`themes/web-customer/tests/experience.browser.html` is an isolated fixture (no live orders). At 360px with reduced motion, tested variant deletion, rating submission, promotional preference saving, order-linked support and proposal acceptance. No horizontal overflow or page errors occurred. Screenshot: `artifacts/customer-experience-360.png`.

Commands: `npm run typecheck:all`, `npm run build:all`, `npm run test --workspace @samou-go/api`, `npm test`.

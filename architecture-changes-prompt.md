Four related changes, in priority order. Read `CLAUDE.md` and
`DESIGN_SYSTEM.md` first. Items A and C touch security-sensitive and
money-sensitive logic — audit first, then STOP and confirm the mechanism
with me before implementing, exactly like the "recommended" flag and
region-fee investigation done previously. Items B and D are lower-risk;
still audit existing patterns before building new ones.

## A. Delivery fee is now set by the captain, based on region

This is a real architecture change to the money model, not a copy change.
Currently (per `DESIGN_SYSTEM.md` §8 and the codebase) the client never sends
price fields — the server always derives pricing, specifically from an
item-count tariff table. That guarantee must NOT be abandoned just because a
captain is now involved — a captain's app is still a client, and letting any
client freely set/send an arbitrary price the server blindly trusts would
reintroduce exactly the tampering risk that rule exists to prevent.

Audit first:
- Confirm GPS is indeed already working in web-captain and web-admin (you
  said it's been added — find and describe what's there: what fields on
  which models, what UI flow, whether captain location is a live/tracked
  value or a one-time set value).
- Find the current delivery-fee derivation path end to end (tariff config,
  `calculateOrderTotals`, the order-quote endpoint) so you know exactly what
  you're replacing.

STOP AND ASK ME before implementing the fee-setting mechanism. Likely
correct shapes, roughly in order of how well they preserve the
anti-tampering guarantee:

(a) **Server-side region table, captain just selects a zone** — an admin
    (not the captain) configures fee-per-region in advance; the captain's
    app shows the customer's region/zone (derived from the customer's GPS
    point set at checkout, or their free-text address matched to a zone) and
    the captain confirms/selects which zone applies if it's ambiguous, but
    the actual fee value is looked up server-side from the admin-configured
    table, never typed/sent freely by the captain.
(b) **Captain proposes a fee, order goes into a pending-confirmation state**
    requiring customer or admin approval before the fee is charged — more
    flexible, but adds a state-machine step and a UX/trust cost (a captain
    could still try to propose an inflated fee, just with a check-before-
    charge instead of no check at all).
(c) **Fully free-form captain-entered fee, trusted as-is** — flag this as
    the option that reintroduces the exact tampering risk the codebase
    currently guards against; don't implement this without me explicitly
    overriding that guidance.

Tell me which of these (or another option you find better-supported by what
GPS infrastructure already exists) fits what's already built for captain/
admin GPS, and wait for my decision before writing the pricing logic.

## B. GPS onboarding for store-manager and customer, matching what captain/admin already have

Audit first: find exactly how the existing captain/admin GPS
capture works (component, API field, first-login prompt flow, and the
customer's existing Settings-page GPS entry you mentioned) so the new flows
match established patterns rather than introducing a second GPS
implementation.

Build:
- **Store-manager**: on first login (no location set yet), prompt for the
  store's location the same way captain/admin already do. Also add a way to
  update it later from store settings (you mentioned this should mirror the
  customer settings pattern) — a store manager should be able to re-set
  location if they move or made an error, not just once at signup.
- **Customer**: same first-login prompt if not already covered by the
  existing Settings-page GPS entry — confirm whether "first login asks for
  location" already exists for customers or only the Settings-page manual
  entry exists; build the missing piece only, don't duplicate what's there.
- Both should follow the browser geolocation permission flow gracefully:
  handle permission-denied without breaking onboarding (let the user skip
  and set it later from settings rather than blocking account use
  entirely).

## C. Unify the dashboard/sidebar position — right side for Arabic (RTL), across all apps

Audit first: check the current sidebar/nav placement in each of the 7 apps.
Some may already be correctly right-aligned for RTL, others may be
hard-coded left regardless of direction (this is exactly the kind of
RTL-direction bug a prior audit already fixed for icons — check whether the
sidebar itself was in scope of that pass or missed). Fix any app whose
primary navigation sidebar doesn't follow `dir="rtl"` placement (right side)
consistently. Don't rebuild sidebars that are already correct — this is a
consistency fix, not a redesign.

## D. Store "Offers" feature (store-manager creates, customer browses)

Audit first: check whether `Voucher` (seen in `seed.ts` — code-based
discounts) already covers part of what "offers/إعلانات خصم" means, or
whether this needs a distinct model (e.g. a promotional banner/announcement
that isn't a redeemable code, just a marketing display — "٢٠٪ خصم على
المشروبات" as a shown offer rather than a voucher code a customer enters).
Ask me to clarify which of these (or both) is wanted if the distinction
matters for the schema, rather than assuming.

Once scoped:
- **Store-manager**: new section to create/edit/delete offers for their own
  store — likely a title, description/terms, optional image (reuse the
  uploads pipeline and `purpose`-keyed pattern from the cover-image feature,
  don't build a second upload path), an active date range, and an
  active/inactive toggle. Match the existing panel pattern used for
  categories and store-profile.
- **Customer**: a way to browse offers — both a dedicated offers
  section/screen and surfaced within each store's detail view. "Improve the
  store interface" is vague on its own — audit the current
  `StoreDetailScreen`/store-card design first and propose concretely what
  you'd change to surface offers well (e.g. a banner carousel, a badge on
  store cards that have active offers) using existing design-system
  patterns, and confirm the concrete plan with me before a large visual
  change — small, obviously-correct additions (like a badge or ribbon) don't
  need to wait for confirmation, but a layout overhaul does.
- Enforce the same authorization pattern already established (store manager
  can only manage their own store's offers, server-side enforced, not just
  hidden client-side).

## Process

- Work through A, B, C, D roughly in this order, but don't let A block B/C/D
  if A is waiting on my decision — come back to it once I've answered.
- After each item: `npm run typecheck` and relevant tests, confirm green.
- Match existing design-system tokens/components everywhere; don't invent
  new visual patterns.
- Report back per item: what you found in the audit, what you built (or what
  you're waiting on my decision for), files changed, and what you verified
  server-side for anything touching authorization or money.

Everything stays uncommitted until I review the diff. Items A and D's scope
question are blocking — don't guess past those stop points.

# Local catalogue QA — 2026-09-08

This fixture targets **local SQLite only** and the three existing `e2e-test-store-*` stores. It does not modify production. Existing unrelated products, accounts, and orders are retained.

## Reproduce

1. Start the local API and customer app (ports 4000 and 5173).
2. `npm run seed:demo-catalogue --workspace @samou-go/api`
3. `npm run test:demo-catalogue --workspace @samou-go/api`
4. For browser checks, provide Playwright via `SAMOU_PLAYWRIGHT_MODULE` (or install it in your test environment) and optionally a Chromium executable via `SAMOU_CHROMIUM_PATH`, then run `node packages/api/scripts/demo-catalogue-browser.cjs`.

The existing E2E demo accounts must be present with their documented `Password123!` password. The smoke test uploads images to its demo product/category/offer and the restaurant cover; creates, edits, and removes a temporary burger option group; creates one local pickup order and cancels it after acceptance/preparation/readiness. Do not use it with production credentials.

## Fixture

Four photographed products, four category images, and four store-scoped offers:
- Restaurant: pizza and burger.
- Supermarket: fresh salad.
- Sweets: chocolate cake.

Pizza base price 30; required medium (+0) or large (+10); optional cheese (+5), olives (+2), mushrooms (+3). This respects the existing five-option limit. Two large pizzas with cheese and olives must subtotal 94, calculated by the API.

Images are versioned WebP files in this directory, copied to content-hashed local upload paths by the seed. The API upload smoke additionally exercises presign, PUT, finalize, and public image responses. See SOURCES.md for photo sources.

## Findings fixed

- Single-choice product options now replace the previous selection on one click.
- Product modal has dialog semantics, focus containment/restoration, Escape dismissal, named quantity/close controls, and 44px quantity/close touch targets.
- Favorites requests are limited to CUSTOMER/ADMIN; staff sign-in no longer produces a favorites 403. Aborted requests cannot overwrite the next account's results.
- Managers with multiple stores can choose the current store; order queries and management panels use that store in both manager interfaces.

## Verified

- API: 267 tests passed; shared domain: 117 tests passed.
- Local API smoke: 42 integration checks passed, including real image uploads, option CRUD, server pricing, guest rejection, and order lifecycle through readiness.
- Browser: onboarding, pizza single/multiple selection, cart, guest auth gate, login continuation with subtotal 47, image decoding, 320px overflow, home/search/orders/profile/settings/offers/favorites/support rendering.
- Manager/captain/admin dashboards render; inspected final sessions had no page exceptions or HTTP failures. Manager store selector exercised.

## Limits

The historical `test:e2e` script assumes older seed accounts/passwords and stopped during login; it is not included in passing counts. This audit used local browsers/API, not a fresh Android/iOS or production test. Notification delivery, physical-device behavior, every possible order/payment transition, and production deployment are not certified by these checks. No commit or push performed.

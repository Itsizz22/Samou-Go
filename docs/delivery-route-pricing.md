# Delivery pricing modes

The API is the authority for prices. `DeliveryZone` is shared by customer onboarding, checkout and store settings; store managers select an existing active zone, while administrators manage the zone catalogue.

## Priority for new orders

1. Pickup: no delivery charge.
2. `PlatformSettings.freeDeliveryEnabled`: zero delivery charge, fixed against captain repricing.
3. `DeliveryPricingConfig.enabled`: the canonical, symmetric `DeliveryRouteRate` for store zone and destination zone, including same-zone routes.
4. Existing zone/base/dynamic pricing when the matrix is not enabled.

The free-delivery promotion never deletes saved route prices. Disable it to return to the configured mode. Configure and enable the matrix before ending the promotion when switching to route pricing. Product prices and store commissions are not changed.

## Administrator workflow

- Manage the shared zones under Delivery Zones.
- Managers choose their store area in Store Settings.
- Enter prices in the upper half of the matrix. Mirrored cells display the same price. Blank means not configured; zero explicitly means free.
- Save incomplete drafts with the matrix disabled. Enabling requires every active pair (including diagonals) and an active zone for every active approved store.
- New areas added later need their prices; missing/inactive routes are rejected, never silently free.
- The free-delivery switch is in Settings > Delivery Pricing and uses the existing admin-only pricing endpoint.

Canonical ordered IDs, a composite primary key, foreign keys, nonnegative PostgreSQL check, atomic replacement and optimistic revision prevent duplicate/reversed prices or silent concurrent overwrites. Fees use PostgreSQL Decimal(10,2) and numeric DTOs.

Order creation stores the price; later setting changes do not rewrite existing orders. Pharmacy offers snapshot their delivery fee and fixed-price mode, preserving the quote when accepted. Single-store, multi-store and pharmacy pricing all use the same resolver.

## Deployment

Apply `20260912000300_route_pricing` before deploying the API. Both new modes default to disabled. Do not populate production with QA prices. Local tests use temporary SQLite databases.

## Contact UI

Customers see store and assigned captain phone/WhatsApp details. Captains see store details and receive private customer contact details only after assignment. An explicitly saved WhatsApp number takes precedence over the telephone number. No claim of automatic WhatsApp account verification is made.

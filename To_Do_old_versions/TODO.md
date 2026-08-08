# Samou' Go — UI/UX Interactivity Upgrade TODO

## Progress Tracking

- [x] Step 0: Explore repository & understand architecture
- [x] Step 1: Approve plan with user

## Implementation Steps

- [x] **Step 1:** Add `refresh` alias to `Resource` in `packages/api-client/src/useApi.ts`
- [x] **Step 2:** Add `<Toaster />` to `main.tsx` entry points:
  - [x] Customer shop
  - [x] Delivery Captain Dashboard
  - [x] Store Details & Product Menu_1 (checkout)
  - [x] admin
  - [x] Store Details & Product Menu (bonus)
- [x] **Step 3:** Store Manager Dashboard
  - [x] Create `src/lib/chime.ts` (Web Audio API chime)
  - [x] Add polling (`pollMs: 10_000`) to PENDING/PREPARING queries
  - [x] Detect new PENDING orders → play chime + info toast
  - [x] Replace `notice` bar with `useToast` for accept/reject/quick actions
  - [x] Retry buttons → `refresh()`
- [x] **Step 4:** Delivery Captain Dashboard
  - [x] Add `useToast` success toasts on pickup & delivery (+ errors)
  - [x] Add polling + toast on new available order
  - [x] Retry buttons → `refresh()`
- [x] **Step 5:** Checkout app (`Store Details & Product Menu_1`)
  - [x] Toast on add-to-cart (0→1)
  - [x] Success toast on order placed
  - [x] Instant delivery tariff preview (3₪/5₪) while quote is stale
  - [x] Retry buttons → `refresh()`
- [x] **Step 6:** Order Tracking
  - [x] `animate-pulse` on active timeline status indicator
  - [x] Retry buttons → `refresh()`
- [x] **Step 7:** Customer Home
  - [x] Retry button → `refresh()`
- [x] **Step 8:** Bonus apps (admin + store-details)
  - [x] `<Toaster />` in admin `main.tsx`
  - [x] `<Toaster />` + add-to-cart toast in store-details app
- [x] **Step 9:** Verification
  - [x] Run `npm run typecheck` across workspaces (all 8 pass cleanly)
  - [x] Run targeted typechecks for admin & store-details
  - [x] Fix pre-existing invalid `ignoreDeprecations: "6.0"` in 3 tsconfigs
  - [x] Output summary table of updated components

## Session 2 — Production-ready MVP (admin dashboard, captain availability, bells, profiles)

- [x] **A. Backend (api)**
  - [x] `isAvailable Boolean @default(false)` on `User` + migration `20260805010000_add_captain_availability`
  - [x] `PATCH /auth/me/availability` (captain-only, `ACCOUNT_INACTIVE` guard) + profile update via `/auth/me` (`name|phone|newPassword|currentPassword`)
  - [x] Claim guard requires `isActive && isVerified && isAvailable` (CAPTAIN_UNVERIFIED/OFFLINE/INACTIVE) + assign-on-claim
  - [x] `admin` module: `/admin/stats` (online captains = `isActive && isAvailable`), `/users` GET+PATCH, `/captains/:id/verify`
  - [x] Stores module: `/stores/:id/approve`, `/stores/:id` PATCH `isActive`, mapper updates
  - [x] Seed: captains available, `isAvailable` in upsert
- [x] **B. shared-types / api-client / ui**
  - [x] Models/DTOs: `isAvailable`, `SetAvailabilityInput`, `AdminStats`, `OrderDetail` typing
  - [x] `api.ts`: `setAvailability`, `updateOrderStatus`, `approveStore`, `updateStore`, `updateUser`, `verifyCaptain`, `getAdminStats`, `getUsers`, `setAvailability`
  - [x] `useApi.ts`: `useAdminStats`, `useUsers`, `useOrders` (paginated), `refresh` alias
  - [x] `useAuth.ts`: `refresh` + `setUser`
  - [x] `ui`: `NotificationBell` (dropdown, badge, localStorage read-state, mark-all-read, `chimeOnNew`, `onDark`) + export
- [x] **C. Themes**
  - [x] Admin: full dashboard rewrite — 5 panels (Dashboard/Orders/Users/Stores/Captains), KPI grid, status distribution, order status override via `ORDER_STATUS_TRANSITIONS`, user freeze/depromote, store approve/open-close, captain verify/freeze, `useAdminStats` pollMs 15s, bell
  - [x] Captain: availability toggle (optimistic + persisted via `setAvailability` + `auth.setUser`), profile panel (name/phone/password via `/auth/me`), bell from available items, tabbed layout (home/orders/earnings/map/account)
  - [x] Store manager: orders tab (inbox + `activeCount` badge), persisted store open/close toggle, bell with boot notifications, StoreProfilePanel + ProductCataloguePanel extracted
  - [x] Customer: header bell, single cart button, bottom-nav wired to checkout/tracking URLs
- [x] **D. Verification**
  - [x] `@samou-go/ui` built; `npm run typecheck` green across all 11 workspaces (fixed `OrderDetail` import + falsy className in admin)
  - [x] `npm test` green (76/76 Vitest)
  - [x] Migrations applied + seed green (9 users, 3 stores, 8 categories, 20 products, 3 orders)

## Session 3 — Notification centers, static-button activation, lifecycle audit

- [x] **Audits** (read-only, no changes)
  - [x] Confirmed full lifecycle already wired: customer checkout→tracking, store manager ACCEPTED→PREPARING→READY_FOR_PICKUP (+reject), captain claim→ON_THE_WAY→DELIVERED (409 on double-claim), admin override via `ORDER_STATUS_TRANSITIONS`
  - [x] `orders.service.ts` claim edge verified: gates `isActive`/`isVerified`/`isAvailable`, optimistic lock `captainId: null` → P2025 → 409, assign-on-claim
  - [x] `AdminStats` already exposes `stores.active`/`stores.pendingApproval` (admin.service.ts + dto.ts)
- [x] **Customer home (`web-customer`)** — was the only app with a dead bell
  - [x] Bell now fed from the signed-in customer's own orders (`useOrders`, 15s poll), keyed by `order:{id}:{status}` so a status change re-alerts; rows deep-link to tracking via `?orderId=`
  - [x] Anonymous visitors keep a quiet bell (no badge); home stays public
  - [x] Header "menu" button → scroll to categories; "See all" → scroll to all-stores list
- [x] **HeaderNav bells** — the static `Bell` button in tracking/checkout/store-details vendored HeaderNavs replaced with the real `NotificationBell`
  - [x] New optional props: `notifications`, `storageKey`, `onNotificationNavigate` (backward compatible)
  - [x] Tracking passes its live order status notification (`storageKey="tracking"`); checkout/store-details default to the designed empty state
- [x] **Admin dashboard**: added "Active Stores" KPI (secondary row) to complete the requested KPI set
- [x] **Customer profile editor (tracking app, `web-order-tracking`)**
  - [x] Bottom-tab state added; the previously dead "حسابي / Profile" tab now swaps the whole screen for `CustomerProfileTab`
  - [x] Profile panel mirrors the captain's account panel: name/phone + password change via `PATCH /auth/me`, `auth.setUser`, sign-out; "home"/"explore" tabs navigate to the customer home app
- [x] **Verification**
  - [x] `npm run typecheck` green across all 12 workspaces (incl. 4 affected web apps)
  - [x] `npm test` green (76/76)


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


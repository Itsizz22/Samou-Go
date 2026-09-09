# Customer discovery polish — local review

- Home categories show four tiles initially and expand to eight inline. The active category remains visible when collapsing. Images reuse a matching store cover/logo; missing media uses the existing category icon. No new external photo dependency.
- Store menu defaults to most ordered when data exists. GET /stores/popular-products accepts an optional storeId, applied BEFORE aggregation and limit. Ranking uses quantities from DELIVERED orders in the last 90 days, available products and active approved stores only. No fake fallback: normal categories remain when no sales exist.
- Product photos open an independent native dialog, with focus containment, Escape, close button and the existing Android overlay-back handler. Previewing does not modify the basket.
- Store identity includes logo, open/busy/closed state and configured opening hours. The schema has no store preparation-duration field: copy explains that the store confirms preparation time upon acceptance, rather than inventing a duration.
- Existing floating store cart shows item quantity separately from the product subtotal (including extras). No numeric delivery fee added.

## Verification

- npm run typecheck:all: passed, all workspaces.
- npm run build --workspace @samou-go/web-customer: passed.
- API suite: 316 passing tests, including scoped best-seller isolation.
- Local Playwright with isolated mock catalogue at 360 x 800: category expansion 4 -> 8 -> 4; no horizontal overflow; photo loads and closes with Escape; preview leaves cart empty; adding one 30 ILS item produces quantity 1 and subtotal 30; no JavaScript errors after using correctly shaped API fixtures.
- Screenshots: artifacts/discovery-polish-home.png and artifacts/discovery-polish-store.png. These use local test data, not live production catalogue photos.
- No commit, deployment, APK build or physical-phone installation performed for this change.

## Follow-up: store navigation and customization

- Sticky compact store identity and category navigation; product deep links retain scroll clearance.
- Product actions distinguish Choose size, Choose extras and Add using the actual option groups. Products already in the basket can be customized again.
- Closed-store actions display an explicit reason and prevent quantity increases; customization confirmation rechecks current store availability.
- Options sheet shows the supplied product image and description, larger option touch targets, semantic surfaces and a wrapping footer for small screens.
- All-workspace typecheck passed; final customer typecheck and build passed after the final label adjustment.
- Isolated browser QA: 360px preview, required size selection updates 30 + 10 to 40, options reopen after adding, sticky back button remains at y=8 after scrolling 1200px, closed action disabled, no horizontal overflow at 320px, no JavaScript errors.
- Screenshots use mock catalogue images: artifacts/store-polish-options.png and artifacts/store-polish-sticky.png.
- Food-type taxonomy deferred: existing store types alone do not reliably identify dishes. No guessed food labels introduced.

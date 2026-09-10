Home banners now load from platform settings; null uses bundled defaults, an empty array hides the reel. Admin Settings > Home banners supports HTTPS image URLs, add/delete/reorder, activation, contain/cover and vertical focal position with preview. Direct file upload is not part of this editor.

Apply migration 20260910000300_home_banners before API deployment. No production settings or migrations were modified. New assets are bundled in customer and admin public/banners. Tracking-coming-soon banner removed from defaults; parcel banner retained.

Validation: 32 lifecycle tests including admin-only banner save, invalid URL rejection and empty-list persistence. Customer/admin builds and all-workspace typecheck passed. Screenshots at 390x844, DPR 3 (1170x2532), with no horizontal overflow at 360px. Local frontend, real public API responses forwarded by the test harness to permit local-origin preview. Existing missing product images remain visible; no fabricated catalogue images used.

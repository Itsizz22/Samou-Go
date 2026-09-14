# Production-readiness review — 14 September 2026

Status: local verification passed for the changes below; production release is conditional, not a blanket approval. No deployment, production migration, account changes, or real customer orders were performed. The working tree already contained extensive changes; they were preserved.

## 1. Critical security findings
No newly confirmed Critical exploit was found in the reviewed code and exercised test cases. This is not proof that every endpoint is vulnerability-free. Static review, existing integration tests and the browser checks below do not replace a penetration test or a production configuration review.

## 2. Security fixes implemented
- CORS no longer accepts arbitrary Vercel tenants or a wildcard environment entry. Production/native origins are retained; preview URLs are restricted to the Samou Go pattern, with explicit CORS_ORIGINS available for other trusted deployments. Verify actual preview/team domains before rollout.
- JWT verification explicitly permits HS256 only; a regression test rejects HS384 even with the valid secret.
- Image decoding has a 40-million-pixel ceiling, in addition to upload byte limits and content-signature validation. Finalization has a dedicated rate limiter to constrain repeated CPU-heavy processing.
- Oversized JSON now produces a sanitized 413 response instead of a misleading 500.
- Seven SPA deployment configurations add frame protection, nosniff, referrer policy, a narrow structural CSP, same-origin device permissions and HTTPS HSTS. CSP intentionally does not claim a complete script-src XSS policy.
- A high-confidence pattern scan of tracked text files found no matching private keys/AWS/GitHub/Stripe live keys. This was not a history/entropy scan. Credentials were not printed.

## 3. Performance / presentation
- Customer home now places featured products directly after search/categories, as requested. Desktop products use four columns; mobile uses two.
- Reusable store cards reserve image geometry, provide fallbacks, lazy-load noncritical images and separate favorite buttons from navigation.
- Store uploads preserve aspect ratio and provide 320/640/1280 derivatives plus a high-quality canonical image. Home uses bounded derivatives rather than the full canonical image. No fabricated srcset width descriptors are used for portrait/small sources.
- Fixed-path login assets revalidate instead of remaining immutable for a year.
- The order client listens for the server's named SSE update event. Polling remains a fallback.

## 4. Architecture and code quality
- Store cards and upload preview/details are reusable components shared where appropriate.
- Fixed several effect dependencies, captured the mounted video for cleanup, and stabilized the checkout draft setter to avoid effect-triggered update loops.
- Removed three unused earlier login-animation source files after confirming they had no consumers: AnimatedScooter.tsx, DeliveryRoute.tsx and config.ts. The active video intro remains.
- Applied Prettier to the principal new/security files; did not mass-format unrelated work or disable lint rules.

## 5. Dependencies
npm audit reported zero known vulnerabilities in all severity categories at audit time. No dependency versions were changed by this review. This does not exclude unpublished vulnerabilities or establish that every dependency is necessary.

## 6. Database
SQLite and PostgreSQL Prisma schemas both validate. Validation used a dummy PostgreSQL URL and made no connection/migration. No new schema/index migration was introduced by this audit. Pre-existing schema and migration changes remain pending their own deployment review.
Order creation/pricing, voucher guards and status updates were reviewed alongside transaction/concurrency tests. Existing server-side pricing, guarded updates and role/ownership checks were retained. PostgreSQL contention and backup restoration were not exercised here.

## 7. Principal files changed
- themes/web-customer/src/components/generated/SamouGoHome.tsx
- themes/web-customer/src/components/home/StoreCards.tsx
- themes/web-customer/src/components/FeaturedProductsShowcase.tsx and src/index.css
- packages/ui/src/components/UploadImageDetails.tsx and both store-manager profile panels
- packages/api/src/uploads/image.ts, uploads.service.ts and uploads.routes.ts
- packages/api/src/config/cors.ts, lib/jwt.ts, middleware/error-handler.ts, middleware/rate-limit.ts
- packages/api-client/src/api.ts and useApi.ts
- themes/web-*/vercel.json

## 8. Verification evidence
- Full production build: npm run build:all passed (artifacts/audit-build-final.txt).
- All-workspace typecheck passed (artifacts/audit-typecheck-final.txt).
- Tests: API 464 passed in the full rerun; adding the JWT regression afterward produced 24/24 passing authentication tests (one additional test). API-client 31, shared-types 123, customer 13 passed. This is 632 distinct passing tests across the final full and targeted runs, not a claim of one single final invocation.
- Upload suite: 44 tests passed, including high-quality source dimensions, derivatives and malformed uploads.
- Added/updated CORS, oversized-body, JWT, image and upload persistence assertions. Updated the SSE preview fixture to the restricted tenant policy.
- Lint: zero errors; 24 warnings remain, predominantly React Fast Refresh export organization, plus the deferred hook items noted below (artifacts/audit-lint-final.txt).
- Home examined at 320, 375, 390, 430, 768, 1024 and 1440 CSS pixels; no horizontal overflow in the measured home states. Search, category filtering, closed-store empty state and reset were exercised.
- Browser verified store detail, product addition, multi-store subtotal and removal of only the added test item; the original cart item was preserved. No order was submitted.
- Role tests exercise unauthenticated access, customers/managers calling admin endpoints, token forgery/expiration, store ownership and order access. These are automated integration tests, not manual logins for every role.

## 9. Remaining risks / required follow-up
| Severity | Item | Required action |
| --- | --- | --- |
| High | Launch credentials and demo data | User previously used phone-number passwords; public catalogue still displays a test store. Confirm staff credential rotation and disable intended demo accounts/data before public launch. This review did not change credentials or delete catalogue data. |
| High | Release acceptance coverage | Complete authenticated customer-to-manager-to-captain order flow, actual OTP delivery, push/background delivery, offline recovery and real Android/iOS permission testing in staging. Automated tests do not establish physical-device behavior. |
| Medium | Anonymous order SSE | Existing unguessable-ID endpoint reveals status only without bearer auth and polls DB per connection. Replace with an authenticated streaming transport or short-lived scoped ticket, and cap concurrent streams before larger-scale deployment. This was not silently broken in the client. |
| Medium | Web token persistence | Access/refresh tokens remain JS-readable browser storage by existing design. A successful XSS could read them. Plan native secure storage and a deliberate web HttpOnly/session design with CSRF protection rather than an ad hoc contract change. |
| Medium | Image retention/storage | Canonical processed uploads are durable through StoredUpload; retained raw originals are private local files and may disappear on ephemeral-host restart. Durable private object storage, retention and orphan cleanup are still needed. Old uploaded covers do not automatically gain new derivatives. |
| Medium | Scale/operations | Rate limiting is per-process; streaming/polling and DB-backed image blobs need staging load measurements, distributed limits if scaled, storage monitoring and verified backup restoration. No production stress test was run. |
| Medium | Browser security rollout | Validate deployed headers and real trusted origins. Structural CSP is not a full script policy. Public website TLS/certificate status on affected phones was not diagnosed by this local audit. |
| Low | Lint/structure | 24 lint warnings remain, mainly development Fast Refresh boundaries. Review the automatic-location capture effect and admin derived-row memo warning before a wider component refactor; rules were not suppressed to claim a clean result. |
| Low | Coverage limits | Not every staff screen, dark-mode state, device keyboard or invalid-route interaction was manually inspected. Source-map/environment checks and dependency audit cannot guarantee production infrastructure settings. |

## 10. Release assessment
Suitable for continued staging review. Do not label this universally production-ready until the High release gates and the operational/security follow-ups above are resolved. Changes remain local and reviewable. No GitHub push or Render/Vercel deployment was performed.

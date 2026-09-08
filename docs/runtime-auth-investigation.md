Investigation and fixes — 2026-09-08

The implementation fixes are local. No production deployment or production account login was performed. Public production probes and a local Chromium regression harness were used; the user's existing browser session and Render logs were not available.

1. Orders and authentication

`BottomNav.tsx` generated `/orders?pageSize=50` to count active orders. It read the access token and sent `Authorization: Bearer ...` itself, bypassing the shared client's refresh handling. On the first 401 it cleared the access token and user, even when a refresh token could restore the session. Thus the header was present by construction in this path; whether the particular production token was expired, revoked, or otherwise invalid cannot be established without that request/session. No tokens were collected or logged.

The badge now uses the shared typed orders resource. Customer orders hooks require `auth.ready && auth.user`, key results by user id, and respect caller enablement. Cached profiles alone cannot enable orders. The root app already had a readiness gate; the missing hook-level guard was an additional weakness, not proof that boot timing caused the observed production request. The home bell legitimately requests 8 orders; the badge requests 50. No production source generating 81 was found. The client preserves 81, and its serialization is covered by a regression test; backend pagination permits up to 250.

The central client already used Bearer access tokens, not session cookies. Login, profile verification and orders use the same resolved API URL. The customer production environment specifies `VITE_API_URL=https://samou-go.onrender.com/api/v1`. `VITE_API_BASE_URL` takes precedence when supplied. No environment values, CORS policies or API contracts were changed. Adding cookie credentials would not repair this Bearer flow.

Refresh-only restoration and 401-triggered refresh now share one rotation operation. Protected requests retry once after refresh. Explicit authentication rejection clears both credentials; network/503 failures preserve them and surface the actual error. Late responses cannot overwrite or sign out a newly selected account. Logout captures revocation credentials before immediately clearing local state. An SSO access-only hand-off no longer retains another account's refresh token. Active-account lookup prefers live token matches over stale saved selection. Boot callbacks respect their own abort signal, and cached profiles must match the live credentials.

Polling stops after 401/403 and while a request is in flight. Errors remain available to callers; the badge exposes a visible error and manual retry. Resource results are scoped by key and cleared when disabled.

Backend inspection: `GET /orders` remains behind `authenticate`. JWT signature, expiration and required claims are validated with the configured signing secret; this implementation does not configure issuer/audience claims. The order service scopes customers to their own orders, managers to managed stores, captains to their jobs/eligible pickup pool, and admins to their permitted global view. No backend implementation, authorization gate or database schema was modified.

2. Static assets and deployment

Both real PNGs exist in `public/`. Vite's former `base: './'` rewrote their links to relative paths in the built HTML, so nested routes resolved them under the wrong directory. The customer base is now `/`; Chromium fetched and decoded the built favicon as 32×32 and the apple icon as 180×180, both with HTTP 200.

The deployment workflow also packaged prebuilt output with only `{"version":3}`, omitting the theme's SPA rewrites and headers. Public production nested navigation returned 404. The packaging helper now carries these rules into Build Output routes, serving real files before the SPA fallback and retaining service-worker cache headers. Routing syntax was checked against [Vercel's Build Output configuration documentation](https://vercel.com/docs/build-output-api/configuration).

3. 503 findings and public probes

The old service worker intercepted Render API requests and converted rejected fetches into synthetic `503` responses with an `OFFLINE` body. It could also cache same-origin GET API responses. API requests now bypass the service worker altogether; normal offline static-asset fallback remains. A cache-version increment activates the new worker behavior after deployment.

Observed public responses:

| URL | Result |
| --- | --- |
| `https://samou-go.onrender.com/health` | 200; production API liveness |
| `https://samou-go.onrender.com/api/v1/stores?pageSize=1` | 200; database-backed catalogue |
| `https://samou-go.onrender.com/api/v1/orders?pageSize=50` without credentials | Expected 401 `UNAUTHORIZED` |
| `https://samou-go-customer.vercel.app/favicon-32.png` | 200 image/png |
| `https://samou-go-customer.vercel.app/apple-touch-icon.png` | 200 image/png |
| `https://samou-go-customer.vercel.app/orders/favicon-32.png` | 404 |
| `https://samou-go-customer.vercel.app/orders/test-order` | 404 |

No live 503 was reproduced. Backend code separately maps database initialization failures to `503 DATABASE_UNAVAILABLE`; that condition was not observed. The exact reported 503 URLs were not supplied, so individual Render, storage or CDN failures cannot be attributed or declared repaired. No sleeping-service or database-outage assumption was used as a diagnosis.

4. Validation

Commands executed:

```text
npm.cmd run build
npm.cmd run typecheck --workspace @samou-go/api-client
npm.cmd run typecheck
npm.cmd run build:all
npm.cmd run lint --workspace @samou-go/web-customer
npm.cmd test
npm.cmd test --workspace @samou-go/api-client
npm.cmd test --workspace @samou-go/api -- src/middleware/authenticate.test.ts src/config/cors.test.ts src/modules/orders/orders.service.test.ts src/middleware/error-handler.test.ts
node scripts/test-session-browser.mjs
node --test scripts/write-vercel-output-config.test.mjs
node scripts/write-vercel-output-config.mjs web-customer <temporary-output-path>
node_modules/.bin/eslint.cmd --config themes/web-customer/eslint.config.js packages/api-client/src/useAuth.ts packages/api-client/src/api.ts packages/api-client/src/accountVault.ts packages/api-client/src/sso.ts packages/api-client/src/useApi.ts themes/web-customer/src/hooks/useApi.ts themes/web-customer/src/components/BottomNav.tsx themes/web-customer/tests/session.browser.tsx
```

Typecheck passed across all workspaces. The production build includes the backend and all seven frontends; the source-only API client is compiled by its consumers. Tests passed: 99 domain tests, 18 client/service-worker tests, 62 relevant backend tests, four Chromium session scenarios, built PNG decoding checks, and one deployment routing regression test. Transport and browser session scenarios use controlled HTTP fixtures; they are not evidence of a successful login to the user's production account. The browser runner requires Chromium and a Node version with the global WebSocket API.

Targeted lint passed. Customer-wide lint still reports 23 pre-existing unrelated errors and 11 warnings, principally explicit `any`, conditional hooks and React refresh/dependency warnings. Builds retain large-chunk and mixed static/dynamic Framer Motion import warnings. Sandbox-denied test runs were rerun successfully with escalation. Git status/diff operations encounter the pre-existing corrupt index (`index file smaller than expected`); the index was not modified or repaired.

5. Files changed by this work

- `packages/api-client/src/api.ts`
- `packages/api-client/src/useAuth.ts`
- `packages/api-client/src/accountVault.ts`
- `packages/api-client/src/sso.ts`
- `packages/api-client/src/useApi.ts`
- `packages/api-client/package.json`
- `packages/api-client/vitest.config.ts`
- `packages/api-client/tests/session.test.ts`
- `packages/api-client/tests/service-worker.test.ts`
- `themes/web-customer/src/components/BottomNav.tsx`
- `themes/web-customer/src/hooks/useApi.ts`
- `themes/web-customer/vite.config.ts`
- `themes/web-customer/public/service-worker.js`
- `themes/web-customer/tests/session.browser.html`
- `themes/web-customer/tests/session.browser.tsx`
- `scripts/test-session-browser.mjs`
- `scripts/write-vercel-output-config.mjs`
- `scripts/write-vercel-output-config.test.mjs`
- `.github/workflows/deploy.yml`
- `package-lock.json`
- `docs/runtime-auth-investigation.md`

The preceding TypeScript task also changed the two canonical classes in `themes/web-customer/src/components/generated/SamouGoHome.tsx`. The originally reported malformed import and unsafe `cause` access were already corrected in the on-disk file before investigation; both real vault exports and the narrowing were verified. `ProductCataloguePanel.tsx` was left unchanged because converting fixed 220px to 13.75rem would not preserve width under non-default root font sizing.

Production verification still requires deploying these changes and observing an authorized session on the actual frontend origin. Public API health, local builds and fixture-based tests cannot establish that an existing production token is valid or identify unnamed historical 503 responses.

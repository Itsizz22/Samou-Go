# Account deletion and transactional notifications — 24 September 2026

## Release status
- Application changes: commit `1f7a44a`, deployed to the production API and packaged as iOS **1.0 (1021)**.
- Apple processed build 1021 successfully. Its TestFlight beta review submission is **WAITING_FOR_REVIEW**.
- Codemagic's post-processing initially stopped because export compliance was unset. The existing uploaded build was updated through the Apple API to declare no non-exempt encryption, and the beta review submission succeeded without another upload.
- `Info.plist` now includes the same encryption exemption setting for future builds. App transport uses platform HTTPS/TLS; no proprietary encryption is included.
- The App Store rejection response still needs the physical-device recording described below; submitting for TestFlight review does not resubmit the public App Store version.

## Account deletion
- Both native apps use the shared `/delete-account` screen.
- Customer: Account → Permanently delete account, or Settings → Permanently delete account.
- Store/captain: Account tools → Settings → Permanently delete account.
- Enter current password, acknowledge permanent deletion, submit, and see the completion screen.
- `DELETE /api/v1/auth/me` requires a live authenticated session, password verification and explicit confirmation. Rate limited.
- Deletes the user row, sessions, device tokens, favorites, GPS, custom requests, support tickets, chats, ratings, account-owned media and checkout response snapshots.
- Removes personal notes, addresses, coordinates and voice references from retained customer orders. Financial totals remain under a single disabled anonymous relation target, not the original user ID. No identity mapping is retained. Storefronts owned by a deleted manager close; personal contact details are cleared.
- Pending orders must first complete or be cancelled from the app. No support contact is required to complete deletion.
- A serializable transaction prevents partial database erasure. No schema migration is needed.
- User-owned upload requests check that their account still exists, including on API instances with older disk caches.
- Other devices lose authenticated access immediately. The deleting device clears the account vault, saved addresses and cart. Already downloaded files on other devices and existing backups are subject to their existing lifecycle, not instant remote deletion.

## Notifications
- Acceptance and each order state transition notify the customer on iOS and Android.
- APNs uses visible alert + sound, including Android data-only deliveries.
- Chat notifications use Android native rendering so the conversation gets a separate notification and correct recipient deep link. They remain audible APNs alerts on iOS.
- Tapping a conversation notification while the same order screen is open now selects/opens that conversation.
- Firebase initialization retries after transient initialization failures.
- Normal iOS notification sound respects silent mode and Focus. Provider acceptance does not prove physical-device receipt.

## Verification
- Real isolated SQLite deletion tests cover password rejection, rollback with active orders, customer/staff deletion, media cleanup, session deletion and retained financial totals.
- Payload tests cover all six customer status transitions and chat notifications for both mobile platforms.
- Chat tests cover all participant roles, idempotency and recipient authorization.
- Native notification tests cover status/chat navigation on both platforms.
- Typecheck, Vite release build and iOS release guard tests are required before upload.

## Apple review recording (required separately)
Apple requested a recording from a physical device. A browser capture or simulator recording does not satisfy that request.
1. Install the new TestFlight build (not 1.0 build 1020).
2. Start iPhone/iPad screen recording.
3. Sign in with a disposable demo account with no active orders.
4. Open Account → Settings → Permanently delete account.
5. Enter its password, tick confirmation, delete, and show the success screen.
6. Attach the recording/link in App Review Information → Notes and the rejection response.
Do not delete the review login that Apple still needs; provide a separate disposable account for the demonstration.

Suggested review response (attach real recording before sending):
We added self-service permanent account deletion on iOS and Android. It is available under Account > Settings > Permanently delete account (also directly on the customer profile). Users confirm their password and deletion in-app without contacting support. Account credentials, sessions and associated personal data are deleted; only de-identified financial transaction records remain. The attached physical-device recording demonstrates sign-in, navigation, confirmation and completion.

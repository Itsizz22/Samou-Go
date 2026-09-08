# iPhone push setup and QA

Status: source/configuration implemented on Windows. Native Xcode compilation,
Simulator execution and physical APNs/FCM delivery have NOT been run here.
Web typecheck/build and mocked notification payload/action tests are separate checks.

## Configure on macOS
1. Install dependencies from the monorepo root (`npm install`).
2. Register Firebase iOS app `com.samougo.customer` in Firebase project `samou-go`.
3. Place its real GoogleService-Info.plist in `ios/App/App/Firebase/` (ignored by git).
   The folder is bundled by Xcode. No fabricated Firebase identifiers are supplied.
4. Upload an APNs authentication key in Firebase Messaging settings for this iOS app.
5. Run `npm run cap:build:ios --workspace @samou-go/web-customer`.
6. Run `npm run cap:open:ios --workspace @samou-go/web-customer` on the Mac.
7. Select your Apple developer team, enable Push Notifications, and use valid signing.
   The checked-in development entitlement is for debug; verify the signed distribution
   archive uses the production APNs environment when exporting for TestFlight.
8. Resolve FirebaseMessaging SPM dependencies in Xcode. Build/run on an iPhone.

No background audio, critical-alert entitlement or forced lock-screen activity is used.
iOS owns sound and banner presentation. Foreground pushes and notification taps show
the Arabic in-app alert for signed-in store managers/captains/admins. Customer updates
keep their existing tracking route. Dismissal does not accept/reject an order.

## Simulator UI smoke test (does NOT prove FCM delivery)
From the web-customer directory, after installing/running the app and logging into a
local/test staff account:

    xcrun simctl push booted com.samougo.customer ios/qa/new-order.apns

Repeat with app foreground, background and terminated. Check Arabic banner, sound,
View and Dismiss actions, safe areas, large text, and in-app details screen. Fixture
order ID is synthetic: it cannot prove a real order's details/acceptance API works.

## Physical phone acceptance matrix
- Register/login with a dedicated QA manager; allow notifications. Verify server saves
  the FCM token as platform ios (never the raw APNs hex token).
- Send a QA order push from the backend in foreground/background/terminated states.
  Confirm the actual iPhone receives title, body and sound in all supported states.
- Tap View: app opens Arabic summary; View Details navigates to staff order flow.
- Dismiss/clear notification: no order navigation or order acceptance API call.
- Deny notification permission: app still browses, no repeated prompt loop; re-enable
  in Settings and resume, verifying registration is synchronized again.
- Switch accounts/logout: verify device token ownership and logout detachment.
- Test Focus/silent mode using ordinary-notification expectations (no bypass promised).
- Validate a real order end-to-end on staging, then TestFlight on a physical iPhone.

Android must remain data-only for staff alerts while APNs includes an explicit alert.

# iOS incoming orders and layout verification

Changes:
- App WebView top and horizontal edges follow UIKit safeAreaLayoutGuide. The bottom remains full height so existing CSS handles the home indicator.
- Editable controls have a 16px minimum independent of pointer and Apple-specific CSS feature detection. User pinch zoom is not disabled in the viewport meta tag.
- Incoming-order dialog matches the Android brand/layout and scrolls on small/landscape screens.
- Explicit SAMOU_VIEW_ORDER action opens /orders/:orderId directly. That route renders StaffOrderDetailsScreen for STORE_MANAGER/CAPTAIN. Default notification taps show the incoming dialog first.
- NEW_ORDER, NEW_ORDER_ALERT and CAPTAIN_ASSIGN use bundled order_alarm.wav: 20 seconds, mono 44.1kHz PCM, derived from the Android ringtone. Other notifications retain default sound. No critical-alert or mute bypass.

Limits:
- iOS lock-screen notifications use system UI. The custom dialog appears inside the app.
- The ringtone is finite; it is not an indefinitely looping Android alarm service.
- Existing TestFlight builds lack the audio resource and native layout changes. Both a new iOS build and updated API are required. Older builds fall back to the system sound.
- Windows WebKit tests cannot prove UIKit, physical keyboard, mute/Focus or lock-screen behavior.

Verified locally:
- Customer TypeScript/Vite build, API typecheck.
- Push payload and notification listener tests.
- iOS release/signing unit tests.
- WebKit: input minimum size and focus scale; dialog at 320x568, 390x844, 844x390.

Before release on a physical iPhone:
1. Test store and captain separately with a real test order, screen locked, sound enabled.
2. Confirm ringtone and lock-screen action open that order under the correct staff role.
3. Test silent mode, where no sound should bypass system settings.
4. Focus home search, type and dismiss keyboard; check header, overlays and rotation.
5. Confirm closing the alert does not accept/reject an order.

Primary references:
- https://developer.apple.com/documentation/uikit/uiview/safearealayoutguide
- https://webkit.org/blog/7929/designing-websites-for-iphone-x/
- https://bugs.webkit.org/show_bug.cgi?id=129632
- https://capacitorjs.com/docs/config
- https://developer.apple.com/documentation/usernotifications/unnotificationsound

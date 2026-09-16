# Field acceptance matrix — current local-launch sweep

Device names, order IDs and timestamps are deliberately blank until observed. No credentials, FCM tokens or delivery codes belong here. Record exact app version/commit. User confirmed Android/iPhone availability and successful store logout notification stop during the 2026-09-16 conversation; this is user-reported evidence for the previous release, not a retest of the new account-switch fix.

| Scenario | Expected | Actual | Status | Order ID | Device/version | Timestamp | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Standard delivery | Customer → store accept/prepare/ready → assigned captain pickup → customer delivery; consistent fee/history | Pending | NOT TESTED | — | — | — | Real consenting trial |
| Customer pickup | Store completes collection; zero delivery fee, no captain/on-way/tracking | Pending | NOT TESTED | — | — | — | Record store completion response |
| Cancellation | Allowed actor/stage only; terminal state and settlement consistent | Pending | NOT TESTED | — | — | — | Isolated automation passed |
| Substitution accepted | Customer approves; server total and order items agree | Pending | NOT TESTED | — | — | — | Never approve for real customer without consent |
| Substitution rejected | Correct rejection path; no stale items/charge | Pending | NOT TESTED | — | — | — | Record final status |
| Offline/reconnect | Recover pending action; no false success or duplicate order | Pending | NOT TESTED | — | — | — | Device network only; do not stop production |
| Logout isolation | NEW event after acknowledged logout does not reach logged-out device | User said yes | PASS user-reported / new build retest pending | — | Not supplied | 2026-09-16 report | Distinguish previously queued messages |
| Account switching | A stops before B visible, even if B FCM registration fails; switching back works | Pending | NOT TESTED | — | — | — | Updated APK/PWA required |
| Multi-device session | Logout/switch device 1 leaves device 2 receiving | Pending | NOT TESTED | — | — | — | Two physical devices |
| Captain background GPS | Fresh valid server samples while background/locked and after reconnect | Pending | NOT TESTED | — | — | — | Passenger/operator observes |
| Firebase receipt | Customer statuses; store new/cancel/change; captain offer/expiry/assignment | Pending | NOT TESTED | — | — | — | Foreground/background/locked separately |
| Notification deep link | Correct account/order; unauthorized account cannot see content | Pending | NOT TESTED | — | — | — | Android and iPhone PWA separately |
| Store location | Saved actual entrance, correct marker and directions | Pending | NOT TESTED | — | — | — | Ten stores missing coordinates |
| Customer snapshot | A remains A after profile address changes to B | Pending | NOT TESTED | — | — | — | Automated immutable snapshot passed |
| No captain available | Honest waiting status; no invented assignment/ETA | Pending | NOT TESTED | — | — | — | Coordinate pilot fleet; no blanket production disable |
| Offer expiry | Expired offer cannot win; next eligible captain receives current offer | Pending | NOT TESTED | — | — | — | Correlate server and handset times |

Also record operator alert receipt/acknowledgement, small-phone RTL/keyboard/safe-area checks, Android video first frame, and iOS TestFlight runtime separately. No ringtone parity requirement for iPhone PWA.

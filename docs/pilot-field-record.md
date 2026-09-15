# Controlled delivery field record

Copy this record for each trial. Do not replace NOT TESTED with PASS based on compilation, HTTP provider acceptance or simulated GPS.

Trial id: ____ | Date/time zone: ____ | Operator: ____ | Order id: ____
Customer device/OS/app version: ____ | Captain Android device/OS/app version: ____ | Store operator: ____
Consent confirmed: ____ | Physical start/end: ____ | Dispatch availability coordinated: ____

| # | Actor | Action | Expected evidence | Status | Observed time / evidence / failure / retest |
|---|---|---|---|---|---|
| 1 | Customer | Login | Authenticated customer; correct role | NOT TESTED | — |
| 2 | Customer | Confirm Mapbox loads | Tiles and controls visible | NOT TESTED | — |
| 3 | Customer | Select exact location | Customer confirms actual point | NOT TESTED | — |
| 4 | Customer | Verify snapshot preview | Coordinates and landmark agree with customer | NOT TESTED | — |
| 5 | Customer | Select approved real store | Correct store id and availability | NOT TESTED | — |
| 6 | Customer | Add products/options | Selections and quantities correct | NOT TESTED | — |
| 7 | Customer | Checkout | No lost or duplicate lines | NOT TESTED | — |
| 8 | Customer | Verify server total | Price and delivery fee match server | NOT TESTED | — |
| 9 | Customer | Place one order | Record id/time; no duplicate submission | NOT TESTED | — |
| 10 | Store | Receive order | Correct store/lines/options/notes | NOT TESTED | — |
| 11 | Store | Accept | Status and timestamp recorded | NOT TESTED | — |
| 12 | Store | Preparing | Status recorded | NOT TESTED | — |
| 13 | Store | Ready | Status recorded; handoff handled privately | NOT TESTED | — |
| 14 | Captain | Receive Firebase offer | Physically observe phone; correlate send log | NOT TESTED | — |
| 15 | Captain | Accept | Exclusive owner; capacity remains <=3 | NOT TESTED | — |
| 16 | Captain | Verify GPS | Fresh timestamp and suitable accuracy | NOT TESTED | — |
| 17 | Captain | Route to store | Store destination; real road distance/duration | NOT TESTED | — |
| 18 | Captain | Reach store | Physical arrival, not simulated coordinates | NOT TESTED | — |
| 19 | Captain | Pickup | Authorized handoff; record time without PIN | NOT TESTED | — |
| 20 | Captain | Route to customer | Destination equals immutable order snapshot | NOT TESTED | — |
| 21 | Captain | Background / lock phone | Record exact start/end times; drive safely | NOT TESTED | — |
| 22 | Captain | Move toward customer | Passenger/operator observes; driver does not use phone while moving | NOT TESTED | — |
| 23 | Operator | Observe server GPS | Fresh accepted samples during locked interval | NOT TESTED | — |
| 24 | Captain | Deliver | Correct protected completion; no codes in report | NOT TESTED | — |
| 25 | Customer | Observe status notifications | Actual foreground/background receipt and timestamps | NOT TESTED | — |
| 26 | Customer | Observe Mapbox movement | Real movement, no stale position labeled live | NOT TESTED | — |
| 27 | Customer | Observe distance/ETA | Matches OSRM values; no invented ETA | NOT TESTED | — |
| 28 | Customer | Observe delivered state | Completion consistent across three roles | NOT TESTED | — |

## Android GPS matrix

| State | Start/end timestamp | Last server update / age / accuracy | Result | Evidence / fix / retest |
|---|---|---|---|---|
| Foreground | — | — | NOT TESTED | — |
| Background | — | — | NOT TESTED | — |
| Locked screen | — | — | NOT TESTED | — |
| Switch apps | — | — | NOT TESTED | — |
| Wi-Fi → mobile | — | — | NOT TESTED | — |
| Mobile → Wi-Fi | — | — | NOT TESTED | — |
| Network loss | — | — | NOT TESTED | — |
| Network recovery | — | — | NOT TESTED | — |
| GPS unavailable | — | — | NOT TESTED | — |
| Permission denied | — | — | NOT TESTED | — |
| Battery saver | — | — | NOT TESTED | — |
| Device idle | — | — | NOT TESTED | — |
| Process restart | — | — | NOT TESTED | — |
| Phone reboot | — | — | NOT TESTED | — |

## Firebase physical matrix

Repeat for each customer event (accepted/preparing/ready/assigned/pickup/on-way/delivered/cancelled/substitution), captain offer/expiry/assignment change, and store new-order/substitution response/cancellation.

| Recipient / event / order | Device / platform | App state | Provider result/time | Physical receipt/time | Tap destination | Result |
|---|---|---|---|---|---|---|
| — | — | foreground/background/terminated/locked/restarted | — | — | — | NOT TESTED |

A provider-accepted or opened timestamp is not physical receipt proof. Compare handset observation, protected route refetch, recipient and device counts. Never put tokens, OTPs or handoff/delivery codes in evidence.

## Pickup gate

Run a separate consenting pickup order: correct total; no captain/offer; no delivery timeline or captain GPS; actual store directions; actual collection; consistent final status. All NOT TESTED until observed.

## Edge gate

Only AFTER the standard delivery passes: cancellation; substitution accept/reject; no captain; captain rejection; offer expiry; connection loss/recovery; duplicate submit attempt; OSRM timeout; denied location; stale captain GPS; multi-store. Simulate transport failures on the pilot device or isolated environment, never stop production OSRM/API or disable unrelated drivers. Record expected/actual/status/evidence/fix/retest for each.

## iPhone gate

Only after Android delivery acceptance: Safari and Home Screen PWA separately; Mapbox, foreground GPS, addresses, checkout, tracking, supported push, notch/safe area, keyboard, text scaling, RTL and offline/reconnect. Do not rely on PWA background GPS. Native iOS requires a separate signed build and device test.

# Captain pools and customer navigation

- Existing many-to-many assignments allow multiple captains per store and multiple stores per captain.
- General means no assigned stores. General captains receive only stores with no dedicated captains; offline dedicated captains do not automatically make their store public.
- Admin can edit blocked stores on an existing captain. Exclusions take priority over assignments for new pool visibility, reservation, claim and manual assignment; eligible broadcast recipients exclude blocked captains. Existing assigned jobs remain accessible for completion.
- New relation migration: 20260910000200_captain_store_exclusions. Apply PostgreSQL migration before deploying API queries that include blockedStores. No production migration was run in this task.
- Customer notification preferences moved into settings; settings entry is more prominent. Bottom navigation now includes cart and quantity badge. Native content consumes system-bar and cutout insets to keep WebView content outside phone bars.

Verification: all-workspace typecheck, customer/admin builds, 31 order lifecycle integration tests, Android compileDebugJavaWithJavac. Physical-device inset appearance still needs checking after installing the new APK. No commit, push, production migration or device installation performed.

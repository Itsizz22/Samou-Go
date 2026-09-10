# Android launch preparation — 2026-09-11

## Release
- Android package: `com.samougo.customer`, versionName 1.0.26, versionCode 27.
- Desktop APK and AAB produced using the existing release signing key.
- UI fixes: staff support access, support fallback, responsive manager summary, usable appearance/ringtone controls, settings opening from the top.
- Public routes: `/privacy`, `/terms`, `/delete-account`. Settings and registration link to policy information.
- Account deletion is a support request, not automatic deletion. Authenticated submission requires explicit checkbox confirmation and creates an ACCOUNT_DELETION ticket. Guests can contact the configured support WhatsApp without installing the app. Operations must process requests, verify identity, explain retention and confirm completion.

## Evidence
- API: 388 tests pass. Shared domain: 122 tests pass.
- Prior UI audit: 54 viewport/route combinations without horizontal overflow or JavaScript failures.
- Public legal pages checked without sign-in at mobile width. Confirmed deletion-request confirmation gate and actual local support-ticket creation (no production deletion request).
- Production readiness and all seven frontend entry pages: HTTP 200.
- Backup: PostgreSQL 18 custom-format public-schema dump kept outside repository in the Windows user's restricted `.samou-quick-backups` directory. Contains uploads stored in database; external object storage must be backed up independently if enabled.
- Restore drill succeeded on isolated localhost PostgreSQL: 36 tables, 18 users, 5 stores, 30 orders, 83 products. Drill server stopped. Production unchanged.
- Backup is a local snapshot, not automated off-device disaster recovery. Signing key/password portability and off-device backup must be arranged by the owner.

## Explicitly deferred / remaining
- Preserve ALL current data for the iOS test, per owner instruction. Do not run demo cleanup.
- SMS provider HTTP remains explicitly accepted by owner temporarily. Do not claim all data transport encrypted in Play Data safety.
- Final real OTP signup requires a second owner-controlled number; full three-role lock-screen notification and completed delivery drill not repeated in this release.
- Ongoing uptime alerts/backup scheduling require an operational destination and retention policy; read-only health probe exists.
- Google Play Console declarations and production-access eligibility are not verified by source tests. Do not claim store approval.

## Play Console checklist for owner
- Upload release AAB to internal/closed testing before production.
- Privacy URL: https://samou-go-customer.vercel.app/privacy
- Deletion URL: https://samou-go-customer.vercel.app/delete-account
- Declare actual personal data collection, location, photos, device notification tokens, sharing with fulfilment parties/providers, deletion process and transport accurately. Review current Play Console questions rather than guessing answers.
- Prepare listing screenshots, description, icon, content rating, target audience, app access instructions and any permission declarations requested by Console.
- New personal accounts may require at least 12 continuously opted-in closed testers for 14 days before applying for production access; verify the account's Console requirement.
- Official references: https://support.google.com/googleplay/android-developer/answer/14151465 and https://support.google.com/googleplay/android-developer/answer/13327111

# Launch preparation — 2026-09-10

## Implemented
- Admin notification log includes operational status: 24-hour unsuccessful/partial/no-device/disabled/expired attempts, pending attempts older than five minutes, scheduler health, and bounded server error codes. API is ADMIN-only; no request bodies, credentials or URLs are stored in this counter.
- Error counter is process-local, capped at 100, filtered to one hour and resets at restart. This is not durable centralized error collection.
- Public /ready probes the database, returns 503 on timeout/failure and coalesces concurrent calls; /health remains a liveness probe. An external checker should use /ready.
- scripts/check-production-health.mjs checks /ready and seven web entry pages, exits nonzero on failure. Prepared only: no external alert destination, paid subscription or recurring monitor was activated.
- Release signing and versioning configured; scripts/build-android-release.ps1 builds APK and AAB using JDK 21. Defaults: versionCode 2, versionName 1.0.1. Increase VersionCode on every distributed update. Refresh web assets with cap:build before running the release script.

## Android artifacts
Desktop: Samou Quick Release.apk and Samou Quick Release.aab.
APK SHA256: 120320C6F5CDEBB3C55E3D8BC516E5826EAC703F3AD96812A0B9FA39AC19A071
Certificate SHA256: 9add26d115c4a175ef4adfff4daf80ae5ba014f8b36a284948315bdf7e2eff1a
Signature verified; manifest is not debuggable. Release not installed over the phone's differently signed debug app. No user data erased. Release runtime on a device remains to be tested.

Signing key: outside repo in C:/Users/Admin/.samou-quick-signing/release.jks. Password is protected with Windows DPAPI in the same directory. This DPAPI file is tied to this Windows account and is NOT a portable password backup for Mac/reinstallation. Arrange an independent encrypted key/password backup before public distribution. Never commit it. Register this release certificate's fingerprints with any provider that requires Android certificate binding before enabling phone authentication.

## Validation
Full typecheck and all-workspace build passed. API suite: 318 tests passed, including isolated real-SQLite HTTP order lifecycle (creation to delivered PIN and exactly-once settlement), 64-way reservation contention, ownership gates, reminders, cancellation, and operations authorization. Two additional readiness failure/timeout tests passed. No real FCM messages or production orders were created in this run. Existing lifecycle tests mock FCM, so they do not prove sound or lock-screen behavior.
Admin operational warning panel visually checked at 360px with isolated sample responses; no horizontal overflow. Screenshot is a preview, not production failure counts.

## Rollout status
Changes prepared locally; not committed or deployed in this task. Production /ready and /admin/operations will exist only after deploying these changes. OTP, demo-data cleanup, iOS runtime, permanent uptime alert service and backup restore drill remain pending.

# Raqib review and remediation — 2026-09-10

Source: raqib-github-com-2026-09-09.pdf, 20 pages. The 87 findings are grouped into 30 numbered entries in the PDF. This ledger covers all 30 groups; a static score is not proof of exploitability or a penetration test.

| PDF entries | Disposition |
| --- | --- |
| 1, 28 Firebase client key | Public client configuration by design. Retained to preserve authentication. Added explicit documentation. Google Cloud API restrictions must limit the key to intended Firebase APIs; their live configuration is not verified by repository changes. Never use this key for unrelated billable APIs. |
| 2, 5–8, 14–18 dependencies | Updated lockfile within supported ranges. Removed unused @capacitor/assets (existing icon generator remains); this removes legacy sharp, tar and xcode tool chains. Explicit uuid 11.1.1 and qs 6.16.0 overrides close remaining transitive advisories. npm audit now reports zero vulnerabilities, including dev dependencies. |
| 3 GitHub token permissions | Both CI and deployment now explicitly grant contents: read. |
| 4 mutable actions | Pinned checkout and setup-node to the full commit IDs resolved from their official v4 tags. |
| 9 Android backup | Disabled allowBackup, excluded private data from both legacy backups and Android 12+ cloud/device transfers. |
| 10 location permission | Removed fine/coarse permissions from merged Android manifest while the live GPS feature is disabled. Re-enabling GPS will require deliberately restoring native permissions. |
| 11 exported activity | MainActivity is the Android launcher entry and must stay exported. OrderAlertActivity, alarm service, receiver and FCM service are non-exported. Export status alone does not demonstrate unauthorized access; order API authorization remains mandatory. |
| 12 node:test | Built-in Node.js test runner, not a missing npm dependency. No removal needed. |
| 13 shell templates | Vercel project IDs are trusted administrator secrets, not PR titles. Nevertheless moved all seven project IDs to env bindings instead of injecting them into shell source. |
| 19 historical generic secrets | 1,566 .browser-audit-profile files existed in old history, including browser storage. Absent from current checkout and already ignored. User authorized removing this directory from every published branch/tag after a verified external local bundle backup. No values were printed. The unrelated favorites.ts finding is a local-storage identifier, not a service credential. |
| 20–22 LGPL dependencies | sharp/libvips are used by the backend, not bundled into browser/APK JavaScript. Retain upstream licenses and attribution; LGPL is not an automatic requirement to disclose the entire proprietary application. See THIRD_PARTY_NOTICES.md. |
| 23 camera | Added iOS purpose string for user-initiated photo attachments. |
| 24 location purpose | GPS is disabled; do not add or request unused location capability. Required before any future GPS release. |
| 25 microphone | Added iOS purpose string for the checkout voice-note recorder. |
| 26 contacts purpose | No contacts feature/plugin is used; do not request contacts access or add a misleading purpose string. |
| 27 photo library | Added iOS purpose string for user-selected photo attachments. |
| 29 fixture secrets | Reviewed named test files: deliberately fake, test-only signing secrets in mocked configuration. No production credential rotation required for these literals. |
| 30 recipients | See data-recipient register below. Importing Twilio is not proof that messages are sent through it. Legal agreements and controller approvals cannot be manufactured by a code patch. |

## Data recipients and configuration-dependent use

- Render: API hosting, request processing and operational logs.
- Neon: PostgreSQL application records (accounts, addresses, orders).
- Vercel: web delivery and associated request metadata.
- Firebase/Google: configured authentication and push tokens/payloads; verify API restrictions and authentication settings in the provider console.
- Twilio / generic SMS provider: only when the selected SMS_PROVIDER and credentials enable that adapter. Supercode was discussed, but its API integration/production contract is not established by this patch.

The operator must confirm actual enabled vendors, retention, privacy notice and applicable agreements. The report cites Egyptian law; applicability to this Palestinian service is not established here.

## Remaining external checks

- Revoke any still-active browser sessions or real credentials exposed in historical browser data. History removal cannot invalidate tokens or delete third-party clones/caches. No live credential was verified from the generic-pattern findings.
- GitHub cached commit/PR views may require a support removal request after rewriting refs. Do not claim every copy on the internet is erased.
- Confirm Firebase key restrictions in Google Cloud. Public visibility alone is not evidence of compromise.
- iOS strings are prepared, but Xcode/device verification requires the Mac/iOS environment.
- Re-run Raqib against the new cleaned revision. Its original saved PDF/score will not change automatically.

## Validation

npm audit: 0 findings; API tests: 316 passed; shared domain tests: 118 passed. Android assembleDebug passed. Full web build and typecheck are recorded in artifacts/raqib-*.log. Test fixture SQL generation now uses Prisma --output so CLI status messages cannot be executed as SQL after the Prisma security update.

## Primary references

- https://firebase.google.com/docs/projects/api-keys
- https://nodejs.org/api/test.html
- https://developer.android.com/guide/topics/manifest/activity-element
- https://developer.android.com/identity/data/autobackup
- https://www.gnu.org/licenses/lgpl.html

# Samou Quick: Codemagic iOS workflows

Updated 2026-09-21. Workflow `ios-release` creates a signed App Store IPA and retains the archive and logs. It does not publish, fetch signing assets from Apple, create certificates/profiles, or call App Store Connect for version numbers. The user starts the cloud build.

## Project inspection

| Item | Verified repository value |
| --- | --- |
| Package manager | npm; root `package-lock.json`, npm workspaces |
| Frontend | `themes/web-customer`, React + TypeScript + Vite |
| Web build | `npm run build --workspace @samou-go/shared-types`, then `npm run cap:build:ios --workspace @samou-go/web-customer` |
| Build wrapper | Builds shared UI, runs `tsc -b && vite build`, then `cap:sync:ios` |
| Capacitor sync | Prepares the existing SPM compatibility patch, runs `cap sync ios`, normalizes Swift paths |
| Capacitor | 8; Node 22 and Xcode 26.6 in CI |
| iOS project | `themes/web-customer/ios/App/App.xcodeproj` |
| Shared scheme | `App`, from `App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` |
| Target | `App`, native target ID `504EC3031FED79650016851F` |
| Archive configuration | Release |
| Workspace | No standalone `.xcworkspace`; the nested `App.xcodeproj/project.xcworkspace` is internal Xcode metadata |
| Native dependencies | Swift Package Manager, including FirebaseMessaging; no Podfile, no `pod install` required |
| Bundle ID | `com.samougo.customer` in Capacitor and both Xcode configurations |
| Apple owner | Qais Amro; numeric TeamIdentifier is read and validated from the selected profile on the runner |
| Marketing version | Existing Xcode `1.0` preserved; build number is incremented separately |

Do not add `pod install` or use an assumed `App.xcworkspace`. A guard stops the workflow if a Podfile is introduced, requiring the native build configuration to be reviewed rather than silently ignoring Pods.

## Codemagic manual settings

1. Use the Codemagic team containing the uploaded signing assets and give this application access to them.
2. Select repository `codemagic.yaml` configuration. Use the branch containing this change.
3. Under Code signing identities, the selected **Reference names** must be exactly:
   - certificate: `samou-quick-app-store-distribution` (Apple Distribution, with private key)
   - profile: `samou-quick-app-store-profile` (App Store, explicit bundle `com.samougo.customer`, Qais Amro, matching certificate)
4. These are reference names, not merely certificate subject/profile display names. User reports duplicate entries and validity until 2027-09-21. Those live assets have not been independently inspected in this session. Ensure only the intended copy has each exact reference; rename the unused duplicate reference if necessary. Do not revoke any certificate. If only display names are duplicated but references differ, no cleanup is required. YAML lists one certificate and one profile only. Identical certificate duplicates are deduplicated by fingerprint; different matching identities cause an explicit error rather than an arbitrary choice.
5. Create/restore environment group `ios_credentials`, shared with this application, containing:
   - `FIREBASE_IOS_PLIST_BASE64`: secure base64 of the **iOS** `GoogleService-Info.plist` for the existing Firebase app below. Android `google-services.json` cannot replace it.
   - `VITE_MAPBOX_ACCESS_TOKEN`: the existing public production `pk.` token. Never put a Mapbox secret `sk.` token into Vite.
6. For the build-only `ios-release` workflow, no App Store Connect integration, API key, `APP_STORE_APPLE_ID`, manual `APPLE_TEAM_ID`, or certificate password in YAML is needed. Certificate passwords remain in Codemagic's uploaded identity storage. Codemagic exports `SAMOU_IOS_PROFILE_PATH` automatically; preflight exports the validated team and identity via `CM_ENV`.
7. Check `IOS_BUILD_NUMBER_BASE: "1000"` before the first build: base + `PROJECT_BUILD_NUMBER` + 1 must exceed the last uploaded build. Increase the base if needed. Do not lower it, reset the project counter, or use a different Codemagic app without reviewing numbering. CI stops above 9999. No Apple API is consulted.

`environment.ios_signing` automatically initializes the keychain and imports the explicitly referenced uploaded signing files. Running `keychain initialize` again would be redundant. `xcode-project use-profiles` then applies only the selected profile, and the verified certificate fingerprint is pinned for archive/export. Hardcoded legacy Team ID and inherited `iPhone Developer` identities were removed from Xcode. Local Xcode users must select their development team locally.

## Build steps and outputs

1. `npm ci` and release guard tests; fail if the root lockfile changes.
2. Validate production inputs and securely install Firebase plist.
3. Build shared types, shared UI and Vite, then sync the existing Capacitor iOS project.
4. Resolve Swift packages against the real App project/scheme.
5. Decode the selected profile; validate owner/team, exact bundle, App Store type, expiration, production APNs, Release entitlements and one matching certificate/private-key identity. Derive Team ID from that profile.
6. Validate source resources/Capacitor/scheme, apply uploaded signing, verify export options and set CI build number in Debug and Release.
7. Archive Release for device and export IPA using Codemagic `xcode-project build-ipa`. Export destination is explicitly `export`; export does not alter build number.
8. Verify code signature, embedded profile UUID, exact bundle/team, CI build number, production APNs, Firebase plist location/content and bundled notification ringtone.

Artifacts:

- `build/ios/ipa/*.ipa`
- `build/ios/xcarchive/*.xcarchive`
- `build/ios/xcarchive/**/*.dSYM`
- `build/ios/logs/*.log`
- `/tmp/xcodebuild_logs/*.log`

Start: Codemagic application -> **Start new build** -> branch with this YAML -> **Samou Quick iOS Release (`ios-release`)** -> Start. Download the artifacts after all steps pass. This release workflow has no automatic triggers or publishing block. An App Store IPA is not an ad hoc installation package; later TestFlight/App Store upload is a separate step.

The geolocation 1.2.26 SPM compatibility repair is retained. Swift resolution uses the existing version constraints, including Firebase 12.x; a verified `Package.resolved` is not yet committed. Archive compilation must still run on the cloud Mac.

## Firebase checks and remaining device test

Expected Firebase project: `samou-go` (sender `949776098795`). Existing iOS Firebase app: `1:949776098795:ios:a083362604fa1db9a2a5ae`, bundle `com.samougo.customer`.

The supplied local iOS plist was validated against these IDs and Cloud Messaging is enabled. The runner refuses a wrong/missing plist. It must remain at `App/Firebase/GoogleService-Info.plist`, included exactly once as an Xcode folder resource; AppDelegate explicitly loads that location. Manual Firebase registration maps APNs device token to FCM registration token; Firebase delegate swizzling is disabled. Production APNs is required both in the selected profile and the signed IPA. None of the plist/private signing files is committed.

For real delivery, Firebase -> Project settings -> Cloud Messaging -> the iOS app must have a valid APNs production authentication key/certificate for the same Apple team. This APNs key is separate from the App Store Connect API key; disabling publishing does not disable FCM. The backend must use the same Firebase project and the logged-in account's current FCM token/session.

Live Firebase console verification was blocked: the browser's signed-in account reported that the project does not exist or the account lacks access. This does not establish that the project was deleted. No keys or Firebase settings were changed. APNs credentials and production delivery therefore remain unverified until access/device testing is available.

After installing the cloud build through TestFlight: log into a test store/captain, grant notifications, lock the phone and send one test order; verify notification, sound under normal sound settings and correct order details on tapping. Also test foreground, logout/login and the customer role. A successful archive or unit test does not prove delivery on a physical iPhone.

## Verification and errors

Passed locally: official Codemagic JSON schema validation; Bash syntax for every YAML script; 18 Python release/signing guard tests; 18 API push tests; 6 frontend notification tests; shared/UI/customer build; Capacitor iOS sync; source/resource/Firebase validation with a synthetic signing team on a temporary project copy. Vite's existing large-map-chunk warning remains non-blocking. The supplied Codemagic screenshots show successful release builds for commits `663ee98` and `3a5d08c`, including signed IPA and Firebase guard steps. These build-only runs did not upload to TestFlight.

Errors are explicit: missing/ambiguous reference must be corrected in Codemagic; wrong profile owner/bundle, expired identity, missing private key or production push capability require the correct already-uploaded matching pair. Missing environment values require restoring the group. The workflow never creates or revokes identities and never bypasses validation to produce an incorrectly signed app.

## Official references

- https://docs.codemagic.io/yaml-code-signing/signing-ios/
- https://github.com/codemagic-ci-cd/cli-tools/blob/master/docs/xcode-project/use-profiles.md
- https://github.com/codemagic-ci-cd/cli-tools/blob/master/docs/xcode-project/build-ipa.md
- https://codemagic.io/codemagic-schema.json
- https://capacitorjs.com/docs/updating/8-0

## Browser App Preview

Use **Start new build -> master -> Samou Quick iOS Preview (`ios-preview`)**.
This separate workflow builds the shared App scheme for the generic iOS Simulator
with Debug configuration and signing disabled. It uses the same Vite assets and
Firebase/Mapbox input group, without importing distribution identities or calling
App Store Connect. Swift packages resolve as part of xcodebuild.

After a successful build, click **Quick Launch** beside the simulator `App.app`
artifact. The existing App Store `App.ipa` cannot be used for this preview and old
build results will not gain a preview button. If Codemagic requires App Preview
activation for the team, enable it from the App Preview page after reviewing its
trial/billing terms. No paid feature is enabled automatically by this workflow.

Use this for layout, header, search focus and navigation checks. It is not proof
of production APNs delivery or locked-device notification behavior; those still
require the signed build on a physical iPhone. Preview uses the production API,
so use designated test accounts for actions that create orders.

Reference: https://docs.codemagic.io/yaml-distributing/app-preview/

## Upload the current build to TestFlight

The separate manual workflow **Samou Quick iOS TestFlight (`ios-testflight`)**
inherits every release build, signing, Firebase validation and artifact step via
a YAML anchor. It adds App Store Connect publishing using the existing integration
named exactly **Samou Quick**. The original `ios-release` and `ios-preview`
workflows remain available without publishing.

1. In this Codemagic team's integrations, ensure **Samou Quick** is accessible to
   this application and its App Store Connect API key has App Manager permission
   and access to the app with bundle `com.samougo.customer`. A green integration
   indicator alone does not prove that uploading is authorized.
2. Start new build -> **master** -> **Samou Quick iOS TestFlight** -> Start.
3. Confirm archive validation and **Publishing** both succeed. If publishing fails,
   inspect its log for authentication, app access, metadata or duplicate build
   errors. Do not create new distribution certificates to fix API authentication.
4. After Apple processes the upload, open App Store Connect -> the app ->
   TestFlight. Assign the new build to the intended tester group if necessary.
   External testers may require beta review. No beta group names are assumed.
5. Install the new build on the iPhone and check its version/build before testing
   safe areas, search zoom, notification sound and notification navigation.
   The supplied TestFlight screenshot showed **1.0 (10)**, whereas this pipeline
   retains version **1.0** and calculates a new build above 1000 from the project
   build counter. Rebuilding alone does not update the installed app.

`submit_to_testflight: true` enables the TestFlight submission; public App Store
submission is disabled with `submit_to_app_store: false`. No API secrets are added
to YAML or the repository. Upload success and device behavior still require the
actual cloud run and current-build device test.

Reference: https://docs.codemagic.io/yaml-publishing/app-store-connect/

## Diagnose publishing HTTP 401

Run **Samou Quick Apple Authentication Check** on master for a read-only check
without npm install, signing, an archive or upload. It uses the same integration
and ios_credentials group as TestFlight. The preflight compares the runner's
Issuer ID, Key ID and public-key fingerprint to the locally verified credentials,
then requests the expected app from Apple using a short-lived JWT. No private key
or JWT is logged or committed. TestFlight also runs this check before npm install.

A metadata or fingerprint mismatch isolates different runner credentials; inspect
integration settings and duplicate APP_STORE_CONNECT_* environment variables.
HTTP 401 with matching credentials requires inspecting runner time and Apple's
response. A pass followed by altool 401 isolates the remaining issue to the upload
path; it does not prove upload authorization or cure that failure. Keep the
Publishing log for that case. Intentional API key rotation requires updating the
expected public fingerprint and IDs in scripts/ios/asc-preflight.cjs.

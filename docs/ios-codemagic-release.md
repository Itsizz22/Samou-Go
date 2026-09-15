# Samou Quick: Codemagic iOS / TestFlight release

## Status and scope

Repository preparation is complete; no signed Xcode archive, IPA, TestFlight upload or physical iPhone validation has been performed. Windows can build web assets and sync Capacitor, but cannot run Xcode. Codemagic supplies the Mac. The workflow is manual and does not replace GitHub deployments, Android, Render, Vercel, migrations or backups.

## Discovered project

| Item | Value |
| --- | --- |
| Customer frontend | `themes/web-customer` (`@samou-go/web-customer`) |
| Capacitor configuration | `themes/web-customer/capacitor.config.ts` |
| Web output | `themes/web-customer/dist`, copied to `ios/App/App/public` |
| Xcode project | `themes/web-customer/ios/App/App.xcodeproj` |
| Target / shared scheme | `App` / `App` |
| Native dependency manager | Swift Package Manager; no standalone CocoaPods workspace |
| Firebase configuration | `themes/web-customer/ios/App/App/Firebase/GoogleService-Info.plist` |
| Bundle ID (Debug and Release) | `com.samougo.customer` |
| Apple team | `XY75ZT4PUS` |
| Firebase project / iOS app | `samou-go` / `1:949776098795:ios:a083362604fa1db9a2a5ae` |
| Workflow | root `codemagic.yaml`, `ios-testflight` |
| Runner | `mac_mini_m2`, Xcode **26.6**, macOS **26.5.1** image |
| Package manager / runtime | npm with root `package-lock.json`; Node **22** in Codemagic |
| Version | marketing version `1.0`; CI updates only iOS build number |

Node 22 matches the production deployment runtime; older existing GitHub CI uses Node 20 and is not changed. Local verification used Node 26.7.0. The Xcode image is pinned to a stable Codemagic image with an iOS 26 SDK, not a beta or an obsolete SDK.

The Firebase directory is an Xcode folder resource included exactly once in App's Resources phase. AppDelegate explicitly loads `Firebase/GoogleService-Info.plist`, so do not move it to the bundle root. The local supplied file matches the intended app. It remains ignored according to repository policy and is injected securely on each runner. Firebase initialization code and the existing APNs-to-FCM registration implementation are unchanged. Runtime initialization remains unverified.

Push Notifications and Background Modes are declared on the App target. Existing `remote-notification` and location background modes are retained. Debug uses `App.entitlements` (development APNs); Release uses `App.Release.entitlements` (production APNs). No new background behavior is introduced.

## One-time setup without a local Mac

1. Make this branch's changes available in GitHub, connect the repository to Codemagic, and choose repository YAML configuration.
2. Use an active Apple Developer membership for team `XY75ZT4PUS`. Verify the explicit App ID `com.samougo.customer` has Push Notifications enabled. Do not create a different bundle ID.
3. Create/verify the app record in App Store Connect for that bundle. Record its numeric Apple ID (not the bundle ID). Resolve outstanding agreements in Apple's portal.
4. In Codemagic team integrations, add App Store Connect integration named exactly **`samou-go-app-store-connect`** using an operator-provided Issuer ID, Key ID and `.p8` API key with sufficient app upload and signing access. Keep the private key out of Git and chat.
5. In Codemagic code signing identities, generate or upload an **Apple Distribution** certificate and private key for the team. Fetch or upload a matching **App Store** provisioning profile, created after Push Notifications was enabled. Automatic profile selection in YAML uses these managed identities; it does not magically create a missing distribution identity.
6. Add environment group **`samou_ios_release`**, enable access for this application, and set the variables below.
7. For native Firebase push, independently verify that Firebase's iOS Cloud Messaging settings have the correct APNs authentication key/team/key ID. An App Store Connect API key is not an APNs key. Do not overwrite existing working APNs credentials.

### Secure integration / variables

| Name | Source / purpose |
| --- | --- |
| `APP_STORE_CONNECT_ISSUER_ID` | Supplied through the named Codemagic Apple integration |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | Supplied through that integration |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Supplied securely through that integration |
| `APP_STORE_APPLE_ID` | Numeric app record ID, in `samou_ios_release` |
| `FIREBASE_IOS_PLIST_BASE64` | Base64 of the provided customer plist; mark secure |
| `VITE_MAPBOX_ACCESS_TOKEN` | Existing production public `pk.` token; never a Mapbox secret token |

The YAML supplies the fixed bundle ID, team and production API URL. Do not add `VITE_API_BASE_URL` overrides. The API URL remains `https://samou-go.onrender.com/api/v1`.

To copy the plist as one base64 value on Windows without printing it:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\Users\Admin\Downloads\GoogleService-Info.plist')) | Set-Clipboard
```

Paste into the secure Codemagic variable and clear the clipboard. The runner validates IDs before writing the file. Never add `.p8`, `.p12`, `.mobileprovision` or service account credentials to the repository.

## Build sequence

Run from repository root. YAML contains the complete commands, signing and export arguments.

```sh
python3 scripts/ios/release.py prepare
npm ci
npm run build --workspace @samou-go/shared-types
npm run cap:build:ios --workspace @samou-go/web-customer
python3 scripts/ios/release.py source
xcodebuild -resolvePackageDependencies -project themes/web-customer/ios/App/App.xcodeproj -scheme App
xcode-project use-profiles --project themes/web-customer/ios/App/App.xcodeproj --custom-export-options='{"teamID":"XY75ZT4PUS","method":"app-store-connect"}'
python3 scripts/ios/release.py signing
python3 scripts/ios/release.py version
xcode-project build-ipa --project themes/web-customer/ios/App/App.xcodeproj --scheme App --config Release --no-show-build-settings --archive-directory build/ios/xcarchive --ipa-directory build/ios/ipa --archive-xcargs "DEVELOPMENT_TEAM=XY75ZT4PUS"
python3 scripts/ios/release.py ipa
```

`cap:build:ios` builds shared UI, builds customer assets and runs `cap:sync:ios`. Sync runs the iOS-only dependency compatibility check, `cap sync ios`, and the existing Windows-path normalization script. The lockfile is checked for changes after `npm ci`.

The installed background-geolocation 1.2.26 npm package declares Capacitor 7 in its Swift manifest while this application uses Capacitor 8. `prepare-ios-spm.cjs` reproducibly adjusts only that package's iOS Swift requirement to 8. It checks the package version and expected input and fails on unfamiliar versions. This replaces a previously local-only modification. Actual native compilation still needs the first cloud build. Android and PWA configuration are untouched.

Swift dependencies use the existing project version constraints (including Firebase 12.x). Transitive Swift resolution is not yet frozen by a verified `Package.resolved`; retain and review the first successful cloud resolution before choosing to commit it. Do not claim bit-for-bit reproducibility before that validation.

## Versioning, signing and artifacts

The workflow reads the highest build number across App Store and TestFlight, then uses `max(latest + 1, PROJECT_BUILD_NUMBER + 1)`. A successful explicit no-builds response supports the first upload. Failed API calls and unexplained empty responses stop the workflow. Existing dotted build numbers or numbers beyond the guarded four-digit range require a reviewed versioning change. Marketing version and Android versioning are unchanged. Run releases serially and wait for Apple processing before starting another to avoid number collisions.

Codemagic installs managed signing assets; `use-profiles` applies them and generates `~/export_options.plist`. Checks require the intended team, bundle mapping and App Store export method. The Release archive is a signed device build, not a simulator.

Artifacts are retained under:

- `build/ios/ipa/*.ipa`
- `build/ios/xcarchive/*.xcarchive`
- `build/ios/xcarchive/**/*.dSYM`
- `build/ios/logs/*.log` and `/tmp/xcodebuild_logs/*.log`

The exported IPA is unpacked with macOS `ditto` to preserve executable modes/symlinks. The workflow verifies its code signature, bundle ID, exactly one matching Firebase plist, signing team, production APNs entitlement, disabled debugging, and App Store provisioning profile before publishing.

## Start a release / retrieve the result

In Codemagic choose the branch containing this configuration, select **Samou Quick iOS TestFlight**, and Start new build. There are no automatic triggers. Download the IPA, archive, dSYMs and logs from the build's Artifacts section. Publishing uses `auth: integration`, `submit_to_testflight: true`, `submit_to_app_store: false`. No public App Review submission or automatic external beta group distribution is configured. Apple processing/export compliance or beta review can still require operator action before testers can install.

## Diagnostics

- Missing Firebase: set the base64 variable using the supplied file; inspect the safe ID-mismatch message. Do not print the decoded file.
- Missing signing identity/profile: inspect Codemagic's identities; ensure Apple Distribution, correct team and exact bundle ID. Regenerate the App Store profile after enabling Push Notifications if necessary.
- Apple API access failure: check integration name, API role, numeric app ID and agreements; never bypass a failed lookup with zero.
- Swift resolution failure: inspect `spm.log`, confirm clean `npm ci` and sync completed, then review package compatibility. Do not remove Firebase or change platform identities to bypass it.
- Archive/export failure: download archive/export and Xcode logs. Missing credentials cannot be fixed by changing application code.
- Firebase/APNs runtime failure: check device logs for Firebase initialization, the bundled plist, signed push entitlement, Firebase APNs credentials and server token ownership. A successful archive proves none of the actual delivery paths.

## Validation performed and remaining gates

Local clean `npm ci`, customer/UI build, Capacitor iOS sync, source/resource checks, nine release-guard tests and Codemagic official JSON-schema validation passed. Vite reports an existing large-chunk warning. Local npm 26 reports blocked Prisma/Firebase install scripts; customer build and sync passed without relaxing repository policy. No existing GitHub workflow was modified; this is scope compatibility, not a newly executed full CI run.

Still required: configure Codemagic/Apple integration and secure values, managed certificate/profile, execute the first signed cloud archive/export/upload, confirm Firebase initializes on device, and install via TestFlight on a physical iPhone. Test notification permission/grant/deny, FCM registration, foreground/background/terminated delivery, tap routing, logout/token ownership, GPS/location permissions, network recovery and a complete test order. PWA push and native APNs are separate validation paths. No physical iOS push success is claimed.

## Official references

- https://docs.codemagic.io/yaml-code-signing/signing-ios/
- https://docs.codemagic.io/yaml-quick-start/building-a-native-ios-app/
- https://docs.codemagic.io/yaml-publishing/app-store-connect/
- https://docs.codemagic.io/specs-macos/xcode-26-6/
- https://developer.apple.com/news/?id=ueeok6yw

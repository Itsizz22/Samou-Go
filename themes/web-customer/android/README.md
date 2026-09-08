# Customer Android app

This directory contains custom notification services and Capacitor plugins, so
it must be preserved in version control rather than regenerated with `cap add`.
Run Android commands here, not in a repository-root `android` directory.

1. Install JDK 21 and an Android SDK; point `JAVA_HOME` to the JDK. Set the Java
   extension's `java.import.gradle.java.home` to that JDK when using VS Code.
2. Set `sdk.dir` in your local, ignored `local.properties`.
3. Put this app's Firebase Android configuration in `app/google-services.json`
   (ignored). Signing keys and machine-specific settings must remain local.
4. From the repository root run `npm install`, then
   `npm run cap:build --workspace @samou-go/web-customer`. This builds web assets
   and regenerates `capacitor.settings.gradle` and plugin dependencies.
5. From this directory run `./gradlew :app:assembleDebug` (`gradlew.bat` on
   Windows). The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

Set `VITE_API_URL` to your HTTPS API URL when building for a physical device.
If VS Code still references a deleted Java extension initialization script or
the obsolete root Android directory, run **Java: Clean Java Language Server
Workspace** and allow the editor to reload.

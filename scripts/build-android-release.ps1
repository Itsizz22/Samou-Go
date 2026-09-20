param([int]$VersionCode = 11, [string]$VersionName = '1.0.10', [string]$JdkHome = (Join-Path $env:USERPROFILE '.jdks/jbr-21.0.11'))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$firebaseFile = Join-Path $projectRoot 'themes/web-customer/android/app/google-services.json'
if (!(Test-Path -LiteralPath $firebaseFile)) { throw 'Missing Android Firebase configuration.' }
$firebaseConfig = Get-Content -LiteralPath $firebaseFile -Raw | ConvertFrom-Json
$firebaseClient = @($firebaseConfig.client | Where-Object { $_.client_info.android_client_info.package_name -eq 'com.samouquick.customer' })
if ($firebaseConfig.project_info.project_id -ne 'samou-go' -or $firebaseClient.Count -ne 1) { throw 'Firebase configuration must target samou-go / com.samouquick.customer.' }
if ($VersionCode -lt 11 -or [string]::IsNullOrWhiteSpace($VersionName)) { throw 'Use versionCode 11 or higher and a nonempty versionName.' }
$signingDir = Join-Path $env:USERPROFILE '.samou-quick-signing'
$storeFile = Join-Path $signingDir 'release.jks'
$passwordFile = Join-Path $signingDir 'password.dpapi'
$javaDir = $JdkHome
if (!(Test-Path -LiteralPath "$javaDir/bin/keytool.exe")) { throw 'Pass -JdkHome pointing to JDK 21.' }
if ((Test-Path -LiteralPath $storeFile) -ne (Test-Path -LiteralPath $passwordFile)) { throw 'Incomplete signing material. Restore its matching backup; do not generate another key.' }
New-Item -ItemType Directory -Path $signingDir -Force | Out-Null
if (!(Test-Path -LiteralPath $storeFile)) {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $secret = [Convert]::ToBase64String($bytes)
    ConvertTo-SecureString $secret -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordFile
} else {
    $secure = Get-Content -LiteralPath $passwordFile | ConvertTo-SecureString
    $secret = [System.Net.NetworkCredential]::new('', $secure).Password
}
$env:SAMOU_KEYSTORE_PASSWORD = $secret
$env:SAMOU_KEYSTORE_FILE = $storeFile
$env:SAMOU_KEY_ALIAS = 'samou-quick'
$env:SAMOU_VERSION_CODE = "$VersionCode"
$env:SAMOU_VERSION_NAME = $VersionName
$env:JAVA_HOME = $javaDir
try {
    if (!(Test-Path -LiteralPath $storeFile)) {
        & "$javaDir/bin/keytool.exe" -genkeypair -keystore $storeFile -alias samou-quick -keyalg RSA -keysize 3072 -validity 10000 -storetype JKS -storepass:env SAMOU_KEYSTORE_PASSWORD -keypass:env SAMOU_KEYSTORE_PASSWORD -dname 'CN=Samou Quick, O=Samou Quick, C=PS'
        if ($LASTEXITCODE -ne 0) { throw 'Key generation failed.' }
    }
    Push-Location "$projectRoot/themes/web-customer/android"
    try {
        & .\gradlew.bat assembleRelease bundleRelease
        if ($LASTEXITCODE -ne 0) { throw 'Release build failed.' }
    } finally { Pop-Location }
    $desktop = [Environment]::GetFolderPath('Desktop')
    Copy-Item -LiteralPath "$projectRoot/themes/web-customer/android/app/build/outputs/apk/release/app-release.apk" -Destination "$desktop/Samou Quick Release.apk" -Force
    Copy-Item -LiteralPath "$projectRoot/themes/web-customer/android/app/build/outputs/bundle/release/app-release.aab" -Destination "$desktop/Samou Quick Release.aab" -Force
    Write-Output 'Release APK and AAB copied to Desktop. Signing password is DPAPI-protected for this Windows user; arrange an independent secure backup before public distribution.'
} finally {
    Remove-Item Env:SAMOU_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    $secret = $null
}

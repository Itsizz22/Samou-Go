# ============================================================================
# Samou Quick — Brand Asset Deployment Script
# ============================================================================
# Run this script AFTER reboot (when Windows Defender releases file locks)
# or after excluding the monorepo directory from Defender real-time scanning.
#
# Usage (elevated PowerShell):
#   powershell -ExecutionPolicy Bypass -File deploy-brand-assets.ps1
#
# Pre-requisite: Run the asset generation first (Node.js with sharp):
#   node -e "require('./generate-brand-assets.js')"
# ============================================================================

$src = "$env:TEMP\brand-assets"
$root = 'C:\Users\Admin\Documents\Samou-Go'

if (-not (Test-Path $src)) {
    Write-Host "ERROR: $src not found. Run the generation script first." -ForegroundColor Red
    exit 1
}

$copies = @(
    # UI package master logo
    @{ src = 'ui-logo.png'; dst = "$root\packages\ui\src\assets\logo.png" }
    # App assets
    @{ src = 'icon-512.png'; dst = "$root\packages\app\assets\logo-512.png" }
    # Capacitor resources
    @{ src = 'icon-512.png'; dst = "$root\themes\web-customer\resources\icon.png" }
    @{ src = 'splash.png'; dst = "$root\themes\web-customer\resources\splash.png" }
)

# Favicon + apple-touch-icon for all themes
$themes = @('web-customer', 'web-store-manager', 'web-captain', 'web-admin', 'web-checkout', 'web-order-tracking', 'web-store-details')
foreach ($theme in $themes) {
    $copies += @{ src = 'favicon-16.png'; dst = "$root\themes\$theme\public\favicon-16.png" }
    $copies += @{ src = 'favicon-32.png'; dst = "$root\themes\$theme\public\favicon-32.png" }
    $copies += @{ src = 'apple-touch-icon.png'; dst = "$root\themes\$theme\public\apple-touch-icon.png" }
}

# Android mipmap densities
$densities = @('mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')
foreach ($density in $densities) {
    $mBase = "$root\themes\web-customer\android\app\src\main\res\mipmap-$density"
    $copies += @{ src = "ic_launcher-$density.png"; dst = "$mBase\ic_launcher.png" }
    $copies += @{ src = "ic_launcher_round-$density.png"; dst = "$mBase\ic_launcher_round.png" }
    $copies += @{ src = "ic_launcher_foreground-$density.png"; dst = "$mBase\ic_launcher_foreground.png" }
}

$ok = 0; $fail = 0
foreach ($c in $copies) {
    $srcPath = Join-Path $src $c.src
    $dstPath = $c.dst
    $dstDir = Split-Path $dstPath -Parent
    if (-not (Test-Path $dstDir)) {
        New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
    }
    try {
        Copy-Item $srcPath $dstPath -Force
        $ok++
        Write-Host "OK: $($c.src) -> $dstPath" -ForegroundColor Green
    } catch {
        $fail++
        Write-Host "FAIL: $dstPath - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Deployed $ok/$($copies.Count) files ($fail failed)" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Yellow' })

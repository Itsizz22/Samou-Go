"""Fail-closed iOS release checks. Never print configuration or signing material."""
import argparse
import base64
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / 'themes/web-customer/ios/App'
APP = IOS / 'App'
PROJECT = IOS / 'App.xcodeproj/project.pbxproj'
CONFIG = APP / 'Firebase/GoogleService-Info.plist'
BUNDLE = 'com.samougo.customer'
TEAM = 'XYZ5ZT4PUS'
APP_ID = '1:949776098795:ios:a083362604fa1db9a2a5ae'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def plist(path):
    return plistlib.loads(Path(path).read_bytes().removeprefix(b'\xef\xbb\xbf'))


def check_firebase(data):
    require(data.get('BUNDLE_ID') == BUNDLE, 'Firebase bundle ID mismatch')
    require(data.get('PROJECT_ID') == 'samou-go', 'Firebase project mismatch')
    require(data.get('GOOGLE_APP_ID') == APP_ID, 'Firebase iOS app ID mismatch')
    require(bool(data.get('API_KEY')) and data.get('GCM_SENDER_ID') == '949776098795', 'Firebase configuration incomplete')


def install_firebase(encoded, path=CONFIG):
    require(bool(encoded), 'Missing FIREBASE_IOS_PLIST_BASE64 in ios_credentials')
    try:
        raw = base64.b64decode(''.join(encoded.split()), validate=True)
        data = plistlib.loads(raw.removeprefix(b'\xef\xbb\xbf'))
    except Exception:
        raise ValueError('Invalid Firebase base64/plist; values omitted') from None
    check_firebase(data)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    path.chmod(0o600)


def check_source():
    require(CONFIG.is_file(), 'Missing App/Firebase/GoogleService-Info.plist')
    check_firebase(plist(CONFIG))
    require(list(APP.rglob('GoogleService-Info.plist')) == [CONFIG], 'Duplicate Firebase plist in app resources')
    text = PROJECT.read_text(encoding='utf-8-sig')
    require(re.findall(r'PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);', text) == [BUNDLE, BUNDLE], 'Debug/Release bundle ID mismatch')
    require(re.findall(r'DEVELOPMENT_TEAM = ([^;]+);', text) == [TEAM, TEAM], 'Debug/Release signing team mismatch')
    resources = text.split('/* Begin PBXResourcesBuildPhase section */')[1].split('/* End PBXResourcesBuildPhase section */')[0]
    require(resources.count('A10000000000000000000003') == 1, 'Firebase must be in Resources exactly once')
    require('fileRef = A10000000000000000000004;' in text and 'lastKnownFileType = folder; path = Firebase;' in text, 'Firebase folder resource reference missing')
    target = text.split('/* Begin PBXNativeTarget section */')[1].split('/* End PBXNativeTarget section */')[0]
    require('504EC3021FED79650016851F /* Resources */' in target and 'name = App;' in target, 'Resources not owned by App target')
    require('CODE_SIGN_ENTITLEMENTS = App/App.Release.entitlements;' in text, 'Release entitlement file not bound')
    require(plist(APP / 'App.Release.entitlements').get('aps-environment') == 'production', 'Release requires production APNs')
    require(plist(APP / 'App.entitlements').get('aps-environment') == 'development', 'Debug APNs unexpectedly changed')
    # APNs silently falls back to the default tone if the bundled sound is absent.
    import wave
    with wave.open(str(APP / 'order_alarm.wav'), 'rb') as sound:
        require(sound.getcomptype() == 'NONE' and 0 < sound.getnframes() / sound.getframerate() < 30,
                'Order ringtone must be PCM and shorter than 30 seconds')
    require('path = order_alarm.wav;' in text and 'A20000000000000000000001,' in resources,
            'Order ringtone must be included in iOS Resources')
    require('remote-notification' in plist(APP / 'Info.plist').get('UIBackgroundModes', []), 'Remote notifications mode missing')
    require('com.apple.Push = { enabled = 1; };' in text, 'Push capability missing')
    delegate = (APP / 'AppDelegate.swift').read_text(encoding='utf-8-sig')
    require('inDirectory: "Firebase"' in delegate and delegate.count('FirebaseApp.configure(') == 1, 'Firebase initialization lookup mismatch')
    require((APP / 'public/index.html').is_file(), 'Capacitor web assets missing; run cap:build:ios')
    swift = (IOS / 'CapApp-SPM/Package.swift').read_text(encoding='utf-8-sig')
    for relative in re.findall(r'path: "([^"]+)"', swift):
        require('\\' not in relative and not Path(relative).is_absolute(), 'Local-only Swift package path')
        require((IOS / 'CapApp-SPM' / relative / 'Package.swift').is_file(), 'Swift dependency missing after npm ci')
    require((IOS / 'App.xcodeproj/xcshareddata/xcschemes/App.xcscheme').is_file(), 'Shared App scheme missing')
    if sys.platform == 'darwin':
        subprocess.run(['plutil', '-lint', str(PROJECT)], check=True)
    print('PASS: iOS source configuration, target resources, capabilities and assets')


def prepare():
    names = ['APP_STORE_CONNECT_ISSUER_ID', 'APP_STORE_CONNECT_KEY_IDENTIFIER',
             'APP_STORE_CONNECT_PRIVATE_KEY', 'APP_STORE_APPLE_ID', 'VITE_MAPBOX_ACCESS_TOKEN']
    missing = [name for name in names if not os.environ.get(name)]
    require(not missing, 'Missing Codemagic variables/integration: ' + ', '.join(missing))
    require(os.environ.get('BUNDLE_ID') == BUNDLE and os.environ.get('APPLE_TEAM_ID') == TEAM, 'Workflow bundle/team mismatch')
    require(os.environ['APP_STORE_APPLE_ID'].isdigit(), 'APP_STORE_APPLE_ID must be numeric')
    require(os.environ['VITE_MAPBOX_ACCESS_TOKEN'].startswith('pk.'), 'Mapbox must use a public pk. token, never a secret token')
    require(os.environ.get('VITE_API_URL') == 'https://samou-go.onrender.com/api/v1', 'Unexpected production API')
    require(not os.environ.get('VITE_API_BASE_URL'), 'Remove VITE_API_BASE_URL override from this workflow')
    install_firebase(os.environ.get('FIREBASE_IOS_PLIST_BASE64'))
    print('PASS: release inputs and Firebase configuration (values omitted)')


def signing():
    options = plist(Path.home() / 'export_options.plist')
    require(options.get('teamID') == TEAM, 'Export signing team mismatch')
    require(options.get('method') in ('app-store', 'app-store-connect'), 'App Store distribution export required')
    require(bool(options.get('provisioningProfiles', {}).get(BUNDLE)), 'App Store provisioning profile missing for bundle ID')
    print('PASS: export profile mapping and distribution team')


def next_build(latest, counter):
    require(latest.strip().isdigit(), 'App Store returned no numeric build number; inspect app record/access, do not assume zero on failure')
    require(counter.isdigit(), 'PROJECT_BUILD_NUMBER missing/invalid')
    result = max(int(latest.strip()) + 1, int(counter) + 1)
    require(0 < result < 10000, 'Review versioning: build number exceeds supported four-digit range')
    return result


def latest_build_number(app_id):
    result = subprocess.run(
        ['app-store-connect', 'get-latest-build-number', app_id, '--all-versions', '--no-color'],
        text=True, capture_output=True, check=True)
    if not result.stdout.strip():
        require(f'Did not find any builds for app {app_id}' in result.stderr,
                'Empty build lookup without confirmed first-upload response')
        return '0'
    return result.stdout.strip()

def version():
    latest = latest_build_number(os.environ['APP_STORE_APPLE_ID'])
    number = next_build(latest, os.environ.get('PROJECT_BUILD_NUMBER', ''))
    text = PROJECT.read_text(encoding='utf-8-sig')
    text, count = re.subn(r'CURRENT_PROJECT_VERSION = [^;]+;', f'CURRENT_PROJECT_VERSION = {number};', text)
    require(count == 2, 'Expected Debug and Release build versions')
    PROJECT.write_text(text, encoding='utf-8')
    print(f'iOS build number: {number}; marketing version unchanged')


def validate_entitlements(ent, profile):
    expected = TEAM + '.' + BUNDLE
    require(ent.get('application-identifier') == expected, 'Signed bundle identifier mismatch')
    require(ent.get('com.apple.developer.team-identifier') == TEAM, 'Signed team mismatch')
    require(ent.get('aps-environment') == 'production', 'Signed IPA lacks production push entitlement')
    require(ent.get('get-task-allow') is False, 'IPA is development/debug signed')
    require(profile.get('TeamIdentifier') == [TEAM], 'Provisioning profile team mismatch')
    require(not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'Profile is not App Store distribution')
    profile_ent = profile.get('Entitlements', {})
    require(profile_ent.get('application-identifier') == expected and profile_ent.get('aps-environment') == 'production', 'App Store profile bundle/push mismatch')


def ipa():
    packages = list((ROOT / 'build/ios/ipa').glob('*.ipa'))
    require(len(packages) == 1, 'Expected exactly one exported IPA')
    with tempfile.TemporaryDirectory() as temp:
        with zipfile.ZipFile(packages[0]) as archive:
            for name in archive.namelist():
                require(not Path(name).is_absolute() and '..' not in Path(name).parts, 'Unsafe IPA archive path')
        # Preserve executable modes and framework symlinks for codesign verification.
        subprocess.run(['ditto', '-x', '-k', str(packages[0]), temp], check=True)
        apps = list((Path(temp) / 'Payload').glob('*.app'))
        require(len(apps) == 1, 'Expected one application bundle')
        app = apps[0]
        configs = list(app.rglob('GoogleService-Info.plist'))
        require(configs == [app / 'Firebase/GoogleService-Info.plist'], 'Missing or duplicate Firebase plist inside IPA')
        check_firebase(plist(configs[0]))
        require(plist(configs[0]) == plist(CONFIG), 'Exported Firebase configuration differs from supplied file')
        require((app / 'order_alarm.wav').read_bytes() == (APP / 'order_alarm.wav').read_bytes(), 'Exported order ringtone missing or changed')
        info = plist(app / 'Info.plist')
        require(info.get('CFBundleIdentifier') == BUNDLE, 'Exported app bundle ID mismatch')
        subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
        ent = plistlib.loads(subprocess.check_output(['codesign', '-d', '--entitlements', ':-', str(app)], stderr=subprocess.DEVNULL))
        profile = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(app / 'embedded.mobileprovision')]))
        validate_entitlements(ent, profile)
    print('PASS: signed IPA, exactly one Firebase plist, correct team/bundle and production APNs; physical push NOT tested')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('step', choices=['prepare', 'source', 'signing', 'version', 'ipa'])
    args = parser.parse_args()
    try:
        globals()[args.step if args.step != 'source' else 'check_source']()
    except (ValueError, OSError, subprocess.CalledProcessError, plistlib.InvalidFileException) as error:
        print(f'iOS release validation failed: {error}', file=sys.stderr)
        sys.exit(1)

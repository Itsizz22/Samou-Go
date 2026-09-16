"""Read only public signing metadata on the macOS runner; never export private keys."""
import datetime as dt
import hashlib
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys

from release import APP, BUNDLE, TEAM, require


def validate_profile(profile, now):
    ent = profile.get('Entitlements', {})
    require(profile.get('TeamIdentifier') == [TEAM], 'Profile team mismatch')
    require(ent.get('application-identifier') == TEAM + '.' + BUNDLE, 'Profile bundle mismatch')
    require(ent.get('com.apple.developer.team-identifier') == TEAM, 'Profile entitlement team mismatch')
    require(ent.get('aps-environment') == 'production', 'Profile must allow production push')
    require(ent.get('get-task-allow') is False, 'Development profile is forbidden')
    require(ent.get('beta-reports-active') is True, 'Profile is not App Store/TestFlight')
    require(not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'Not an App Store profile')
    expires = profile.get('ExpirationDate')
    require(isinstance(expires, dt.datetime), 'Profile expiration missing')
    require(expires.replace(tzinfo=dt.timezone.utc) > now, 'Profile expired')
    require(bool(profile.get('DeveloperCertificates')), 'Profile has no certificates')
    return ent


def main():
    require(sys.platform == 'darwin', 'Signing preflight requires the macOS build keychain')
    profile_path = Path(os.environ['SAMOU_IOS_PROFILE_PATH'])
    profile = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(profile_path)]))
    ent = validate_profile(profile, dt.datetime.now(dt.timezone.utc))
    requested = plistlib.loads((APP / 'App.Release.entitlements').read_bytes())
    for name, value in requested.items():
        require(ent.get(name) == value, 'Profile lacks requested Release entitlement: ' + name)
    info = plistlib.loads((APP / 'Info.plist').read_bytes())
    require('remote-notification' in info.get('UIBackgroundModes', []), 'Remote notification background mode missing')
    # find-identity returns certificate/private-key identities, not bare certificates.
    identities = subprocess.check_output(['security', 'find-identity', '-v', '-p', 'codesigning'], text=True)
    available = {fingerprint.upper(): subject for fingerprint, subject in
                 re.findall(r'\d+\)\s+([0-9A-Fa-f]{40})\s+"([^"]+)"', identities)}
    matches = []
    for der in profile['DeveloperCertificates']:
        fingerprint = hashlib.sha1(der).hexdigest().upper()
        if fingerprint in available:
            matches.append((fingerprint, available[fingerprint], der))
    require(len(matches) == 1, 'Expected exactly one valid profile certificate with private key; found ' + str(len(matches)))
    fingerprint, subject, der = matches[0]
    require(subject.startswith(('Apple Distribution:', 'iPhone Distribution:')), 'Identity is not a distribution certificate')
    require('(' + TEAM + ')' in subject, 'Signing identity team mismatch')
    subprocess.run(['openssl', 'x509', '-inform', 'DER', '-checkend', '0', '-noout'], input=der, check=True, capture_output=True)
    metadata = subprocess.check_output(['openssl', 'x509', '-inform', 'DER', '-noout', '-subject', '-serial', '-dates'], input=der).decode()
    print('Profile:', profile.get('Name'), '| UUID:', profile.get('UUID'))
    print('Team:', TEAM, '| Bundle:', BUNDLE, '| Distribution: app_store')
    print('Profile expiration:', profile['ExpirationDate'].isoformat())
    print('Certificate SHA1:', fingerprint, '| Identity:', subject)
    print(metadata.strip())
    print('PASS: exact certificate fingerprint in profile matches one valid private-key identity; Release entitlements match')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError, plistlib.InvalidFileException) as error:
        print('Signing preflight failed: ' + str(error), file=sys.stderr)
        sys.exit(1)

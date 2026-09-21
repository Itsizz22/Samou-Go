"""Read only public signing metadata on the macOS runner; never export private keys."""
import datetime as dt
import hashlib
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys

from release import APP, BUNDLE, PROJECT, require


def profile_team(profile, expected_name):
    teams = profile.get('TeamIdentifier', [])
    require(len(teams) == 1 and bool(re.fullmatch(r'[A-Z0-9]{10}', teams[0])), 'Invalid profile TeamIdentifier')
    require(bool(expected_name) and profile.get('TeamName', '').strip().casefold() == expected_name.strip().casefold(),
            'Profile TeamName does not match EXPECTED_APPLE_TEAM_NAME')
    return teams[0]


def validate_profile(profile, now, team):
    ent = profile.get('Entitlements', {})
    require(profile.get('TeamIdentifier') == [team], 'Profile team mismatch')
    require(ent.get('application-identifier') == team + '.' + BUNDLE, 'Profile bundle mismatch')
    require(ent.get('com.apple.developer.team-identifier') == team, 'Profile entitlement team mismatch')
    require(ent.get('aps-environment') == 'production', 'Profile must allow production push')
    require(ent.get('get-task-allow') is False, 'Development profile is forbidden')
    require(ent.get('beta-reports-active') is True, 'Profile is not App Store/TestFlight')
    require(not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'Not an App Store profile')
    expires = profile.get('ExpirationDate')
    require(isinstance(expires, dt.datetime), 'Profile expiration missing')
    require(expires.replace(tzinfo=dt.timezone.utc) > now, 'Profile expired')
    require(bool(profile.get('DeveloperCertificates')), 'Profile has no certificates')
    return ent


def matching_identity(profile, identities):
    available = {fingerprint.upper(): subject for fingerprint, subject in
                 re.findall(r'\d+\)\s+([0-9A-Fa-f]{40})\s+"([^"]+)"', identities)}
    matches = {}
    for der in profile['DeveloperCertificates']:
        fingerprint = hashlib.sha1(der).hexdigest().upper()
        if fingerprint in available:
            matches[fingerprint] = (fingerprint, available[fingerprint], der)
    require(len(matches) == 1, 'Expected exactly one distinct profile certificate with private key; found ' + str(len(matches)))
    return next(iter(matches.values()))


def main():
    require(sys.platform == 'darwin', 'Signing preflight requires the macOS build keychain')
    profile_path = Path(os.environ['SAMOU_IOS_PROFILE_PATH'])
    profile = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(profile_path)]))
    team = profile_team(profile, os.environ.get('EXPECTED_APPLE_TEAM_NAME', ''))
    ent = validate_profile(profile, dt.datetime.now(dt.timezone.utc), team)
    requested = plistlib.loads((APP / 'App.Release.entitlements').read_bytes())
    for name, value in requested.items():
        require(ent.get(name) == value, 'Profile lacks requested Release entitlement: ' + name)
    info = plistlib.loads((APP / 'Info.plist').read_bytes())
    require('remote-notification' in info.get('UIBackgroundModes', []), 'Remote notification background mode missing')
    # find-identity returns certificate/private-key identities, not bare certificates.
    identities = subprocess.check_output(['security', 'find-identity', '-v', '-p', 'codesigning'], text=True)
    fingerprint, subject, der = matching_identity(profile, identities)
    require(subject.startswith(('Apple Distribution:', 'iPhone Distribution:')), 'Identity is not a distribution certificate')
    require('(' + team + ')' in subject, 'Signing identity team mismatch')
    subprocess.run(['openssl', 'x509', '-inform', 'DER', '-checkend', '0', '-noout'], input=der, check=True, capture_output=True)
    metadata = subprocess.check_output(['openssl', 'x509', '-inform', 'DER', '-noout', '-subject', '-serial', '-dates'], input=der).decode()
    print('Profile:', profile.get('Name'), '| UUID:', profile.get('UUID'))
    print('Team:', team, '| Bundle:', BUNDLE, '| Distribution: app_store')
    print('Profile expiration:', profile['ExpirationDate'].isoformat())
    print('Certificate SHA1:', fingerprint, '| Identity:', subject)
    print(metadata.strip())
    text, count = re.subn(r'DEVELOPMENT_TEAM = [^;]+;', f'DEVELOPMENT_TEAM = {team};', PROJECT.read_text(encoding='utf-8-sig'))
    require(count == 2, 'Expected Debug and Release signing teams')
    PROJECT.write_text(text, encoding='utf-8')
    # CM_ENV variables become available in subsequent Codemagic script steps.
    with Path(os.environ['CM_ENV']).open('a', encoding='utf-8') as env:
        env.write(f'\nAPPLE_TEAM_ID={team}\nIOS_SIGNING_IDENTITY={fingerprint}\n')
    print('PASS: exact certificate fingerprint in profile matches one valid private-key identity; Release entitlements match')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError, plistlib.InvalidFileException) as error:
        print('Signing preflight failed: ' + str(error), file=sys.stderr)
        sys.exit(1)

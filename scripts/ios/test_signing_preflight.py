import copy
import hashlib
import datetime as dt
import unittest
from signing_preflight import validate_profile, profile_team, matching_identity
from release import BUNDLE

TEAM = 'TESTTEAM01'


class ProfilePreflightTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 9, 16, tzinfo=dt.timezone.utc)
        self.profile = {'TeamName': 'Qais Amro', 'TeamIdentifier': [TEAM], 'ExpirationDate': dt.datetime(2027, 9, 16),
                        'DeveloperCertificates': [b'public-certificate'],
                        'Entitlements': {'application-identifier': TEAM + '.' + BUNDLE,
                                         'com.apple.developer.team-identifier': TEAM,
                                         'aps-environment': 'production', 'get-task-allow': False,
                                         'beta-reports-active': True}}

    def test_app_store_profile(self):
        validate_profile(self.profile, self.now, TEAM)

    def test_reject_wrong_team_bundle_push_and_development(self):
        for key, value in [('application-identifier', TEAM + '.wrong'),
                           ('com.apple.developer.team-identifier', 'WRONG'),
                           ('aps-environment', 'development'), ('get-task-allow', True),
                           ('beta-reports-active', False)]:
            with self.subTest(key=key):
                profile = copy.deepcopy(self.profile)
                profile['Entitlements'][key] = value
                with self.assertRaises(ValueError):
                    validate_profile(profile, self.now, TEAM)

    def test_reject_expired_adhoc_enterprise_missing_certificate(self):
        for key, value in [('ExpirationDate', dt.datetime(2025, 1, 1)),
                           ('ProvisionedDevices', ['device']), ('ProvisionsAllDevices', True),
                           ('DeveloperCertificates', []), ('TeamIdentifier', ['WRONG'])]:
            with self.subTest(key=key):
                profile = copy.deepcopy(self.profile)
                profile[key] = value
                with self.assertRaises(ValueError):
                    validate_profile(profile, self.now, TEAM)

    def test_team_is_read_from_profile_not_hardcoded(self):
        self.assertEqual(profile_team(self.profile, 'Qais Amro'), TEAM)
        with self.assertRaises(ValueError):
            profile_team(self.profile, 'Other Owner')

    def test_identical_duplicates_count_as_one_identity(self):
        der = b'public-certificate'
        fingerprint = hashlib.sha1(der).hexdigest().upper()
        identities = f'1) {fingerprint} "Apple Distribution: Qais Amro ({TEAM})"\n' * 2
        self.profile['DeveloperCertificates'] = [der, der]
        self.assertEqual(matching_identity(self.profile, identities)[0], fingerprint)

    def test_missing_key_or_ambiguous_distinct_certificates_fail(self):
        with self.assertRaises(ValueError):
            matching_identity(self.profile, '')
        self.profile['DeveloperCertificates'] = [b'one', b'two']
        identities = '\n'.join(f'{i}) {hashlib.sha1(der).hexdigest()} "Apple Distribution: Test ({TEAM})"'
                               for i, der in enumerate(self.profile['DeveloperCertificates'], 1))
        with self.assertRaises(ValueError):
            matching_identity(self.profile, identities)

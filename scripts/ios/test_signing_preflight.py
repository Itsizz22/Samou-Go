import copy
import datetime as dt
import unittest
from signing_preflight import validate_profile
from release import BUNDLE, TEAM


class ProfilePreflightTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 9, 16, tzinfo=dt.timezone.utc)
        self.profile = {'TeamIdentifier': [TEAM], 'ExpirationDate': dt.datetime(2027, 9, 16),
                        'DeveloperCertificates': [b'public-certificate'],
                        'Entitlements': {'application-identifier': TEAM + '.' + BUNDLE,
                                         'com.apple.developer.team-identifier': TEAM,
                                         'aps-environment': 'production', 'get-task-allow': False,
                                         'beta-reports-active': True}}

    def test_app_store_profile(self):
        validate_profile(self.profile, self.now)

    def test_reject_wrong_team_bundle_push_and_development(self):
        for key, value in [('application-identifier', TEAM + '.wrong'),
                           ('com.apple.developer.team-identifier', 'WRONG'),
                           ('aps-environment', 'development'), ('get-task-allow', True),
                           ('beta-reports-active', False)]:
            with self.subTest(key=key):
                profile = copy.deepcopy(self.profile)
                profile['Entitlements'][key] = value
                with self.assertRaises(ValueError):
                    validate_profile(profile, self.now)

    def test_reject_expired_adhoc_enterprise_missing_certificate(self):
        for key, value in [('ExpirationDate', dt.datetime(2025, 1, 1)),
                           ('ProvisionedDevices', ['device']), ('ProvisionsAllDevices', True),
                           ('DeveloperCertificates', []), ('TeamIdentifier', ['WRONG'])]:
            with self.subTest(key=key):
                profile = copy.deepcopy(self.profile)
                profile[key] = value
                with self.assertRaises(ValueError):
                    validate_profile(profile, self.now)

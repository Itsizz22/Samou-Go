import base64
import plistlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import release


class ReleaseGuards(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict('os.environ', {'APPLE_TEAM_ID': 'TESTTEAM01'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def config(self):
        return {'BUNDLE_ID': release.BUNDLE, 'PROJECT_ID': 'samou-go',
                'GOOGLE_APP_ID': release.APP_ID, 'API_KEY': 'synthetic-test-only',
                'GCM_SENDER_ID': '949776098795', 'IS_GCM_ENABLED': True}

    def test_config_is_decoded_without_fallback(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / 'GoogleService-Info.plist'
            raw = plistlib.dumps(self.config())
            release.install_firebase(base64.b64encode(raw).decode(), dest)
            self.assertEqual(dest.read_bytes(), raw)

    def test_missing_or_invalid_base64_fails(self):
        for value in (None, '', 'not base64!'):
            with self.assertRaises(ValueError):
                release.install_firebase(value)

    def test_wrong_firebase_identifiers_fail(self):
        for key in ('BUNDLE_ID', 'PROJECT_ID', 'GOOGLE_APP_ID', 'GCM_SENDER_ID', 'IS_GCM_ENABLED'):
            data = self.config()
            data[key] = 'wrong'
            with self.assertRaises(ValueError):
                release.check_firebase(data)

    def test_build_number_increases_without_apple_api(self):
        self.assertEqual(release.next_build('1000', '8'), 1009)
        self.assertEqual(release.next_build('1000', '9'), 1010)
        self.assertEqual(release.next_build('0', '0'), 1)

    def test_invalid_or_overflowing_build_numbers_fail(self):
        for base, counter in [('', '1'), ('1000', ''), ('1000', '-1'), ('1000', '1.2'), ('9999', '8')]:
            with self.assertRaises(ValueError):
                release.next_build(base, counter)

    def test_missing_credentials_fail_before_configuration_write(self):
        with patch.dict('os.environ', {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'Missing Codemagic'):
                release.prepare()

    def test_prepare_requires_no_app_store_credentials(self):
        env = {'BUNDLE_ID': release.BUNDLE, 'VITE_MAPBOX_ACCESS_TOKEN': 'pk.synthetic',
               'FIREBASE_IOS_PLIST_BASE64': 'synthetic',
               'VITE_API_URL': 'https://samou-go.onrender.com/api/v1'}
        with patch.dict('os.environ', env, clear=True), patch('release.install_firebase') as install:
            release.prepare()
            install.assert_called_once_with('synthetic')

    def test_version_writes_both_configurations_without_network(self):
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp) / 'project.pbxproj'
            project.write_text('CURRENT_PROJECT_VERSION = 1;\nCURRENT_PROJECT_VERSION = 1;\n')
            with patch.object(release, 'PROJECT', project), patch.dict('os.environ', {
                    'IOS_BUILD_NUMBER_BASE': '1000', 'PROJECT_BUILD_NUMBER': '12'}), patch('release.subprocess.run') as run:
                release.version()
                self.assertEqual(project.read_text().count('CURRENT_PROJECT_VERSION = 1013;'), 2)
                run.assert_not_called()

    def test_missing_team_cannot_silently_fall_back(self):
        with patch.dict('os.environ', {}, clear=True), self.assertRaises(ValueError):
            release.signing_team()

    def test_export_must_use_selected_profile_and_certificate_without_upload(self):
        options = {'teamID': 'TESTTEAM01', 'method': 'app-store',
                   'provisioningProfiles': {release.BUNDLE: 'profile-uuid'},
                   'signingCertificate': 'A' * 40, 'destination': 'export',
                   'manageAppVersionAndBuildNumber': False}
        selected = {'UUID': 'profile-uuid', 'Name': 'App Store Profile'}
        with patch.dict('os.environ', {'SAMOU_IOS_PROFILE_PATH': '/synthetic/profile', 'IOS_SIGNING_IDENTITY': 'A' * 40}), \
                patch('release.plist', return_value=options), \
                patch('release.subprocess.check_output', return_value=plistlib.dumps(selected)):
            release.signing()
            for key, value in [('destination', 'upload'), ('signingCertificate', 'B' * 40),
                               ('manageAppVersionAndBuildNumber', True),
                               ('provisioningProfiles', {release.BUNDLE: 'other-profile'})]:
                original = options[key]
                options[key] = value
                with self.subTest(key=key), self.assertRaises(ValueError):
                    release.signing()
                options[key] = original

    def signed(self):
        app_id = 'TESTTEAM01' + '.' + release.BUNDLE
        return ({'application-identifier': app_id, 'com.apple.developer.team-identifier': 'TESTTEAM01',
                 'aps-environment': 'production', 'get-task-allow': False},
                {'TeamIdentifier': ['TESTTEAM01'], 'Entitlements': {'application-identifier': app_id, 'aps-environment': 'production'}})

    def test_valid_distribution_entitlements(self):
        release.validate_entitlements(*self.signed())

    def test_debug_wrong_team_or_non_app_store_profile_fails(self):
        for key, value in [('get-task-allow', True), ('aps-environment', 'development'),
                           ('com.apple.developer.team-identifier', 'OTHER')]:
            ent, profile = self.signed()
            ent[key] = value
            with self.assertRaises(ValueError):
                release.validate_entitlements(ent, profile)
        ent, profile = self.signed()
        profile['ProvisionedDevices'] = ['synthetic-device']
        with self.assertRaises(ValueError):
            release.validate_entitlements(ent, profile)


if __name__ == '__main__':
    unittest.main()

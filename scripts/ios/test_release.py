import base64
import plistlib
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import release


class ReleaseGuards(unittest.TestCase):
    def config(self):
        return {'BUNDLE_ID': release.BUNDLE, 'PROJECT_ID': 'samou-go',
                'GOOGLE_APP_ID': release.APP_ID, 'API_KEY': 'synthetic-test-only',
                'GCM_SENDER_ID': '949776098795'}

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
        for key in ('BUNDLE_ID', 'PROJECT_ID', 'GOOGLE_APP_ID', 'GCM_SENDER_ID'):
            data = self.config()
            data[key] = 'wrong'
            with self.assertRaises(ValueError):
                release.check_firebase(data)

    def test_build_number_uses_highest_existing_or_runner_number(self):
        self.assertEqual(release.next_build('100\n', '8'), 101)
        self.assertEqual(release.next_build('0', '12'), 13)
        self.assertEqual(release.next_build('0', '0'), 1)

    def test_failed_lookup_is_not_treated_as_first_upload(self):
        for latest in ('', 'null', 'unauthorized', '1.2'):
            with self.assertRaises(ValueError):
                release.next_build(latest, '5')
        with self.assertRaises(ValueError):
            release.next_build('9999', '8')

    def test_missing_credentials_fail_before_configuration_write(self):
        with patch.dict('os.environ', {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'Missing Codemagic'):
                release.prepare()

    def test_first_upload_requires_success_and_explicit_no_builds_response(self):
        with patch('release.subprocess.run', return_value=subprocess.CompletedProcess([], 0, '', 'Did not find any builds for app 123')):
            self.assertEqual(release.latest_build_number('123'), '0')
        with patch('release.subprocess.run', return_value=subprocess.CompletedProcess([], 0, '', '')):
            with self.assertRaises(ValueError):
                release.latest_build_number('123')
        with patch('release.subprocess.run', side_effect=subprocess.CalledProcessError(1, 'lookup')):
            with self.assertRaises(subprocess.CalledProcessError):
                release.latest_build_number('123')
    def signed(self):
        app_id = release.TEAM + '.' + release.BUNDLE
        return ({'application-identifier': app_id, 'com.apple.developer.team-identifier': release.TEAM,
                 'aps-environment': 'production', 'get-task-allow': False},
                {'TeamIdentifier': [release.TEAM], 'Entitlements': {'application-identifier': app_id, 'aps-environment': 'production'}})

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

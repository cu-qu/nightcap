from datetime import date
from unittest.mock import Mock

from django.test import SimpleTestCase, override_settings

from config.r2 import (
    configured_media_storages,
    r2_credentials_configured,
    r2_endpoint_url,
    r2_is_enabled,
    r2_storage_options,
)
from entries.media import nightcap_photo_url


class R2ConfigTests(SimpleTestCase):
    def test_endpoint_from_account_id(self):
        env = {"R2_ACCOUNT_ID": "abc123"}
        self.assertEqual(
            r2_endpoint_url(env),
            "https://abc123.r2.cloudflarestorage.com",
        )

    def test_explicit_endpoint_wins(self):
        env = {
            "R2_ACCOUNT_ID": "abc123",
            "R2_ENDPOINT_URL": "https://custom.example/r2/",
        }
        self.assertEqual(r2_endpoint_url(env), "https://custom.example/r2")

    def test_parses_cloudflare_s3_bucket_url(self):
        env = {
            "R2_ENDPOINT_URL": (
                "https://34954321e1480d1ebf8cc2a855e570c0.r2.cloudflarestorage.com/"
                "nightcap-prod"
            )
        }
        options = r2_storage_options(env)
        self.assertEqual(
            options["endpoint_url"],
            "https://34954321e1480d1ebf8cc2a855e570c0.r2.cloudflarestorage.com",
        )
        self.assertEqual(options["bucket_name"], "nightcap-prod")
        self.assertTrue(
            r2_credentials_configured(
                {
                    **env,
                    "R2_ACCESS_KEY_ID": "key",
                    "R2_SECRET_ACCESS_KEY": "secret",
                }
            )
        )

    def test_credentials_require_bucket_keys_and_endpoint(self):
        self.assertFalse(r2_credentials_configured({}))
        self.assertFalse(
            r2_credentials_configured(
                {
                    "R2_BUCKET_NAME": "nightcap-media",
                    "R2_ACCESS_KEY_ID": "key",
                    "R2_SECRET_ACCESS_KEY": "secret",
                }
            )
        )
        self.assertTrue(
            r2_credentials_configured(
                {
                    "R2_BUCKET_NAME": "nightcap-media",
                    "R2_ACCESS_KEY_ID": "key",
                    "R2_SECRET_ACCESS_KEY": "secret",
                    "R2_ACCOUNT_ID": "acct",
                }
            )
        )

    def test_local_debug_does_not_auto_enable(self):
        env = {
            "R2_BUCKET_NAME": "nightcap-media",
            "R2_ACCESS_KEY_ID": "key",
            "R2_SECRET_ACCESS_KEY": "secret",
            "R2_ACCOUNT_ID": "acct",
            "DJANGO_SETTINGS_MODULE": "config.settings.local",
        }
        self.assertFalse(r2_is_enabled(debug=True, environ=env))
        env["R2_ENABLED"] = "true"
        self.assertTrue(r2_is_enabled(debug=True, environ=env))

    def test_production_auto_enables_when_credentials_exist(self):
        env = {
            "R2_BUCKET_NAME": "nightcap-media",
            "R2_ACCESS_KEY_ID": "key",
            "R2_SECRET_ACCESS_KEY": "secret",
            "R2_ACCOUNT_ID": "acct",
            "DJANGO_SETTINGS_MODULE": "config.settings.production",
        }
        self.assertTrue(r2_is_enabled(debug=False, environ=env))
        env["R2_ENABLED"] = "false"
        self.assertFalse(r2_is_enabled(debug=False, environ=env))

    def test_storage_options_and_backends(self):
        env = {
            "R2_BUCKET_NAME": "nightcap-media",
            "R2_ACCESS_KEY_ID": "key",
            "R2_SECRET_ACCESS_KEY": "secret",
            "R2_ACCOUNT_ID": "acct",
        }
        options = r2_storage_options(env)
        self.assertEqual(options["bucket_name"], "nightcap-media")
        self.assertEqual(
            options["endpoint_url"],
            "https://acct.r2.cloudflarestorage.com",
        )
        self.assertTrue(options["querystring_auth"])
        storages = configured_media_storages(True, "/tmp/media", "/tmp/static")
        self.assertEqual(
            storages["default"]["BACKEND"],
            "storages.backends.s3.S3Storage",
        )
        local = configured_media_storages(False, "/tmp/media", "/tmp/static")
        self.assertEqual(
            local["default"]["BACKEND"],
            "django.core.files.storage.FileSystemStorage",
        )


class NightCapPhotoUrlTests(SimpleTestCase):
    def test_missing_photo_is_none(self):
        obj = Mock(favorite_photo=None)
        self.assertIsNone(nightcap_photo_url(obj))

    @override_settings(USE_R2_STORAGE=False)
    def test_local_uses_authenticated_api_proxy(self):
        obj = Mock()
        obj.favorite_photo = Mock()
        obj.date = date(2026, 9, 14)
        obj.updated_at = None
        url = nightcap_photo_url(obj)
        self.assertEqual(url, "/api/v1/nightcaps/2026-09-14/photo/")

    @override_settings(USE_R2_STORAGE=True)
    def test_r2_uses_storage_signed_url(self):
        signed = (
            "https://acct.r2.cloudflarestorage.com/nightcap-media/"
            "media/nightcaps/1/2026-09-14/abc.jpg?X-Amz-Signature=sig"
        )
        obj = Mock()
        obj.favorite_photo = Mock()
        obj.favorite_photo.url = signed
        obj.date = date(2026, 9, 14)
        self.assertEqual(nightcap_photo_url(obj), signed)

"""Regression checks for authentication boundaries and public API availability."""
import os
import unittest
from datetime import timedelta
from unittest.mock import patch

os.environ.setdefault("SECRET_KEY", "local-test-signing-key-not-for-deployment")

from fastapi.testclient import TestClient
from starlette.requests import Request

from app import validation
from app.config import Settings, base_url
from app.main import app
from app.security import create_token, decode_token, hash_password, verify_password


class AuthenticationTests(unittest.TestCase):
    def test_password_hash_rejects_wrong_password(self):
        hashed = hash_password("A-long-test-password42")
        self.assertNotEqual(hashed, "A-long-test-password42")
        self.assertTrue(verify_password("A-long-test-password42", hashed))
        self.assertFalse(verify_password("wrong-password", hashed))

    def test_tokens_cannot_cross_authentication_boundaries(self):
        token = create_token(7, "session", timedelta(minutes=5))
        self.assertEqual(decode_token(token, "session"), 7)
        self.assertIsNone(decode_token(token, "api"))
        self.assertIsNone(decode_token(token + "tampered", "session"))
        expired = create_token(7, "api", timedelta(seconds=-10))
        self.assertIsNone(decode_token(expired, "api"))

    def test_forwarded_host_must_be_allowlisted(self):
        settings = Settings(_env_file=None, secret_key="test", public_url="https://video.example.com",
                            extra_public_urls="https://extra.example.com")
        for host, expected in (("attacker.example.com", settings.public_url),
                               ("extra.example.com", "https://extra.example.com")):
            with self.subTest(host=host), patch("app.config.get_settings", return_value=settings):
                request = Request({"type": "http", "scheme": "http", "path": "/",
                                   "headers": [(b"x-forwarded-proto", b"https"),
                                               (b"x-forwarded-host", host.encode())]})
                self.assertEqual(base_url(request), expected)


class InputTests(unittest.TestCase):
    def test_invalid_profile_values_are_rejected(self):
        for check, value in ((validation.check_username, "<script>"),
                             (validation.check_name, "<script>"),
                             (validation.check_email, "invalid-email"),
                             (validation.check_password, "password123"),
                             (validation.check_avatar_url, "javascript:alert(1)"),
                             (validation.check_language, "unknown")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                check(value)


class ApiTests(unittest.TestCase):
    # No lifespan context: these HTTP checks do not start torrents or contact external sources.
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_health_and_security_headers(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["x-frame-options"], "DENY")

    def test_private_endpoint_requires_authentication(self):
        response = self.client.get("/api/users")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers["www-authenticate"], "Bearer")

    def test_openapi_schema_is_available(self):
        response = self.client.get("/api/openapi.json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("/api/oauth/token", response.json()["paths"])

"""auth.py unit contracts — opt-in HMAC, handle binding, timestamp freshness.

_API_SECRET is read from the module global at call time, so monkeypatching it
exercises the enabled path without importlib.reload or env manipulation.
"""

import time

import pytest
from fastapi import HTTPException

import auth as auth_mod


class TestPassThroughWhenUnset:
    def test_verify_hmac_noop_without_secret(self):
        assert auth_mod._API_SECRET == ""
        # No headers at all — dev/public deployment passes through
        import asyncio
        asyncio.run(auth_mod.verify_hmac(authorization=None, x_timestamp=None))

    def test_handle_signature_noop_without_secret(self):
        auth_mod.verify_handle_signature("x", None, None)


class TestEnabledContracts:
    @pytest.fixture(autouse=True)
    def secret_set(self, monkeypatch):
        monkeypatch.setattr(auth_mod, "_API_SECRET", "unit-test-secret")

    def test_missing_headers_rejected_401(self):
        with pytest.raises(HTTPException) as e:
            auth_mod.verify_handle_signature("mannpatel", None, None)
        assert e.value.status_code == 401

    def test_valid_binding_passes(self):
        ts = str(int(time.time()))
        sig = auth_mod._hmac_sign(ts, "mannpatel")
        auth_mod.verify_handle_signature("mannpatel", f"HMAC {sig}", ts)

    def test_signature_for_other_handle_rejected_401(self):
        ts = str(int(time.time()))
        sig = auth_mod._hmac_sign(ts, "someone-else")
        with pytest.raises(HTTPException) as e:
            auth_mod.verify_handle_signature("mannpatel", f"HMAC {sig}", ts)
        assert e.value.status_code == 401

    def test_stale_timestamp_rejected_401(self):
        # Freshness is enforced by verify_hmac (the dependency), not
        # verify_handle_signature (presence + binding only).
        import asyncio
        old_ts = str(int(time.time()) - 3600)  # 1h old — past the 5-minute window
        with pytest.raises(HTTPException) as e:
            asyncio.run(auth_mod.verify_hmac(
                authorization="HMAC deadbeef", x_timestamp=old_ts))
        assert e.value.status_code == 401

    def test_non_numeric_timestamp_rejected_401(self):
        import asyncio
        with pytest.raises(HTTPException) as e:
            asyncio.run(auth_mod.verify_hmac(
                authorization="HMAC deadbeef", x_timestamp="not-a-number"))
        assert e.value.status_code == 401

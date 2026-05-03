"""Unit tests: Lemon Squeezy webhook HMAC (no DB)."""

from __future__ import annotations

import hashlib
import hmac

import pytest

from app.modules.billing_lemonsqueezy.signature import verify_x_signature


def test_verify_x_signature_accepts_valid_hex_digest():
    secret = "my_signing_secret"
    raw = b'{"meta":{"event_name":"order_created"},"data":{}}'
    expected = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    assert verify_x_signature(raw_body=raw, x_signature=expected, secret=secret) is True


def test_verify_x_signature_rejects_wrong_secret():
    raw = b"{}"
    sig = hmac.new(b"correct", raw, hashlib.sha256).hexdigest()
    assert verify_x_signature(raw_body=raw, x_signature=sig, secret="wrong") is False


@pytest.mark.parametrize(
    "sig,secret",
    [
        (None, "s"),
        ("abc", ""),
        ("", "s"),
    ],
)
def test_verify_x_signature_rejects_missing_inputs(sig: str | None, secret: str):
    assert verify_x_signature(raw_body=b"{}", x_signature=sig, secret=secret) is False

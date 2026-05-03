"""Verify Lemon Squeezy webhook `X-Signature` (HMAC-SHA256 hex digest of raw body).

Docs: https://docs.lemonsqueezy.com/help/webhooks/signing-requests
"""

from __future__ import annotations

import hashlib
import hmac


def verify_x_signature(*, raw_body: bytes, x_signature: str | None, secret: str) -> bool:
    """Return True if the header matches HMAC-SHA256(secret, raw_body).hexdigest()."""
    if not secret or not raw_body:
        return False
    if x_signature is None:
        return False
    received = (x_signature or "").strip()
    if not received:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)

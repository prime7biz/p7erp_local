"""Time-based one-time passwords (RFC 6238, SHA-1, 6 digits, 30 s) using only the standard library.

Compatible with Google Authenticator, Microsoft Authenticator, 1Password, Authy, etc.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

TOTP_PERIOD_SECONDS = 30
TOTP_DIGITS = 6
# Accept the previous and next 30-second step to tolerate small clock differences.
TOTP_ALLOWED_DRIFT_STEPS = 1


def generate_totp_secret() -> str:
    """160-bit random secret, base32 without padding (what authenticator apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _secret_bytes(secret: str) -> bytes:
    s = (secret or "").strip().replace(" ", "").upper()
    s += "=" * (-len(s) % 8)
    return base64.b32decode(s, casefold=True)


def totp_code_at_step(secret: str, step: int) -> str:
    """RFC 4226 HOTP value for ``step`` (the RFC 6238 time counter)."""
    digest = hmac.new(_secret_bytes(secret), struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % (10**TOTP_DIGITS)).zfill(TOTP_DIGITS)


def current_totp_step(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // TOTP_PERIOD_SECONDS)


def verify_totp(
    secret: str,
    code: str | None,
    *,
    last_used_step: int | None = None,
    now: float | None = None,
) -> int | None:
    """Return the matched time step, or None.

    A step at or before ``last_used_step`` is refused so a code cannot be used twice.
    """
    candidate = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(candidate) != TOTP_DIGITS or not secret:
        return None
    step_now = current_totp_step(now)
    for step in range(step_now - TOTP_ALLOWED_DRIFT_STEPS, step_now + TOTP_ALLOWED_DRIFT_STEPS + 1):
        if last_used_step is not None and step <= last_used_step:
            continue
        if hmac.compare_digest(totp_code_at_step(secret, step), candidate):
            return step
    return None


def totp_provisioning_uri(secret: str, *, account_name: str, issuer: str) -> str:
    """``otpauth://`` URI that authenticator apps import (usually shown as a QR code)."""
    label = quote(f"{issuer}:{account_name}")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}"
        f"&algorithm=SHA1&digits={TOTP_DIGITS}&period={TOTP_PERIOD_SECONDS}"
    )

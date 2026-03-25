"""Normalize and validate extracted strings without fabricating data."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from email.utils import parseaddr
from urllib.parse import urlparse

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def sanitize_text(value: str | None, max_len: int = 4096) -> str | None:
    if value is None:
        return None
    s = value.replace("\x00", "").strip()
    if not s:
        return None
    return s[:max_len]


def normalize_email(value: str | None) -> tuple[str | None, bool]:
    """Returns (normalized_email, is_valid)."""
    s = sanitize_text(value, 255)
    if not s:
        return None, False
    # parseaddr for "Name <email@x.com>"
    _, addr = parseaddr(s)
    candidate = addr.strip() if addr else s
    if _EMAIL_RE.match(candidate):
        return candidate.lower(), True
    return None, False


def normalize_url(value: str | None) -> str | None:
    s = sanitize_text(value, 512)
    if not s:
        return None
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", s):
        s = "https://" + s.lstrip("/")
    try:
        p = urlparse(s)
        if p.scheme in ("http", "https") and p.netloc:
            return s
    except Exception:
        pass
    return None


def normalize_phone(value: str | None) -> tuple[str | None, str | None]:
    """Returns (country_code like +880, local_digits) if parseable."""
    s = sanitize_text(value, 64)
    if not s:
        return None, None
    # Leading +country
    m = re.match(r"^\+(\d{1,4})\s*([\d\s().-]{4,})$", s)
    if m:
        cc = "+" + m.group(1)
        rest = re.sub(r"\D", "", m.group(2))
        return cc, rest or None
    digits = re.sub(r"\D", "", s)
    if len(digits) < 7:
        return None, None
    # US-style 1 + 10 digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+1", digits[1:]
    return None, digits


def split_phone_for_form(value: str | None) -> tuple[str | None, str | None]:
    """Prefer +CC and number for customer form fields."""
    cc, num = normalize_phone(value)
    return cc, num


def normalize_date(value: str | None) -> str | None:
    s = sanitize_text(value, 64)
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%b-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def normalize_numeric_string(value: str | int | float | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return str(value)
    s = sanitize_text(str(value), 64)
    if not s:
        return None
    try:
        d = Decimal(s.replace(",", ""))
        return format(d.normalize(), "f").rstrip("0").rstrip(".") if "." in format(d, "f") else str(int(d))
    except (InvalidOperation, ValueError):
        return None


def normalize_int(value: str | int | float | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    ns = normalize_numeric_string(value)
    if not ns:
        return None
    try:
        i = int(Decimal(ns))
        return i if i >= 0 else None
    except (ValueError, InvalidOperation):
        return None


def parse_loose_address(value: str | None) -> dict[str, str | None]:
    """Best-effort split; returns keys line1, city, postal, country."""
    s = sanitize_text(value, 1024)
    if not s:
        return {"line1": None, "city": None, "postal": None, "country": None}
    lines = [ln.strip() for ln in s.splitlines() if ln.strip()]
    line1 = lines[0] if lines else None
    city = None
    postal = None
    country = None
    if len(lines) >= 2:
        # last line often city, postal, country
        tail = lines[-1]
        postal_m = re.search(r"\b(\d{4,10}|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b", tail, re.I)
        if postal_m:
            postal = postal_m.group(1)
        parts = [p.strip() for p in re.split(r",", tail) if p.strip()]
        if len(parts) >= 2:
            city = parts[0]
            if len(parts) >= 3:
                country = parts[-1]
        elif len(parts) == 1 and not postal:
            city = parts[0]
    return {
        "line1": line1,
        "city": city,
        "postal": postal,
        "country": country,
    }

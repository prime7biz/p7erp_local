"""Optional offline IP → city/country lookup for User Activity.

- Private / loopback / link-local → \"Private network\"
- If ``GEOIP_CITY_DB_PATH`` points at a MaxMind GeoLite2 City ``.mmdb`` and the optional
  ``geoip2`` package is installed, resolve city + country.
- Otherwise return None (UI shows IP only).

Never raises to callers; lookup failures are logged at debug level.
"""

from __future__ import annotations

import ipaddress
import logging
from functools import lru_cache

from app.config import get_settings

logger = logging.getLogger(__name__)


def _classify_non_public(ip: str) -> str | None:
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        return None
    if addr.is_loopback or addr.is_private or addr.is_link_local or addr.is_reserved or addr.is_unspecified:
        return "Private network"
    return None


@lru_cache(maxsize=1)
def _reader():
    path = (getattr(get_settings(), "geoip_city_db_path", "") or "").strip()
    if not path:
        return None
    try:
        import geoip2.database  # type: ignore
    except ImportError:
        logger.debug("geoip2 not installed; skipping City DB at %s", path)
        return None
    try:
        return geoip2.database.Reader(path)
    except Exception:
        logger.debug("geoip city db open failed path=%s", path, exc_info=True)
        return None


def lookup_ip_location(ip: str | None) -> str | None:
    """Return a short location label, or None when unknown."""
    if not ip or ip in ("unknown", "0.0.0.0", "::"):
        return None
    private = _classify_non_public(ip)
    if private:
        return private
    reader = _reader()
    if reader is None:
        return None
    try:
        resp = reader.city(ip)
        city = (resp.city.name or "").strip()
        country = (resp.country.name or "").strip()
        if city and country:
            return f"{city}, {country}"
        return city or country or None
    except Exception:
        return None

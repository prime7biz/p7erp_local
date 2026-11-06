"""Business "today" in the company's own timezone.

The server clock runs in UTC. A Bangladesh company working at 01:00 local time is already on the
next calendar day, while ``date.today()`` (UTC) still returns yesterday. Use ``today_local()`` for
business dates (default voucher date, payroll period, leave / attendance date, overdue checks).
Keep using UTC ``datetime.utcnow()`` for stored timestamps such as ``created_at``.

Timezone order: ``tenants.timezone`` (when set and valid) -> env ``APP_TIMEZONE`` -> Asia/Dhaka.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone, tzinfo
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

DEFAULT_TIMEZONE = "Asia/Dhaka"
# Used only if the OS has no timezone database: Asia/Dhaka is UTC+6 with no daylight saving.
_DHAKA_FIXED = timezone(timedelta(hours=6), name="Asia/Dhaka")


def _zone(name: str | None) -> tzinfo | None:
    text = (name or "").strip()
    if not text:
        return None
    try:
        return ZoneInfo(text)
    except (ZoneInfoNotFoundError, ValueError):
        if text == DEFAULT_TIMEZONE:
            return _DHAKA_FIXED
        logger.warning("business_date_unknown_timezone tz=%s", text)
        return None


def _app_timezone_name() -> str:
    try:
        from app.config import get_settings

        return (get_settings().app_timezone or "").strip() or DEFAULT_TIMEZONE
    except Exception:  # noqa: BLE001 — settings must never break a date default
        return DEFAULT_TIMEZONE


def _tenant_timezone_name(tenant: Any) -> str | None:
    if tenant is None:
        return None
    try:
        from sqlalchemy import inspect as sa_inspect

        state = sa_inspect(tenant, raiseerr=False)
        # An expired attribute would need a DB round trip (MissingGreenlet in async code): skip it.
        if state is not None and "timezone" in state.unloaded:
            return None
    except Exception:  # noqa: BLE001
        pass
    value = getattr(tenant, "timezone", None)
    return value if isinstance(value, str) else None


def business_timezone(tenant: Any = None) -> tzinfo:
    """Timezone for business dates: the tenant's own setting, else APP_TIMEZONE, else Asia/Dhaka."""
    zone = _zone(_tenant_timezone_name(tenant))
    if zone is None:
        zone = _zone(_app_timezone_name())
    return zone or _DHAKA_FIXED


def now_local(tenant: Any = None) -> datetime:
    """Timezone-aware current time in the business timezone."""
    return datetime.now(timezone.utc).astimezone(business_timezone(tenant))


def today_local(tenant: Any = None) -> date:
    """Today's date in the business timezone (use for default business dates)."""
    return now_local(tenant).date()


async def tenant_today(db: Any, tenant_id: int | None) -> date:
    """`today_local` for code that only has a tenant id (the Tenant row is usually already in the session)."""
    if tenant_id is None:
        return today_local()
    from app.models import Tenant

    return today_local(await db.get(Tenant, tenant_id))

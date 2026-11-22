"""Staff login-session telemetry for User Activity Phase 2.

Authorization still uses ``users.auth_session_version``. These rows record login/logout,
duration, IP and device for the Activity UI. Writes run only while
``USER_SESSION_TRACKING_ENABLED`` is true; JWT ``sid`` is still issued either way.
"""

from __future__ import annotations

import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user_login_session import UserLoginSession

logger = logging.getLogger(__name__)

ENDED_LOGOUT = "logout"
ENDED_SUPERSEDED = "superseded"
ENDED_SIGNED_OUT_BY_ADMIN = "signed_out_by_admin"
ENDED_SIGNED_OUT_BY_USER = "signed_out_by_user"
ENDED_PASSWORD_RESET = "password_reset"
ENDED_AUTHORITY_CHANGED = "authority_changed"
ENDED_EXPIRED = "expired"

LAST_SEEN_MIN_INTERVAL = timedelta(minutes=5)

_BROWSER_RE = re.compile(
    r"(Edg|Edge|Chrome|Firefox|Safari|Opera|OPR|SamsungBrowser)/[\d.]+",
    re.I,
)
_OS_RE = re.compile(r"(Windows NT [\d.]+|Android [\d.]+|iPhone OS [\d_]+|Mac OS X [\d_]+|Linux)", re.I)


def session_tracking_enabled() -> bool:
    return bool(getattr(get_settings(), "user_session_tracking_enabled", False))


def new_session_id() -> str:
    return secrets.token_urlsafe(24)[:64]


def device_label_from_ua(user_agent: str | None) -> str | None:
    if not user_agent:
        return None
    ua = user_agent.strip()
    if not ua:
        return None
    browser = None
    m = _BROWSER_RE.search(ua)
    if m:
        name = m.group(1)
        if name.lower() in ("edg", "edge"):
            browser = "Edge"
        elif name.lower() in ("opr", "opera"):
            browser = "Opera"
        else:
            browser = name
    os_name = None
    om = _OS_RE.search(ua)
    if om:
        raw = om.group(1)
        if raw.startswith("Windows"):
            os_name = "Windows"
        elif raw.startswith("Android"):
            os_name = "Android"
        elif raw.startswith("iPhone"):
            os_name = "iPhone"
        elif raw.startswith("Mac"):
            os_name = "macOS"
        else:
            os_name = "Linux"
    if browser and os_name:
        return f"{browser} on {os_name}"[:128]
    if browser:
        return browser[:128]
    if os_name:
        return os_name[:128]
    return ua[:64]


def _now() -> datetime:
    return datetime.utcnow()


async def create_login_session(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    session_id: str,
    session_version: int | None,
    ip_address: str | None,
    user_agent: str | None,
    supersede_others: bool,
) -> tuple[UserLoginSession | None, bool]:
    """Create a session row when tracking is on.

    Returns ``(row, new_device_alert)``. The alert flag means the caller should notify the user
    (in-app is written here; email should be sent in a background task so login stays fast).
    """
    if not session_tracking_enabled():
        return None, False
    now = _now()
    device_label = device_label_from_ua(user_agent)
    if supersede_others:
        await close_open_sessions(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            reason=ENDED_SUPERSEDED,
            except_session_id=session_id,
            ended_at=now,
        )
    is_new_device = await _is_new_device_or_ip(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        ip_address=ip_address,
        device_label=device_label,
    )
    row = UserLoginSession(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        session_version=session_version,
        login_at=now,
        last_seen_at=now,
        logout_at=None,
        ended_reason=None,
        ip_address=(ip_address or None),
        user_agent=(user_agent or None),
        device_label=device_label,
    )
    db.add(row)
    await db.flush()
    if is_new_device:
        await _alert_new_device_login_inapp(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            ip_address=ip_address,
            device_label=device_label,
        )
    return row, is_new_device


async def _is_new_device_or_ip(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    ip_address: str | None,
    device_label: str | None,
) -> bool:
    """True when neither this IP nor this device label has been seen for the user before."""
    prior = (
        await db.execute(
            select(UserLoginSession.ip_address, UserLoginSession.device_label).where(
                UserLoginSession.tenant_id == tenant_id,
                UserLoginSession.user_id == user_id,
            )
        )
    ).all()
    if not prior:
        # First ever tracked login — treat as baseline, not an alert.
        return False
    seen_ips = { (r.ip_address or "").strip() for r in prior if r.ip_address }
    seen_devices = { (r.device_label or "").strip() for r in prior if r.device_label }
    ip = (ip_address or "").strip()
    device = (device_label or "").strip()
    ip_known = bool(ip) and ip in seen_ips
    device_known = bool(device) and device in seen_devices
    if ip_known or device_known:
        return False
    # Unknown IP and unknown device (or missing both labels) → alert.
    return True


async def _alert_new_device_login_inapp(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    ip_address: str | None,
    device_label: str | None,
) -> None:
    if not bool(getattr(get_settings(), "user_session_new_device_alerts", True)):
        return
    try:
        from app.common.geoip_lookup import lookup_ip_location
        from app.modules.notifications.service import notify_user

        location = lookup_ip_location(ip_address)
        bits = [b for b in (device_label, ip_address, location) if b]
        detail = " · ".join(bits) if bits else "unknown device"
        notify_user(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            kind="security_new_login",
            title="New sign-in to your account",
            body=f"A sign-in used a device or IP we have not seen before ({detail}).",
            href="/app/settings/activity-logs",
        )
    except Exception:
        logger.warning("new_login_alert_failed user_id=%s", user_id, exc_info=True)


def new_device_alerts_enabled() -> bool:
    return bool(getattr(get_settings(), "user_session_new_device_alerts", True))


async def close_open_sessions(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    reason: str,
    except_session_id: str | None = None,
    only_session_id: str | None = None,
    ended_at: datetime | None = None,
) -> int:
    """Close open session rows. Returns number of rows updated. No-op when tracking is off."""
    if not session_tracking_enabled():
        return 0
    when = ended_at or _now()
    stmt = (
        update(UserLoginSession)
        .where(
            UserLoginSession.tenant_id == tenant_id,
            UserLoginSession.user_id == user_id,
            UserLoginSession.logout_at.is_(None),
        )
        .values(logout_at=when, ended_reason=reason, last_seen_at=when)
    )
    if only_session_id:
        stmt = stmt.where(UserLoginSession.session_id == only_session_id)
    if except_session_id:
        stmt = stmt.where(UserLoginSession.session_id != except_session_id)
    result = await db.execute(stmt)
    return int(result.rowcount or 0)


async def close_session_by_sid(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    session_id: str | None,
    reason: str = ENDED_LOGOUT,
) -> int:
    if not session_id:
        # No sid on older tokens: close all open rows for this user.
        return await close_open_sessions(
            db, tenant_id=tenant_id, user_id=user_id, reason=reason
        )
    return await close_open_sessions(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        reason=reason,
        only_session_id=session_id,
    )


async def touch_session_last_seen(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    session_id: str | None,
) -> None:
    """Best-effort last-seen update, at most once per LAST_SEEN_MIN_INTERVAL."""
    if not session_tracking_enabled() or not session_id:
        return
    try:
        now = _now()
        cutoff = now - LAST_SEEN_MIN_INTERVAL
        await db.execute(
            update(UserLoginSession)
            .where(
                UserLoginSession.tenant_id == tenant_id,
                UserLoginSession.user_id == user_id,
                UserLoginSession.session_id == session_id,
                UserLoginSession.logout_at.is_(None),
                UserLoginSession.last_seen_at < cutoff,
            )
            .values(last_seen_at=now)
        )
    except Exception as exc:
        logger.warning(
            "session_last_seen_failed tenant_id=%s user_id=%s err=%s",
            tenant_id,
            user_id,
            type(exc).__name__,
        )


async def expire_stale_sessions_for_tenant(
    db: AsyncSession,
    *,
    tenant_id: int,
    idle_before: datetime,
    batch_size: int = 200,
) -> int:
    """Close open sessions whose last_seen_at is older than idle_before. Returns closed count."""
    if not session_tracking_enabled():
        return 0
    total = 0
    while True:
        ids = (
            await db.execute(
                select(UserLoginSession.id)
                .where(
                    UserLoginSession.tenant_id == tenant_id,
                    UserLoginSession.logout_at.is_(None),
                    UserLoginSession.last_seen_at < idle_before,
                )
                .order_by(UserLoginSession.id)
                .limit(batch_size)
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()
        if not ids:
            break
        now = _now()
        await db.execute(
            update(UserLoginSession)
            .where(UserLoginSession.id.in_(list(ids)))
            .values(logout_at=now, ended_reason=ENDED_EXPIRED, last_seen_at=now)
        )
        total += len(ids)
        if len(ids) < batch_size:
            break
    return total


def duration_seconds(row: UserLoginSession, *, now: datetime | None = None) -> int:
    end = row.logout_at or row.last_seen_at or now or _now()
    start = row.login_at
    if end < start:
        return 0
    return int((end - start).total_seconds())


def parse_session_id(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or len(text) > 64:
        return None
    # Accept url-safe tokens and UUID forms.
    if re.fullmatch(r"[A-Za-z0-9_\-]+", text) or _is_uuid(text):
        return text
    return None


def _is_uuid(text: str) -> bool:
    try:
        uuid.UUID(text)
        return True
    except ValueError:
        return False

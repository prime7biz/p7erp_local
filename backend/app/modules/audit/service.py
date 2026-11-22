import logging
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import current_impersonator_admin_id
from app.models import AuditLog

logger = logging.getLogger(__name__)

# Keep details bounded so audit rows stay readable and storage stays predictable.
_MAX_DETAILS_LEN = 2000
_MAX_UA_LEN = 512

TECHNICAL_ACTIONS: frozenset[str] = frozenset({"API_REQUEST", "API_ERROR"})

AUTH_ACTIONS: frozenset[str] = frozenset(
    {
        "LOGIN",
        "LOGOUT",
        "LOGIN_FAILED",
        "LOGIN_LOCKED",
        "LOGIN_BLOCKED_IP",
        "STAFF_INVITE_ACCEPTED",
        "PASSWORD_RESET_REQUESTED",
        "PASSWORD_RESET_COMPLETED",
        "PASSWORD_CHANGED",
        "SETTINGS_USER_SIGN_OUT_DEVICES",
    }
)

APPROVAL_ACTIONS_SUFFIXES: tuple[str, ...] = (
    "_APPROVED",
    "_REJECTED",
    "_RECOMMENDED",
    "_VERIFIED",
    "_RATIFIED",
)

REPORT_ACTIONS: frozenset[str] = frozenset({"REPORT_VIEWED", "REPORT_EXPORTED"})

AUDIT_CATEGORIES: frozenset[str] = frozenset({"auth", "data", "approval", "report"})


def categorize_action(action: str | None) -> str:
    """Map an audit action string into a UI filter category."""
    a = (action or "").strip().upper()
    if a in TECHNICAL_ACTIONS:
        return "technical"
    if a in AUTH_ACTIONS:
        return "auth"
    if a in REPORT_ACTIONS:
        return "report"
    if any(a.endswith(suf) for suf in APPROVAL_ACTIONS_SUFFIXES) or a.endswith(".APPROVE") or "APPROVE" in a:
        return "approval"
    return "data"


def _clip(value: str | None, max_len: int) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


async def log_action(
    db: AsyncSession,
    tenant_id: int,
    action: str,
    user_id: int | None = None,
    resource: str | None = None,
    details: str | None = None,
    *,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    impersonator = current_impersonator_admin_id.get()
    if impersonator is not None:
        tag = f"impersonated_by_platform_admin={impersonator}"
        details = f"{details} [{tag}]" if details else tag
    entry = AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource=resource,
        details=_clip(details, _MAX_DETAILS_LEN),
        ip_address=_clip(ip_address, 45),
        user_agent=_clip(user_agent, _MAX_UA_LEN),
    )
    db.add(entry)
    await db.flush()


async def log_action_best_effort(
    db: AsyncSession,
    tenant_id: int,
    action: str,
    user_id: int | None = None,
    resource: str | None = None,
    details: str | None = None,
    *,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Write an audit row in a savepoint so failure cannot undo the caller's transaction.

    Used on auth paths where login/logout state must remain committed even if auditing fails.
    """
    try:
        async with db.begin_nested():
            await log_action(
                db,
                tenant_id=tenant_id,
                action=action,
                user_id=user_id,
                resource=resource,
                details=details,
                ip_address=ip_address,
                user_agent=user_agent,
            )
    except Exception as exc:
        logger.warning(
            "audit_write_failed action=%s tenant_id=%s user_id=%s err=%s",
            action,
            tenant_id,
            user_id,
            type(exc).__name__,
        )


async def log_report_activity(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    report_name: str,
    exported: bool = False,
    filters_summary: str | None = None,
) -> None:
    """Record that a user opened or exported a report (no report data values)."""
    name = (report_name or "report").strip()[:80] or "report"
    action = "REPORT_EXPORTED" if exported else "REPORT_VIEWED"
    details = f"{'Exported' if exported else 'Opened'} {name}"
    if filters_summary:
        details = f"{details} ({_clip(filters_summary, 200)})"
    await log_action_best_effort(
        db,
        tenant_id=tenant_id,
        action=action,
        user_id=user_id,
        resource=f"report:{name}"[:64],
        details=details,
    )

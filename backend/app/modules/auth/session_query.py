"""List helpers for staff login sessions (Settings User Activity)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.geoip_lookup import lookup_ip_location
from app.models import User
from app.models.user_login_session import UserLoginSession
from app.modules.auth.session_service import duration_seconds
from app.modules.settings.schemas import UserLoginSessionListResponse, UserLoginSessionRow


def _full_name(first_name: str | None, last_name: str | None) -> str | None:
    parts = [p.strip() for p in (first_name or "", last_name or "") if p and p.strip()]
    return " ".join(parts) if parts else None


async def list_login_sessions(
    db: AsyncSession,
    *,
    tenant_id: int,
    limit: int,
    offset: int,
    user_id: int | None = None,
    active_only: bool = False,
    current_session_id: str | None = None,
) -> UserLoginSessionListResponse:
    filters = [UserLoginSession.tenant_id == tenant_id]
    if user_id is not None:
        filters.append(UserLoginSession.user_id == int(user_id))
    if active_only:
        filters.append(UserLoginSession.logout_at.is_(None))

    total = int(
        (await db.execute(select(func.count()).select_from(UserLoginSession).where(*filters))).scalar() or 0
    )
    result = await db.execute(
        select(UserLoginSession, User.username, User.first_name, User.last_name)
        .outerjoin(
            User,
            and_(User.id == UserLoginSession.user_id, User.tenant_id == UserLoginSession.tenant_id),
        )
        .where(*filters)
        .order_by(desc(UserLoginSession.login_at), desc(UserLoginSession.id))
        .limit(limit)
        .offset(offset)
    )
    now = datetime.utcnow()
    items: list[UserLoginSessionRow] = []
    for row in result.all():
        sess: UserLoginSession = row.UserLoginSession
        items.append(
            UserLoginSessionRow(
                id=sess.id,
                tenant_id=sess.tenant_id,
                user_id=sess.user_id,
                username=row.username,
                full_name=_full_name(row.first_name, row.last_name),
                session_id=sess.session_id,
                login_at=sess.login_at,
                last_seen_at=sess.last_seen_at,
                logout_at=sess.logout_at,
                ended_reason=sess.ended_reason,
                ip_address=sess.ip_address,
                user_agent=sess.user_agent,
                device_label=sess.device_label,
                location=lookup_ip_location(sess.ip_address),
                is_active=sess.logout_at is None,
                duration_seconds=duration_seconds(sess, now=now),
                is_current=bool(current_session_id and sess.session_id == current_session_id and sess.logout_at is None),
            )
        )
    return UserLoginSessionListResponse(items=items, total=total, limit=limit, offset=offset)

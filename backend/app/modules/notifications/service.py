"""Create personal notifications from any module.

`notify_user` only adds a row to the caller's session; the caller's normal commit
persists it together with the business change, so a failed request leaves no
orphan notification.
"""

from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import UserNotification

logger = logging.getLogger(__name__)


def notify_user(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    kind: str,
    title: str,
    body: str | None = None,
    href: str | None = None,
    actor_user_id: int | None = None,
) -> None:
    """Queue a notification for `user_id`; skipped when there is no recipient or the actor is the recipient."""
    if not user_id or user_id == actor_user_id:
        return
    if href and not href.startswith("/app/"):
        href = None
    try:
        db.add(
            UserNotification(
                tenant_id=tenant_id,
                user_id=user_id,
                kind=kind[:64],
                title=title[:200],
                body=body,
                href=href[:300] if href else None,
            )
        )
    except Exception:
        logger.exception("notify_user_failed tenant_id=%s user_id=%s kind=%s", tenant_id, user_id, kind)

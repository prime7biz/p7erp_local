"""Header bell inbox: list, unread count, mark read."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.notification import UserNotification

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: str | None
    href: str | None
    read: bool
    created_at: datetime


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    unread_count: int


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _mine(tenant: Tenant, user: User):
    return (UserNotification.tenant_id == tenant.id, UserNotification.user_id == user.id)


@router.get("", response_model=NotificationListOut)
async def list_notifications(
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = False,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(UserNotification).where(*_mine(tenant, user))
    if unread_only:
        stmt = stmt.where(UserNotification.read_at.is_(None))
    rows = (await db.execute(stmt.order_by(UserNotification.id.desc()).limit(limit))).scalars().all()
    unread = int(
        await db.scalar(
            select(func.count()).select_from(UserNotification).where(*_mine(tenant, user), UserNotification.read_at.is_(None))
        )
        or 0
    )
    return NotificationListOut(
        items=[
            NotificationOut(
                id=r.id, kind=r.kind, title=r.title, body=r.body, href=r.href, read=r.read_at is not None, created_at=r.created_at
            )
            for r in rows
        ],
        unread_count=unread,
    )


@router.post("/{notification_id}/read", status_code=204)
async def mark_read(
    notification_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        update(UserNotification)
        .where(*_mine(tenant, user), UserNotification.id == notification_id, UserNotification.read_at.is_(None))
        .values(read_at=datetime.utcnow())
    )
    await db.commit()
    if result.rowcount == 0:
        exists = await db.scalar(select(UserNotification.id).where(*_mine(tenant, user), UserNotification.id == notification_id))
        if not exists:
            raise HTTPException(status_code=404, detail="Notification not found")


@router.post("/read-all", status_code=204)
async def mark_all_read(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await db.execute(
        update(UserNotification)
        .where(*_mine(tenant, user), UserNotification.read_at.is_(None))
        .values(read_at=datetime.utcnow())
    )
    await db.commit()

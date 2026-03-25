"""Active platform announcements for the current tenant."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import PlatformAnnouncement, Tenant, User

router = APIRouter(prefix="/announcements", tags=["announcements"])


@router.get("/active")
async def active_announcements(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    q = select(PlatformAnnouncement).where(
        and_(
            PlatformAnnouncement.is_active.is_(True),
            or_(
                PlatformAnnouncement.target == "all",
                PlatformAnnouncement.target_tenant_id == tenant.id,
            ),
            or_(PlatformAnnouncement.starts_at.is_(None), PlatformAnnouncement.starts_at <= now),
            or_(PlatformAnnouncement.expires_at.is_(None), PlatformAnnouncement.expires_at >= now),
        )
    )
    rows = (await db.execute(q.order_by(PlatformAnnouncement.id.desc()).limit(20))).scalars().all()
    return {
        "items": [
            {
                "id": a.id,
                "title": a.title,
                "content": a.content,
                "type": a.type,
            }
            for a in rows
        ]
    }

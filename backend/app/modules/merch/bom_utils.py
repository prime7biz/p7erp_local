"""Shared BOM helpers for merchandising routes (legacy + split routers)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bom
from app.modules.merch import constants as merch_c

GOVERNED_BOM_STATUSES = merch_c.GOVERNED_BOM_STATUSES


async def get_latest_governed_bom(
    db: AsyncSession,
    *,
    tenant_id: int,
    style_id: int,
) -> Bom | None:
    result = await db.execute(
        select(Bom)
        .where(
            Bom.tenant_id == tenant_id,
            Bom.style_id == style_id,
            Bom.status.in_(GOVERNED_BOM_STATUSES),
        )
        .order_by(Bom.version_no.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()

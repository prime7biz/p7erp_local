"""Validate optional style / colourway tags (Phase 2A). Cross-tenant ids look like not found."""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.models.merch import GarmentStyle, StyleColorway


async def resolve_style_colorway(
    db: AsyncSession,
    *,
    tenant_id: int,
    style_id: int | None,
    colorway_id: int | None,
) -> tuple[int | None, int | None]:
    if style_id is None and colorway_id is None:
        return None, None
    if colorway_id is not None and style_id is None:
        raise HTTPException(status_code=400, detail="style_id is required when colorway_id is set")
    if style_id is not None:
        await ensure_owned(db, GarmentStyle, style_id, tenant_id, "Style")
    if colorway_id is not None:
        cw = await ensure_owned(db, StyleColorway, colorway_id, tenant_id, "Colourway")
        if int(cw.style_id) != int(style_id):
            raise HTTPException(status_code=400, detail="Colourway does not belong to the selected style")
    return style_id, colorway_id

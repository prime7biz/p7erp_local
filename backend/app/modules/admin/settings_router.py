"""Platform-wide settings (kill switch, maintenance)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import PlatformSettings
from app.modules.admin.auth import AdminContext, any_admin, log_admin_action, super_only

router = APIRouter(prefix="/settings", tags=["platform-admin-settings"])


@router.get("")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    row = await db.get(PlatformSettings, 1)
    if not row:
        row = PlatformSettings(id=1, gemini_kill_switch=False, maintenance_mode=False)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return {
        "gemini_kill_switch": row.gemini_kill_switch,
        "maintenance_mode": row.maintenance_mode,
    }


@router.put("")
async def put_platform_settings(
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    row = await db.get(PlatformSettings, 1)
    if not row:
        row = PlatformSettings(id=1, gemini_kill_switch=False, maintenance_mode=False)
        db.add(row)
        await db.flush()
    if "gemini_kill_switch" in body:
        row.gemini_kill_switch = bool(body["gemini_kill_switch"])
    if "maintenance_mode" in body:
        row.maintenance_mode = bool(body["maintenance_mode"])
    row.updated_at = datetime.utcnow()
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="PLATFORM_SETTINGS_UPDATE",
        resource="platform_settings",
        details=str(body),
    )
    await db.commit()
    return {
        "gemini_kill_switch": row.gemini_kill_switch,
        "maintenance_mode": row.maintenance_mode,
    }

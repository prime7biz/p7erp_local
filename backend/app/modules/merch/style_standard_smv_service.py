"""Governed style standard SMV (Manufacturing Intelligence Phase 2, R4; migration 299).

`garment_styles.standard_smv` is the per-piece SMV a planner approved for a style (from an IE study, history, the
buyer ...). It is written only here (PUT /mfg-intelligence/styles/{id}/standard-smv, permission
`production.planning.approve`, audited with the old and new value and a reason). The Phase 1 SMV resolver reads it
as a source only while the tenant flag `mfg_integrated_planning_v1` is on.

The service locks the style row and never commits (the router does).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GarmentStyle, Tenant, User
from app.modules.audit.service import log_action
from app.modules.merch.route_stages import choice

SMV_SOURCES = ("OB", "IE_STUDY", "HISTORICAL", "BUYER", "ESTIMATE")
SMV_CONFIDENCES = ("HIGH", "MEDIUM", "LOW")
MAX_SMV = Decimal("999.9999")


class StandardSmvIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    smv: Decimal = Field(..., gt=0, le=MAX_SMV, max_digits=8, decimal_places=4)
    source: str
    confidence: str
    reason: str = Field(..., min_length=5, max_length=2000)

    @field_validator("source")
    @classmethod
    def _v_source(cls, v: str) -> str:
        out = choice(v, SMV_SOURCES, "source")
        if out is None:
            raise ValueError("source is required")
        return out

    @field_validator("confidence")
    @classmethod
    def _v_confidence(cls, v: str) -> str:
        out = choice(v, SMV_CONFIDENCES, "confidence")
        if out is None:
            raise ValueError("confidence is required")
        return out

    @field_validator("reason")
    @classmethod
    def _v_reason(cls, v: str) -> str:
        s = (v or "").strip()
        if len(s) < 5:
            raise ValueError("reason must be at least 5 characters")
        return s


def standard_smv_out(style: GarmentStyle) -> dict:
    return {
        "style_id": style.id,
        "style_code": style.style_code,
        "standard_smv": format(style.standard_smv, "f") if style.standard_smv is not None else None,
        "standard_smv_source": style.standard_smv_source,
        "standard_smv_confidence": style.standard_smv_confidence,
        "standard_smv_approved_by": style.standard_smv_approved_by,
        "standard_smv_updated_at": style.standard_smv_updated_at,
    }


async def set_standard_smv(
    db: AsyncSession, *, tenant: Tenant, user: User, style_id: int, data: StandardSmvIn
) -> tuple[GarmentStyle, bool]:
    """Approve (set) the style's standard SMV. Returns (style, changed); the same values again change nothing."""
    style = (
        await db.execute(
            select(GarmentStyle)
            .where(GarmentStyle.tenant_id == tenant.id, GarmentStyle.id == style_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if style is None:
        raise HTTPException(status_code=404, detail="Style not found")
    smv = data.smv.quantize(Decimal("0.0001"))
    before = style.standard_smv
    if (
        before is not None
        and Decimal(before) == smv
        and style.standard_smv_source == data.source
        and style.standard_smv_confidence == data.confidence
    ):
        return style, False
    style.standard_smv = smv
    style.standard_smv_source = data.source
    style.standard_smv_confidence = data.confidence
    style.standard_smv_approved_by = user.id
    style.standard_smv_updated_at = datetime.utcnow()
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="style_standard_smv.approve",
        resource=f"garment_style:{style.id}",
        details=(
            f"standard_smv {format(before, 'f') if before is not None else 'none'} -> {format(smv, 'f')} "
            f"source={data.source} confidence={data.confidence} reason={data.reason[:500]}"
        ),
    )
    return style, True

"""Finishing & packing stage WIP (flag ``finishing_stage_wip_v1``). Warn-only if finish > sew."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_finishing_stage_wip_v1_enabled
from app.models import GarmentStyle, HourlyProductionEntry, Order, ProductionShift, SewingLine, Tenant, User
from app.models.production import FinishingStageEntry
from app.modules.merch.constants import TNA_EVENT_FINISHING_START, TNA_EVENT_PACKING_COMPLETE
from app.modules.merch.followup_sync_service import maybe_sync_followup

STAGES = (
    "SEWING_RCV",
    "WASH_OUT",
    "WASH_RCV",
    "IRON_PRESS",
    "THREAD_TRIM",
    "BUTTON_SPOT",
    "FINISHING_QC",
    "POLY_PACK",
    "CARTON_PACK",
)


class FinishingEntryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: int = Field(..., ge=1)
    style_id: int | None = Field(None, ge=1)
    sewing_line_id: int | None = Field(None, ge=1)
    shift_id: int | None = Field(None, ge=1)
    production_date: date
    hour_slot: int | None = Field(None, ge=0, le=24)
    stage: str
    color_name: str | None = Field(None, max_length=64)
    size_name: str | None = Field(None, max_length=32)
    good_qty: Decimal = Field(default=Decimal("0"))
    reject_qty: Decimal = Field(default=Decimal("0"))
    rework_qty: Decimal = Field(default=Decimal("0"))
    carton_count: int | None = Field(None, ge=0)
    notes: str | None = Field(None, max_length=2000)

    @field_validator("stage")
    @classmethod
    def _v_stage(cls, v: str) -> str:
        s = (v or "").strip().upper()
        if s not in STAGES:
            raise ValueError(f"Invalid stage. Allowed: {', '.join(STAGES)}")
        return s


def _d(v: Any) -> Decimal:
    try:
        return Decimal(str(v if v is not None else 0))
    except Exception:
        return Decimal("0")


async def upsert_entry(
    db: AsyncSession, *, tenant: Tenant, user: User, body: FinishingEntryIn
) -> dict[str, Any]:
    if not is_finishing_stage_wip_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Not found")
    await ensure_owned(db, Order, body.order_id, tenant.id, "Order")
    await ensure_owned(db, GarmentStyle, body.style_id, tenant.id, "Style")
    await ensure_owned(db, SewingLine, body.sewing_line_id, tenant.id, "Sewing line")
    await ensure_owned(db, ProductionShift, body.shift_id, tenant.id, "Shift")

    warnings: list[str] = []
    sew_out = (
        await db.execute(
            select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                HourlyProductionEntry.tenant_id == tenant.id,
                HourlyProductionEntry.order_id == body.order_id,
                HourlyProductionEntry.department_type.ilike("%sew%"),
            )
        )
    ).scalar()
    sew_d = _d(sew_out)
    finish_so_far = (
        await db.execute(
            select(func.coalesce(func.sum(FinishingStageEntry.good_qty), 0)).where(
                FinishingStageEntry.tenant_id == tenant.id,
                FinishingStageEntry.order_id == body.order_id,
                FinishingStageEntry.stage.in_(("FINISHING_QC", "POLY_PACK", "CARTON_PACK")),
            )
        )
    ).scalar()
    if body.stage in ("FINISHING_QC", "POLY_PACK", "CARTON_PACK"):
        projected = _d(finish_so_far) + _d(body.good_qty)
        if sew_d > 0 and projected > sew_d:
            warnings.append(
                f"Finishing output ({projected}) would exceed sewing good qty ({sew_d}). Warning only."
            )

    row = FinishingStageEntry(
        tenant_id=tenant.id,
        order_id=body.order_id,
        style_id=body.style_id,
        sewing_line_id=body.sewing_line_id,
        shift_id=body.shift_id,
        production_date=body.production_date,
        hour_slot=body.hour_slot,
        stage=body.stage,
        color_name=body.color_name,
        size_name=body.size_name,
        good_qty=body.good_qty,
        reject_qty=body.reject_qty,
        rework_qty=body.rework_qty,
        carton_count=body.carton_count,
        notes=body.notes,
        entered_by_user_id=user.id,
    )
    db.add(row)
    await db.flush()

    try:
        if body.stage in ("SEWING_RCV", "WASH_RCV", "IRON_PRESS"):
            await maybe_sync_followup(
                db,
                tenant=tenant,
                order_id=body.order_id,
                event_key=TNA_EVENT_FINISHING_START,
                user_id=user.id,
                note="[auto-sync] Finishing stage logged",
            )
        if body.stage in ("POLY_PACK", "CARTON_PACK"):
            await maybe_sync_followup(
                db,
                tenant=tenant,
                order_id=body.order_id,
                event_key=TNA_EVENT_PACKING_COMPLETE,
                user_id=user.id,
                note="[auto-sync] Packing stage logged",
            )
    except Exception:
        pass

    return {"id": row.id, "warnings": warnings}


async def order_funnel(db: AsyncSession, *, tenant: Tenant, order_id: int) -> dict[str, Any]:
    if not is_finishing_stage_wip_v1_enabled(tenant.feature_flags):
        return {"enabled": False}
    await ensure_owned(db, Order, order_id, tenant.id, "Order")
    order = await db.get(Order, order_id)
    sew = _d(
        (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tenant.id,
                    HourlyProductionEntry.order_id == order_id,
                    HourlyProductionEntry.department_type.ilike("%sew%"),
                )
            )
        ).scalar()
    )
    cut = _d(
        (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tenant.id,
                    HourlyProductionEntry.order_id == order_id,
                    HourlyProductionEntry.department_type.ilike("%cut%"),
                )
            )
        ).scalar()
    )
    rows = list(
        (
            await db.execute(
                select(FinishingStageEntry).where(
                    FinishingStageEntry.tenant_id == tenant.id,
                    FinishingStageEntry.order_id == order_id,
                )
            )
        )
        .scalars()
        .all()
    )
    by_stage: dict[str, Decimal] = {s: Decimal("0") for s in STAGES}
    for r in rows:
        by_stage[r.stage] = by_stage.get(r.stage, Decimal("0")) + _d(r.good_qty)
    return {
        "enabled": True,
        "order_id": order_id,
        "order_qty": str(getattr(order, "quantity", 0) or 0),
        "cut_qty": f"{cut:.3f}",
        "sew_qty": f"{sew:.3f}",
        "stages": {k: f"{v:.3f}" for k, v in by_stage.items()},
        "warnings": (
            ["Finishing QC exceeds sewing output"]
            if by_stage.get("FINISHING_QC", Decimal("0")) > sew > 0
            else []
        ),
    }

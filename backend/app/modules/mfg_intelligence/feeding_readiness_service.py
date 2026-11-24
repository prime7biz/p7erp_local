"""4-pillar Line Feeding Readiness Gate (Fabric, Shade, Trims, Cut panels).

Uses existing material readiness when allocation flags are on; otherwise falls back
to GRN / hourly cutting heuristics. Classification: READY | AT_RISK | STARVATION_RISK.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.tenant_feature_keys import (
    is_material_alloc_ud_v1_enabled,
    is_material_budget_plan_v1_enabled,
    is_mfg_material_allocation_v1_enabled,
    is_prod_control_center_v1_enabled,
)
from app.models import HourlyProductionEntry, Order, SewingLineStyleConfig, Tenant

HUNDRED = Decimal("100")
ZERO = Decimal("0")
BUFFER_DAYS_DEFAULT = 3


def _pct(num: Decimal, den: Decimal) -> Decimal:
    if den <= 0:
        return HUNDRED if num <= 0 else ZERO
    return (num * HUNDRED / den).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def classify(
    *,
    fabric_pct: Decimal,
    shade_ok: bool | None,
    trims_pct: Decimal,
    cut_days_buffer: Decimal | None,
    days_to_start: int,
    buffer_days: int = BUFFER_DAYS_DEFAULT,
) -> str:
    starving = (
        fabric_pct < Decimal("80")
        or trims_pct < Decimal("80")
        or shade_ok is False
        or (cut_days_buffer is not None and cut_days_buffer < Decimal("1"))
    )
    if days_to_start <= buffer_days and starving:
        return "STARVATION_RISK"
    if starving or (cut_days_buffer is not None and cut_days_buffer < Decimal(str(buffer_days))):
        return "AT_RISK"
    if fabric_pct >= Decimal("95") and trims_pct >= Decimal("95") and shade_ok is not False:
        return "READY"
    return "AT_RISK"


async def feeding_readiness_for_config(
    db: AsyncSession,
    *,
    tenant: Tenant,
    config: SewingLineStyleConfig,
    as_of: date | None = None,
    buffer_days: int = BUFFER_DAYS_DEFAULT,
) -> dict[str, Any]:
    as_of = as_of or today_local(tenant)
    start = config.start_date or as_of
    days_to_start = max(0, (start - as_of).days)

    fabric_pct = ZERO
    trims_pct = ZERO
    shade_ok: bool | None = None
    material_status = "UNKNOWN"
    reasons: list[str] = []
    rm_allocated_qty: Decimal | None = None
    rm_allocation_source: str | None = None
    order: Order | None = None

    if config.order_id:
        order = await db.get(Order, config.order_id)
        if order is not None and order.tenant_id != tenant.id:
            order = None

    if order is not None and is_mfg_material_allocation_v1_enabled(tenant.feature_flags):
        try:
            from app.modules.mfg_intelligence.allocation_readiness_service import compute_material_v3

            mat = await compute_material_v3(db, tenant.id, order)
            material_status = mat.status
            # Approximate fabric/trims split from line reason codes when detailed split unavailable.
            if mat.status == "READY":
                fabric_pct = HUNDRED
                trims_pct = HUNDRED
                shade_ok = True
            elif mat.status == "PARTIAL":
                fabric_pct = Decimal("70")
                trims_pct = Decimal("70")
                shade_ok = None
                reasons.extend(list(mat.reason_codes or [])[:5])
            else:
                fabric_pct = Decimal("30")
                trims_pct = Decimal("30")
                shade_ok = False if "SUPPLY_NOT_PEGGED" in (mat.reason_codes or []) else None
                reasons.extend(list(mat.reason_codes or [])[:5])
        except Exception:
            reasons.append("MATERIAL_READINESS_ERROR")

    # Additive RM layer-allocation bridge (read-only; flag OFF keeps legacy behaviour above).
    if order is not None and is_material_alloc_ud_v1_enabled(tenant.feature_flags):
        try:
            from app.models.material_control_alloc import MaterialLayerAllocation

            alloc_qty = (
                await db.execute(
                    select(
                        func.coalesce(
                            func.sum(
                                MaterialLayerAllocation.qty_allocated
                                - MaterialLayerAllocation.qty_consumed
                                - MaterialLayerAllocation.qty_released
                            ),
                            0,
                        )
                    ).where(
                        MaterialLayerAllocation.tenant_id == tenant.id,
                        MaterialLayerAllocation.order_id == order.id,
                        MaterialLayerAllocation.status == "ACTIVE",
                    )
                )
            ).scalar()
            rm_allocated_qty = Decimal(str(alloc_qty or 0)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            rm_allocation_source = "material_layer_allocations"
            if rm_allocated_qty > ZERO:
                # Reflect RM coverage into fabric readiness without replacing trims/cut logic.
                if fabric_pct < Decimal("80"):
                    fabric_pct = max(fabric_pct, Decimal("85"))
                if material_status in ("UNKNOWN", "NOT_READY", "BLOCKED"):
                    material_status = "PARTIAL"
                reasons = [r for r in reasons if r != "SUPPLY_NOT_PEGGED"][:5]
            else:
                reasons.append("RM_ALLOCATION_EMPTY")
        except Exception:
            reasons.append("RM_ALLOCATION_READ_ERROR")

    # Additive roll shade-band bridge (read-only; flag OFF keeps legacy shade inference).
    if order is not None and is_material_budget_plan_v1_enabled(tenant.feature_flags) and order.style_id:
        try:
            from app.models.material_control_alloc import MaterialRoll

            rolls = list(
                (
                    await db.execute(
                        select(MaterialRoll.shade_band, MaterialRoll.status, MaterialRoll.qty_remaining).where(
                            MaterialRoll.tenant_id == tenant.id,
                            MaterialRoll.style_id == order.style_id,
                        ).limit(100)
                    )
                ).all()
            )
            if not rolls:
                shade_ok = None
            else:
                available = [
                    r
                    for r in rolls
                    if str(r.status or "").upper() == "AVAILABLE"
                    and Decimal(str(r.qty_remaining or 0)) > ZERO
                ]
                if not available:
                    shade_ok = False
                    reasons.append("RM_ROLLS_HELD_OR_EMPTY")
                elif any(not (r.shade_band or "").strip() for r in available):
                    shade_ok = False
                    reasons.append("RM_SHADE_MISSING_OR_HOLD")
                else:
                    shade_ok = True
        except Exception:
            reasons.append("RM_SHADE_READ_ERROR")

    # Cut panel buffer: sewing good qty vs cutting good qty (hourly) as a rough days-of-feed.
    cut_days_buffer: Decimal | None = None
    if config.order_id:
        cut = (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tenant.id,
                    HourlyProductionEntry.order_id == config.order_id,
                    HourlyProductionEntry.department_type.ilike("%cut%"),
                )
            )
        ).scalar()
        sew = (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tenant.id,
                    HourlyProductionEntry.order_id == config.order_id,
                    HourlyProductionEntry.department_type.ilike("%sew%"),
                )
            )
        ).scalar()
        cut_d = Decimal(str(cut or 0))
        sew_d = Decimal(str(sew or 0))
        buffer_pcs = cut_d - sew_d
        daily_target = Decimal(str(config.planned_qty or 0))
        days_span = 1
        if config.start_date and config.planned_end_date and config.planned_end_date >= config.start_date:
            days_span = max(1, (config.planned_end_date - config.start_date).days + 1)
        per_day = (daily_target / Decimal(days_span)) if daily_target > 0 else ZERO
        if per_day > 0:
            cut_days_buffer = (buffer_pcs / per_day).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        else:
            cut_days_buffer = Decimal("0.00") if buffer_pcs <= 0 else Decimal("9.99")

    status = classify(
        fabric_pct=fabric_pct,
        shade_ok=shade_ok,
        trims_pct=trims_pct,
        cut_days_buffer=cut_days_buffer,
        days_to_start=days_to_start,
        buffer_days=buffer_days,
    )
    out: dict[str, Any] = {
        "line_style_config_id": config.id,
        "order_id": config.order_id,
        "line_id": config.line_id,
        "start_date": start.isoformat(),
        "days_to_start": days_to_start,
        "fabric_in_house_pct": f"{fabric_pct:.2f}",
        "shade_approved": shade_ok,
        "trims_in_house_pct": f"{trims_pct:.2f}",
        "cut_panel_days_buffer": f"{cut_days_buffer:.2f}" if cut_days_buffer is not None else None,
        "material_status": material_status,
        "status": status,
        "reasons": reasons,
    }
    if rm_allocated_qty is not None:
        out["rm_allocated_qty"] = f"{rm_allocated_qty:.4f}"
        out["rm_allocation_source"] = rm_allocation_source
    return out


async def feeding_readiness_upcoming(
    db: AsyncSession,
    *,
    tenant: Tenant,
    within_days: int = 14,
    limit: int = 100,
) -> dict[str, Any]:
    if not (
        is_prod_control_center_v1_enabled(tenant.feature_flags)
        or is_mfg_material_allocation_v1_enabled(tenant.feature_flags)
    ):
        return {"enabled": False, "items": []}
    as_of = today_local(tenant)
    end = as_of + timedelta(days=max(1, min(within_days, 90)))
    rows = list(
        (
            await db.execute(
                select(SewingLineStyleConfig)
                .where(
                    SewingLineStyleConfig.tenant_id == tenant.id,
                    SewingLineStyleConfig.start_date >= as_of,
                    SewingLineStyleConfig.start_date <= end,
                    SewingLineStyleConfig.status.notin_(("CANCELLED", "cancelled", "COMPLETED", "completed")),
                )
                .order_by(SewingLineStyleConfig.start_date.asc())
                .limit(min(limit, 200))
            )
        )
        .scalars()
        .all()
    )
    items = [await feeding_readiness_for_config(db, tenant=tenant, config=c, as_of=as_of) for c in rows]
    return {"enabled": True, "as_of": as_of.isoformat(), "items": items}

"""Live hourly floor efficiency + DHU board (flag ``floor_live_monitor_v1``)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import is_floor_live_monitor_v1_enabled
from app.models import (
    HourlyProductionEntry,
    LineCrewDaily,
    ProductionQcCheck,
    SewingLine,
    SewingLineStyleConfig,
    Tenant,
)
from app.models.production import ProductionDowntimeLog

HUNDRED = Decimal("100")
ZERO = Decimal("0")


def _d(v: Any) -> Decimal:
    try:
        return Decimal(str(v if v is not None else 0))
    except Exception:
        return ZERO


def _pct(n: Decimal, d: Decimal) -> Decimal:
    if d <= 0:
        return ZERO
    return (n * HUNDRED / d).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def efficiency_pct(*, good_qty: Decimal, smv: Decimal, operators: Decimal, run_minutes: Decimal) -> Decimal:
    earned = good_qty * smv
    available = operators * run_minutes
    return _pct(earned, available)


def dhu_pct(*, total_defects: Decimal, total_checked: Decimal) -> Decimal:
    return _pct(total_defects, total_checked)


def rft_pct(*, pass_qty: Decimal, total_checked: Decimal) -> Decimal:
    return _pct(pass_qty, total_checked)


async def live_board(
    db: AsyncSession,
    *,
    tenant: Tenant,
    production_date: date,
    factory_unit: str | None = None,
) -> dict[str, Any]:
    if not is_floor_live_monitor_v1_enabled(tenant.feature_flags):
        return {"enabled": False, "lines": []}

    q = select(SewingLine).where(SewingLine.tenant_id == tenant.id, SewingLine.is_active.is_(True))
    if factory_unit:
        q = q.where(SewingLine.factory_unit == factory_unit)
    lines = list((await db.execute(q.order_by(SewingLine.line_code))).scalars().all())

    # Batch: one query per table for all lines (same tenant filter), grouped by line in Python.
    line_ids = [ln.id for ln in lines]
    hourly_by_line: dict[int, list[Any]] = {}
    cfg_by_line: dict[int, Any] = {}
    crew_by_line: dict[int, Any] = {}
    qc_by_line: dict[int, list[Any]] = {}
    downtime_by_line: dict[int, Any] = {}
    if line_ids:
        for h in (
            await db.execute(
                select(HourlyProductionEntry)
                .where(
                    HourlyProductionEntry.tenant_id == tenant.id,
                    HourlyProductionEntry.line_id.in_(line_ids),
                    HourlyProductionEntry.production_date == production_date,
                    HourlyProductionEntry.department_type.ilike("%sew%"),
                )
                .order_by(HourlyProductionEntry.hour_slot)
            )
        ).scalars():
            hourly_by_line.setdefault(h.line_id, []).append(h)

        # Latest config per line (start_date <= production_date); first row per line wins.
        for cfg_row in (
            await db.execute(
                select(SewingLineStyleConfig)
                .where(
                    SewingLineStyleConfig.tenant_id == tenant.id,
                    SewingLineStyleConfig.line_id.in_(line_ids),
                    SewingLineStyleConfig.start_date <= production_date,
                )
                .order_by(SewingLineStyleConfig.start_date.desc(), SewingLineStyleConfig.id.desc())
            )
        ).scalars():
            cfg_by_line.setdefault(cfg_row.line_id, cfg_row)

        crew_by_line = {
            lid: total
            for lid, total in (
                await db.execute(
                    select(
                        LineCrewDaily.sewing_line_id,
                        func.coalesce(func.sum(LineCrewDaily.actual_present), 0),
                    )
                    .where(
                        LineCrewDaily.tenant_id == tenant.id,
                        LineCrewDaily.sewing_line_id.in_(line_ids),
                        LineCrewDaily.production_date == production_date,
                    )
                    .group_by(LineCrewDaily.sewing_line_id)
                )
            ).all()
        }

        for qc_row in (
            await db.execute(
                select(ProductionQcCheck).where(
                    ProductionQcCheck.tenant_id == tenant.id,
                    ProductionQcCheck.sewing_line_id.in_(line_ids),
                    ProductionQcCheck.production_date == production_date,
                )
            )
        ).scalars():
            qc_by_line.setdefault(qc_row.sewing_line_id, []).append(qc_row)

        downtime_by_line = {
            lid: total
            for lid, total in (
                await db.execute(
                    select(
                        ProductionDowntimeLog.sewing_line_id,
                        func.coalesce(func.sum(ProductionDowntimeLog.minutes_lost), 0),
                    )
                    .where(
                        ProductionDowntimeLog.tenant_id == tenant.id,
                        ProductionDowntimeLog.sewing_line_id.in_(line_ids),
                        ProductionDowntimeLog.production_date == production_date,
                    )
                    .group_by(ProductionDowntimeLog.sewing_line_id)
                )
            ).all()
        }

    out_lines: list[dict[str, Any]] = []
    for line in lines:
        hourly = hourly_by_line.get(line.id, [])
        target = sum((_d(h.target_qty) for h in hourly), ZERO)
        good = sum((_d(h.good_qty) for h in hourly), ZERO)
        reject = sum((_d(h.reject_qty) for h in hourly), ZERO)
        rework = sum((_d(h.rework_qty) for h in hourly), ZERO)
        inp = sum((_d(h.input_qty) for h in hourly), ZERO)

        cfg = cfg_by_line.get(line.id)
        smv = _d(cfg.smv_per_piece if cfg and cfg.smv_per_piece else 12)
        ops = _d(cfg.operator_count if cfg and cfg.operator_count else line.default_operator_count or 1)
        present = ops
        crew = crew_by_line.get(line.id)
        if crew:
            present = _d(crew)

        hours_logged = len({h.hour_slot for h in hourly}) or 1
        run_min = Decimal(hours_logged * 60)
        eff = efficiency_pct(good_qty=good, smv=smv, operators=present, run_minutes=run_min)

        qc = qc_by_line.get(line.id, [])
        checked = sum((_d(c.total_checked) for c in qc), ZERO)
        passed = sum((_d(c.pass_qty) for c in qc), ZERO)
        defects = sum((_d(getattr(c, "total_defects", None) or c.fail_qty) for c in qc), ZERO)
        dhu = dhu_pct(total_defects=defects, total_checked=checked)
        rft = rft_pct(pass_qty=passed, total_checked=checked)

        # Top defects from JSON payloads (best-effort)
        defect_counts: dict[str, int] = {}
        for c in qc:
            raw = c.defect_codes
            if isinstance(raw, dict):
                for k, v in raw.items():
                    try:
                        defect_counts[str(k)] = defect_counts.get(str(k), 0) + int(v or 0)
                    except Exception:
                        pass
            elif isinstance(raw, list):
                for item in raw:
                    if isinstance(item, dict):
                        code = str(item.get("code") or item.get("defect_code") or "")
                        qty = int(item.get("qty") or item.get("count") or 1)
                        if code:
                            defect_counts[code] = defect_counts.get(code, 0) + qty
                    elif item:
                        defect_counts[str(item)] = defect_counts.get(str(item), 0) + 1
        top_defects = sorted(defect_counts.items(), key=lambda x: -x[1])[:3]

        downtime = downtime_by_line.get(line.id)

        hours_grid = []
        by_hour = {h.hour_slot: h for h in hourly}
        for slot in range(1, 11):
            h = by_hour.get(slot)
            hours_grid.append(
                {
                    "hour_slot": slot,
                    "target_qty": float(h.target_qty) if h and h.target_qty is not None else None,
                    "good_qty": float(h.good_qty) if h and h.good_qty is not None else None,
                    "reject_qty": float(h.reject_qty) if h and h.reject_qty is not None else None,
                }
            )

        out_lines.append(
            {
                "line_id": line.id,
                "line_code": line.line_code,
                "line_name": line.name,
                "target_qty": f"{target:.3f}",
                "good_qty": f"{good:.3f}",
                "reject_qty": f"{reject:.3f}",
                "rework_qty": f"{rework:.3f}",
                "wip_qty": f"{max(ZERO, inp - good - reject):.3f}",
                "attainment_pct": f"{_pct(good, target):.2f}",
                "efficiency_pct": f"{eff:.2f}",
                "dhu_pct": f"{dhu:.2f}",
                "rft_pct": f"{rft:.2f}",
                "planned_operators": int(ops),
                "present_operators": int(present),
                "downtime_minutes": float(downtime or 0),
                "top_defects": [{"code": c, "qty": q} for c, q in top_defects],
                "hours": hours_grid,
                "order_id": cfg.order_id if cfg else None,
                "style_id": cfg.style_id if cfg else None,
            }
        )

    return {"enabled": True, "production_date": production_date.isoformat(), "lines": out_lines}

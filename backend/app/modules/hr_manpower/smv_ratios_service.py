"""Industry vs factory SMV + ratio KPIs (Phase 5). Read-only; does not rewrite MI."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr import Employee
from app.models.hr_manpower import HrManpowerDepartmentGroup, HrManpowerSettings
from app.models.merch import GarmentStyle
from app.models.production import HourlyProductionEntry, OperationBulletin, SewingLine
from app.modules.production import manpower_floor_service as floor_svc


def _dec(v: Any) -> Decimal | None:
    if v is None:
        return None
    try:
        d = Decimal(str(v))
    except (InvalidOperation, ValueError):
        return None
    return d


def _fmt(d: Decimal | None) -> str | None:
    if d is None:
        return None
    return format(d.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP), "f")


async def build_smv_comparison(
    db: AsyncSession,
    tenant_id: int,
    *,
    as_of: date | None = None,
    lookback_days: int = 14,
    limit: int = 50,
) -> dict[str, Any]:
    """Industry SMV from style standard / latest OB; factory SMV from recent sewing output.

    Factory SMV = available_operator_minutes / good_pieces when both known; else null + reason.
    """
    on = as_of or date.today()
    lookback_days = max(1, min(int(lookback_days), 90))
    limit = max(1, min(int(limit), 100))
    start = on - timedelta(days=lookback_days - 1)

    styles = list(
        (
            await db.execute(
                select(GarmentStyle)
                .where(GarmentStyle.tenant_id == tenant_id, GarmentStyle.status == "ACTIVE")
                .order_by(GarmentStyle.style_code)
                .limit(limit)
            )
        ).scalars().all()
    )
    style_ids = [int(s.id) for s in styles]

    # Latest OB per style (any status — same advisory stance as floor IE).
    latest_ob: dict[int, Decimal] = {}
    if style_ids:
        obs = list(
            (
                await db.execute(
                    select(OperationBulletin)
                    .where(
                        OperationBulletin.tenant_id == tenant_id,
                        OperationBulletin.style_id.in_(style_ids),
                    )
                    .order_by(OperationBulletin.style_id, OperationBulletin.version_no.desc())
                )
            ).scalars().all()
        )
        for ob in obs:
            sid = int(ob.style_id)
            if sid in latest_ob:
                continue
            v = _dec(ob.total_smv)
            if v is not None and v > 0:
                latest_ob[sid] = v

    # Factory-wide sewing minutes / pieces over the window (advisory aggregate).
    lines = list(
        (
            await db.execute(
                select(SewingLine).where(SewingLine.tenant_id == tenant_id, SewingLine.is_active.is_(True))
            )
        ).scalars().all()
    )
    # Assume 480 operator-minutes per operator per day when defaults exist (same pragmatic default as legacy).
    day_count = lookback_days
    available = Decimal("0")
    for line in lines:
        ops = max(0, int(line.default_operator_count or 0))
        available += Decimal(ops) * Decimal(480) * Decimal(day_count)

    good = (
        await db.execute(
            select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                HourlyProductionEntry.tenant_id == tenant_id,
                func.lower(func.trim(HourlyProductionEntry.department_type)) == "sewing",
                HourlyProductionEntry.production_date >= start,
                HourlyProductionEntry.production_date <= on,
            )
        )
    ).scalar_one()
    good_dec = _dec(good) or Decimal("0")
    factory_smv: Decimal | None = None
    factory_reason: str | None = None
    if available <= 0:
        factory_reason = "UNKNOWN: no line default_operator_count to estimate available minutes"
    elif good_dec <= 0:
        factory_reason = "UNKNOWN: no sewing good pieces in the lookback window"
    else:
        factory_smv = (available / good_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    rows = []
    for s in styles:
        industry = _dec(s.standard_smv)
        source = "STYLE_STANDARD"
        if industry is None or industry <= 0:
            industry = latest_ob.get(int(s.id))
            source = "OB_TOTAL" if industry is not None else "UNKNOWN"
        rows.append(
            {
                "style_id": int(s.id),
                "style_code": s.style_code,
                "style_name": s.name,
                "industry_smv": _fmt(industry if industry and industry > 0 else None),
                "industry_source": source if industry and industry > 0 else "UNKNOWN",
                "factory_smv": _fmt(factory_smv),
                "factory_reason": factory_reason,
                "variance": _fmt((factory_smv - industry) if factory_smv and industry and industry > 0 else None),
            }
        )

    return {
        "as_of": on.isoformat(),
        "lookback_days": lookback_days,
        "factory_available_operator_minutes": _fmt(available if available > 0 else None),
        "factory_good_pieces": _fmt(good_dec if good_dec > 0 else None),
        "rows": rows,
        "count": len(rows),
        "notes": [
            "Industry SMV prefers garment_styles.standard_smv, else latest OB total_smv.",
            "Factory SMV is tenant-wide sewing advisory: (sum line default operators × 480 × days) ÷ good pieces.",
            "Null factory_smv means UNKNOWN — see factory_reason.",
        ],
    }


async def build_ratios(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    settings = (
        await db.execute(select(HrManpowerSettings).where(HrManpowerSettings.tenant_id == tenant_id))
    ).scalar_one_or_none()
    targets = dict(settings.targets) if settings and isinstance(settings.targets, dict) else {}

    employees = list(
        (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True))
            )
        ).scalars().all()
    )
    by_cat: dict[str, int] = {"MANAGEMENT": 0, "STAFF": 0, "WORKER": 0, "Unclassified": 0}
    for e in employees:
        raw = (e.employee_category or "").strip().upper()
        if raw in ("MANAGEMENT", "MANAGER", "MGMT"):
            by_cat["MANAGEMENT"] += 1
        elif raw in ("STAFF", "OFFICER", "EXECUTIVE"):
            by_cat["STAFF"] += 1
        elif raw in ("WORKER", "OPERATOR", "HELPER"):
            by_cat["WORKER"] += 1
        else:
            by_cat["Unclassified"] += 1

    groups = list(
        (
            await db.execute(
                select(HrManpowerDepartmentGroup).where(HrManpowerDepartmentGroup.tenant_id == tenant_id)
            )
        ).scalars().all()
    )
    dept_to_group = {int(g.department_id): g.group_key for g in groups}
    by_dept_group = {"SEWING": 0, "CUTTING": 0, "FINISHING": 0, "OTHER": 0, "Unassigned group": 0}
    for e in employees:
        if e.department_id is None:
            by_dept_group["Unassigned group"] += 1
            continue
        gk = dept_to_group.get(int(e.department_id))
        if gk in by_dept_group:
            by_dept_group[gk] += 1
        else:
            by_dept_group["Unassigned group"] += 1

    floor = await floor_svc.build_floor_suggested(db, tenant_id, department_type="sewing", limit=200)
    ops = 0
    helpers = 0
    machines = 0
    for item in floor.get("items") or []:
        machines += int(item.get("running_machine_count") or 0)
        for role in item.get("roles") or []:
            key = (role.get("role_key") or "").lower()
            n = int(role.get("suggested_count") or 0)
            if key in ("sewing_operator", "operator"):
                ops += n
            elif key in ("sewing_helper", "helper"):
                helpers += n

    def ratio_row(name: str, actual_parts: list[int], target_key: str) -> dict[str, Any]:
        actual = ":".join(str(x) for x in actual_parts)
        target = targets.get(target_key)
        return {
            "name": name,
            "actual": actual,
            "target": str(target) if target not in (None, "") else None,
            "parts": actual_parts,
        }

    unclassified_warn = by_cat["Unclassified"] > 0

    return {
        "headcount": len(employees),
        "by_category": by_cat,
        "by_department_group": by_dept_group,
        "ratios": [
            ratio_row("operator_to_helper", [ops, helpers], "operator_to_helper"),
            ratio_row(
                "sewing_cutting_finishing",
                [by_dept_group["SEWING"], by_dept_group["CUTTING"], by_dept_group["FINISHING"]],
                "sewing_cutting_finishing",
            ),
            ratio_row("staff_to_workers", [by_cat["STAFF"], by_cat["WORKER"]], "staff_to_workers"),
            ratio_row(
                "management_staff_workers",
                [by_cat["MANAGEMENT"], by_cat["STAFF"], by_cat["WORKER"]],
                "management_staff_workers",
            ),
            {
                "name": "running_machines_per_operator",
                "actual": _fmt((Decimal(machines) / Decimal(ops)) if ops > 0 else None),
                "target": str(targets.get("running_machines_per_operator") or "") or None,
                "parts": [machines, ops],
            },
        ],
        "data_quality": {
            "unclassified_employees": by_cat["Unclassified"],
            "warning": (
                f"{by_cat['Unclassified']} employees have no category — shown as Unclassified."
                if unclassified_warn
                else None
            ),
            "unassigned_department_group": by_dept_group["Unassigned group"],
        },
    }

"""Recompute CM actuals from hourly output, HR labor, and finance overhead."""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import Numeric, cast, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AlertDefinition,
    CmCostActual,
    CmOverheadConfig,
    Designation,
    Employee,
    HourlyProductionEntry,
    LineCrewDaily,
    Order,
    PayrollPeriod,
    PayrollRun,
    PayrollRunLine,
    ProductionCostInput,
    ProductionCrewRole,
    QuotationManufacturing,
    SewingLine,
    TenantProductionSettings,
    UnitCrewDaily,
    Voucher,
    VoucherLine,
)


def _to_float(s: object) -> float:
    try:
        return float(s or 0)
    except (TypeError, ValueError):
        return 0.0


async def _get_cm_threshold_pct(db: AsyncSession, tenant_id: int) -> float:
    r = await db.execute(select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant_id))
    row = r.scalar_one_or_none()
    if row and row.cm_alert_threshold_pct is not None:
        return float(row.cm_alert_threshold_pct)
    return 10.0


async def _quoted_cm_sum_for_order(db: AsyncSession, tenant_id: int, order_id: int) -> float | None:
    o = await db.get(Order, order_id)
    if not o or o.tenant_id != tenant_id or not o.quotation_id:
        return None
    r = await db.execute(
        select(QuotationManufacturing).where(
            QuotationManufacturing.tenant_id == tenant_id,
            QuotationManufacturing.quotation_id == o.quotation_id,
        )
    )
    rows = list(r.scalars().all())
    if not rows:
        return None
    return sum(_to_float(x.cm_per_piece) for x in rows)


async def _total_sewing_cost_for_day(db: AsyncSession, tenant_id: int, d: date) -> float:
    r = await db.execute(
        select(func.coalesce(func.sum(ProductionCostInput.total_cost), 0)).where(
            ProductionCostInput.tenant_id == tenant_id,
            ProductionCostInput.cost_date == d,
            ProductionCostInput.department_type == "sewing",
        )
    )
    total = float(r.scalar_one() or 0)
    if total > 0:
        return total
    r2 = await db.execute(
        select(func.coalesce(func.sum(ProductionCostInput.total_cost), 0)).where(
            ProductionCostInput.tenant_id == tenant_id,
            ProductionCostInput.cost_date == d,
        )
    )
    return float(r2.scalar_one() or 0)


def _month_bounds(d: date) -> tuple[date, date]:
    first = date(d.year, d.month, 1)
    if d.month == 12:
        nxt = date(d.year + 1, 1, 1)
    else:
        nxt = date(d.year, d.month + 1, 1)
    return first, nxt - timedelta(days=1)


def _safe_days(start: date | None, end: date | None) -> int:
    if not start or not end:
        return 26
    try:
        return max(1, (end - start).days + 1)
    except Exception:
        return 26


async def _get_employee_daily_rates(db: AsyncSession, tenant_id: int) -> tuple[dict[int, float], dict[str, float]]:
    run_q = await db.execute(
        select(PayrollRun.id, PayrollPeriod.start_date, PayrollPeriod.end_date)
        .join(PayrollPeriod, PayrollPeriod.id == PayrollRun.period_id)
        .where(PayrollRun.tenant_id == tenant_id)
        .order_by(PayrollRun.run_date.desc(), PayrollRun.id.desc())
        .limit(1)
    )
    run = run_q.first()
    if not run:
        return {}, {}
    run_id, start_date, end_date = run
    days = _safe_days(start_date, end_date)
    rows = list(
        (
            await db.execute(
                select(
                    PayrollRunLine.employee_id,
                    PayrollRunLine.gross_pay,
                    Employee.designation_id,
                    Designation.title,
                )
                .join(Employee, Employee.id == PayrollRunLine.employee_id, isouter=True)
                .join(Designation, Designation.id == Employee.designation_id, isouter=True)
                .where(
                    PayrollRunLine.tenant_id == tenant_id,
                    PayrollRunLine.run_id == run_id,
                )
            )
        ).all()
    )
    emp_rate: dict[int, float] = {}
    des_acc: dict[str, list[float]] = {}
    for employee_id, gross, _designation_id, title in rows:
        try:
            rate = max(0.0, float(gross or 0) / float(days))
        except Exception:
            rate = 0.0
        emp_rate[int(employee_id)] = rate
        k = str(title or "").strip().lower()
        if k:
            des_acc.setdefault(k, []).append(rate)
    des_rate = {k: (sum(v) / len(v) if v else 0.0) for k, v in des_acc.items()}
    return emp_rate, des_rate


async def _line_labor_cost_pool_for_day(db: AsyncSession, tenant_id: int, d: date) -> tuple[dict[int, float], float, bool]:
    rows = list(
        (
            await db.execute(
                select(
                    LineCrewDaily.sewing_line_id,
                    LineCrewDaily.planned_count,
                    LineCrewDaily.actual_present,
                    LineCrewDaily.employee_id,
                    ProductionCrewRole.designation_filter,
                )
                .join(ProductionCrewRole, ProductionCrewRole.id == LineCrewDaily.crew_role_id)
                .where(
                    LineCrewDaily.tenant_id == tenant_id,
                    LineCrewDaily.production_date == d,
                )
            )
        ).all()
    )
    if not rows:
        return {}, 0.0, False
    emp_rate, des_rate = await _get_employee_daily_rates(db, tenant_id)
    line_cost: dict[int, float] = {}
    for line_id, planned, actual, employee_id, des_filter in rows:
        count = int(actual or 0)
        if count <= 0:
            count = int(planned or 0)
        if employee_id and int(employee_id) in emp_rate:
            rate = emp_rate[int(employee_id)]
        else:
            rate = des_rate.get(str(des_filter or "").strip().lower(), 0.0)
        line_cost[int(line_id)] = line_cost.get(int(line_id), 0.0) + max(0.0, float(count) * float(rate))
    # optional unit crew treated as indirect labor and spread equally into line pools
    unit_rows = list(
        (
            await db.execute(
                select(
                    UnitCrewDaily.planned_count,
                    UnitCrewDaily.actual_present,
                    UnitCrewDaily.employee_id,
                    ProductionCrewRole.designation_filter,
                )
                .join(ProductionCrewRole, ProductionCrewRole.id == UnitCrewDaily.crew_role_id)
                .where(UnitCrewDaily.tenant_id == tenant_id, UnitCrewDaily.production_date == d)
            )
        ).all()
    )
    indirect = 0.0
    for planned, actual, employee_id, des_filter in unit_rows:
        count = int(actual or 0)
        if count <= 0:
            count = int(planned or 0)
        if employee_id and int(employee_id) in emp_rate:
            rate = emp_rate[int(employee_id)]
        else:
            rate = des_rate.get(str(des_filter or "").strip().lower(), 0.0)
        indirect += max(0.0, float(count) * float(rate))
    if indirect > 0:
        active_lines = list(
            (
                await db.execute(
                    select(SewingLine.id).where(SewingLine.tenant_id == tenant_id, SewingLine.is_active.is_(True))
                )
            ).scalars().all()
        )
        if active_lines:
            share = indirect / float(len(active_lines))
            for lid in active_lines:
                line_cost[int(lid)] = line_cost.get(int(lid), 0.0) + share
    return line_cost, sum(line_cost.values()), True


async def _line_good_qty_for_day(db: AsyncSession, tenant_id: int, d: date) -> tuple[dict[int, float], float]:
    q = await db.execute(
        select(HourlyProductionEntry.line_id, func.coalesce(func.sum(func.coalesce(HourlyProductionEntry.good_qty, 0)), 0))
        .where(
            HourlyProductionEntry.tenant_id == tenant_id,
            HourlyProductionEntry.production_date == d,
            HourlyProductionEntry.department_type == "sewing",
            HourlyProductionEntry.line_id.isnot(None),
        )
        .group_by(HourlyProductionEntry.line_id)
    )
    by_line: dict[int, float] = {}
    total = 0.0
    for line_id, qty in q.all():
        f = float(qty or 0)
        if line_id is None:
            continue
        by_line[int(line_id)] = f
        total += f
    return by_line, total


async def _line_running_machines(db: AsyncSession, tenant_id: int) -> tuple[dict[int, int], int]:
    rows = list(
        (
            await db.execute(
                select(SewingLine.id, SewingLine.running_machine_count).where(
                    SewingLine.tenant_id == tenant_id,
                    SewingLine.is_active.is_(True),
                )
            )
        ).all()
    )
    out = {int(i): int(m or 0) for i, m in rows}
    return out, sum(out.values())


async def _line_headcount_for_day(db: AsyncSession, tenant_id: int, d: date) -> tuple[dict[int, int], int]:
    rows = list(
        (
            await db.execute(
                select(
                    LineCrewDaily.sewing_line_id,
                    func.coalesce(func.sum(func.coalesce(LineCrewDaily.actual_present, LineCrewDaily.planned_count)), 0),
                )
                .where(LineCrewDaily.tenant_id == tenant_id, LineCrewDaily.production_date == d)
                .group_by(LineCrewDaily.sewing_line_id)
            )
        ).all()
    )
    out = {int(line_id): int(cnt or 0) for line_id, cnt in rows}
    return out, sum(out.values())


async def _daily_overhead_by_line(db: AsyncSession, tenant_id: int, d: date) -> tuple[dict[int, float], float]:
    configs = list(
        (
            await db.execute(
                select(CmOverheadConfig).where(
                    CmOverheadConfig.tenant_id == tenant_id,
                    CmOverheadConfig.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    if not configs:
        return {}, 0.0
    month_start, month_end = _month_bounds(d)
    active_lines = list(
        (
            await db.execute(
                select(SewingLine.id).where(SewingLine.tenant_id == tenant_id, SewingLine.is_active.is_(True))
            )
        ).scalars().all()
    )
    if not active_lines:
        return {}, 0.0
    line_ids = [int(x) for x in active_lines]
    machine_by_line, total_machine = await _line_running_machines(db, tenant_id)
    qty_by_line, total_qty = await _line_good_qty_for_day(db, tenant_id, d)
    head_by_line, total_head = await _line_headcount_for_day(db, tenant_id, d)
    out: dict[int, float] = {lid: 0.0 for lid in line_ids}
    for cfg in configs:
        vq = (
            select(func.coalesce(func.sum(func.abs(cast(VoucherLine.amount, Numeric(18, 2)))), 0))
            .select_from(VoucherLine)
            .join(Voucher, Voucher.id == VoucherLine.voucher_id)
            .where(
                VoucherLine.tenant_id == tenant_id,
                Voucher.tenant_id == tenant_id,
                Voucher.voucher_date >= month_start,
                Voucher.voucher_date <= month_end,
                Voucher.status != "VOID",
            )
        )
        if cfg.account_id is not None:
            vq = vq.where(VoucherLine.account_id == cfg.account_id)
        if cfg.cost_center_id is not None:
            vq = vq.where(VoucherLine.cost_center_id == cfg.cost_center_id)
        month_total = float((await db.execute(vq)).scalar_one() or 0.0)
        if month_total <= 0:
            continue
        days_in_month = max(1, (month_end - month_start).days + 1)
        daily_total = month_total / float(days_in_month)
        method = (cfg.allocation_method or "equal").strip().lower()
        if method == "headcount" and total_head > 0:
            for lid in line_ids:
                out[lid] += daily_total * (float(head_by_line.get(lid, 0)) / float(total_head))
        elif method == "machine_count" and total_machine > 0:
            for lid in line_ids:
                out[lid] += daily_total * (float(machine_by_line.get(lid, 0)) / float(total_machine))
        elif method == "output_volume" and total_qty > 0:
            for lid in line_ids:
                out[lid] += daily_total * (float(qty_by_line.get(lid, 0.0)) / float(total_qty))
        else:
            eq = daily_total / float(len(line_ids))
            for lid in line_ids:
                out[lid] += eq
    return out, sum(out.values())


def _cm_overrun_natural_key(order_id: int, style_id: int | None, period_date: date) -> str:
    sid = style_id if style_id is not None else 0
    return f"production_cm_overrun:order:{order_id}:period:{period_date.isoformat()}:style:{sid}"


async def _sync_cm_overrun_alerts(
    db: AsyncSession,
    tenant_id: int,
    period_date: date,
    active_natural_keys: set[str],
) -> dict[str, int]:
    """Upsert merch alerts for CM overruns and resolve stale rows for this period."""
    from app.modules.merch.alert_engine import (
        ensure_definitions_for_tenant,
        resolve_stale_production_cm_alerts_for_period,
        run_rule,
    )

    await ensure_definitions_for_tenant(db, tenant_id)
    r = await db.execute(
        select(AlertDefinition).where(
            AlertDefinition.tenant_id == tenant_id,
            AlertDefinition.rule_key == "production_cm_overrun",
        )
    )
    defn = r.scalar_one_or_none()
    created = updated = 0
    if defn and defn.is_enabled:
        created, updated = await run_rule(db, tenant_id, "production_cm_overrun", defn.id, None)
    resolved = await resolve_stale_production_cm_alerts_for_period(db, tenant_id, period_date, active_natural_keys)
    return {
        "alerts_created": created,
        "alerts_updated": updated,
        "alerts_resolved": resolved,
    }


async def recalc_cm_cost_actuals(
    db: AsyncSession,
    *,
    tenant_id: int,
    period_date: date,
) -> dict:
    """Recalculate CM rows for one date using HR labor + finance overhead."""
    threshold_pct = await _get_cm_threshold_pct(db, tenant_id)
    line_labor_pool, labor_total, has_crew_daily = await _line_labor_cost_pool_for_day(db, tenant_id, period_date)
    line_overhead_pool, overhead_total = await _daily_overhead_by_line(db, tenant_id, period_date)
    total_cost_pool = labor_total + overhead_total
    if total_cost_pool <= 0:
        # Fallback to manual daily production cost input
        total_cost_pool = await _total_sewing_cost_for_day(db, tenant_id, period_date)

    r = await db.execute(
        select(
            HourlyProductionEntry.order_id,
            HourlyProductionEntry.style_id,
            HourlyProductionEntry.line_id,
            func.coalesce(func.sum(func.coalesce(HourlyProductionEntry.good_qty, 0)), 0),
        )
        .where(
            HourlyProductionEntry.tenant_id == tenant_id,
            HourlyProductionEntry.production_date == period_date,
            HourlyProductionEntry.department_type == "sewing",
            HourlyProductionEntry.order_id.isnot(None),
        )
        .group_by(HourlyProductionEntry.order_id, HourlyProductionEntry.style_id, HourlyProductionEntry.line_id)
    )
    groups: list[tuple[int, int | None, int | None, float]] = []
    total_good = 0.0
    for order_id, style_id, line_id, qty_sum in r.all():
        g = float(qty_sum or 0)
        if g <= 0:
            continue
        oid = int(order_id)
        sid = int(style_id) if style_id is not None else None
        lid = int(line_id) if line_id is not None else None
        groups.append((oid, sid, lid, g))
        total_good += g

    await db.execute(delete(CmCostActual).where(CmCostActual.tenant_id == tenant_id, CmCostActual.period_date == period_date))
    await db.flush()

    if not groups or total_good <= 0:
        sync = await _sync_cm_overrun_alerts(db, tenant_id, period_date, set())
        return {
            "period_date": period_date.isoformat(),
            "rows_written": 0,
            "total_cost_pool": round(total_cost_pool, 4),
            "total_good_output": 0.0,
            "message": "No sewing hourly output with order_id for this date.",
            **sync,
        }

    rows_out: list[dict] = []
    line_good: dict[int, float] = {}
    for _oid, _sid, lid, g in groups:
        if lid is None:
            continue
        line_good[lid] = line_good.get(lid, 0.0) + g
    non_line_good = sum(g for _oid, _sid, lid, g in groups if lid is None)
    line_pool = {k: line_labor_pool.get(k, 0.0) + line_overhead_pool.get(k, 0.0) for k in set(line_labor_pool) | set(line_overhead_pool)}
    assigned_line_pool = sum(line_pool.values())
    unassigned_pool = max(0.0, total_cost_pool - assigned_line_pool)

    for order_id, style_id, line_id, good_qty in groups:
        if line_id is not None and line_id in line_pool and line_good.get(line_id, 0) > 0:
            allocated = line_pool[line_id] * (good_qty / float(line_good[line_id]))
        elif non_line_good > 0:
            allocated = unassigned_pool * (good_qty / non_line_good)
        else:
            share = good_qty / total_good
            allocated = total_cost_pool * share
        actual_cm = allocated / good_qty if good_qty > 0 else None
        quoted = await _quoted_cm_sum_for_order(db, tenant_id, order_id)

        variance_amt = None
        variance_pct = None
        if actual_cm is not None and quoted is not None:
            variance_amt = actual_cm - quoted
            if quoted != 0:
                variance_pct = (actual_cm / quoted - 1.0) * 100.0

        is_over = False
        if actual_cm is not None and quoted is not None and quoted > 0:
            limit = quoted * (1.0 + threshold_pct / 100.0)
            is_over = actual_cm > limit

        row = CmCostActual(
            tenant_id=tenant_id,
            order_id=order_id,
            style_id=style_id,
            line_id=line_id,
            period_date=period_date,
            total_production_cost=round(allocated, 4),
            total_good_output=round(good_qty, 4),
            actual_cm_per_piece=round(actual_cm, 6) if actual_cm is not None else None,
            quoted_cm_per_piece=round(quoted, 6) if quoted is not None else None,
            variance_amount=round(variance_amt, 6) if variance_amt is not None else None,
            variance_pct=round(variance_pct, 4) if variance_pct is not None else None,
            is_over_budget=is_over,
            alert_triggered=is_over,
        )
        db.add(row)
        rows_out.append(
            {
                "order_id": order_id,
                "style_id": style_id,
                "line_id": line_id,
                "good_qty": round(good_qty, 4),
                "allocated_cost": round(allocated, 4),
                "actual_cm_per_piece": round(actual_cm, 6) if actual_cm is not None else None,
                "quoted_cm_per_piece": round(quoted, 6) if quoted is not None else None,
                "is_over_budget": is_over,
            }
        )

    active_keys = {
        _cm_overrun_natural_key(int(r["order_id"]), r["style_id"] if r.get("style_id") is not None else None, period_date)
        for r in rows_out
        if r.get("is_over_budget")
    }
    sync = await _sync_cm_overrun_alerts(db, tenant_id, period_date, active_keys)

    return {
        "period_date": period_date.isoformat(),
        "rows_written": len(rows_out),
        "total_cost_pool": round(total_cost_pool, 4),
        "total_labor_cost": round(labor_total, 4),
        "total_overhead_cost": round(overhead_total, 4),
        "cost_source": "hr_finance" if has_crew_daily else "manual_fallback",
        "total_good_output": round(total_good, 4),
        "cm_alert_threshold_pct": threshold_pct,
        "items": rows_out,
        **sync,
    }

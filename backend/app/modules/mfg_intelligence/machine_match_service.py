"""OB vs sewing-line machine-content similarity (flag ``mfg_machine_match_v1``).

Read-only scoring. Match % = weighted coverage of required machine types by line
inventory (assigned on the target date) + idle pool availability for shortages.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_mfg_machine_match_v1_enabled
from app.models import (
    DepartmentMachine,
    OperationBulletin,
    OperationBulletinOp,
    Order,
    SewingLine,
    Tenant,
)
from app.models.mfg_planning import ProductionMachineLineAssignment

HUNDRED = Decimal("100")
ZERO = Decimal("0")
CHANGEOVER_HOURS_PER_SWAP = Decimal("0.5")


def _norm_type(raw: str | None, code: str | None = None) -> str:
    if code and str(code).strip():
        return str(code).strip().upper()
    return (raw or "").strip().upper() or "UNKNOWN"


def _dec(v: Any) -> Decimal:
    try:
        return Decimal(str(v if v is not None else 0))
    except Exception:
        return ZERO


def _pct(num: Decimal, den: Decimal) -> Decimal:
    if den <= 0:
        return ZERO
    return (num * HUNDRED / den).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass
class MachineProfile:
    counts: dict[str, int]
    smv_weights: dict[str, Decimal]

    def required_types(self) -> set[str]:
        return {k for k, n in self.counts.items() if n > 0 and k != "UNKNOWN"}


def profile_from_ops(ops: list[Any]) -> MachineProfile:
    counts: Counter[str] = Counter()
    weights: dict[str, Decimal] = {}
    for op in ops:
        code = _norm_type(getattr(op, "machine_type", None), getattr(op, "machine_type_code", None))
        counts[code] += 1
        weights[code] = weights.get(code, ZERO) + _dec(getattr(op, "smv", 0))
    return MachineProfile(counts=dict(counts), smv_weights=weights)


def score_match(
    required: MachineProfile,
    available: Counter[str],
    pool: Counter[str],
) -> dict[str, Any]:
    """Compute match %, shortages, surplus, swap count, pool coverage, changeover hours."""
    req_types = required.required_types()
    if not req_types:
        return {
            "match_pct": "100.00",
            "swap_count": 0,
            "shortage_machines": [],
            "surplus_machines": [],
            "pool_can_cover": True,
            "estimated_changeover_hours": "0.00",
            "required": dict(required.counts),
            "available": dict(available),
            "pool": dict(pool),
        }

    total_weight = sum((required.smv_weights.get(t, Decimal(required.counts.get(t, 1))) for t in req_types), ZERO)
    covered_weight = ZERO
    shortages: list[dict[str, Any]] = []
    surplus: list[dict[str, Any]] = []
    swap = 0
    pool_ok = True

    for t in sorted(req_types):
        need = int(required.counts.get(t, 0))
        have = int(available.get(t, 0))
        w = required.smv_weights.get(t, Decimal(need))
        covered = min(need, have)
        if need > 0 and total_weight > 0:
            covered_weight += w * (Decimal(covered) / Decimal(need))
        short = max(0, need - have)
        if short:
            pool_have = int(pool.get(t, 0))
            shortages.append({"machine_type": t, "need": need, "have": have, "short": short, "pool": pool_have})
            swap += short
            if pool_have < short:
                pool_ok = False
        extra = max(0, have - need)
        if extra:
            surplus.append({"machine_type": t, "extra": extra})
            swap += 0  # surplus does not force a move unless planner chooses

    # Types on line not required — optional surplus for info
    for t, have in available.items():
        if t not in req_types and t != "UNKNOWN" and have > 0:
            surplus.append({"machine_type": t, "extra": int(have)})

    match = _pct(covered_weight, total_weight) if total_weight > 0 else HUNDRED
    hours = (Decimal(swap) * CHANGEOVER_HOURS_PER_SWAP).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return {
        "match_pct": f"{match:.2f}",
        "swap_count": int(swap),
        "shortage_machines": shortages,
        "surplus_machines": surplus,
        "pool_can_cover": pool_ok,
        "estimated_changeover_hours": f"{hours:.2f}",
        "required": {k: int(v) for k, v in required.counts.items()},
        "available": {k: int(v) for k, v in available.items()},
        "pool": {k: int(v) for k, v in pool.items()},
    }


async def _active_assignments(
    db: AsyncSession, *, tenant_id: int, on_date: date, line_id: int | None = None
) -> list[ProductionMachineLineAssignment]:
    q = select(ProductionMachineLineAssignment).where(
        ProductionMachineLineAssignment.tenant_id == tenant_id,
        ProductionMachineLineAssignment.is_active.is_(True),
        ProductionMachineLineAssignment.valid_from <= on_date,
        or_(
            ProductionMachineLineAssignment.valid_to.is_(None),
            ProductionMachineLineAssignment.valid_to >= on_date,
        ),
    )
    if line_id is not None:
        q = q.where(ProductionMachineLineAssignment.sewing_line_id == line_id)
    return list((await db.execute(q)).scalars().all())


async def _machine_type_map(db: AsyncSession, tenant_id: int, machine_ids: list[int]) -> dict[int, str]:
    if not machine_ids:
        return {}
    rows = (
        await db.execute(
            select(DepartmentMachine).where(
                DepartmentMachine.tenant_id == tenant_id,
                DepartmentMachine.id.in_(machine_ids),
            )
        )
    ).scalars().all()
    return {m.id: _norm_type(m.machine_type, getattr(m, "machine_type_code", None)) for m in rows}


async def line_available_profile(
    db: AsyncSession, *, tenant_id: int, line_id: int, on_date: date
) -> Counter[str]:
    assigns = await _active_assignments(db, tenant_id=tenant_id, on_date=on_date, line_id=line_id)
    type_map = await _machine_type_map(db, tenant_id, [a.machine_id for a in assigns])
    return Counter(type_map.get(a.machine_id, "UNKNOWN") for a in assigns)


async def idle_pool_profile(
    db: AsyncSession, *, tenant_id: int, on_date: date
) -> Counter[str]:
    """Active sewing machines not currently assigned to any line on ``on_date``."""
    assigns = await _active_assignments(db, tenant_id=tenant_id, on_date=on_date)
    assigned_ids = {a.machine_id for a in assigns}
    q = select(DepartmentMachine).where(
        DepartmentMachine.tenant_id == tenant_id,
        DepartmentMachine.is_active.is_(True),
        DepartmentMachine.department_type.in_(("sewing", "SEWING", "Sewing")),
    )
    machines = list((await db.execute(q)).scalars().all())
    pool = Counter()
    for m in machines:
        if m.id in assigned_ids:
            continue
        pool[_norm_type(m.machine_type, getattr(m, "machine_type_code", None))] += 1
    return pool


async def required_profile_for_order(
    db: AsyncSession, *, tenant_id: int, order_id: int, ob_id: int | None = None
) -> MachineProfile:
    ob: OperationBulletin | None = None
    if ob_id:
        ob = await db.get(OperationBulletin, ob_id)
        if not ob or ob.tenant_id != tenant_id:
            ob = None
    if ob is None:
        r = await db.execute(
            select(OperationBulletin)
            .where(
                OperationBulletin.tenant_id == tenant_id,
                OperationBulletin.order_id == order_id,
                OperationBulletin.status.in_(("approved", "APPROVED", "active", "ACTIVE")),
            )
            .order_by(OperationBulletin.id.desc())
            .limit(1)
        )
        ob = r.scalar_one_or_none()
    if ob is None:
        r = await db.execute(
            select(OperationBulletin)
            .where(OperationBulletin.tenant_id == tenant_id, OperationBulletin.order_id == order_id)
            .order_by(OperationBulletin.id.desc())
            .limit(1)
        )
        ob = r.scalar_one_or_none()
    if not ob:
        return MachineProfile(counts={}, smv_weights={})
    ops = list(
        (
            await db.execute(
                select(OperationBulletinOp).where(
                    OperationBulletinOp.tenant_id == tenant_id,
                    OperationBulletinOp.ob_id == ob.id,
                )
            )
        )
        .scalars()
        .all()
    )
    return profile_from_ops(ops)


async def rank_lines_for_order(
    db: AsyncSession,
    *,
    tenant: Tenant,
    order_id: int,
    on_date: date,
    factory_unit: str | None = None,
) -> list[dict[str, Any]]:
    if not is_mfg_machine_match_v1_enabled(tenant.feature_flags):
        return []
    await ensure_owned(db, Order, order_id, tenant.id, "Order")
    required = await required_profile_for_order(db, tenant_id=tenant.id, order_id=order_id)
    pool = await idle_pool_profile(db, tenant_id=tenant.id, on_date=on_date)
    q = select(SewingLine).where(SewingLine.tenant_id == tenant.id, SewingLine.is_active.is_(True))
    if factory_unit:
        q = q.where(SewingLine.factory_unit == factory_unit)
    lines = list((await db.execute(q.order_by(SewingLine.line_code))).scalars().all())
    out: list[dict[str, Any]] = []
    for line in lines:
        avail = await line_available_profile(db, tenant_id=tenant.id, line_id=line.id, on_date=on_date)
        scored = score_match(required, avail, pool)
        out.append(
            {
                "line_id": line.id,
                "line_code": line.line_code,
                "line_name": line.name,
                "factory_unit": line.factory_unit,
                **scored,
            }
        )
    out.sort(key=lambda r: (-Decimal(r["match_pct"]), r["swap_count"], r["line_code"]))
    return out


async def machine_gap_for_line(
    db: AsyncSession,
    *,
    tenant: Tenant,
    line_id: int,
    order_id: int,
    on_date: date,
) -> dict[str, Any]:
    if not is_mfg_machine_match_v1_enabled(tenant.feature_flags):
        return {"enabled": False, "items": []}
    await ensure_owned(db, SewingLine, line_id, tenant.id, "Sewing line")
    await ensure_owned(db, Order, order_id, tenant.id, "Order")
    required = await required_profile_for_order(db, tenant_id=tenant.id, order_id=order_id)
    avail = await line_available_profile(db, tenant_id=tenant.id, line_id=line_id, on_date=on_date)
    pool = await idle_pool_profile(db, tenant_id=tenant.id, on_date=on_date)
    scored = score_match(required, avail, pool)
    return {"enabled": True, "line_id": line_id, "order_id": order_id, "on_date": on_date.isoformat(), **scored}

"""Floor suggested headcount + machine:operator ratio (Phase 3).

Suggested order (locked plan):
1. Line/unit crew template ``default_count`` per role
2. Else sewing line master ``default_operator_count`` / ``default_helper_count``
3. Else most recent ``LineBalanceRun.num_workstations`` for that line (any status; advisory)
4. Cutting/finishing: unit crew templates by ``department_type``
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr_manpower import HrManpowerSettings
from app.models.production import (
    LineBalanceRun,
    LineCrewTemplate,
    ProductionCrewRole,
    SewingLine,
    UnitCrewTemplate,
)

SOURCE_TEMPLATE = "TEMPLATE"
SOURCE_LINE_DEFAULT = "LINE_DEFAULT"
SOURCE_IE_ADVISORY = "IE_ADVISORY"
SOURCE_UNIT_TEMPLATE = "UNIT_TEMPLATE"
SOURCE_RATIO_TARGET = "RATIO_TARGET"
SOURCE_NONE = "NONE"


def _parse_ratio_pair(raw: Any) -> tuple[Decimal, Decimal] | None:
    """Parse ``4:1`` / ``1:0.25`` into (left, right). Returns None if invalid."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text or ":" not in text:
        return None
    left_s, right_s = text.split(":", 1)
    try:
        left = Decimal(left_s.strip())
        right = Decimal(right_s.strip())
    except (InvalidOperation, ValueError):
        return None
    if left <= 0 or right < 0:
        return None
    return left, right


def helpers_from_operator_target(operators: int, operator_to_helper: Any) -> int | None:
    """If target is ops:helpers (e.g. 4:1), return helpers for ``operators``; else None."""
    pair = _parse_ratio_pair(operator_to_helper)
    if pair is None or operators <= 0:
        return None
    ops, helpers = pair
    # helpers = operators * (helpers_part / ops_part)
    val = (Decimal(operators) * helpers / ops).quantize(Decimal("1"))
    return max(0, int(val))


def _default_line_counts(role_key: str, line: SewingLine) -> int:
    rk = (role_key or "").strip().lower()
    if rk == "line_incharge":
        return 1
    if rk in ("sewing_operator", "operator"):
        return max(0, int(line.default_operator_count or 0))
    if rk in ("sewing_helper", "helper"):
        return max(0, int(line.default_helper_count or 0))
    return 0


def _is_operator_role(role_key: str) -> bool:
    rk = (role_key or "").strip().lower()
    return rk in ("sewing_operator", "operator")


def _is_helper_role(role_key: str) -> bool:
    rk = (role_key or "").strip().lower()
    return rk in ("sewing_helper", "helper")


@dataclass
class RoleSuggestion:
    crew_role_id: int
    role_key: str
    role_name: str
    designation_id: int | None
    suggested_count: int
    source: str
    advisory_label: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "crew_role_id": self.crew_role_id,
            "role_key": self.role_key,
            "role_name": self.role_name,
            "designation_id": self.designation_id,
            "suggested_count": self.suggested_count,
            "source": self.source,
            "advisory_label": self.advisory_label,
        }


async def _manpower_targets(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    row = (
        await db.execute(select(HrManpowerSettings).where(HrManpowerSettings.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if row is None or not isinstance(row.targets, dict):
        return {}
    return dict(row.targets)


async def _latest_ie_workstations(
    db: AsyncSession, tenant_id: int, line_ids: list[int]
) -> dict[int, int]:
    if not line_ids:
        return {}
    rows = list(
        (
            await db.execute(
                select(LineBalanceRun)
                .where(
                    LineBalanceRun.tenant_id == tenant_id,
                    LineBalanceRun.line_id.in_(line_ids),
                )
                .order_by(LineBalanceRun.created_at.desc(), LineBalanceRun.id.desc())
            )
        ).scalars().all()
    )
    out: dict[int, int] = {}
    for run in rows:
        lid = int(run.line_id)
        if lid in out:
            continue
        out[lid] = max(0, int(run.num_workstations or 0))
    return out


async def build_floor_suggested(
    db: AsyncSession,
    tenant_id: int,
    *,
    factory_unit: str | None = None,
    department_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    targets = await _manpower_targets(db, tenant_id)
    op_helper_target = targets.get("operator_to_helper")

    items: list[dict[str, Any]] = []

    want_sewing = department_type is None or department_type.strip().lower() in ("", "sewing")
    if want_sewing:
        q = select(SewingLine).where(SewingLine.tenant_id == tenant_id, SewingLine.is_active.is_(True))
        if factory_unit is not None and factory_unit.strip() != "":
            q = q.where(SewingLine.factory_unit == factory_unit.strip())
        q = q.order_by(SewingLine.line_code).limit(limit).offset(offset)
        lines = list((await db.execute(q)).scalars().all())
        line_ids = [int(x.id) for x in lines]

        roles = list(
            (
                await db.execute(
                    select(ProductionCrewRole)
                    .where(
                        ProductionCrewRole.tenant_id == tenant_id,
                        ProductionCrewRole.department_type == "sewing",
                        ProductionCrewRole.is_active.is_(True),
                    )
                    .order_by(ProductionCrewRole.sort_order, ProductionCrewRole.role_name)
                )
            ).scalars().all()
        )

        templates: list[LineCrewTemplate] = []
        if line_ids:
            templates = list(
                (
                    await db.execute(
                        select(LineCrewTemplate).where(
                            LineCrewTemplate.tenant_id == tenant_id,
                            LineCrewTemplate.sewing_line_id.in_(line_ids),
                        )
                    )
                ).scalars().all()
            )
        by_line_role: dict[tuple[int, int], LineCrewTemplate] = {
            (int(t.sewing_line_id), int(t.crew_role_id)): t for t in templates
        }
        lines_with_any = {int(t.sewing_line_id) for t in templates}
        ie_ws = await _latest_ie_workstations(db, tenant_id, line_ids)

        for line in lines:
            role_rows: list[RoleSuggestion] = []
            template_empty = int(line.id) not in lines_with_any
            operator_suggested = 0
            for role in roles:
                key = (int(line.id), int(role.id))
                t = by_line_role.get(key)
                advisory: str | None = None
                if t is not None:
                    count = max(0, int(t.default_count or 0))
                    source = SOURCE_TEMPLATE
                elif template_empty:
                    count = _default_line_counts(role.role_key, line)
                    source = SOURCE_LINE_DEFAULT if count > 0 or _is_operator_role(role.role_key) or _is_helper_role(
                        role.role_key
                    ) or (role.role_key or "").strip().lower() == "line_incharge" else SOURCE_NONE
                    if _is_operator_role(role.role_key) and count <= 0:
                        ws = ie_ws.get(int(line.id), 0)
                        if ws > 0:
                            count = ws
                            source = SOURCE_IE_ADVISORY
                            advisory = "advisory (IE estimate)"
                else:
                    count = 0
                    source = SOURCE_NONE
                    if _is_operator_role(role.role_key):
                        ws = ie_ws.get(int(line.id), 0)
                        if ws > 0:
                            count = ws
                            source = SOURCE_IE_ADVISORY
                            advisory = "advisory (IE estimate)"

                if _is_helper_role(role.role_key) and count <= 0 and operator_suggested > 0:
                    derived = helpers_from_operator_target(operator_suggested, op_helper_target)
                    if derived is not None:
                        count = derived
                        source = SOURCE_RATIO_TARGET

                if _is_operator_role(role.role_key):
                    operator_suggested = count

                role_rows.append(
                    RoleSuggestion(
                        crew_role_id=int(role.id),
                        role_key=role.role_key,
                        role_name=role.role_name,
                        designation_id=role.designation_id,
                        suggested_count=count,
                        source=source if count > 0 or source != SOURCE_NONE else SOURCE_NONE,
                        advisory_label=advisory,
                    )
                )

            # Second pass: helpers may appear before operators in sort order.
            op_count = next(
                (r.suggested_count for r in role_rows if _is_operator_role(r.role_key)),
                0,
            )
            for r in role_rows:
                if _is_helper_role(r.role_key) and r.suggested_count <= 0 and op_count > 0:
                    derived = helpers_from_operator_target(op_count, op_helper_target)
                    if derived is not None:
                        r.suggested_count = derived
                        r.source = SOURCE_RATIO_TARGET

            items.append(
                {
                    "scope": "line",
                    "sewing_line_id": int(line.id),
                    "line_code": line.line_code,
                    "line_name": line.name,
                    "factory_unit": line.factory_unit,
                    "department_type": "sewing",
                    "running_machine_count": int(line.running_machine_count or 0),
                    "default_machine_count": int(line.default_machine_count or 0),
                    "roles": [r.as_dict() for r in role_rows],
                    "suggested_operators": op_count,
                    "suggested_total": sum(r.suggested_count for r in role_rows),
                }
            )

    # Cutting / finishing unit templates (machine_id IS NULL = unit-level).
    unit_depts = []
    if department_type is None or department_type.strip() == "":
        unit_depts = ["cutting", "finishing"]
    else:
        d = department_type.strip().lower()
        if d in ("cutting", "finishing"):
            unit_depts = [d]

    roles_by_dept: dict[str, list[ProductionCrewRole]] = {d: [] for d in unit_depts}
    templates_by_dept: dict[str, list[UnitCrewTemplate]] = {d: [] for d in unit_depts}
    if unit_depts:
        all_unit_roles = list(
            (
                await db.execute(
                    select(ProductionCrewRole)
                    .where(
                        ProductionCrewRole.tenant_id == tenant_id,
                        ProductionCrewRole.department_type.in_(unit_depts),
                        ProductionCrewRole.is_active.is_(True),
                    )
                    .order_by(ProductionCrewRole.sort_order, ProductionCrewRole.role_name)
                )
            ).scalars().all()
        )
        for role in all_unit_roles:
            roles_by_dept.setdefault(str(role.department_type), []).append(role)
        all_unit_templates = list(
            (
                await db.execute(
                    select(UnitCrewTemplate).where(
                        UnitCrewTemplate.tenant_id == tenant_id,
                        UnitCrewTemplate.department_type.in_(unit_depts),
                        UnitCrewTemplate.machine_id.is_(None),
                    )
                )
            ).scalars().all()
        )
        for t in all_unit_templates:
            templates_by_dept.setdefault(str(t.department_type), []).append(t)

    for dept in unit_depts:
        roles = roles_by_dept.get(dept, [])
        templates = templates_by_dept.get(dept, [])
        by_role = {int(t.crew_role_id): t for t in templates}
        role_rows: list[RoleSuggestion] = []
        for role in roles:
            t = by_role.get(int(role.id))
            if t is not None:
                count = max(0, int(t.default_count or 0))
                source = SOURCE_UNIT_TEMPLATE
            else:
                count = 0
                source = SOURCE_NONE
            role_rows.append(
                RoleSuggestion(
                    crew_role_id=int(role.id),
                    role_key=role.role_key,
                    role_name=role.role_name,
                    designation_id=role.designation_id,
                    suggested_count=count,
                    source=source if count > 0 else SOURCE_NONE,
                )
            )
        if roles:
            items.append(
                {
                    "scope": "unit",
                    "sewing_line_id": None,
                    "line_code": None,
                    "line_name": None,
                    "factory_unit": None,
                    "department_type": dept,
                    "running_machine_count": 0,
                    "default_machine_count": 0,
                    "roles": [r.as_dict() for r in role_rows],
                    "suggested_operators": next(
                        (r.suggested_count for r in role_rows if _is_operator_role(r.role_key)),
                        sum(r.suggested_count for r in role_rows),
                    ),
                    "suggested_total": sum(r.suggested_count for r in role_rows),
                }
            )

    return {"items": items, "limit": limit, "offset": offset, "count": len(items)}


async def build_machine_ratio(
    db: AsyncSession,
    tenant_id: int,
    *,
    factory_unit: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    targets = await _manpower_targets(db, tenant_id)
    target_raw = targets.get("running_machines_per_operator")
    target_val: Decimal | None = None
    if target_raw is not None and str(target_raw).strip() != "":
        try:
            target_val = Decimal(str(target_raw).strip())
            if target_val <= 0:
                target_val = None
        except (InvalidOperation, ValueError):
            target_val = None

    floor = await build_floor_suggested(
        db,
        tenant_id,
        factory_unit=factory_unit,
        department_type="sewing",
        limit=limit,
        offset=offset,
    )
    rows: list[dict[str, Any]] = []
    for item in floor["items"]:
        machines = int(item.get("running_machine_count") or 0)
        ops = int(item.get("suggested_operators") or 0)
        actual: str | None = None
        status = "UNKNOWN"
        if ops > 0:
            ratio = (Decimal(machines) / Decimal(ops)).quantize(Decimal("0.01"))
            actual = format(ratio, "f")
            if target_val is not None:
                # Allow ±15% band around target before flagging.
                lo = target_val * Decimal("0.85")
                hi = target_val * Decimal("1.15")
                if ratio < lo:
                    status = "UNDER"  # fewer machines per operator than target
                elif ratio > hi:
                    status = "OVER"
                else:
                    status = "OK"
            else:
                status = "OK"
        rows.append(
            {
                "sewing_line_id": item["sewing_line_id"],
                "line_code": item["line_code"],
                "line_name": item["line_name"],
                "factory_unit": item["factory_unit"],
                "running_machine_count": machines,
                "suggested_operators": ops,
                "actual_machines_per_operator": actual,
                "target_machines_per_operator": format(target_val, "f") if target_val is not None else None,
                "status": status,
            }
        )
    return {"items": rows, "limit": limit, "offset": offset, "count": len(rows)}

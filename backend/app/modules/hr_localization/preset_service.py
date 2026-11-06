"""Phase A: add-only, idempotent Bangladesh RMG HR starter preset.

The preset only creates rows that are missing, matched by stable ``BD-*`` codes inside the tenant.
It never overwrites a row someone already created or edited. Status is always derived from the
catalog manifest and the tenant's real rows; the ``hr_bd_rmg_preset`` flag is informational only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.tenant_feature_keys import (
    HR_OT_HOURS_PER_MONTH,
    HR_OT_MULTIPLIER,
    PAYROLL_OT_FROM_SALARY_ENABLED,
)
from app.models import Tenant
from app.models.hr import Designation
from app.models.hr_leave import LeavePolicy, LeaveType
from app.models.hr_payroll import PayrollComponent, PayrollStructure, PayrollStructureLine
from app.modules.hr_leave.leave_days import HR_WEEKEND_DAYS_KEY
from app.modules.hr_localization import bd_rmg_catalog as cat

PRESET_MARKER_KEY = "hr_bd_rmg_preset"

ItemState = Literal["missing", "matched", "edited", "conflict"]


@dataclass(frozen=True)
class ComponentSpec:
    code: str
    name: str
    calculation_type: str
    amount: Decimal


COMPONENTS: tuple[ComponentSpec, ...] = (
    ComponentSpec("BD-BASIC", "Basic wage", "PERCENT_OF_BASE", Decimal("100")),
    ComponentSpec("BD-HRENT", "House rent (50% of basic)", "PERCENT_OF_BASE", cat.HOUSE_RENT_PCT_OF_BASIC),
    ComponentSpec("BD-MEDICAL", "Medical allowance", "FIXED", cat.MEDICAL),
    ComponentSpec("BD-TRANSPORT", "Transport allowance", "FIXED", cat.TRANSPORT),
    ComponentSpec("BD-FOOD", "Food allowance", "FIXED", cat.FOOD),
)


@dataclass(frozen=True)
class LeaveSpec:
    code: str
    name: str
    annual_quota: Decimal | None  # None = no generic policy (handled by a dedicated workflow)
    carry_forward: Decimal
    capability: str


LEAVES: tuple[LeaveSpec, ...] = (
    LeaveSpec("BD-CL", "Casual leave (s.115)", Decimal(str(cat.legal_rule("casual_leave_days"))), Decimal("0"), "configured"),
    LeaveSpec("BD-SL", "Sick leave (s.116)", Decimal(str(cat.legal_rule("sick_leave_days"))), Decimal("0"), "configured"),
    LeaveSpec(
        "BD-EL",
        "Earned leave (s.117)",
        Decimal("0"),
        Decimal(str(cat.legal_rule("earned_leave_carry_cap_days"))),
        "preview_only",
    ),
    LeaveSpec("BD-ML", "Maternity leave (s.46-48)", None, Decimal("0"), "preview_only"),
)

SETTING_DEFAULTS: dict[str, Any] = {
    "hr_bd_identity_required": True,
    HR_WEEKEND_DAYS_KEY: ["friday"],
    PAYROLL_OT_FROM_SALARY_ENABLED: True,
    HR_OT_HOURS_PER_MONTH: 208,
    HR_OT_MULTIPLIER: cat.legal_rule("ot_multiplier_of_basic"),
}

LOCALE_DEFAULTS = {"country_code": "BD", "timezone": "Asia/Dhaka"}


def structure_code(rate_code: str) -> str:
    return f"BD-{rate_code}"


def designation_code(rate_code: str, index: int) -> str:
    return f"BD-{rate_code}-{index:02d}"


def _rate_label(rate: cat.WageRate) -> str:
    who = "Worker" if rate.schedule_class == "WORKER" else "Employee"
    if rate.employment_stage == "APPRENTICE":
        return f"{who} apprentice"
    return f"{who} grade {rate.grade_code}"


@dataclass
class Item:
    area: str
    code: str
    label: str
    state: ItemState
    detail: str = ""

    def as_dict(self) -> dict[str, str]:
        return {"area": self.area, "code": self.code, "label": self.label, "state": self.state, "detail": self.detail}


@dataclass
class PresetStatus:
    items: list[Item] = field(default_factory=list)
    marker: dict[str, Any] | None = None

    def counts(self) -> dict[str, int]:
        out = {"missing": 0, "matched": 0, "edited": 0, "conflict": 0}
        for i in self.items:
            out[i.state] += 1
        return out

    @property
    def complete(self) -> bool:
        return all(i.state in {"matched", "edited"} for i in self.items)


def _dec(value: Any) -> Decimal:
    return Decimal(str(value if value is not None else "0"))


async def _by_code(db: AsyncSession, model, tenant_id: int, codes: list[str]) -> dict[str, Any]:
    rows = (await db.execute(select(model).where(model.tenant_id == tenant_id, model.code.in_(codes)))).scalars().all()
    return {r.code: r for r in rows}


async def compute_status(db: AsyncSession, tenant: Tenant) -> PresetStatus:
    status = PresetStatus()
    flags = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    marker = flags.get(PRESET_MARKER_KEY)
    status.marker = marker if isinstance(marker, dict) else None

    # Designations: same code = ours; same title under another code = conflict (title is unique).
    desig_specs = [
        (designation_code(r.rate_code, i + 1), title, r)
        for r in cat.WAGE_RATES
        for i, title in enumerate(r.designations)
    ]
    by_code = await _by_code(db, Designation, tenant.id, [c for c, _t, _r in desig_specs])
    titles = (
        await db.execute(
            select(Designation.title, Designation.code).where(
                Designation.tenant_id == tenant.id, Designation.title.in_([t for _c, t, _r in desig_specs])
            )
        )
    ).all()
    title_owner = {t: c for t, c in titles}
    for code, title, rate in desig_specs:
        row = by_code.get(code)
        if row is not None:
            state: ItemState = "matched" if row.title == title else "edited"
            status.items.append(Item("designations", code, title, state, _rate_label(rate)))
        elif title in title_owner:
            status.items.append(
                Item("designations", code, title, "conflict", f"Title already used by designation {title_owner[title]}")
            )
        else:
            status.items.append(Item("designations", code, title, "missing", _rate_label(rate)))

    comps = await _by_code(db, PayrollComponent, tenant.id, [c.code for c in COMPONENTS])
    for spec in COMPONENTS:
        row = comps.get(spec.code)
        if row is None:
            status.items.append(Item("components", spec.code, spec.name, "missing"))
            continue
        same = (row.calculation_type or "").upper() == spec.calculation_type and (row.component_type or "").upper() == "EARNING"
        status.items.append(Item("components", spec.code, spec.name, "matched" if same else "edited"))

    structures = await _by_code(db, PayrollStructure, tenant.id, [structure_code(r.rate_code) for r in cat.WAGE_RATES])
    for rate in cat.WAGE_RATES:
        code = structure_code(rate.rate_code)
        row = structures.get(code)
        label = f"{_rate_label(rate)} (min gross {rate.gross:,})"
        if row is None:
            status.items.append(Item("structures", code, label, "missing"))
            continue
        lines = (
            await db.execute(
                select(PayrollStructureLine, PayrollComponent.code)
                .join(PayrollComponent, PayrollComponent.id == PayrollStructureLine.component_id)
                .where(PayrollStructureLine.tenant_id == tenant.id, PayrollStructureLine.structure_id == row.id)
            )
        ).all()
        have = {c: _dec(sl.amount) for sl, c in lines}
        expected = {c.code: c.amount for c in COMPONENTS}
        status.items.append(Item("structures", code, label, "matched" if have == expected else "edited"))

    leave_types = await _by_code(db, LeaveType, tenant.id, [s.code for s in LEAVES])
    for spec in LEAVES:
        lt = leave_types.get(spec.code)
        if lt is None:
            status.items.append(Item("leave", spec.code, spec.name, "missing", spec.capability))
            continue
        if spec.annual_quota is None:
            status.items.append(Item("leave", spec.code, spec.name, "matched", spec.capability))
            continue
        policy = (
            await db.execute(
                select(LeavePolicy)
                .where(LeavePolicy.tenant_id == tenant.id, LeavePolicy.leave_type_id == lt.id)
                .order_by(LeavePolicy.id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if policy is None:
            status.items.append(Item("leave", spec.code, spec.name, "edited", "Leave type exists without a policy"))
        else:
            same = _dec(policy.annual_quota_days) == spec.annual_quota and _dec(policy.max_carry_forward_days) == spec.carry_forward
            status.items.append(Item("leave", spec.code, spec.name, "matched" if same else "edited", spec.capability))

    for key, value in SETTING_DEFAULTS.items():
        if key not in flags:
            status.items.append(Item("settings", key, key, "missing", f"default {value}"))
        else:
            status.items.append(Item("settings", key, key, "matched" if flags[key] == value else "edited", f"current {flags[key]}"))

    for attr, value in LOCALE_DEFAULTS.items():
        current = getattr(tenant, attr, None)
        if not current:
            status.items.append(Item("locale", attr, attr, "missing", f"default {value}"))
        else:
            status.items.append(Item("locale", attr, attr, "matched" if current == value else "edited", f"current {current}"))
    currency = getattr(tenant, "base_currency", None) or ""
    status.items.append(
        Item("locale", "base_currency", "base_currency", "matched" if currency == "BDT" else "edited", f"current {currency}")
    )
    return status


@dataclass
class ApplyResult:
    created: list[dict[str, str]] = field(default_factory=list)
    skipped: list[dict[str, str]] = field(default_factory=list)
    conflicts: list[dict[str, str]] = field(default_factory=list)


async def apply_preset(db: AsyncSession, tenant: Tenant, *, user_id: int | None) -> ApplyResult:
    """Create every missing preset row. Caller must hold a ``FOR UPDATE`` lock on the tenant row
    *before* calling (so a second concurrent apply waits and then finds nothing missing), and owns
    commit / rollback."""
    status = await compute_status(db, tenant)
    result = ApplyResult()
    missing = {(i.area, i.code) for i in status.items if i.state == "missing"}
    for item in status.items:
        bucket = result.conflicts if item.state == "conflict" else result.skipped if item.state != "missing" else None
        if bucket is not None:
            bucket.append(item.as_dict())

    for rate in cat.WAGE_RATES:
        for i, title in enumerate(rate.designations):
            code = designation_code(rate.rate_code, i + 1)
            if ("designations", code) not in missing:
                continue
            db.add(
                Designation(
                    tenant_id=tenant.id,
                    code=code,
                    title=title,
                    description=(
                        f"Bangladesh RMG minimum wage {cat.WAGE_GAZETTE['published']}: {_rate_label(rate)}, "
                        f"minimum basic {rate.basic:,}, gross {rate.gross:,}"
                    ),
                    is_active=True,
                )
            )
            result.created.append({"area": "designations", "code": code, "label": title})

    comp_rows: dict[str, PayrollComponent] = await _by_code(db, PayrollComponent, tenant.id, [c.code for c in COMPONENTS])
    for spec in COMPONENTS:
        if ("components", spec.code) not in missing:
            continue
        row = PayrollComponent(
            tenant_id=tenant.id,
            code=spec.code,
            name=spec.name,
            component_type="EARNING",
            calculation_type=spec.calculation_type,
            default_amount=spec.amount,
            applies_to="ALL",
            is_active=True,
        )
        db.add(row)
        comp_rows[spec.code] = row
        result.created.append({"area": "components", "code": spec.code, "label": spec.name})
    await db.flush()

    for rate in cat.WAGE_RATES:
        code = structure_code(rate.rate_code)
        if ("structures", code) not in missing:
            continue
        if any(spec.code not in comp_rows for spec in COMPONENTS):
            result.conflicts.append(
                {"area": "structures", "code": code, "label": _rate_label(rate), "state": "conflict", "detail": "Component missing"}
            )
            continue
        apprentice = f", apprentice period {rate.apprentice_months} months" if rate.apprentice_months else ""
        structure = PayrollStructure(
            tenant_id=tenant.id,
            code=code,
            name=f"BD {_rate_label(rate)}",
            description=(
                f"Gazette {cat.WAGE_GAZETTE['notification_no']} (effective {cat.WAGE_GAZETTE['effective_from']}): "
                f"minimum basic {rate.basic:,}, house rent {rate.house_rent:,}, medical {cat.MEDICAL:,}, "
                f"transport {cat.TRANSPORT:,}, food {cat.FOOD:,}, gross {rate.gross:,}{apprentice}. "
                "Assign each employee's basic wage as the assignment base salary."
            ),
            is_active=True,
        )
        db.add(structure)
        await db.flush()
        for order, spec in enumerate(COMPONENTS):
            db.add(
                PayrollStructureLine(
                    tenant_id=tenant.id,
                    structure_id=structure.id,
                    component_id=comp_rows[spec.code].id,
                    amount=spec.amount,
                    sort_order=(order + 1) * 10,
                )
            )
        result.created.append({"area": "structures", "code": code, "label": structure.name})

    lt_rows: dict[str, LeaveType] = await _by_code(db, LeaveType, tenant.id, [s.code for s in LEAVES])
    for spec in LEAVES:
        if ("leave", spec.code) not in missing:
            continue
        lt = LeaveType(tenant_id=tenant.id, code=spec.code, name=spec.name, is_paid=True, requires_approval=True, is_active=True)
        db.add(lt)
        await db.flush()
        lt_rows[spec.code] = lt
        if spec.annual_quota is not None:
            db.add(
                LeavePolicy(
                    tenant_id=tenant.id,
                    leave_type_id=lt.id,
                    employment_type=None,
                    annual_quota_days=spec.annual_quota,
                    max_carry_forward_days=spec.carry_forward,
                    effective_from=date(today_local(tenant).year, 1, 1),
                    is_active=True,
                )
            )
        result.created.append({"area": "leave", "code": spec.code, "label": spec.name})

    flags = dict(tenant.feature_flags) if isinstance(tenant.feature_flags, dict) else {}
    for key, value in SETTING_DEFAULTS.items():
        if ("settings", key) in missing:
            flags[key] = value
            result.created.append({"area": "settings", "code": key, "label": key})
    for attr, value in LOCALE_DEFAULTS.items():
        if ("locale", attr) in missing:
            setattr(tenant, attr, value)
            result.created.append({"area": "locale", "code": attr, "label": attr})
    flags[PRESET_MARKER_KEY] = {
        "catalog_version": cat.CATALOG_VERSION,
        "source_manifest_sha256": cat.WAGE_GAZETTE["pdf_sha256"],
        "applied_at": datetime.utcnow().isoformat(timespec="seconds"),
        "applied_by": user_id,
    }
    tenant.feature_flags = flags
    await db.flush()
    return result


CAPABILITIES: tuple[dict[str, str], ...] = (
    {"area": "minimum_wage", "label": "Minimum wage schedules (4 worker + 4 employee grades, 2 apprentice rates)", "state": "configured"},
    {"area": "salary_structures", "label": "Grade salary structures (basic, house rent 50%, medical, transport, food)", "state": "configured"},
    {"area": "casual_sick_leave", "label": "Casual 10 days / sick 14 days per year", "state": "configured"},
    {"area": "earned_leave", "label": "Earned leave 1 day per 18 worked, 40-day cap", "state": "preview_only"},
    {"area": "maternity", "label": "Maternity 120 calendar days, pay = gross / 26", "state": "preview_only"},
    {"area": "festival_holidays", "label": "13 paid festival holidays; festival work compensation", "state": "preview_only"},
    {"area": "overtime", "label": "Overtime 2x basic (basic / 208 per hour)", "state": "configured"},
    {"area": "service_benefits", "label": "Gratuity, resignation, termination and death benefits", "state": "preview_only"},
    {"area": "festival_bonus", "label": "Eid / festival bonus (Rule 111(5) pending official verification)", "state": "unsupported"},
)


def capabilities(flags: dict[str, Any] | None) -> list[dict[str, str]]:
    """Capability badges. Areas move to ``enforced`` only when their strict Phase C flag is ON."""
    from app.modules.hr_localization.enforcement_flags import ENFORCEMENT_FLAGS_BY_AREA, is_area_enforced

    out = []
    for cap in CAPABILITIES:
        state = cap["state"]
        if cap["area"] in ENFORCEMENT_FLAGS_BY_AREA and is_area_enforced(flags, cap["area"]):
            state = "enforced"
        out.append({**cap, "state": state})
    return out

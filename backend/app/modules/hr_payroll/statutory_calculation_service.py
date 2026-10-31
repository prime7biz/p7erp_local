"""Sprint 5: PF / ESI / PT / gratuity statutory calculations."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.models.payroll_statutory import PayrollStatutoryConfig

ZERO = Decimal("0")

DEFAULT_MH_PT_SLABS = [
    {"from": 0, "to": 7500, "amount": 0},
    {"from": 7501, "to": 10000, "amount": 175},
    {"from": 10001, "to": None, "amount": 200},
]


def _d(v: Any) -> Decimal:
    try:
        return Decimal(str(v or 0))
    except Exception:
        return ZERO


def _money(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"))


def _pct(rate: Decimal) -> Decimal:
    """Statutory rates are stored as percent points (12 → 12%, 0.75 → 0.75%)."""
    return _d(rate) / Decimal("100")


def calculate_pf(
    basic_salary: Decimal,
    *,
    employee_rate: Decimal = Decimal("12"),
    employer_rate: Decimal = Decimal("12"),
    wage_ceiling: Decimal = Decimal("15000"),
) -> dict[str, Decimal]:
    basic = _money(_d(basic_salary))
    ceiling = _money(_d(wage_ceiling))
    wage = min(basic, ceiling) if ceiling > ZERO else basic
    ee = _money(wage * _pct(_d(employee_rate)))
    er = _money(wage * _pct(_d(employer_rate)))
    return {
        "pf_wage": wage,
        "employee_pf": ee,
        "employer_pf": er,
        "total_pf": _money(ee + er),
    }


def calculate_esi(
    gross_salary: Decimal,
    *,
    employee_rate: Decimal = Decimal("0.75"),
    employer_rate: Decimal = Decimal("3.25"),
    wage_ceiling: Decimal = Decimal("21000"),
) -> dict[str, Decimal]:
    gross = _money(_d(gross_salary))
    ceiling = _money(_d(wage_ceiling))
    if ceiling > ZERO and gross > ceiling:
        return {
            "esi_applicable": ZERO,
            "employee_esi": ZERO,
            "employer_esi": ZERO,
            "total_esi": ZERO,
        }
    ee = _money(gross * _pct(_d(employee_rate)))
    er = _money(gross * _pct(_d(employer_rate)))
    return {
        "esi_applicable": Decimal("1"),
        "employee_esi": ee,
        "employer_esi": er,
        "total_esi": _money(ee + er),
    }


def calculate_pt(gross_salary: Decimal, slabs: list[dict[str, Any]] | None = None) -> Decimal:
    gross = _money(_d(gross_salary))
    use_slabs = slabs if isinstance(slabs, list) and slabs else DEFAULT_MH_PT_SLABS
    for slab in use_slabs:
        low = _d(slab.get("from") or slab.get("min") or 0)
        high_raw = slab.get("to") if "to" in slab else slab.get("max")
        high = _d(high_raw) if high_raw is not None else None
        amt = _money(_d(slab.get("amount") or 0))
        if high is None:
            if gross >= low:
                return amt
        elif low <= gross <= high:
            return amt
    return ZERO


def calculate_gratuity(
    basic_salary: Decimal,
    years_of_service: Decimal,
    *,
    days_per_year: Decimal = Decimal("15"),
) -> Decimal:
    """Standard formula: (basic * days_per_year * years) / 26."""
    basic = _money(_d(basic_salary))
    years = _d(years_of_service)
    if basic <= ZERO or years <= ZERO:
        return ZERO
    return _money((basic * _d(days_per_year) * years) / Decimal("26"))


def calculate_all_statutory(
    *,
    basic_salary: Decimal,
    gross_salary: Decimal,
    config: PayrollStatutoryConfig | None,
    years_of_service: Decimal | None = None,
) -> dict[str, Any]:
    cfg = config
    pf = calculate_pf(
        basic_salary,
        employee_rate=_d(cfg.pf_employee_rate) if cfg else Decimal("12"),
        employer_rate=_d(cfg.pf_employer_rate) if cfg else Decimal("12"),
        wage_ceiling=_d(cfg.pf_wage_ceiling) if cfg else Decimal("15000"),
    )
    esi = calculate_esi(
        gross_salary,
        employee_rate=_d(cfg.esi_employee_rate) if cfg else Decimal("0.75"),
        employer_rate=_d(cfg.esi_employer_rate) if cfg else Decimal("3.25"),
        wage_ceiling=_d(cfg.esi_wage_ceiling) if cfg else Decimal("21000"),
    )
    pt = calculate_pt(gross_salary, cfg.pt_slabs if cfg else None)
    gratuity = ZERO
    if years_of_service is not None:
        gratuity = calculate_gratuity(
            basic_salary,
            years_of_service,
            days_per_year=_d(cfg.gratuity_days_per_year) if cfg else Decimal("15"),
        )
    employee_deductions = _money(pf["employee_pf"] + esi["employee_esi"] + pt)
    return {
        "pf": {k: str(v) for k, v in pf.items()},
        "esi": {k: str(v) for k, v in esi.items()},
        "pt_amount": str(pt),
        "pt_state": cfg.pt_state if cfg else None,
        "gratuity": str(gratuity),
        "employee_statutory_deductions": str(employee_deductions),
        "employer_contributions": str(_money(pf["employer_pf"] + esi["employer_esi"])),
    }


def statutory_config_out(row: PayrollStatutoryConfig) -> dict[str, Any]:
    return {
        "id": row.id,
        "pf_employee_rate": str(row.pf_employee_rate),
        "pf_employer_rate": str(row.pf_employer_rate),
        "esi_employee_rate": str(row.esi_employee_rate),
        "esi_employer_rate": str(row.esi_employer_rate),
        "pf_wage_ceiling": str(row.pf_wage_ceiling),
        "esi_wage_ceiling": str(row.esi_wage_ceiling),
        "pt_state": row.pt_state,
        "pt_slabs": row.pt_slabs or DEFAULT_MH_PT_SLABS,
        "gratuity_days_per_year": str(row.gratuity_days_per_year),
        "is_active": row.is_active,
    }

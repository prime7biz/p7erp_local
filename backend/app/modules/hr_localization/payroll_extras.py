"""Approved Bangladesh payroll extras (festival-work compensation, tiffin/dinner/night bills,
production bonus, festival bonus) paid through a payroll run line.

Accounting ownership: a source row is payable through exactly one owner. It is eligible for a
payroll line when it is approved, has no final settlement, and is either unlinked, already linked to
this same run line (recalculation), or linked to a line of a REJECTED / CANCELLED run. Linking locks
the rows and re-checks ownership, so payroll and a final settlement can never both take a row.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import _flag_true
from app.models import Tenant
from app.models.hr_allowance import HrAllowanceEntry, HrAllowanceRule, HrBonusAllocationLine, HrProductionBonusEntry
from app.models.hr_bd import HrBdFestivalWorkEntry
from app.models.hr_payroll import BonusDeclaration, PayrollRun, PayrollRunLine
from app.modules.hr_localization.enforcement_flags import HR_BD_FESTIVAL_COMPENSATION_ENABLED

HR_MEAL_NIGHT_BILLS_ENABLED = "hr_meal_night_bills_enabled"
HR_PRODUCTION_BONUS_ENABLED = "hr_production_bonus_enabled"
HR_FESTIVAL_BONUS_ENABLED = "hr_festival_bonus_enabled"

DEAD_RUN_STATUSES = ("REJECTED", "CANCELLED")


@dataclass
class Extra:
    code: str
    name: str
    amount: Decimal


@dataclass
class Extras:
    lines: list[Extra] = field(default_factory=list)
    sources: dict[str, list[int]] = field(default_factory=dict)

    @property
    def total(self) -> Decimal:
        return sum((x.amount for x in self.lines), Decimal("0"))


SOURCES = {
    "festival_work": HrBdFestivalWorkEntry,
    "allowance": HrAllowanceEntry,
    "production_bonus": HrProductionBonusEntry,
    "festival_bonus": HrBonusAllocationLine,
}


def _eligible_owner(model, run_line_id: int | None):
    dead_line = (
        select(PayrollRunLine.id)
        .join(PayrollRun, PayrollRun.id == PayrollRunLine.run_id)
        .where(PayrollRun.status.in_(DEAD_RUN_STATUSES))
    )
    conds = [model.payroll_run_line_id.is_(None), model.payroll_run_line_id.in_(dead_line)]
    if run_line_id is not None:
        conds.append(model.payroll_run_line_id == run_line_id)
    return and_(model.final_settlement_id.is_(None), or_(*conds))


async def collect_extras(
    db: AsyncSession, *, tenant: Tenant, employee_id: int, start: date, end: date, run_line_id: int | None
) -> Extras:
    flags = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    out = Extras()
    tid = tenant.id

    if _flag_true(flags, HR_BD_FESTIVAL_COMPENSATION_ENABLED):
        rows = (
            await db.execute(
                select(HrBdFestivalWorkEntry.id, HrBdFestivalWorkEntry.compensation_amount).where(
                    HrBdFestivalWorkEntry.tenant_id == tid,
                    HrBdFestivalWorkEntry.employee_id == employee_id,
                    HrBdFestivalWorkEntry.status == "APPROVED",
                    HrBdFestivalWorkEntry.work_date >= start,
                    HrBdFestivalWorkEntry.work_date <= end,
                    _eligible_owner(HrBdFestivalWorkEntry, run_line_id),
                )
            )
        ).all()
        if rows:
            out.lines.append(Extra("BD-FESTIVAL-WORK", "Festival holiday work (s.118(3))", sum((a for _i, a in rows), Decimal("0"))))
            out.sources["festival_work"] = [i for i, _a in rows]

    if _flag_true(flags, HR_MEAL_NIGHT_BILLS_ENABLED):
        rows = (
            await db.execute(
                select(HrAllowanceEntry.id, HrAllowanceEntry.amount, HrAllowanceRule.bill_type)
                .join(HrAllowanceRule, HrAllowanceRule.id == HrAllowanceEntry.rule_id)
                .where(
                    HrAllowanceEntry.tenant_id == tid,
                    HrAllowanceEntry.employee_id == employee_id,
                    HrAllowanceEntry.status == "APPROVED",
                    HrAllowanceEntry.work_date >= start,
                    HrAllowanceEntry.work_date <= end,
                    _eligible_owner(HrAllowanceEntry, run_line_id),
                )
            )
        ).all()
        by_type: dict[str, Decimal] = {}
        for _i, amount, bill_type in rows:
            by_type[bill_type] = by_type.get(bill_type, Decimal("0")) + amount
        for bill_type in ("TIFFIN", "DINNER", "NIGHT"):
            if bill_type in by_type:
                out.lines.append(Extra(f"BD-{bill_type}", f"{bill_type.title()} bill", by_type[bill_type]))
        if rows:
            out.sources["allowance"] = [i for i, _a, _t in rows]

    if _flag_true(flags, HR_PRODUCTION_BONUS_ENABLED):
        rows = (
            await db.execute(
                select(HrProductionBonusEntry.id, HrProductionBonusEntry.amount).where(
                    HrProductionBonusEntry.tenant_id == tid,
                    HrProductionBonusEntry.employee_id == employee_id,
                    HrProductionBonusEntry.status == "APPROVED",
                    HrProductionBonusEntry.period_end >= start,
                    HrProductionBonusEntry.period_end <= end,
                    _eligible_owner(HrProductionBonusEntry, run_line_id),
                )
            )
        ).all()
        if rows:
            out.lines.append(Extra("BD-PROD-BONUS", "Production bonus", sum((a for _i, a in rows), Decimal("0"))))
            out.sources["production_bonus"] = [i for i, _a in rows]

    if _flag_true(flags, HR_FESTIVAL_BONUS_ENABLED):
        rows = (
            await db.execute(
                select(HrBonusAllocationLine.id, HrBonusAllocationLine.amount)
                .join(BonusDeclaration, BonusDeclaration.id == HrBonusAllocationLine.bonus_declaration_id)
                .where(
                    HrBonusAllocationLine.tenant_id == tid,
                    HrBonusAllocationLine.employee_id == employee_id,
                    HrBonusAllocationLine.status == "APPROVED",
                    BonusDeclaration.tenant_id == tid,
                    BonusDeclaration.status == "APPROVED",
                    _eligible_owner(HrBonusAllocationLine, run_line_id),
                )
            )
        ).all()
        if rows:
            out.lines.append(Extra("BD-FESTIVAL-BONUS", "Festival bonus", sum((a for _i, a in rows), Decimal("0"))))
            out.sources["festival_bonus"] = [i for i, _a in rows]
    return out


async def link_extras(db: AsyncSession, *, tenant_id: int, run_line_id: int, sources: dict[str, Any]) -> None:
    """Point every source row at ``run_line_id`` (and release rows this line no longer uses).

    Rows are locked first; if any was taken by a final settlement or another live run meanwhile,
    the whole payroll apply is refused (409) and the caller rolls back.
    """
    for key, model in SOURCES.items():
        ids = [int(x) for x in (sources or {}).get(key, [])]
        if ids:
            rows = (
                await db.execute(
                    select(model).where(model.tenant_id == tenant_id, model.id.in_(ids)).with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalars().all()
            linked = {r.payroll_run_line_id for r in rows if r.payroll_run_line_id not in (None, run_line_id)}
            dead = set(
                (
                    await db.execute(
                        select(PayrollRunLine.id)
                        .join(PayrollRun, PayrollRun.id == PayrollRunLine.run_id)
                        .where(
                            PayrollRunLine.tenant_id == tenant_id,
                            PayrollRunLine.id.in_(linked or {0}),
                            PayrollRun.status.in_(DEAD_RUN_STATUSES),
                        )
                    )
                ).scalars()
            )
            for row in rows:
                owned_elsewhere = row.payroll_run_line_id not in (None, run_line_id) and row.payroll_run_line_id not in dead
                if row.final_settlement_id is not None or owned_elsewhere:
                    raise HTTPException(
                        status_code=409,
                        detail=f"{key} #{row.id} is already paid through another payroll line or final settlement; recalculate",
                    )
                row.payroll_run_line_id = run_line_id
        await db.execute(
            update(model)
            .where(model.tenant_id == tenant_id, model.payroll_run_line_id == run_line_id, model.id.not_in(ids or [0]))
            .values(payroll_run_line_id=None)
        )

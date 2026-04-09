"""Deterministic executive cockpit aggregates."""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    BankAccount,
    CashForecastLine,
    CashForecastScenario,
    FacilityUtilization,
    MasterContract,
    Order,
    OutstandingBill,
    RepaymentScheduleLine,
    Tenant,
)


def _outstanding_bill_open(b: OutstandingBill) -> float:
    """Open balance on `outstanding_bills` (amount minus paid_amount; both stored as strings)."""
    try:
        amt = float(str(b.amount or "0").replace(",", ""))
        paid = float(str(b.paid_amount or "0").replace(",", ""))
        return max(amt - paid, 0.0)
    except (TypeError, ValueError):
        return 0.0


async def build_business_overview(db: AsyncSession, *, tenant_id: int) -> dict:
    tenant = await db.get(Tenant, tenant_id)
    base_ccy = getattr(tenant, "base_currency", None) or "BDT"

    bank_rows = list(
        (
            await db.execute(
                select(BankAccount).where(
                    BankAccount.tenant_id == tenant_id,
                    BankAccount.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    liquid = 0.0
    for b in bank_rows:
        try:
            liquid += float(b.current_balance or 0)
        except (TypeError, ValueError):
            continue

    bills = list(
        (
            await db.execute(select(OutstandingBill).where(OutstandingBill.tenant_id == tenant_id))
        ).scalars().all()
    )
    rec = sum(_outstanding_bill_open(b) for b in bills if (b.bill_type or "").upper() == "RECEIVABLE")
    pay = sum(_outstanding_bill_open(b) for b in bills if (b.bill_type or "").upper() == "PAYABLE")

    debt = (
        await db.execute(
            select(func.coalesce(func.sum(FacilityUtilization.outstanding_principal), 0)).where(
                FacilityUtilization.tenant_id == tenant_id,
                FacilityUtilization.status == "active",
            )
        )
    ).scalar()
    debt_f = float(debt or 0)

    emi_by_month: dict[str, float] = {}
    slines = list(
        (
            await db.execute(
                select(RepaymentScheduleLine).where(
                    RepaymentScheduleLine.tenant_id == tenant_id,
                    RepaymentScheduleLine.status.in_(("upcoming", "due", "overdue", "partially_paid")),
                )
            )
        ).scalars().all()
    )
    for sl in slines:
        if sl.due_date is None:
            continue
        k = f"{sl.due_date.year:04d}-{sl.due_date.month:02d}"
        emi_by_month[k] = emi_by_month.get(k, 0) + float(sl.emi_amount or 0)

    mc = list((await db.execute(select(MasterContract).where(MasterContract.tenant_id == tenant_id))).scalars().all())
    btb_health = []
    for m in mc:
        amt = float(m.amount or 0)
        used = float(m.btb_utilized_amount or 0)
        pct = round(100 * used / amt, 2) if amt > 0 else None
        btb_health.append({"reference": m.reference, "amount": amt, "utilized": used, "utilization_percent": pct})

    order_book = int(
        (
            await db.execute(
                select(func.count()).select_from(Order).where(
                    Order.tenant_id == tenant_id,
                    Order.status.not_in(("DRAFT", "CANCELLED")),
                )
            )
        ).scalar()
        or 0
    )

    latest_cf = (
        await db.execute(
            select(CashForecastScenario)
            .where(CashForecastScenario.tenant_id == tenant_id, CashForecastScenario.status == "GENERATED")
            .order_by(CashForecastScenario.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    cf_lines: list[dict] = []
    if latest_cf:
        lines = list(
            (
                await db.execute(
                    select(CashForecastLine)
                    .where(CashForecastLine.scenario_id == latest_cf.id)
                    .order_by(CashForecastLine.id)
                )
            ).scalars().all()
        )
        cf_lines = [
            {"month": ln.month_label, "inflow": float(ln.inflow or 0), "outflow": float(ln.outflow or 0)}
            for ln in lines
        ]

    return {
        "base_currency": base_ccy,
        "data_as_of": date.today().isoformat(),
        "liquid_funds_bank_balances": round(liquid, 2),
        "receivables_open": round(rec, 2),
        "payables_open": round(pay, 2),
        "working_capital_proxy": round(rec - pay, 2),
        "active_debt_principal": round(debt_f, 2),
        "obligation_emi_by_month": {k: round(v, 2) for k, v in sorted(emi_by_month.items())},
        "btb_master_contracts": btb_health,
        "open_orders_count": order_book,
        "system_cash_forecast_lines": cf_lines,
        "source_modules": ["finance", "facility", "commercial", "merch"],
    }

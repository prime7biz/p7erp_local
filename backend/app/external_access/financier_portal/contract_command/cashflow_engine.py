"""8-week cash ladder: planned CM from quotation vs actual CM from vouchers (cost center + cost_nature)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.commercial import MasterContract
from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.models.merch import Order

from app.external_access.financier_portal.contract_command import selectors as csel


def _parse_money(s: str | None) -> float:
    if not s:
        return 0.0
    try:
        return float(str(s).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def _effective_cost_nature(vl: VoucherLine, acc: ChartOfAccount | None) -> str | None:
    if vl.cost_nature_override:
        return str(vl.cost_nature_override).upper()
    if acc and acc.cost_nature:
        return str(acc.cost_nature).upper()
    return None


async def actual_cm_for_contract_cost_center(
    db: AsyncSession, tenant_id: int, master: MasterContract
) -> float:
    if not master.cost_center_id:
        return 0.0
    cc_id = int(master.cost_center_id)
    r = await db.execute(
        select(VoucherLine, Voucher, ChartOfAccount)
        .join(Voucher, VoucherLine.voucher_id == Voucher.id)
        .join(ChartOfAccount, VoucherLine.account_id == ChartOfAccount.id)
        .where(
            VoucherLine.tenant_id == tenant_id,
            Voucher.tenant_id == tenant_id,
            VoucherLine.cost_center_id == cc_id,
            Voucher.status == "POSTED",
        )
    )
    total = 0.0
    for vl, _v, acc in r.all():
        if _effective_cost_nature(vl, acc) != "CM":
            continue
        if (vl.entry_type or "").upper() == "DEBIT":
            total += _parse_money(vl.base_amount)
    return round(total, 2)


async def build_cash_ladder(
    db: AsyncSession, tenant_id: int, master: MasterContract, orders: list[Order]
) -> dict[str, Any]:
    """Weekly buckets for 8 weeks: planned_cm_outflow from quotation CM × remaining pcs / 8."""
    weeks: list[dict[str, Any]] = []
    today = date.today()
    monday = today - timedelta(days=today.weekday())

    total_planned_cm = 0.0
    base_ccy = master.currency or "BDT"
    for o in orders:
        cm_pp, ccy = await csel.quotation_cm_per_piece_for_order(db, tenant_id, o)
        if ccy:
            base_ccy = ccy
        qty = float(o.quantity or 0)
        if cm_pp and qty:
            total_planned_cm += cm_pp * qty

    actual_cm = await actual_cm_for_contract_cost_center(db, tenant_id, master)
    per_week = total_planned_cm / 8.0 if total_planned_cm else 0.0

    running = 0.0
    red_weeks = 0
    for w in range(8):
        ws = monday + timedelta(weeks=w)
        we = ws + timedelta(days=6)
        outflow = per_week
        running -= outflow
        if running < -1e-6:
            red_weeks += 1
        weeks.append(
            {
                "week_start": ws.isoformat(),
                "week_end": we.isoformat(),
                "planned_cm_outflow": round(outflow, 2),
                "running_balance_proxy": round(running, 2),
            }
        )

    cashability_score = max(0.0, 100.0 - red_weeks * 12.0)
    return {
        "currency": base_ccy,
        "total_planned_cm_order_book": round(total_planned_cm, 2),
        "actual_cm_vouchers_debit": actual_cm,
        "weeks": weeks,
        "red_weeks": red_weeks,
        "cashability_score": round(cashability_score, 1),
    }

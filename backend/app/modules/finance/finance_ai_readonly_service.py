"""Phase 17: read-only financial insights (voucher activity, GL movement proxy, payment-run cash proxy)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import Numeric, case, cast, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PaymentRun, Voucher, VoucherLine


def _margin_proxy_from_rows(rows: list[tuple[Any, Any, Any, Any]]) -> list[dict[str, Any]]:
    """Build month-over-month trend on (credit - debit) posted base amounts."""
    out: list[dict[str, Any]] = []
    prev_net: float | None = None
    for y, m, deb, cred in rows:
        ym = f"{int(y)}-{int(m):02d}"
        d = float(deb or 0)
        c = float(cred or 0)
        net = c - d
        mom = None
        if prev_net is not None and abs(prev_net) > 1e-6:
            mom = round((net - prev_net) / abs(prev_net) * 100.0, 2)
        prev_net = net
        out.append(
            {
                "period": ym,
                "posted_total_debit_base": round(d, 2),
                "posted_total_credit_base": round(c, 2),
                "net_credit_minus_debit_base": round(net, 2),
                "month_over_month_net_change_pct": mom,
                "confidence": 0.55,
                "reason_codes": ["AGGREGATE_VOUCHER_LINES_NOT_TRUE_MARGIN"],
            }
        )
    return out


async def build_finance_readonly_insights(
    db: AsyncSession,
    *,
    tenant_id: int,
    months_back: int = 6,
) -> dict[str, Any]:
    today = date.today()
    start_year = today.year
    start_month = today.month - (months_back - 1)
    while start_month < 1:
        start_month += 12
        start_year -= 1
    start_date = date(start_year, start_month, 1)

    r = await db.execute(
        select(
            extract("year", Voucher.voucher_date).label("y"),
            extract("month", Voucher.voucher_date).label("m"),
            func.count(Voucher.id),
        )
        .where(
            Voucher.tenant_id == tenant_id,
            Voucher.status == "POSTED",
            Voucher.voucher_date >= start_date,
        )
        .group_by("y", "m")
        .order_by("y", "m")
    )
    series: list[dict[str, Any]] = []
    counts: list[int] = []
    for y, m, cnt in r.all():
        ym = f"{int(y)}-{int(m):02d}"
        c = int(cnt or 0)
        counts.append(c)
        series.append({"period": ym, "posted_voucher_count": c})

    anomalies: list[dict[str, Any]] = []
    if len(counts) >= 3:
        mean = sum(counts) / len(counts)
        if mean > 0:
            for item in series:
                v = item["posted_voucher_count"]
                if v > mean * 2.0:
                    anomalies.append(
                        {
                            "period": item["period"],
                            "code": "HIGH_VOLUME_VS_MEAN",
                            "confidence": 0.6,
                            "reason_codes": ["COUNT_GT_2X_MEAN"],
                        }
                    )

    r2 = await db.execute(
        select(
            extract("year", Voucher.voucher_date).label("y"),
            extract("month", Voucher.voucher_date).label("m"),
            func.sum(
                case(
                    (VoucherLine.entry_type == "DEBIT", cast(VoucherLine.base_amount, Numeric(24, 4))),
                    else_=0,
                )
            ),
            func.sum(
                case(
                    (VoucherLine.entry_type == "CREDIT", cast(VoucherLine.base_amount, Numeric(24, 4))),
                    else_=0,
                )
            ),
        )
        .select_from(VoucherLine)
        .join(Voucher, Voucher.id == VoucherLine.voucher_id)
        .where(
            Voucher.tenant_id == tenant_id,
            VoucherLine.tenant_id == tenant_id,
            Voucher.status == "POSTED",
            Voucher.voucher_date >= start_date,
        )
        .group_by("y", "m")
        .order_by("y", "m")
    )
    margin_trend_proxy = _margin_proxy_from_rows(list(r2.all()))

    r3 = await db.execute(
        select(
            extract("year", PaymentRun.run_date).label("y"),
            extract("month", PaymentRun.run_date).label("m"),
            func.sum(cast(PaymentRun.total_amount, Numeric(24, 4))),
            func.count(PaymentRun.id),
        )
        .where(
            PaymentRun.tenant_id == tenant_id,
            PaymentRun.executed_voucher_id.isnot(None),
            PaymentRun.run_date >= start_date,
        )
        .group_by("y", "m")
        .order_by("y", "m")
    )
    cash_flow_proxy: list[dict[str, Any]] = []
    for y, m, tot, n in r3.all():
        ym = f"{int(y)}-{int(m):02d}"
        try:
            amt = float(tot or 0)
        except (TypeError, ValueError):
            amt = float(Decimal(str(tot or 0)))
        cash_flow_proxy.append(
            {
                "period": ym,
                "executed_payment_run_count": int(n or 0),
                "total_amount_base_sum": round(amt, 2),
                "confidence": 0.5,
                "reason_codes": ["PAYMENT_RUN_TOTALS_NOT_BANK_CASH"],
            }
        )

    return {
        "as_of": today.isoformat(),
        "months_back": months_back,
        "posted_voucher_series": series,
        "margin_trend_proxy": margin_trend_proxy,
        "cash_flow_proxy": cash_flow_proxy,
        "anomalies": anomalies,
        "disclaimer": "Aggregates for exploration only — not audited P&L, margin, or bank cash; map accounts for real margin analysis.",
    }

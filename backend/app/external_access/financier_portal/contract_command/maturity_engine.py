"""BTB maturity tranche safety vs expected export inflow (simplified)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.commercial import BtbLc, BtbMaturityTranche
from app.models.merch import Order
from app.models.trade import Shipment, TradeCase


async def _expected_ship_date_for_order(db: AsyncSession, tenant_id: int, order_id: int) -> date | None:
    o = await db.get(Order, order_id)
    if o and o.delivery_date:
        return o.delivery_date
    tc = (
        await db.execute(select(TradeCase).where(TradeCase.tenant_id == tenant_id, TradeCase.order_id == order_id).limit(1))
    ).scalar_one_or_none()
    if not tc:
        return None
    sh = list((await db.execute(select(Shipment).where(Shipment.trade_case_id == tc.id))).scalars().all())
    if sh and sh[0].etd:
        e = sh[0].etd
        return e if isinstance(e, date) else None
    return None


async def score_btb_maturities(
    db: AsyncSession, tenant_id: int, btb_rows: list[BtbLc], orders: list[Order]
) -> dict[str, Any]:
    """Threat score 0-100 (higher = safer). Uses earliest order ETD + 30d as rough inflow proxy."""
    if not btb_rows:
        return {"maturity_safety_score": None, "tranches": []}

    etd_dates: list[date] = []
    for o in orders:
        d = o.delivery_date
        if d:
            etd_dates.append(d)
        else:
            ed = await _expected_ship_date_for_order(db, tenant_id, o.id)
            if ed:
                etd_dates.append(ed)
    inflow_proxy = min(etd_dates) + timedelta(days=30) if etd_dates else date.today() + timedelta(days=60)

    tranche_payload: list[dict[str, Any]] = []
    threats = 0
    total = 0
    for b in btb_rows:
        trs = list(
            (
                await db.execute(
                    select(BtbMaturityTranche).where(
                        BtbMaturityTranche.tenant_id == tenant_id,
                        BtbMaturityTranche.btb_lc_id == b.id,
                        BtbMaturityTranche.status.in_(("UPCOMING", "DUE")),
                    )
                )
            ).scalars().all()
        )
        for tr in trs:
            total += 1
            md = tr.maturity_date
            gap = (inflow_proxy - md).days if md else 0
            safe = gap >= 0
            if not safe:
                threats += 1
            amt = float(tr.amount or 0)
            tranche_payload.append(
                {
                    "btb_lc_id": b.id,
                    "btb_reference": b.reference,
                    "tranche_no": tr.tranche_no,
                    "maturity_date": md.isoformat() if md else None,
                    "amount": amt,
                    "currency": tr.currency or b.currency,
                    "days_before_inflow_proxy": gap,
                    "status": "threat" if not safe else "ok",
                }
            )

    if total == 0:
        score = 85.0
    else:
        score = max(0.0, 100.0 - 40.0 * (threats / total))
    return {
        "maturity_safety_score": round(score, 1),
        "inflow_proxy_date": inflow_proxy.isoformat(),
        "tranches": tranche_payload[:50],
    }

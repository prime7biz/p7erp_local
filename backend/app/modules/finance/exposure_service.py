"""Read-only funded / non-funded BTB exposure vs facility linkage (per master contract)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.commercial import BtbLc, BtbMaturityTranche, MasterContract
from app.models.facility import Facility


def _active_facility(f: Facility) -> bool:
    return (f.status or "").strip().lower() == "active"


async def compute_master_lc_exposure(
    db: AsyncSession, *, tenant_id: int, master_contract_id: int
) -> dict[str, Any] | None:
    mc = await db.get(MasterContract, master_contract_id)
    if not mc or mc.tenant_id != tenant_id:
        return None

    btbs = (
        (
            await db.execute(
                select(BtbLc).where(BtbLc.tenant_id == tenant_id, BtbLc.master_contract_id == mc.id)
            )
        )
        .scalars()
        .all()
    )
    facs = (
        (await db.execute(select(Facility).where(Facility.tenant_id == tenant_id))).scalars().all()
    )
    active = [f for f in facs if _active_facility(f)]

    total_btb = sum(float(b.amount or 0) for b in btbs)
    funded = 0.0
    mc_pool = sum(
        float(f.available_amount or 0)
        for f in active
        if f.linked_master_contract_id == mc.id and f.linked_btb_lc_id is None
    )
    for b in sorted(btbs, key=lambda x: x.id):
        b_amt = float(b.amount or 0)
        if b_amt <= 0:
            continue
        direct_cap = sum(float(f.available_amount or 0) for f in active if f.linked_btb_lc_id == b.id)
        covered = min(b_amt, direct_cap)
        need = max(0.0, b_amt - covered)
        from_mc = min(need, mc_pool)
        mc_pool -= from_mc
        funded += covered + from_mc

    non_funded = max(0.0, total_btb - funded)
    return {
        "master_contract_id": mc.id,
        "reference": mc.reference,
        "total_btb_amount": round(total_btb, 2),
        "funded_portion": round(funded, 2),
        "non_funded_portion": round(non_funded, 2),
        "btb_count": len(btbs),
    }


async def build_maturity_ladder(
    db: AsyncSession, *, tenant_id: int, master_contract_id: int | None = None
) -> list[dict[str, Any]]:
    stmt = (
        select(BtbMaturityTranche, BtbLc.reference)
        .join(BtbLc, BtbLc.id == BtbMaturityTranche.btb_lc_id)
        .where(BtbMaturityTranche.tenant_id == tenant_id)
        .order_by(BtbMaturityTranche.maturity_date.asc(), BtbMaturityTranche.id.asc())
    )
    if master_contract_id is not None:
        stmt = stmt.where(BtbLc.master_contract_id == master_contract_id)
    rows = (await db.execute(stmt)).all()
    out: list[dict[str, Any]] = []
    for tr, bref in rows:
        out.append(
            {
                "id": tr.id,
                "btb_lc_id": tr.btb_lc_id,
                "btb_reference": bref,
                "tranche_no": tr.tranche_no,
                "maturity_date": tr.maturity_date.isoformat() if tr.maturity_date else None,
                "amount": float(tr.amount) if tr.amount is not None else None,
                "currency": tr.currency,
                "status": tr.status,
            }
        )
    return out

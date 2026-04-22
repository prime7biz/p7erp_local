"""Read paths for master contracts in financier party scope (ID joins only)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.external_access.financier_portal import facility_selectors as fsel
from app.models.commercial import BtbLc, MasterContract
from app.models.costing import QuotationManufacturing
from app.models.merch import Order, Quotation


async def master_contract_ids_for_party(db: AsyncSession, tenant_id: int, party_id: int) -> list[int]:
    btb_ids = await fsel.linked_btb_lc_ids_for_party(db, tenant_id, party_id)
    if not btb_ids:
        return []
    r = await db.execute(
        select(BtbLc.master_contract_id).where(
            BtbLc.tenant_id == tenant_id,
            BtbLc.id.in_(btb_ids),
            BtbLc.master_contract_id.isnot(None),
        )
    )
    out: set[int] = set()
    for (mid,) in r.all():
        if mid is not None:
            out.add(int(mid))
    return sorted(out)


async def get_master_contract_for_party(
    db: AsyncSession, *, tenant_id: int, party_id: int, contract_id: int
) -> MasterContract | None:
    allowed = await master_contract_ids_for_party(db, tenant_id, party_id)
    if contract_id not in allowed:
        return None
    mc = await db.get(MasterContract, contract_id)
    if not mc or mc.tenant_id != tenant_id:
        return None
    return mc


async def orders_for_master_contract(db: AsyncSession, tenant_id: int, master_contract_id: int) -> list[Order]:
    r = await db.execute(
        select(Order).where(
            Order.tenant_id == tenant_id,
            Order.master_contract_id == master_contract_id,
            Order.status.not_in(("DRAFT", "CANCELLED")),
        )
    )
    return list(r.scalars().all())


async def btb_lcs_for_master(db: AsyncSession, tenant_id: int, master_contract_id: int) -> list[BtbLc]:
    r = await db.execute(
        select(BtbLc).where(BtbLc.tenant_id == tenant_id, BtbLc.master_contract_id == master_contract_id)
    )
    return list(r.scalars().all())


async def quotation_cm_per_piece_for_order(db: AsyncSession, tenant_id: int, order: Order) -> tuple[float | None, str | None]:
    """Sum QuotationManufacturing.cm_per_piece for the order's quotation."""
    if not order.quotation_id:
        return None, None
    q = await db.get(Quotation, order.quotation_id)
    if not q or q.tenant_id != tenant_id:
        return None, None
    r = await db.execute(
        select(QuotationManufacturing).where(
            QuotationManufacturing.tenant_id == tenant_id,
            QuotationManufacturing.quotation_id == order.quotation_id,
        )
    )
    rows = list(r.scalars().all())
    if not rows:
        return None, q.currency
    total = 0.0
    for row in rows:
        try:
            total += float(row.cm_per_piece or 0)
        except (TypeError, ValueError):
            pass
    return (round(total, 6) if total else None), q.currency

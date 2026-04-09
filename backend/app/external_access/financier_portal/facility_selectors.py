"""Financier-scoped facility reads (ID-linked; no text matching)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    BtbLc,
    ExternalFinancierAccess,
    ExternalPrincipal,
    Facility,
    FacilityUtilization,
    Order,
    PurchaseOrder,
    RepaymentScheduleLine,
)


async def financier_party_id_for_principal(db: AsyncSession, principal: ExternalPrincipal) -> int | None:
    r = await db.execute(
        select(ExternalFinancierAccess.financier_party_id).where(
            ExternalFinancierAccess.tenant_id == principal.tenant_id,
            ExternalFinancierAccess.external_principal_id == principal.id,
            ExternalFinancierAccess.financier_party_id.isnot(None),
        )
    )
    for row in r.all():
        if row[0] is not None:
            return int(row[0])
    return None


async def list_facilities_for_financier(
    db: AsyncSession, tenant_id: int, party_id: int
) -> list[Facility]:
    r = await db.execute(
        select(Facility).where(
            Facility.tenant_id == tenant_id,
            Facility.financier_party_id == party_id,
        )
    )
    return list(r.scalars().all())


async def list_utilizations_for_financier(
    db: AsyncSession, tenant_id: int, party_id: int
) -> list[FacilityUtilization]:
    r = await db.execute(
        select(FacilityUtilization)
        .join(Facility, FacilityUtilization.facility_id == Facility.id)
        .where(Facility.tenant_id == tenant_id, Facility.financier_party_id == party_id)
    )
    return list(r.scalars().all())


async def get_utilization_for_financier(
    db: AsyncSession, tenant_id: int, party_id: int, utilization_id: int
) -> FacilityUtilization | None:
    r = await db.execute(
        select(FacilityUtilization)
        .join(Facility, FacilityUtilization.facility_id == Facility.id)
        .where(
            FacilityUtilization.id == utilization_id,
            FacilityUtilization.tenant_id == tenant_id,
            Facility.financier_party_id == party_id,
        )
    )
    return r.scalar_one_or_none()


async def schedule_for_utilization(
    db: AsyncSession, tenant_id: int, utilization_id: int
) -> list[RepaymentScheduleLine]:
    r = await db.execute(
        select(RepaymentScheduleLine)
        .where(
            RepaymentScheduleLine.tenant_id == tenant_id,
            RepaymentScheduleLine.facility_utilization_id == utilization_id,
        )
        .order_by(RepaymentScheduleLine.installment_number)
    )
    return list(r.scalars().all())


async def purchase_orders_for_btb_ids(
    db: AsyncSession, tenant_id: int, btb_ids: list[int]
) -> list[PurchaseOrder]:
    if not btb_ids:
        return []
    r = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.tenant_id == tenant_id,
            PurchaseOrder.btb_lc_id.in_(btb_ids),
        )
    )
    return list(r.scalars().all())


async def linked_btb_lc_ids_for_party(db: AsyncSession, tenant_id: int, party_id: int) -> list[int]:
    """BTB LC ids linked from facilities / utilizations for this financier party."""
    facs = await list_facilities_for_financier(db, tenant_id, party_id)
    ids: set[int] = set()
    for f in facs:
        if f.linked_btb_lc_id:
            ids.add(int(f.linked_btb_lc_id))
    utils = await list_utilizations_for_financier(db, tenant_id, party_id)
    for u in utils:
        if u.linked_btb_lc_id:
            ids.add(int(u.linked_btb_lc_id))
    return sorted(ids)


async def party_btb_lc_rows(db: AsyncSession, tenant_id: int, party_id: int) -> list[BtbLc]:
    ids = await linked_btb_lc_ids_for_party(db, tenant_id, party_id)
    if not ids:
        return []
    r = await db.execute(select(BtbLc).where(BtbLc.tenant_id == tenant_id, BtbLc.id.in_(ids)))
    return list(r.scalars().all())


async def utilizations_for_party_btbs(
    db: AsyncSession, tenant_id: int, party_id: int, btb_ids: list[int]
) -> list[FacilityUtilization]:
    if not btb_ids:
        return []
    r = await db.execute(
        select(FacilityUtilization)
        .join(Facility, FacilityUtilization.facility_id == Facility.id)
        .where(
            FacilityUtilization.tenant_id == tenant_id,
            Facility.financier_party_id == party_id,
            FacilityUtilization.linked_btb_lc_id.in_(btb_ids),
        )
    )
    return list(r.scalars().all())


async def order_btb_links_for_party(
    db: AsyncSession, tenant_id: int, btb_rows: list[BtbLc]
) -> dict[int, set[int]]:
    """order_id -> BTB LC ids linking that order to the financier chain."""
    from collections import defaultdict

    out: dict[int, set[int]] = defaultdict(set)
    if not btb_rows:
        return dict(out)
    btb_ids = [b.id for b in btb_rows]
    for b in btb_rows:
        if b.master_contract_id:
            r = await db.execute(
                select(Order.id).where(
                    Order.tenant_id == tenant_id,
                    Order.master_contract_id == b.master_contract_id,
                )
            )
            for (oid,) in r.all():
                out[int(oid)].add(int(b.id))
    pr = await db.execute(
        select(PurchaseOrder.source_order_id, PurchaseOrder.btb_lc_id).where(
            PurchaseOrder.tenant_id == tenant_id,
            PurchaseOrder.btb_lc_id.in_(btb_ids),
            PurchaseOrder.source_order_id.isnot(None),
        )
    )
    for soid, bid in pr.all():
        if soid and bid:
            out[int(soid)].add(int(bid))
    return dict(out)

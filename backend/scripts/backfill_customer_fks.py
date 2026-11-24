"""Backfill nullable customer_id FKs on commercial / logistics / AR tables.

Rules (idempotent; only fills NULL customer_id):
- EXPORT proforma_invoices: single distinct Order.customer_id via proforma_invoice_orders
  (filters BOTH ProformaInvoice.tenant_id and Order.tenant_id).
- master_contracts: single distinct Order.customer_id from linked orders / EXPORT PIs.
- export_cases: Order.customer_id or TradeCase.customer_id.
- delivery_challans: single distinct Order.customer_id via delivery_challan_orders.
- outstanding_bills RECEIVABLE: unambiguous case-insensitive name match on
  customers.name / legal_entity_name / trade_name within the tenant.

Run:
  docker compose exec backend python scripts/backfill_customer_fks.py
  docker compose exec backend python scripts/backfill_customer_fks.py --apply
  docker compose exec backend python scripts/backfill_customer_fks.py --apply --tenant-id 1
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import defaultdict
from pathlib import Path

from sqlalchemy import select, update

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.common.rls import bind_session_bypass, bind_session_tenant, reset_session_context  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Customer,
    DeliveryChallan,
    DeliveryChallanOrder,
    ExportCase,
    MasterContract,
    Order,
    OutstandingBill,
    ProformaInvoice,
    ProformaInvoiceOrder,
    Tenant,
    TradeCase,
)


def _norm(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    return text or None


async def _tenant_ids(db, tenant_id: int | None) -> list[int]:
    await bind_session_bypass(db)
    stmt = select(Tenant.id).order_by(Tenant.id)
    if tenant_id is not None:
        stmt = stmt.where(Tenant.id == tenant_id)
    return [int(r[0]) for r in (await db.execute(stmt)).all()]


async def _backfill_export_pis(db, *, tenant_id: int, apply: bool) -> int:
    rows = list(
        (
            await db.execute(
                select(ProformaInvoice.id).where(
                    ProformaInvoice.tenant_id == tenant_id,
                    ProformaInvoice.direction == "EXPORT",
                    ProformaInvoice.customer_id.is_(None),
                )
            )
        ).all()
    )
    updated = 0
    for (pi_id,) in rows:
        cust_ids = {
            int(cid)
            for (cid,) in (
                await db.execute(
                    select(Order.customer_id)
                    .select_from(ProformaInvoiceOrder)
                    .join(Order, Order.id == ProformaInvoiceOrder.order_id)
                    .join(ProformaInvoice, ProformaInvoice.id == ProformaInvoiceOrder.proforma_invoice_id)
                    .where(
                        ProformaInvoiceOrder.proforma_invoice_id == pi_id,
                        ProformaInvoice.tenant_id == tenant_id,
                        Order.tenant_id == tenant_id,
                        Order.customer_id.is_not(None),
                    )
                )
            ).all()
            if cid is not None
        }
        if len(cust_ids) != 1:
            continue
        cid = next(iter(cust_ids))
        if apply:
            await db.execute(
                update(ProformaInvoice)
                .where(
                    ProformaInvoice.id == pi_id,
                    ProformaInvoice.tenant_id == tenant_id,
                    ProformaInvoice.customer_id.is_(None),
                )
                .values(customer_id=cid)
            )
        updated += 1
    return updated


async def _backfill_master_contracts(db, *, tenant_id: int, apply: bool) -> int:
    rows = list(
        (
            await db.execute(
                select(MasterContract.id).where(
                    MasterContract.tenant_id == tenant_id,
                    MasterContract.customer_id.is_(None),
                )
            )
        ).all()
    )
    updated = 0
    for (mc_id,) in rows:
        from_orders = {
            int(cid)
            for (cid,) in (
                await db.execute(
                    select(Order.customer_id).where(
                        Order.tenant_id == tenant_id,
                        Order.master_contract_id == mc_id,
                        Order.customer_id.is_not(None),
                    )
                )
            ).all()
            if cid is not None
        }
        from_pis = {
            int(cid)
            for (cid,) in (
                await db.execute(
                    select(Order.customer_id)
                    .select_from(ProformaInvoice)
                    .join(
                        ProformaInvoiceOrder,
                        ProformaInvoiceOrder.proforma_invoice_id == ProformaInvoice.id,
                    )
                    .join(Order, Order.id == ProformaInvoiceOrder.order_id)
                    .where(
                        ProformaInvoice.tenant_id == tenant_id,
                        ProformaInvoice.master_contract_id == mc_id,
                        Order.tenant_id == tenant_id,
                        Order.customer_id.is_not(None),
                    )
                )
            ).all()
            if cid is not None
        }
        cust_ids = from_orders | from_pis
        if len(cust_ids) != 1:
            continue
        cid = next(iter(cust_ids))
        if apply:
            await db.execute(
                update(MasterContract)
                .where(
                    MasterContract.id == mc_id,
                    MasterContract.tenant_id == tenant_id,
                    MasterContract.customer_id.is_(None),
                )
                .values(customer_id=cid)
            )
        updated += 1
    return updated


async def _backfill_export_cases(db, *, tenant_id: int, apply: bool) -> int:
    rows = list(
        (
            await db.execute(
                select(ExportCase).where(
                    ExportCase.tenant_id == tenant_id,
                    ExportCase.customer_id.is_(None),
                )
            )
        ).scalars().all()
    )
    updated = 0
    for row in rows:
        cid: int | None = None
        if row.order_id:
            order = (
                await db.execute(
                    select(Order.customer_id).where(
                        Order.id == row.order_id,
                        Order.tenant_id == tenant_id,
                    )
                )
            ).scalar_one_or_none()
            if order is not None:
                cid = int(order) if order else None
        if cid is None and row.trade_case_id:
            tc = (
                await db.execute(
                    select(TradeCase.customer_id).where(
                        TradeCase.id == row.trade_case_id,
                        TradeCase.tenant_id == tenant_id,
                    )
                )
            ).scalar_one_or_none()
            if tc is not None:
                cid = int(tc) if tc else None
        if cid is None:
            continue
        if apply:
            await db.execute(
                update(ExportCase)
                .where(
                    ExportCase.id == row.id,
                    ExportCase.tenant_id == tenant_id,
                    ExportCase.customer_id.is_(None),
                )
                .values(customer_id=cid)
            )
        updated += 1
    return updated


async def _backfill_delivery_challans(db, *, tenant_id: int, apply: bool) -> int:
    rows = list(
        (
            await db.execute(
                select(DeliveryChallan.id).where(
                    DeliveryChallan.tenant_id == tenant_id,
                    DeliveryChallan.customer_id.is_(None),
                )
            )
        ).all()
    )
    updated = 0
    for (dc_id,) in rows:
        cust_ids = {
            int(cid)
            for (cid,) in (
                await db.execute(
                    select(Order.customer_id)
                    .select_from(DeliveryChallanOrder)
                    .join(Order, Order.id == DeliveryChallanOrder.order_id)
                    .where(
                        DeliveryChallanOrder.delivery_challan_id == dc_id,
                        DeliveryChallanOrder.tenant_id == tenant_id,
                        Order.tenant_id == tenant_id,
                        Order.customer_id.is_not(None),
                    )
                )
            ).all()
            if cid is not None
        }
        if len(cust_ids) != 1:
            continue
        cid = next(iter(cust_ids))
        if apply:
            await db.execute(
                update(DeliveryChallan)
                .where(
                    DeliveryChallan.id == dc_id,
                    DeliveryChallan.tenant_id == tenant_id,
                    DeliveryChallan.customer_id.is_(None),
                )
                .values(customer_id=cid)
            )
        updated += 1
    return updated


async def _backfill_receivable_bills(db, *, tenant_id: int, apply: bool) -> int:
    customers = list(
        (
            await db.execute(
                select(Customer).where(Customer.tenant_id == tenant_id)
            )
        ).scalars().all()
    )
    alias_to_ids: dict[str, set[int]] = defaultdict(set)
    for c in customers:
        for raw in (c.name, c.legal_entity_name, c.trade_name):
            key = _norm(raw)
            if key:
                alias_to_ids[key].add(int(c.id))

    bills = list(
        (
            await db.execute(
                select(OutstandingBill).where(
                    OutstandingBill.tenant_id == tenant_id,
                    OutstandingBill.bill_type == "RECEIVABLE",
                    OutstandingBill.customer_id.is_(None),
                )
            )
        ).scalars().all()
    )
    updated = 0
    for bill in bills:
        key = _norm(bill.party_name)
        if not key:
            continue
        matches = alias_to_ids.get(key) or set()
        if len(matches) != 1:
            if len(matches) > 1:
                print(
                    f"[skip ambiguous] tenant={tenant_id} bill={bill.id} "
                    f"party={bill.party_name!r} matches={sorted(matches)}"
                )
            continue
        cid = next(iter(matches))
        if apply:
            await db.execute(
                update(OutstandingBill)
                .where(
                    OutstandingBill.id == bill.id,
                    OutstandingBill.tenant_id == tenant_id,
                    OutstandingBill.customer_id.is_(None),
                )
                .values(customer_id=cid)
            )
        updated += 1
    return updated


async def run(*, tenant_id: int | None, apply: bool) -> None:
    async with AsyncSessionLocal() as db:
        try:
            ids = await _tenant_ids(db, tenant_id)
            totals = {
                "proforma_invoices": 0,
                "master_contracts": 0,
                "export_cases": 0,
                "delivery_challans": 0,
                "outstanding_bills": 0,
            }
            for tid in ids:
                await bind_session_tenant(db, tid)
                n_pi = await _backfill_export_pis(db, tenant_id=tid, apply=apply)
                n_mc = await _backfill_master_contracts(db, tenant_id=tid, apply=apply)
                n_ec = await _backfill_export_cases(db, tenant_id=tid, apply=apply)
                n_dc = await _backfill_delivery_challans(db, tenant_id=tid, apply=apply)
                n_ob = await _backfill_receivable_bills(db, tenant_id=tid, apply=apply)
                totals["proforma_invoices"] += n_pi
                totals["master_contracts"] += n_mc
                totals["export_cases"] += n_ec
                totals["delivery_challans"] += n_dc
                totals["outstanding_bills"] += n_ob
                mode = "apply" if apply else "dry-run"
                print(
                    f"[{mode}] tenant={tid} PI={n_pi} MSC={n_mc} "
                    f"EC={n_ec} DC={n_dc} AR={n_ob}"
                )
            if apply:
                await db.commit()
            else:
                await db.rollback()
            print(f"Totals ({'applied' if apply else 'dry-run'}): {totals}")
        finally:
            await reset_session_context(db)


def main() -> None:
    p = argparse.ArgumentParser(description="Backfill cross-module customer_id FKs")
    p.add_argument("--tenant-id", type=int, default=None)
    p.add_argument("--apply", action="store_true", help="Persist changes (default is dry-run)")
    p.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Preview only (default). Ignored when --apply is set.",
    )
    args = p.parse_args()
    apply = bool(args.apply)
    asyncio.run(run(tenant_id=args.tenant_id, apply=apply))


if __name__ == "__main__":
    main()

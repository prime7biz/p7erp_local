"""INV-10: Debit-note stock returns call finalize_movement_fifo and credit Inventory.

Run: docker compose exec backend pytest tests/test_debit_note_fifo_stock.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import InventoryCostLayer, StockMovement, VoucherLine
from app.models.party_ledger import PartyLedger, PartyLedgerBill
from app.modules.finance.advanced_voucher_service import create_note_voucher
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa

from tests.go_live_fixtures import seed_inventory_chain
from tests.inventory_gl_fixtures import add_stock, setup_inventory_gl


@pytest.mark.asyncio
async def test_debit_note_stock_out_consumes_fifo_and_credits_inventory(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    await seed_tenant_system_coa(db, tenant.id)
    gl = await setup_inventory_gl(db, tenant.id, [item])
    await add_stock(db, tenant.id, item.id, wh.id, "10", unit_cost=25.0)
    await db.flush()

    party = PartyLedger(
        tenant_id=tenant.id,
        party_type="VENDOR",
        vendor_id=vendor.id,
        ledger_account_id=gl.grni.id,
        opening_balance=Decimal("0"),
        opening_balance_type="CR",
        current_balance=Decimal("250"),
        current_balance_type="CR",
        is_active=True,
    )
    db.add(party)
    await db.flush()
    today = date.today()
    bill = PartyLedgerBill(
        tenant_id=tenant.id,
        party_ledger_id=party.id,
        bill_number=f"PLB-{tenant.id}-DN",
        bill_date=today - timedelta(days=2),
        bill_type="PURCHASE",
        original_amount=Decimal("250"),
        amount_type="CR",
        pending_amount=Decimal("250"),
        settled_amount=Decimal("0"),
        status="PENDING",
        due_date=today + timedelta(days=10),
    )
    db.add(bill)
    await db.flush()

    voucher = await create_note_voucher(
        db,
        tenant.id,
        note_kind="DEBIT_NOTE",
        voucher_date=today,
        description="Return defective fabric",
        party_ledger_id=party.id,
        original_bill_id=bill.id,
        amount=Decimal("50"),
        revenue_or_purchase_account_id=gl.cogs.id,
        party_account_id=gl.grni.id,
        created_by=user.id,
        stock_returns=[{"stock_item_id": item.id, "qty": "2", "godown_id": wh.id}],
    )
    await db.commit()

    mvs = list(
        (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant.id,
                    StockMovement.reference_type == "DEBIT_NOTE",
                    StockMovement.reference_id == voucher.id,
                )
            )
        ).scalars().all()
    )
    assert len(mvs) == 1
    assert (mvs[0].movement_type or "").upper() == "OUT"
    assert Decimal(str(mvs[0].quantity)) == Decimal("2")
    assert mvs[0].movement_value is not None
    assert Decimal(str(mvs[0].movement_value)) == Decimal("50")

    layers = list(
        (
            await db.execute(
                select(InventoryCostLayer).where(
                    InventoryCostLayer.tenant_id == tenant.id,
                    InventoryCostLayer.item_id == item.id,
                    InventoryCostLayer.warehouse_id == wh.id,
                )
            )
        ).scalars().all()
    )
    assert sum(Decimal(str(x.qty_remaining)) for x in layers) == Decimal("8")

    credit_lines = list(
        (
            await db.execute(
                select(VoucherLine).where(
                    VoucherLine.tenant_id == tenant.id,
                    VoucherLine.voucher_id == voucher.id,
                    VoucherLine.entry_type == "CREDIT",
                )
            )
        ).scalars().all()
    )
    assert any(int(ln.account_id) == gl.inventory.id for ln in credit_lines)
    inv_credit = sum(
        Decimal(str(ln.amount)) for ln in credit_lines if int(ln.account_id) == gl.inventory.id
    )
    assert inv_credit == Decimal("50")


@pytest.mark.asyncio
async def test_debit_note_invoice_below_fifo_splits_purchase_return_variance(db_session_integration):
    """When DN invoice net ≠ FIFO stock value, Inventory credits FIFO; variance → Purchase Return."""
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    await seed_tenant_system_coa(db, tenant.id)
    gl = await setup_inventory_gl(db, tenant.id, [item])
    await add_stock(db, tenant.id, item.id, wh.id, "10", unit_cost=25.0)
    await db.flush()

    party = PartyLedger(
        tenant_id=tenant.id,
        party_type="VENDOR",
        vendor_id=vendor.id,
        ledger_account_id=gl.grni.id,
        opening_balance=Decimal("0"),
        opening_balance_type="CR",
        current_balance=Decimal("250"),
        current_balance_type="CR",
        is_active=True,
    )
    db.add(party)
    await db.flush()
    today = date.today()
    bill = PartyLedgerBill(
        tenant_id=tenant.id,
        party_ledger_id=party.id,
        bill_number=f"PLB-{tenant.id}-DN-VAR",
        bill_date=today - timedelta(days=2),
        bill_type="PURCHASE",
        original_amount=Decimal("250"),
        amount_type="CR",
        pending_amount=Decimal("250"),
        settled_amount=Decimal("0"),
        status="PENDING",
        due_date=today + timedelta(days=10),
    )
    db.add(bill)
    await db.flush()

    # Invoice claims 40; FIFO for qty 2 @ 25 = 50 → Inventory Cr 50, Purchase Return Dr 10
    voucher = await create_note_voucher(
        db,
        tenant.id,
        note_kind="DEBIT_NOTE",
        voucher_date=today,
        description="Return at invoice below FIFO",
        party_ledger_id=party.id,
        original_bill_id=bill.id,
        amount=Decimal("40"),
        revenue_or_purchase_account_id=gl.cogs.id,
        party_account_id=gl.grni.id,
        created_by=user.id,
        stock_returns=[{"stock_item_id": item.id, "qty": "2", "godown_id": wh.id}],
    )
    await db.commit()

    lines = list(
        (
            await db.execute(
                select(VoucherLine).where(
                    VoucherLine.tenant_id == tenant.id,
                    VoucherLine.voucher_id == voucher.id,
                )
            )
        ).scalars().all()
    )
    debits = sum(Decimal(str(ln.amount)) for ln in lines if (ln.entry_type or "").upper() == "DEBIT")
    credits = sum(Decimal(str(ln.amount)) for ln in lines if (ln.entry_type or "").upper() == "CREDIT")
    assert debits == credits

    inv_credit = sum(
        Decimal(str(ln.amount))
        for ln in lines
        if (ln.entry_type or "").upper() == "CREDIT" and int(ln.account_id) == gl.inventory.id
    )
    assert inv_credit == Decimal("50")

    pr_debit = sum(
        Decimal(str(ln.amount))
        for ln in lines
        if (ln.entry_type or "").upper() == "DEBIT" and int(ln.account_id) == gl.cogs.id
    )
    assert pr_debit == Decimal("10")

    mvs = list(
        (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant.id,
                    StockMovement.reference_type == "DEBIT_NOTE",
                    StockMovement.reference_id == voucher.id,
                )
            )
        ).scalars().all()
    )
    assert len(mvs) == 1
    assert Decimal(str(mvs[0].movement_value)) == Decimal("50")

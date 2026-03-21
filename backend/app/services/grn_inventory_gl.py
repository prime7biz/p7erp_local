"""Optional GL journal when goods are received (GRN), if CoA inventory accounts are configured."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.models import (
    AccountingPeriod,
    CoAConfig,
    GoodsReceiving,
    GoodsReceivingItem,
    Item,
    PurchaseOrderItem,
    Voucher,
    VoucherLine,
)


async def post_grn_receipt_gl_journal(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    grn: GoodsReceiving,
    items: list[GoodsReceivingItem],
) -> None:
    """Create a posted inventory receipt journal (Dr stock / Cr clearing) when configured. No-op if not set."""
    cfg_row = (
        await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant_id))
    ).scalars().first()
    if not cfg_row:
        return
    stock_id = getattr(cfg_row, "inventory_stock_account_id", None)
    clear_id = getattr(cfg_row, "inventory_clearing_account_id", None)
    if not stock_id or not clear_id:
        return

    from app.modules.finance.router import (
        _apply_internal_signature,
        _lock_chart_accounts_for_subset,
        _to_float as fin_float,
    )

    po_lines: dict[tuple[int, int | None], PurchaseOrderItem] = {}
    if grn.purchase_order_id:
        pls = (
            await db.execute(
                select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == grn.purchase_order_id)
            )
        ).scalars().all()
        for pl in pls:
            po_lines[(pl.item_id, pl.warehouse_id)] = pl

    total = 0.0
    for line in items:
        qty = fin_float(line.quantity)
        unit = 0.0
        key = (line.item_id, line.warehouse_id)
        pl = po_lines.get(key) or po_lines.get((line.item_id, None))
        if pl is not None:
            unit = fin_float(pl.unit_price)
        else:
            it = await db.get(Item, line.item_id)
            if it and it.tenant_id == tenant_id:
                unit = fin_float(getattr(it, "default_cost", None) or "0")
        total += qty * unit

    total = round(total, 4)
    if total <= 0:
        return

    v_date = grn.received_date or date.today()
    open_period = (
        await db.execute(
            select(AccountingPeriod).where(
                AccountingPeriod.tenant_id == tenant_id,
                AccountingPeriod.is_closed.is_(False),
                AccountingPeriod.start_date <= v_date,
                AccountingPeriod.end_date >= v_date,
            )
        )
    ).scalars().first()
    if not open_period:
        return

    voucher_number = await next_tenant_code(
        db,
        model=Voucher,
        tenant_id=tenant_id,
        prefix="VCH-",
        width=4,
    )
    desc = f"Inventory receipt {grn.grn_code}"
    row = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type="JOURNAL",
        voucher_date=v_date,
        status="POSTED",
        description=desc,
        reference=f"GRN-{grn.id}",
        currency="BDT",
        base_currency="BDT",
        exchange_rate="1",
        exchange_rate_source="system",
        exchange_rate_fetched_at=datetime.utcnow(),
        created_by=user_id,
    )
    db.add(row)
    await db.flush()

    amt_s = f"{total:.4f}"
    db.add(
        VoucherLine(
            tenant_id=tenant_id,
            voucher_id=row.id,
            account_id=stock_id,
            currency="BDT",
            exchange_rate="1",
            base_amount=amt_s,
            entry_type="DEBIT",
            amount=amt_s,
            notes=desc,
        )
    )
    db.add(
        VoucherLine(
            tenant_id=tenant_id,
            voucher_id=row.id,
            account_id=clear_id,
            currency="BDT",
            exchange_rate="1",
            base_amount=amt_s,
            entry_type="CREDIT",
            amount=amt_s,
            notes=desc,
        )
    )
    await db.flush()

    lines_result = await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == row.id))
    line_rows = list(lines_result.scalars().all())
    locked = await _lock_chart_accounts_for_subset(db, tenant_id, (line.account_id for line in line_rows))
    for vl in line_rows:
        account = locked.get(vl.account_id)
        if not account:
            continue
        cur = fin_float(account.balance)
        amt = fin_float(vl.amount)
        if account.normal_balance == "debit":
            cur += amt if vl.entry_type == "DEBIT" else -amt
        else:
            cur += amt if vl.entry_type == "CREDIT" else -amt
        account.balance = f"{round(cur, 4):.4f}"

    _apply_internal_signature(row, line_rows)

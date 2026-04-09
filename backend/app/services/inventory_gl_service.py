"""Posted inventory journals with idempotency (inventory_gl_postings)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.voucher_controls import (
    allocate_series_voucher_number,
    finalize_posted_voucher_metadata,
)
from app.models import (
    AccountingPeriod,
    DeliveryChallanItem,
    GoodsReceiving,
    GoodsReceivingItem,
    InventoryGlPosting,
    StockAdjustment,
    StockMovement,
    Voucher,
    VoucherLine,
)

from app.services.inventory_account_resolver import resolve_inventory_accounts


def _f(s: str | None) -> float:
    try:
        return float(s or "0")
    except (TypeError, ValueError):
        return 0.0


def _amt(v: float) -> str:
    return f"{round(v, 4):.4f}"


async def _open_period(db: AsyncSession, tenant_id: int, v_date: date) -> AccountingPeriod | None:
    return (
        await db.execute(
            select(AccountingPeriod).where(
                AccountingPeriod.tenant_id == tenant_id,
                AccountingPeriod.is_closed.is_(False),
                AccountingPeriod.start_date <= v_date,
                AccountingPeriod.end_date >= v_date,
            )
        )
    ).scalars().first()


async def _already_posted(db: AsyncSession, tenant_id: int, system: str, source_id: int, action: str) -> bool:
    r = (
        await db.execute(
            select(InventoryGlPosting).where(
                InventoryGlPosting.tenant_id == tenant_id,
                InventoryGlPosting.source_system == system,
                InventoryGlPosting.source_id == source_id,
                InventoryGlPosting.action == action,
            )
        )
    ).scalars().first()
    return r is not None


async def _post_balanced_voucher(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    voucher_date: date,
    description: str,
    reference: str,
    entries: list[tuple[int, str, float, str]],
    *,
    source_system: str,
    source_id: int,
    action: str,
) -> None:
    """entries: (account_id, DEBIT|CREDIT, amount, notes)."""
    if await _already_posted(db, tenant_id, source_system, source_id, action):
        return
    deb = sum(a for _, t, a, _ in entries if t == "DEBIT")
    cre = sum(a for _, t, a, _ in entries if t == "CREDIT")
    if abs(deb - cre) > 0.0001:
        return
    if deb <= 0:
        return
    period = await _open_period(db, tenant_id, voucher_date)
    if not period:
        return

    from app.modules.finance.router import (
        _apply_internal_signature,
        _lock_chart_accounts_for_subset,
        _to_float as fin_float,
    )

    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant_id,
        voucher_date=voucher_date,
        voucher_type="JOURNAL",
        branch_code="MAIN",
    )
    ref_key = f"{source_system}:{source_id}:{action}"[:128]
    vrow = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type="JOURNAL",
        voucher_date=voucher_date,
        status="POSTED",
        description=description[:512],
        reference=reference[:64],
        branch_code="MAIN",
        fiscal_year=fy,
        series_sequence=series_seq,
        number_series_key=series_key,
        source_module="INVENTORY_GL",
        source_module_ref=ref_key,
        allow_manual_edit=False,
        currency="BDT",
        base_currency="BDT",
        exchange_rate="1",
        exchange_rate_source="system",
        exchange_rate_fetched_at=datetime.utcnow(),
        created_by=user_id,
    )
    db.add(vrow)
    await db.flush()

    for acc_id, etype, amt, notes in entries:
        if amt <= 0:
            continue
        s = _amt(amt)
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=vrow.id,
                account_id=acc_id,
                currency="BDT",
                exchange_rate="1",
                base_amount=s,
                entry_type=etype,
                amount=s,
                notes=(notes or description)[:512],
            )
        )
    await db.flush()

    lines_result = await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == vrow.id))
    line_rows = list(lines_result.scalars().all())
    await finalize_posted_voucher_metadata(db, tenant_id, vrow, line_rows, strict_duplicate_check=True)
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

    _apply_internal_signature(vrow, line_rows)
    db.add(
        InventoryGlPosting(
            tenant_id=tenant_id,
            source_system=source_system,
            source_id=source_id,
            action=action,
            voucher_id=vrow.id,
        )
    )


async def post_grn_receipt_gl(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    grn: GoodsReceiving,
    items: list[GoodsReceivingItem],
) -> None:
    v_date = grn.received_date or date.today()
    buckets: dict[tuple[int | None, int | None], float] = defaultdict(float)

    for line in items:
        stmt = select(StockMovement).where(
            StockMovement.tenant_id == tenant_id,
            StockMovement.reference_type == "GRN",
            StockMovement.reference_id == grn.id,
            StockMovement.movement_type == "IN",
        )
        if getattr(line, "id", None):
            stmt = stmt.where(StockMovement.goods_receiving_item_id == line.id)
        else:
            stmt = stmt.where(
                StockMovement.item_id == line.item_id,
                StockMovement.warehouse_id == line.warehouse_id,
            )
        mv = (await db.execute(stmt.order_by(StockMovement.id.desc()))).scalars().first()
        if mv is None and getattr(line, "id", None):
            mv = (
                await db.execute(
                    select(StockMovement).where(
                        StockMovement.tenant_id == tenant_id,
                        StockMovement.reference_type == "GRN",
                        StockMovement.reference_id == grn.id,
                        StockMovement.item_id == line.item_id,
                        StockMovement.warehouse_id == line.warehouse_id,
                        StockMovement.movement_type == "IN",
                    ).order_by(StockMovement.id.desc())
                )
            ).scalars().first()
        val = _f(mv.movement_value) if mv else 0.0
        if val <= 0:
            continue
        acc = await resolve_inventory_accounts(db, tenant_id, line.item_id)
        inv_id = acc["inventory"]
        grni_id = acc["grni"]
        if not inv_id or not grni_id:
            continue
        buckets[(inv_id, grni_id)] += val

    entries: list[tuple[int, str, float, str]] = []
    for (inv_id, grni_id), total in buckets.items():
        if total <= 0:
            continue
        entries.append((inv_id, "DEBIT", total, f"GRN {grn.grn_code}"))
        entries.append((grni_id, "CREDIT", total, f"GRN {grn.grn_code}"))

    if not entries:
        return
    await _post_balanced_voucher(
        db,
        tenant_id,
        user_id,
        v_date,
        f"Inventory receipt {grn.grn_code}",
        f"GRN-{grn.id}",
        entries,
        source_system="GRN",
        source_id=grn.id,
        action="RECEIPT",
    )


async def post_delivery_challan_gl(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    challan_id: int,
    delivery_date: date | None,
    challan_code: str,
    lines: list[DeliveryChallanItem],
) -> None:
    v_date = delivery_date or date.today()
    buckets: dict[tuple[int | None, int | None], float] = defaultdict(float)

    for line in lines:
        mv = (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.reference_type == "DELIVERY_CHALLAN",
                    StockMovement.reference_id == challan_id,
                    StockMovement.item_id == line.item_id,
                    StockMovement.warehouse_id == line.warehouse_id,
                    StockMovement.movement_type == "OUT",
                )
            )
        ).scalars().first()
        val = _f(mv.movement_value) if mv else 0.0
        if val <= 0:
            continue
        acc = await resolve_inventory_accounts(db, tenant_id, line.item_id)
        inv_id = acc["inventory"]
        cogs_id = acc["cogs"]
        if not inv_id or not cogs_id:
            continue
        buckets[(cogs_id, inv_id)] += val

    entries: list[tuple[int, str, float, str]] = []
    for (cogs_id, inv_id), total in buckets.items():
        entries.append((cogs_id, "DEBIT", total, f"DC {challan_code}"))
        entries.append((inv_id, "CREDIT", total, f"DC {challan_code}"))

    if not entries:
        return
    await _post_balanced_voucher(
        db,
        tenant_id,
        user_id,
        v_date,
        f"COGS {challan_code}",
        f"DC-{challan_id}",
        entries,
        source_system="DELIVERY_CHALLAN",
        source_id=challan_id,
        action="POSTED",
    )


async def post_process_order_issue_gl(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    process_order_id: int,
    input_item_id: int,
    output_item_id: int,
    notes: str,
) -> None:
    mv = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.reference_type == "PROCESS_ORDER",
                StockMovement.reference_id == process_order_id,
                StockMovement.item_id == input_item_id,
                StockMovement.movement_type == "OUT",
            )
        )
    ).scalars().first()
    val = _f(mv.movement_value) if mv else 0.0
    if val <= 0:
        return
    in_acc = await resolve_inventory_accounts(db, tenant_id, input_item_id)
    out_acc = await resolve_inventory_accounts(db, tenant_id, output_item_id)
    inv_in = in_acc["inventory"]
    wip = out_acc["wip"]
    if not inv_in or not wip:
        return
    v_date = mv.movement_date or date.today()
    entries = [
        (wip, "DEBIT", val, notes),
        (inv_in, "CREDIT", val, notes),
    ]
    await _post_balanced_voucher(
        db,
        tenant_id,
        user_id,
        v_date,
        f"WIP issue PO#{process_order_id}",
        f"PO-ISSUE-{process_order_id}",
        entries,
        source_system="PROCESS_ORDER",
        source_id=process_order_id,
        action="ISSUE",
    )


async def post_process_order_receive_gl(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    process_order_id: int,
    output_item_id: int,
    notes: str,
) -> None:
    mv = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.reference_type == "PROCESS_ORDER",
                StockMovement.reference_id == process_order_id,
                StockMovement.item_id == output_item_id,
                StockMovement.movement_type == "IN",
            )
        )
    ).scalars().first()
    val = _f(mv.movement_value) if mv else 0.0
    if val <= 0:
        return
    out_acc = await resolve_inventory_accounts(db, tenant_id, output_item_id)
    inv_out = out_acc["inventory"]
    wip = out_acc["wip"]
    if not inv_out or not wip:
        return
    v_date = mv.movement_date or date.today()
    entries = [
        (inv_out, "DEBIT", val, notes),
        (wip, "CREDIT", val, notes),
    ]
    await _post_balanced_voucher(
        db,
        tenant_id,
        user_id,
        v_date,
        f"FG receipt PO#{process_order_id}",
        f"PO-RECV-{process_order_id}",
        entries,
        source_system="PROCESS_ORDER",
        source_id=process_order_id,
        action="RECEIVE",
    )


async def post_stock_adjustment_gl(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    adj: StockAdjustment,
) -> None:
    mv = (
        await db.execute(
            select(StockMovement)
            .where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.reference_type == "STOCK_ADJUSTMENT",
                StockMovement.reference_id == adj.id,
                StockMovement.item_id == adj.item_id,
                StockMovement.warehouse_id == adj.warehouse_id,
            )
            .order_by(StockMovement.id.desc())
            .limit(1)
        )
    ).scalars().first()
    if not mv:
        return
    val = _f(mv.movement_value)
    if val <= 0:
        return
    acc = await resolve_inventory_accounts(db, tenant_id, adj.item_id)
    inv_id = acc["inventory"]
    adj_id = acc["adjustment"]
    if not inv_id or not adj_id:
        return
    v_date = mv.movement_date or date.today()
    if mv.movement_type == "IN":
        entries = [(inv_id, "DEBIT", val, adj.adjust_code), (adj_id, "CREDIT", val, adj.adjust_code)]
    else:
        entries = [(adj_id, "DEBIT", val, adj.adjust_code), (inv_id, "CREDIT", val, adj.adjust_code)]
    await _post_balanced_voucher(
        db,
        tenant_id,
        user_id,
        v_date,
        f"Stock adjustment {adj.adjust_code}",
        f"ADJ-{adj.id}",
        entries,
        source_system="STOCK_ADJUSTMENT",
        source_id=adj.id,
        action="POST",
    )


async def post_physical_inventory_gl(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    session_id: int,
    session_code: str,
    count_date: date | None,
) -> None:
    v_date = count_date or date.today()
    mvs = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.reference_type == "PHYSICAL_COUNT",
                StockMovement.reference_id == session_id,
            )
        )
    ).scalars().all()

    net_buckets: dict[tuple[int, int, str], float] = defaultdict(float)
    # key: (inventory_account, adjustment_account, "IN"|"OUT" for sign pattern)
    for mv in mvs:
        val = _f(mv.movement_value)
        if val <= 0:
            continue
        acc = await resolve_inventory_accounts(db, tenant_id, mv.item_id)
        inv_id = acc["inventory"]
        adj_id = acc["adjustment"]
        if not inv_id or not adj_id:
            continue
        if mv.movement_type == "IN":
            net_buckets[(inv_id, adj_id, "IN")] += val
        else:
            net_buckets[(inv_id, adj_id, "OUT")] += val

    entries: list[tuple[int, str, float, str]] = []
    for (inv_id, adj_id, kind), total in net_buckets.items():
        if total <= 0:
            continue
        if kind == "IN":
            entries.append((inv_id, "DEBIT", total, session_code))
            entries.append((adj_id, "CREDIT", total, session_code))
        else:
            entries.append((adj_id, "DEBIT", total, session_code))
            entries.append((inv_id, "CREDIT", total, session_code))

    if not entries:
        return
    deb = sum(a for _, t, a, _ in entries if t == "DEBIT")
    cre = sum(a for _, t, a, _ in entries if t == "CREDIT")
    if abs(deb - cre) > 0.0001:
        return

    await _post_balanced_voucher(
        db,
        tenant_id,
        user_id,
        v_date,
        f"Physical count {session_code}",
        f"PIC-{session_id}",
        entries,
        source_system="PHYSICAL_COUNT",
        source_id=session_id,
        action="POST",
    )


async def post_consumption_issue_gl(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    movement_id: int,
) -> None:
    mv = await db.get(StockMovement, movement_id)
    if not mv or mv.tenant_id != tenant_id:
        return
    ref = (mv.reference_type or "").upper()
    if ref == "CONSUMPTION_ISSUE":
        memo = "Consumption issue"
        v_prefix = "CMI"
        src = "CONSUMPTION_ISSUE"
    elif ref == "PRODUCTION_MATERIAL_ISSUE":
        memo = "Production material issue"
        v_prefix = "PMI"
        src = "PRODUCTION_MATERIAL_ISSUE"
    else:
        return
    val = _f(mv.movement_value)
    if val <= 0:
        return
    acc = await resolve_inventory_accounts(db, tenant_id, mv.item_id)
    inv_id = acc["inventory"]
    cogs_id = acc["cogs"]
    if not inv_id or not cogs_id:
        return
    v_date = mv.movement_date or date.today()
    entries = [
        (cogs_id, "DEBIT", val, memo),
        (inv_id, "CREDIT", val, memo),
    ]
    await _post_balanced_voucher(
        db,
        tenant_id,
        user_id,
        v_date,
        f"{memo} MV#{movement_id}",
        f"{v_prefix}-{movement_id}",
        entries,
        source_system=src,
        source_id=movement_id,
        action="POST",
    )

"""Sprint 4: advanced voucher helpers (books impact, CN/DN, recurring, post-dated)."""

from __future__ import annotations

import logging
from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.models.advanced_vouchers import RecurringVoucherTemplate, VoucherClass
from app.models.finance import ChartOfAccount, Voucher, VoucherLine
from app.models.party_ledger import PartyLedger, PartyLedgerBill
from app.modules.finance.voucher_controls import allocate_series_voucher_number

logger = logging.getLogger(__name__)

ZERO = Decimal("0")


async def assert_voucher_line_refs(db: AsyncSession, tenant_id: int, lines: list[dict[str, Any]]) -> None:
    """Every account / cost centre referenced by voucher line dicts must belong to the tenant."""
    from app.common.ownership import ensure_all_owned
    from app.models.finance import CostCenter

    account_ids: list[int | None] = []
    for ln in lines:
        raw = ln.get("account_id")
        if raw in (None, ""):
            raise HTTPException(status_code=400, detail="Each voucher line needs account_id")
        account_ids.append(int(raw))
    await ensure_all_owned(db, ChartOfAccount, account_ids, tenant_id, "Account")
    await ensure_all_owned(
        db,
        CostCenter,
        [int(ln["cost_center_id"]) if ln.get("cost_center_id") not in (None, "") else None for ln in lines],
        tenant_id,
        "Cost center",
    )


def voucher_should_affect_books(voucher: Voucher, *, as_of: date | None = None) -> bool:
    """Memorandum / optional(not included) / future post-dated / stock transfer do not hit CoA."""
    as_of = as_of or date.today()
    vtype = (voucher.voucher_type or "").upper()
    if vtype == "STOCK_TRANSFER" or getattr(voucher, "is_stock_transfer", False):
        return False
    if getattr(voucher, "is_memorandum", False) or vtype == "MEMORANDUM":
        return False
    if vtype == "OPTIONAL" or getattr(voucher, "is_optional", False):
        return bool(getattr(voucher, "include_in_books", False))
    if getattr(voucher, "is_post_dated", False) and voucher.voucher_date > as_of:
        return False
    return True


def voucher_book_impact_applied(voucher: Voucher) -> bool:
    """True when a POSTED voucher's lines are in CoA balances.

    ``books_applied`` was added later with default False, so older posted vouchers
    (and some auto-posting paths) hit the books without the flag; for those, fall
    back to the same rule used at posting time.
    """
    if getattr(voucher, "books_applied", False):
        return True
    return voucher_should_affect_books(voucher) and not getattr(voucher, "is_post_dated", False)


def voucher_in_books_clause():
    """SQL twin of ``voucher_book_impact_applied`` for report queries on POSTED vouchers."""
    vtype = func.upper(func.coalesce(Voucher.voucher_type, ""))
    return or_(
        Voucher.books_applied.is_(True),
        and_(
            vtype.not_in(("STOCK_TRANSFER", "MEMORANDUM")),
            Voucher.is_memorandum.is_(False),
            or_(and_(vtype != "OPTIONAL", Voucher.is_optional.is_(False)), Voucher.include_in_books.is_(True)),
            Voucher.is_post_dated.is_(False),
        ),
    )


def voucher_visible_in_day_book(voucher: Voucher, *, as_of: date | None = None) -> bool:
    """Active books vouchers (and posted CN/DN etc.) appear in day book; memo/held registers do not."""
    as_of = as_of or date.today()
    if getattr(voucher, "is_memorandum", False) or (voucher.voucher_type or "").upper() == "MEMORANDUM":
        return False
    if (voucher.voucher_type or "").upper() == "STOCK_TRANSFER":
        return False
    if getattr(voucher, "is_optional", False) and not getattr(voucher, "include_in_books", False):
        return False
    if getattr(voucher, "is_post_dated", False) and voucher.voucher_date > as_of:
        return False
    return True


async def apply_voucher_line_balances(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    *,
    reverse: bool = False,
) -> None:
    """Apply (or reverse) CoA balance impact for voucher lines. Sets books_applied.

    Locks the touched accounts, posts base-currency amounts and refuses unbalanced vouchers.
    """
    from app.modules.finance.posting_core import apply_voucher_to_books, load_voucher_lines

    lines = await load_voucher_lines(db, voucher.id)
    if not lines:
        voucher.books_applied = not reverse and voucher_should_affect_books(voucher)
        return
    await apply_voucher_to_books(db, tenant_id, voucher, lines, reverse=reverse)
    await db.flush()


def _d(v: Any) -> Decimal:
    try:
        return Decimal(str(v or 0))
    except Exception:
        return ZERO


def _money(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.0001"))


def next_frequency_date(d: date, frequency: str) -> date:
    freq = (frequency or "MONTHLY").upper()
    if freq == "DAILY":
        return d + timedelta(days=1)
    if freq == "WEEKLY":
        return d + timedelta(days=7)
    if freq == "QUARTERLY":
        m = d.month + 3
        y = d.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        last = monthrange(y, m)[1]
        return date(y, m, min(d.day, last))
    if freq == "YEARLY":
        try:
            return date(d.year + 1, d.month, d.day)
        except ValueError:
            return date(d.year + 1, d.month, 28)
    # MONTHLY
    m = d.month + 1
    y = d.year + (1 if m == 13 else 0)
    m = 1 if m == 13 else m
    last = monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


async def ensure_voucher_type_row(
    db: AsyncSession,
    tenant_id: int,
    code: str,
    name: str,
    *,
    flags: dict[str, bool] | None = None,
) -> None:
    from app.models.finance import VoucherType

    code = code.strip().upper()
    existing = (
        await db.execute(
            select(VoucherType).where(VoucherType.tenant_id == tenant_id, VoucherType.code == code)
        )
    ).scalars().first()
    if existing:
        if flags:
            for k, v in flags.items():
                if hasattr(existing, k):
                    setattr(existing, k, v)
        existing.is_active = True
        return
    row = VoucherType(
        tenant_id=tenant_id,
        code=code,
        name=name,
        is_active=True,
        is_system=True,
        **(flags or {}),
    )
    db.add(row)


async def create_note_voucher(
    db: AsyncSession,
    tenant_id: int,
    *,
    note_kind: str,  # CREDIT_NOTE | DEBIT_NOTE
    voucher_date: date,
    description: str,
    party_ledger_id: int,
    original_bill_id: int,
    amount: Decimal,
    revenue_or_purchase_account_id: int,
    party_account_id: int | None = None,
    tax_account_id: int | None = None,
    tax_amount: Decimal = ZERO,
    created_by: int | None = None,
    currency: str = "BDT",
    stock_returns: list[dict[str, Any]] | None = None,
) -> Voucher:
    """Create balanced CN/DN voucher + party ledger bill + FIFO allocate against original.

    Optional ``stock_returns``: list of {stock_item_id, qty, godown_id?, notes?} —
    CREDIT_NOTE receives stock (IN); DEBIT_NOTE issues stock back to vendor (OUT).
    """
    note_kind = note_kind.upper()
    if note_kind not in {"CREDIT_NOTE", "DEBIT_NOTE"}:
        raise HTTPException(status_code=400, detail="note_kind must be CREDIT_NOTE or DEBIT_NOTE")

    ledger = await db.get(PartyLedger, party_ledger_id)
    if not ledger or ledger.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    original = await db.get(PartyLedgerBill, original_bill_id)
    if not original or original.tenant_id != tenant_id or original.party_ledger_id != party_ledger_id:
        raise HTTPException(status_code=404, detail="Original party bill not found")

    amount = _money(amount)
    tax_amount = _money(tax_amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")

    party_acct = party_account_id or ledger.ledger_account_id
    for aid in (party_acct, revenue_or_purchase_account_id):
        acct = await db.get(ChartOfAccount, aid)
        if not acct or acct.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail=f"Invalid account {aid}")
    if tax_account_id and tax_amount > 0:
        tacct = await db.get(ChartOfAccount, tax_account_id)
        if not tacct or tacct.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Invalid tax account")
    if stock_returns:
        from app.common.ownership import ensure_all_owned
        from app.models.costing import Item
        from app.models.inventory import Warehouse

        await ensure_all_owned(
            db, Item, [int(sr.get("stock_item_id") or 0) or None for sr in stock_returns], tenant_id, "Item"
        )
        await ensure_all_owned(
            db,
            Warehouse,
            [int(sr["godown_id"]) if sr.get("godown_id") else None for sr in stock_returns],
            tenant_id,
            "Warehouse",
        )

    await ensure_voucher_type_row(
        db,
        tenant_id,
        note_kind,
        "Credit Note" if note_kind == "CREDIT_NOTE" else "Debit Note",
        flags={
            "is_credit_note": note_kind == "CREDIT_NOTE",
            "is_debit_note": note_kind == "DEBIT_NOTE",
        },
    )

    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant_id,
        voucher_date=voucher_date,
        voucher_type=note_kind,
        branch_code="MAIN",
    )
    voucher = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type=note_kind,
        voucher_date=voucher_date,
        status="DRAFT",
        description=description,
        reference=original.bill_number,
        currency=currency,
        base_currency=currency,
        exchange_rate=Decimal("1"),
        source_module=note_kind,
        original_party_bill_id=original.id,
        created_by=created_by,
        include_in_books=True,
    )
    db.add(voucher)
    await db.flush()

    # CREDIT_NOTE (customer return): Dr Sales Return (+tax), Cr Customer AR
    # DEBIT_NOTE (vendor return): Dr Vendor AP, Cr Purchase Return (+tax)
    net = amount
    gross = _money(net + tax_amount)
    lines: list[tuple[int, str, Decimal, str]] = []
    if note_kind == "CREDIT_NOTE":
        lines.append((revenue_or_purchase_account_id, "DEBIT", net, "Sales return"))
        if tax_account_id and tax_amount > 0:
            lines.append((tax_account_id, "DEBIT", tax_amount, "GST reversal"))
        lines.append((party_acct, "CREDIT", gross, "AR reduction"))
    else:
        lines.append((party_acct, "DEBIT", gross, "AP reduction"))
        lines.append((revenue_or_purchase_account_id, "CREDIT", net, "Purchase return"))
        if tax_account_id and tax_amount > 0:
            lines.append((tax_account_id, "CREDIT", tax_amount, "Input tax reversal"))

    for acct_id, entry, amt, notes in lines:
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=voucher.id,
                account_id=acct_id,
                entry_type=entry,
                amount=str(amt),
                base_amount=str(amt),
                currency=currency,
                exchange_rate="1",
                notes=notes,
            )
        )
    await db.flush()

    # Party bill for the note (CR for CN reduces AR pending; DR for DN reduces AP)
    note_bill = PartyLedgerBill(
        tenant_id=tenant_id,
        party_ledger_id=ledger.id,
        bill_number=f"{note_kind}-{voucher.voucher_number}",
        bill_date=voucher_date,
        bill_type=note_kind,
        original_amount=gross,
        amount_type="CR" if note_kind == "CREDIT_NOTE" else "DR",
        pending_amount=gross,
        settled_amount=ZERO,
        status="PENDING",
        due_date=voucher_date,
        voucher_id=voucher.id,
        narration=description,
    )
    db.add(note_bill)
    await db.flush()

    # Allocate note against original bill
    from app.modules.finance.party_ledger_bill_service import allocate_to_bill

    try:
        await allocate_to_bill(
            db,
            tenant_id,
            bill_id=original.id,
            voucher_id=voucher.id,
            allocated_amount=min(gross, _d(original.pending_amount)),
            allocated_date=voucher_date,
            notes=f"Auto from {note_kind}",
            created_by=created_by,
        )
    except Exception as exc:
        logger.warning("CN/DN allocate skipped: %s", exc)

    # Optional stock impact (goods returned)
    if stock_returns:
        from app.models.inventory import StockMovement

        for sr in stock_returns:
            qty = _money(_d(sr.get("qty")))
            item_id = int(sr.get("stock_item_id") or 0)
            if qty <= ZERO or item_id <= 0:
                continue
            godown_id = sr.get("godown_id")
            movement_type = "IN" if note_kind == "CREDIT_NOTE" else "OUT"
            db.add(
                StockMovement(
                    tenant_id=tenant_id,
                    item_id=item_id,
                    warehouse_id=int(godown_id) if godown_id else None,
                    movement_type=movement_type,
                    quantity=qty,
                    reference_type=note_kind,
                    reference_id=voucher.id,
                    movement_date=voucher_date,
                    notes=sr.get("notes") or f"{note_kind} stock",
                    created_by_user_id=created_by,
                    movement_kind=f"{note_kind}_STOCK",
                )
            )
        await db.flush()

    return voucher


async def create_stock_transfer_voucher(
    db: AsyncSession,
    tenant_id: int,
    *,
    from_godown_id: int,
    to_godown_id: int,
    items: list[dict[str, Any]],
    notes: str | None = None,
    created_by: int | None = None,
    auto_fifo: bool = True,
    feature_flags: Any = None,
) -> dict[str, Any]:
    """Internal stock move + STOCK_TRANSFER voucher record (no GL)."""
    from app.models.inventory import StockMovement, Warehouse, WarehouseTransfer, WarehouseTransferLine
    from app.modules.inventory.stock_batch_service import get_batch_availability, transfer_batch_qty

    if from_godown_id == to_godown_id:
        raise HTTPException(status_code=400, detail="from/to godown must differ")
    from_wh = await db.get(Warehouse, from_godown_id)
    to_wh = await db.get(Warehouse, to_godown_id)
    if not from_wh or from_wh.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Source godown not found")
    if not to_wh or to_wh.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Destination godown not found")
    from app.common.ownership import ensure_all_owned
    from app.models.costing import Item

    await ensure_all_owned(db, Item, [int(ln["stock_item_id"]) for ln in items], tenant_id, "Item")

    await ensure_voucher_type_row(
        db,
        tenant_id,
        "STOCK_TRANSFER",
        "Stock Transfer",
        flags={"is_stock_transfer": True, "is_memorandum": True},
    )

    code = await next_tenant_code(db, model=WarehouseTransfer, tenant_id=tenant_id, prefix="ST-", width=5)
    transfer = WarehouseTransfer(
        tenant_id=tenant_id,
        transfer_code=code,
        from_warehouse_id=from_godown_id,
        to_warehouse_id=to_godown_id,
        status="POSTED",
        notes=notes,
        created_by_user_id=created_by,
    )
    db.add(transfer)
    await db.flush()

    results: list[dict[str, Any]] = []
    for line in items:
        qty = _money(_d(line.get("qty")))
        item_id = int(line["stock_item_id"])
        if qty <= 0:
            continue
        db.add(
            WarehouseTransferLine(
                tenant_id=tenant_id,
                transfer_id=transfer.id,
                item_id=item_id,
                quantity=qty,
            )
        )
        batch_moves: list[dict[str, Any]] = []
        batch_id = line.get("batch_id")
        if batch_id:
            dest = await transfer_batch_qty(
                db, tenant_id, batch_id=int(batch_id), to_godown_id=to_godown_id, qty=qty
            )
            batch_moves.append({"batch_id": int(batch_id), "dest_batch_id": dest.id, "qty": str(qty)})
        elif auto_fifo:
            avail = await get_batch_availability(db, tenant_id, item_id, from_godown_id)
            remaining = qty
            for b in avail:
                if remaining <= ZERO:
                    break
                take = min(remaining, _d(b["current_qty"]))
                if take <= ZERO:
                    continue
                dest = await transfer_batch_qty(
                    db, tenant_id, batch_id=int(b["id"]), to_godown_id=to_godown_id, qty=take
                )
                batch_moves.append({"batch_id": int(b["id"]), "dest_batch_id": dest.id, "qty": str(take)})
                remaining = _money(remaining - take)
            if remaining > ZERO:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient batch stock for item {item_id}: short by {remaining}",
                )

        db.add(
            StockMovement(
                tenant_id=tenant_id,
                item_id=item_id,
                warehouse_id=from_godown_id,
                movement_type="OUT",
                quantity=qty,
                reference_type="STOCK_TRANSFER",
                reference_id=transfer.id,
                movement_date=date.today(),
                notes=f"Transfer {code}",
                created_by_user_id=created_by,
                movement_kind="WAREHOUSE_TRANSFER_OUT",
            )
        )
        db.add(
            StockMovement(
                tenant_id=tenant_id,
                item_id=item_id,
                warehouse_id=to_godown_id,
                movement_type="IN",
                quantity=qty,
                reference_type="STOCK_TRANSFER",
                reference_id=transfer.id,
                movement_date=date.today(),
                notes=f"Transfer {code}",
                created_by_user_id=created_by,
                movement_kind="WAREHOUSE_TRANSFER_IN",
            )
        )
        results.append({"item_id": item_id, "qty": str(qty), "batch_moves": batch_moves})

    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant_id,
        voucher_date=date.today(),
        voucher_type="STOCK_TRANSFER",
        branch_code="MAIN",
    )
    voucher = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type="STOCK_TRANSFER",
        voucher_date=date.today(),
        status="POSTED",
        description=notes or f"Stock transfer {code}",
        reference=code,
        source_module="STOCK_TRANSFER",
        source_module_ref=str(transfer.id),
        is_memorandum=True,
        include_in_books=False,
        books_applied=False,
        created_by=created_by,
        fiscal_year=fy,
        series_sequence=series_seq,
        number_series_key=series_key,
    )
    db.add(voucher)
    await db.flush()
    return {
        "voucher_id": voucher.id,
        "voucher_number": voucher.voucher_number,
        "transfer_id": transfer.id,
        "transfer_code": code,
        "lines": results,
    }


async def convert_optional_to_books(db: AsyncSession, tenant_id: int, voucher_id: int) -> Voucher:
    voucher = await db.get(Voucher, voucher_id)
    if not voucher or voucher.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if not voucher.is_optional and (voucher.voucher_type or "").upper() != "OPTIONAL":
        raise HTTPException(status_code=400, detail="Not an optional voucher")
    voucher.include_in_books = True
    voucher.is_optional = True
    if (voucher.status or "").upper() == "POSTED" and not voucher.books_applied:
        await apply_voucher_line_balances(db, tenant_id, voucher, reverse=False)
    return voucher


async def convert_memorandum_to_regular(db: AsyncSession, tenant_id: int, voucher_id: int) -> Voucher:
    voucher = await db.get(Voucher, voucher_id)
    if not voucher or voucher.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    voucher.is_memorandum = False
    voucher.include_in_books = True
    if (voucher.voucher_type or "").upper() == "MEMORANDUM":
        voucher.voucher_type = "JOURNAL"
    if (voucher.status or "").upper() == "POSTED" and not voucher.books_applied:
        await apply_voucher_line_balances(db, tenant_id, voucher, reverse=False)
    return voucher


async def activate_due_post_dated(
    db: AsyncSession,
    tenant_id: int,
    *,
    as_of: date | None = None,
) -> list[int]:
    """Clear is_post_dated for vouchers whose date has arrived; apply books if already POSTED."""
    as_of = as_of or date.today()
    rows = list(
        (
            await db.execute(
                select(Voucher).where(
                    Voucher.tenant_id == tenant_id,
                    Voucher.is_post_dated.is_(True),
                    Voucher.voucher_date <= as_of,
                    Voucher.status.in_(("DRAFT", "APPROVED", "POSTED", "SUBMITTED", "CHECKED", "RECOMMENDED")),
                )
            )
        )
        .scalars()
        .all()
    )
    activated = []
    for v in rows:
        v.is_post_dated = False
        if (v.status or "").upper() == "POSTED" and not v.books_applied and voucher_should_affect_books(v, as_of=as_of):
            await apply_voucher_line_balances(db, tenant_id, v, reverse=False)
        activated.append(v.id)
    await db.flush()
    return activated


async def generate_from_recurring_template(
    db: AsyncSession,
    tenant_id: int,
    template: RecurringVoucherTemplate,
    *,
    created_by: int | None = None,
    as_of: date | None = None,
) -> Voucher | None:
    as_of = as_of or date.today()
    if not template.is_active:
        return None
    if template.next_due_date > as_of:
        return None
    if template.end_date and template.next_due_date > template.end_date:
        template.is_active = False
        return None

    tpl = template.voucher_template or {}
    lines_in = tpl.get("lines") or []
    if not lines_in:
        raise HTTPException(status_code=400, detail=f"Template {template.id} has no lines")
    await assert_voucher_line_refs(db, tenant_id, lines_in)
    from app.modules.finance.posting_core import assert_dict_lines_balanced

    # Every generated line shares one currency and rate, so balanced amounts mean balanced base amounts.
    assert_dict_lines_balanced(
        [{"entry_type": ln.get("entry_type") or "DEBIT", "amount": ln.get("amount")} for ln in lines_in],
        label=f"Recurring template {template.id}",
    )

    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant_id,
        voucher_date=template.next_due_date,
        voucher_type=template.voucher_type,
        branch_code="MAIN",
    )
    status = (template.generate_as_status or "DRAFT").upper()
    if status not in {"DRAFT", "POSTED"}:
        status = "DRAFT"
    voucher = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type=template.voucher_type,
        voucher_date=template.next_due_date,
        status="DRAFT",  # always draft first; caller may post
        description=tpl.get("description") or template.name,
        reference=tpl.get("reference"),
        currency=tpl.get("currency") or "BDT",
        base_currency=tpl.get("base_currency") or tpl.get("currency") or "BDT",
        exchange_rate=Decimal(str(tpl.get("exchange_rate") or "1")),
        source_module="RECURRING",
        source_module_ref=str(template.id),
        voucher_class_id=template.voucher_class_id,
        created_by=created_by,
        fiscal_year=fy,
        series_sequence=series_seq,
        number_series_key=series_key,
    )
    db.add(voucher)
    await db.flush()
    rate = _d(voucher.exchange_rate)
    if rate <= ZERO:
        rate = Decimal("1")
    for ln in lines_in:
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=voucher.id,
                account_id=int(ln["account_id"]),
                cost_center_id=ln.get("cost_center_id"),
                entry_type=str(ln.get("entry_type") or "DEBIT").upper(),
                amount=str(_money(_d(ln.get("amount")))),
                base_amount=str(_money(_d(ln.get("amount")) * rate)),
                currency=voucher.currency,
                exchange_rate=str(voucher.exchange_rate),
                notes=ln.get("notes"),
            )
        )
    template.last_generated_date = template.next_due_date
    template.next_due_date = next_frequency_date(template.next_due_date, template.frequency)
    await db.flush()
    return voucher


def voucher_class_out(row: VoucherClass) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "voucher_type": row.voucher_type,
        "default_ledger_id": row.default_ledger_id,
        "default_narration": row.default_narration,
        "default_cost_center_id": row.default_cost_center_id,
        "line_templates": row.line_templates or [],
        "auto_tax": row.auto_tax,
        "auto_round_off": row.auto_round_off,
        "auto_bill_allocation": row.auto_bill_allocation,
        "is_active": row.is_active,
    }


def recurring_out(row: RecurringVoucherTemplate) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "voucher_type": row.voucher_type,
        "voucher_class_id": row.voucher_class_id,
        "frequency": row.frequency,
        "start_date": row.start_date.isoformat(),
        "end_date": row.end_date.isoformat() if row.end_date else None,
        "next_due_date": row.next_due_date.isoformat(),
        "last_generated_date": row.last_generated_date.isoformat() if row.last_generated_date else None,
        "voucher_template": row.voucher_template,
        "generate_as_status": row.generate_as_status,
        "is_active": row.is_active,
    }

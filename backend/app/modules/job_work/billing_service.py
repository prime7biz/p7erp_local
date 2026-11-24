"""CM billing and cash/bank receipts for inbound job work."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.codegen import next_tenant_code
from app.common.document_history import record_doc_event
from app.common.ownership import ensure_owned
from app.database import safe_async_session_rollback
from app.models import Tenant, User
from app.models.customer import Customer
from app.models.finance import ChartOfAccount, OutstandingBill, Voucher
from app.models.job_work import JobWorkBill, JobWorkReceipt
from app.modules.finance.auto_posting_service import AutoPostingLine, create_system_voucher, to_money_decimal
from app.modules.finance.system_coa_seeding_service import resolve_system_ledger
from app.modules.job_work.access import ensure_not_closed, get_contract_for_tenant
from app.modules.job_work.money import ZERO, money2, q4, rate6, s2, s4
from app.modules.job_work.schemas import BillCreate, ReceiptCreate
from app.modules.job_work.serializers import bill_out, billable_qty, receipt_out


async def _replay_bill(db: AsyncSession, tenant_id: int, source_ref: str) -> JobWorkBill | None:
    existing = (
        await db.execute(
            select(Voucher).where(
                Voucher.tenant_id == tenant_id,
                Voucher.source_module == "JOB_WORK",
                Voucher.source_module_ref == source_ref,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        return None
    bill = (
        await db.execute(
            select(JobWorkBill).where(
                JobWorkBill.tenant_id == tenant_id,
                JobWorkBill.voucher_id == existing.id,
            )
        )
    ).scalar_one_or_none()
    if bill is None:
        # Voucher already posted for this idempotency key — never post a second one.
        raise HTTPException(
            status_code=409,
            detail="A voucher already exists for this bill request_id; refresh and retry",
        )
    return bill


async def create_bill(
    db: AsyncSession,
    tenant: Tenant,
    user: User,
    contract_id: int,
    body: BillCreate,
):
    try:
        contract = await get_contract_for_tenant(
            db, tenant_id=tenant.id, contract_id=contract_id, for_update=True
        )
        ensure_not_closed(contract)
        if (contract.status or "").upper() == "DRAFT":
            raise HTTPException(status_code=409, detail="Confirm the contract before billing")

        if body.request_id and body.request_id.strip():
            source_ref = f"JOB_WORK_CM:{contract.id}:{body.request_id.strip()}"
            replay = await _replay_bill(db, tenant.id, source_ref)
            if replay is not None:
                return bill_out(replay)
        else:
            source_ref = None

        remaining = q4(billable_qty(contract))
        qty = q4(body.qty_billed, field="qty_billed") if body.qty_billed is not None else remaining
        if qty <= ZERO:
            raise HTTPException(status_code=400, detail="Nothing left to bill")
        if qty > remaining:
            raise HTTPException(status_code=400, detail="qty_billed exceeds billable delivered qty")

        cm_rate = money2(contract.cm_rate, field="cm_rate")
        net = money2(qty * cm_rate, field="net_amount")
        vat_pct = money2(body.vat_rate_pct if body.vat_rate_pct is not None else contract.vat_rate_pct, field="vat_rate_pct")
        if vat_pct < ZERO:
            raise HTTPException(status_code=400, detail="vat_rate_pct cannot be negative")
        vat_amt = money2(net * vat_pct / Decimal("100"), field="vat_amount") if vat_pct > ZERO else ZERO
        gross = money2(net + vat_amt, field="gross_amount")
        if gross <= ZERO:
            raise HTTPException(status_code=400, detail="Bill amount must be greater than zero")

        currency = (contract.currency or "BDT").upper()
        base = (tenant.base_currency or "BDT").strip().upper()[:10] or "BDT"
        fx = rate6(body.exchange_rate if body.exchange_rate is not None else contract.exchange_rate_default)
        if currency == base:
            fx = rate6("1")

        bill_date = body.bill_date or today_local(tenant)
        bill_no = await next_tenant_code(db, model=JobWorkBill, tenant_id=tenant.id, prefix="JWB-", width=4)
        if source_ref is None:
            source_ref = f"JOB_WORK_CM:{contract.id}:{bill_no}"

        lines = [
            AutoPostingLine(
                entry_type="DEBIT",
                amount=gross,
                system_code="ACCOUNTS_RECEIVABLE_TRADE",
                notes=f"Job work CM {contract.contract_no}",
            ),
            AutoPostingLine(
                entry_type="CREDIT",
                amount=net,
                system_code="SERVICE_REVENUE",
                notes=f"Job work CM {contract.contract_no}",
            ),
        ]
        if vat_amt > ZERO:
            try:
                await resolve_system_ledger(db, tenant.id, "VAT_PAYABLE_OUTPUT")
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail="VAT output ledger is not mapped; set VAT rate to 0 or map VAT_PAYABLE_OUTPUT",
                ) from exc
            lines.append(
                AutoPostingLine(
                    entry_type="CREDIT",
                    amount=vat_amt,
                    system_code="VAT_PAYABLE_OUTPUT",
                    notes=f"VAT on job work {contract.contract_no}",
                )
            )

        voucher = await create_system_voucher(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            voucher_type="JOURNAL",
            voucher_date=bill_date,
            lines=lines,
            description=f"Job work CM bill {bill_no}",
            reference=contract.contract_no,
            source_module="JOB_WORK",
            source_module_ref=source_ref,
            currency=currency,
            base_currency=base,
            exchange_rate=fx,
            auto_post=True,
        )

        customer = await db.get(Customer, contract.customer_id)
        party_name = customer.name.strip() if customer and customer.tenant_id == tenant.id and customer.name else f"CUSTOMER-{contract.customer_id}"
        ar_bill_no = await next_tenant_code(db, model=OutstandingBill, tenant_id=tenant.id, prefix="AR-", width=4)
        ob = OutstandingBill(
            tenant_id=tenant.id,
            bill_no=ar_bill_no,
            party_name=party_name,
            bill_type="RECEIVABLE",
            bill_date=bill_date,
            due_date=bill_date + timedelta(days=30),
            amount=s2(gross),
            paid_amount="0",
            currency=currency,
            status="OPEN",
            notes=f"Job work CM | {contract.contract_no} | {bill_no} | voucher:{voucher.voucher_number}",
        )
        db.add(ob)
        await db.flush()

        bill = JobWorkBill(
            tenant_id=tenant.id,
            contract_id=contract.id,
            bill_no=bill_no,
            bill_date=bill_date,
            qty_billed=s4(qty),
            cm_rate=s2(cm_rate),
            currency=currency,
            exchange_rate=str(fx),
            vat_rate_pct=s2(vat_pct),
            vat_amount=s2(vat_amt),
            net_amount=s2(net),
            gross_amount=s2(gross),
            amount_received="0",
            status="OPEN",
            voucher_id=voucher.id,
            outstanding_bill_id=ob.id,
            notes=(body.notes or "").strip() or None,
            created_by_user_id=user.id,
        )
        db.add(bill)

        contract.qty_billed = s4(q4(contract.qty_billed) + qty)
        contract.amount_billed = s2(money2(contract.amount_billed) + gross)
        contract.updated_by_user_id = user.id
        contract.updated_at = datetime.utcnow()
        if q4(billable_qty(contract)) <= ZERO:
            contract.status = "BILLED"
        elif (contract.status or "").upper() not in {"CLOSED"}:
            contract.status = "DELIVERED"

        await db.flush()
        await record_doc_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            doc_type="JOB_WORK_CONTRACT",
            doc_id=contract.id,
            event="BILLED",
            summary=f"Billed {s4(qty)} @ {s2(cm_rate)} on {contract.contract_no}",
            from_status=contract.status,
            to_status=contract.status,
            extra={"bill_id": bill.id, "voucher_id": voucher.id},
        )
        await db.commit()
        return bill_out(bill)
    except HTTPException:
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


async def list_bills(db: AsyncSession, tenant: Tenant, contract_id: int):
    await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id)
    rows = (
        await db.execute(
            select(JobWorkBill)
            .where(JobWorkBill.tenant_id == tenant.id, JobWorkBill.contract_id == contract_id)
            .order_by(JobWorkBill.id.desc())
        )
    ).scalars().all()
    return [bill_out(r) for r in rows]


async def cancel_bill(db: AsyncSession, tenant: Tenant, user: User, contract_id: int, bill_id: int):
    try:
        contract = await get_contract_for_tenant(
            db, tenant_id=tenant.id, contract_id=contract_id, for_update=True
        )
        ensure_not_closed(contract)
        bill = await db.get(JobWorkBill, bill_id)
        if bill is None or bill.tenant_id != tenant.id or bill.contract_id != contract.id:
            raise HTTPException(status_code=404, detail="Bill not found")
        if (bill.status or "").upper() == "CANCELLED":
            return bill_out(bill)
        if money2(bill.amount_received) > ZERO:
            raise HTTPException(status_code=409, detail="Cannot cancel a bill that has receipts")
        if bill.voucher_id is None:
            raise HTTPException(status_code=409, detail="Bill has no voucher to reverse")

        original = await db.get(Voucher, bill.voucher_id)
        if original is None or original.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Source voucher not found")
        if (original.status or "").upper() == "REVERSED" or original.reversed_by_voucher_id:
            raise HTTPException(status_code=409, detail="Bill voucher already reversed")

        cancel_ref = f"JOB_WORK_CM_CANCEL:{bill.id}"
        existing_cancel = (
            await db.execute(
                select(Voucher).where(
                    Voucher.tenant_id == tenant.id,
                    Voucher.source_module == "JOB_WORK",
                    Voucher.source_module_ref == cancel_ref,
                )
            )
        ).scalar_one_or_none()
        if existing_cancel is not None:
            bill.status = "CANCELLED"
            bill.reverse_voucher_id = existing_cancel.id
            await db.commit()
            return bill_out(bill)

        # Reverse by flipping DEBIT/CREDIT of the original posted lines via system voucher reconstruction
        from app.models.finance import VoucherLine

        src_lines = (
            await db.execute(
                select(VoucherLine).where(
                    VoucherLine.tenant_id == tenant.id,
                    VoucherLine.voucher_id == original.id,
                )
            )
        ).scalars().all()
        if not src_lines:
            raise HTTPException(status_code=400, detail="Source voucher has no lines")
        rev_lines = [
            AutoPostingLine(
                entry_type="CREDIT" if (ln.entry_type or "").upper() == "DEBIT" else "DEBIT",
                amount=to_money_decimal(ln.amount),
                account_id=ln.account_id,
                notes=f"Reverse {bill.bill_no}",
            )
            for ln in src_lines
        ]
        rev = await create_system_voucher(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            voucher_type="JOURNAL",
            voucher_date=today_local(tenant),
            lines=rev_lines,
            description=f"Cancel job work bill {bill.bill_no}",
            reference=contract.contract_no,
            source_module="JOB_WORK",
            source_module_ref=cancel_ref,
            currency=bill.currency,
            base_currency=(tenant.base_currency or "BDT"),
            exchange_rate=bill.exchange_rate,
            auto_post=True,
        )
        # Link like finance.reverse_voucher so books cannot be reversed twice from the UI.
        rev.reverses_voucher_id = original.id
        original.status = "REVERSED"
        original.reversed_by_voucher_id = rev.id
        from app.modules.finance.party_ledger_hooks import on_voucher_cancelled

        await on_voucher_cancelled(db, tenant.id, original)

        bill.status = "CANCELLED"
        bill.reverse_voucher_id = rev.id
        if bill.outstanding_bill_id:
            ob = await db.get(OutstandingBill, bill.outstanding_bill_id)
            if ob and ob.tenant_id == tenant.id:
                ob.status = "CANCELLED"
                ob.paid_amount = ob.amount

        contract.qty_billed = s4(q4(contract.qty_billed) - q4(bill.qty_billed))
        if q4(contract.qty_billed) < ZERO:
            contract.qty_billed = "0"
        contract.amount_billed = s2(money2(contract.amount_billed) - money2(bill.gross_amount))
        if money2(contract.amount_billed) < ZERO:
            contract.amount_billed = "0"
        contract.updated_by_user_id = user.id
        await record_doc_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            doc_type="JOB_WORK_CONTRACT",
            doc_id=contract.id,
            event="BILL_CANCELLED",
            summary=f"Cancelled bill {bill.bill_no}",
            extra={"bill_id": bill.id, "reverse_voucher_id": rev.id},
        )
        await db.commit()
        return bill_out(bill)
    except HTTPException:
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


async def create_receipt(
    db: AsyncSession,
    tenant: Tenant,
    user: User,
    contract_id: int,
    body: ReceiptCreate,
):
    try:
        contract = await get_contract_for_tenant(
            db, tenant_id=tenant.id, contract_id=contract_id, for_update=True
        )
        ensure_not_closed(contract)
        bill = (
            await db.execute(
                select(JobWorkBill)
                .where(
                    JobWorkBill.id == body.bill_id,
                    JobWorkBill.tenant_id == tenant.id,
                    JobWorkBill.contract_id == contract.id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if bill is None:
            raise HTTPException(status_code=404, detail="Bill not found")
        if (bill.status or "").upper() in {"CANCELLED"}:
            raise HTTPException(status_code=409, detail="Cannot receive against a cancelled bill")

        if body.request_id:
            source_ref = f"JOB_WORK_RCPT:{bill.id}:{body.request_id.strip()}"
            existing_v = (
                await db.execute(
                    select(Voucher).where(
                        Voucher.tenant_id == tenant.id,
                        Voucher.source_module == "JOB_WORK",
                        Voucher.source_module_ref == source_ref,
                    )
                )
            ).scalar_one_or_none()
            if existing_v is not None:
                existing_r = (
                    await db.execute(
                        select(JobWorkReceipt).where(
                            JobWorkReceipt.tenant_id == tenant.id,
                            JobWorkReceipt.voucher_id == existing_v.id,
                        )
                    )
                ).scalar_one_or_none()
                if existing_r:
                    return receipt_out(existing_r)
                raise HTTPException(
                    status_code=409,
                    detail="A voucher already exists for this receipt request_id; refresh and retry",
                )
        else:
            receipt_no = await next_tenant_code(
                db, model=JobWorkReceipt, tenant_id=tenant.id, prefix="JWR-", width=4
            )
            source_ref = f"JOB_WORK_RCPT:{bill.id}:{receipt_no}"

        cash_acct = await ensure_owned(db, ChartOfAccount, body.cash_or_bank_account_id, tenant.id, "Account")
        from app.models.finance import AccountGroup

        cash_ok = bool(getattr(cash_acct, "is_bank_account", False))
        if not cash_ok and cash_acct.group_id:
            grp = await db.get(AccountGroup, cash_acct.group_id)
            if grp and grp.tenant_id == tenant.id and (
                bool(grp.is_bank_group) or "cash" in (grp.code or "").lower() or "bank" in (grp.code or "").lower()
            ):
                cash_ok = True
        name_l = (cash_acct.name or "").lower()
        if not cash_ok and ("cash" in name_l or "bank" in name_l):
            cash_ok = True
        if not cash_ok:
            raise HTTPException(status_code=400, detail="Choose a cash or bank ledger for the receipt")
        amount = money2(body.amount, field="amount")
        if amount <= ZERO:
            raise HTTPException(status_code=400, detail="amount must be greater than zero")
        outstanding = money2(bill.gross_amount) - money2(bill.amount_received)
        if amount > outstanding:
            raise HTTPException(status_code=400, detail="Receipt exceeds outstanding bill amount")

        currency = (bill.currency or "BDT").upper()
        base = (tenant.base_currency or "BDT").strip().upper()[:10] or "BDT"
        bill_fx = rate6(bill.exchange_rate)
        rcpt_fx = rate6(body.exchange_rate if body.exchange_rate is not None else bill.exchange_rate)
        if currency == base:
            bill_fx = rate6("1")
            rcpt_fx = rate6("1")

        receipt_date = body.receipt_date or today_local(tenant)
        if not body.request_id:
            # receipt_no already allocated above
            pass
        else:
            receipt_no = await next_tenant_code(
                db, model=JobWorkReceipt, tenant_id=tenant.id, prefix="JWR-", width=4
            )

        # Base-currency AR credit uses bill rate; cash debit uses receipt rate; difference -> FX gain/loss
        ar_base = (amount * bill_fx).quantize(Decimal("0.0001"))
        cash_base = (amount * rcpt_fx).quantize(Decimal("0.0001"))
        diff = cash_base - ar_base

        lines: list[AutoPostingLine] = [
            AutoPostingLine(
                entry_type="DEBIT",
                amount=amount,
                account_id=body.cash_or_bank_account_id,
                notes=f"Receipt {receipt_no}",
            ),
            AutoPostingLine(
                entry_type="CREDIT",
                amount=amount,
                system_code="ACCOUNTS_RECEIVABLE_TRADE",
                notes=f"Receipt {receipt_no}",
            ),
        ]
        # When rates differ, create_system_voucher applies one rate to all lines — so for FX
        # difference we post in base currency with rate=1 and amounts already in base terms.
        use_rate = rcpt_fx
        post_currency = currency
        if currency != base and bill_fx != rcpt_fx:
            # Post cash and AR in base at rate 1 so the voucher balances after FX line.
            lines = [
                AutoPostingLine(
                    entry_type="DEBIT",
                    amount=cash_base,
                    account_id=body.cash_or_bank_account_id,
                    notes=f"Receipt {receipt_no} (base)",
                ),
                AutoPostingLine(
                    entry_type="CREDIT",
                    amount=ar_base,
                    system_code="ACCOUNTS_RECEIVABLE_TRADE",
                    notes=f"Receipt {receipt_no} (base)",
                ),
            ]
            if diff > ZERO:
                try:
                    await resolve_system_ledger(db, tenant.id, "EXCHANGE_GAIN")
                except ValueError as exc:
                    raise HTTPException(
                        status_code=400,
                        detail="Exchange gain ledger is not mapped; use the bill rate or map EXCHANGE_GAIN",
                    ) from exc
                lines.append(
                    AutoPostingLine(
                        entry_type="CREDIT",
                        amount=diff,
                        system_code="EXCHANGE_GAIN",
                        notes="FX gain on job work receipt",
                    )
                )
            elif diff < ZERO:
                try:
                    await resolve_system_ledger(db, tenant.id, "EXCHANGE_LOSS")
                except ValueError as exc:
                    raise HTTPException(
                        status_code=400,
                        detail="Exchange loss ledger is not mapped; use the bill rate or map EXCHANGE_LOSS",
                    ) from exc
                lines.append(
                    AutoPostingLine(
                        entry_type="DEBIT",
                        amount=abs(diff),
                        system_code="EXCHANGE_LOSS",
                        notes="FX loss on job work receipt",
                    )
                )
            use_rate = rate6("1")
            post_currency = base

        voucher = await create_system_voucher(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            voucher_type="RECEIPT",
            voucher_date=receipt_date,
            lines=lines,
            description=f"Job work receipt {receipt_no}",
            reference=contract.contract_no,
            source_module="JOB_WORK",
            source_module_ref=source_ref,
            currency=post_currency,
            base_currency=base,
            exchange_rate=use_rate,
            auto_post=True,
        )

        receipt = JobWorkReceipt(
            tenant_id=tenant.id,
            contract_id=contract.id,
            bill_id=bill.id,
            receipt_no=receipt_no,
            receipt_date=receipt_date,
            amount=s2(amount),
            currency=currency,
            exchange_rate=str(rcpt_fx),
            cash_or_bank_account_id=body.cash_or_bank_account_id,
            status="POSTED",
            voucher_id=voucher.id,
            notes=(body.notes or "").strip() or None,
            created_by_user_id=user.id,
        )
        db.add(receipt)

        new_paid = money2(bill.amount_received) + amount
        bill.amount_received = s2(new_paid)
        bill.status = "PAID" if new_paid >= money2(bill.gross_amount) else "PARTIAL"
        if bill.outstanding_bill_id:
            ob = await db.get(OutstandingBill, bill.outstanding_bill_id)
            if ob and ob.tenant_id == tenant.id:
                ob.paid_amount = s2(money2(ob.paid_amount) + amount)
                ob.status = "PAID" if money2(ob.paid_amount) >= money2(ob.amount) else "PARTIAL"

        contract.amount_received = s2(money2(contract.amount_received) + amount)
        contract.updated_by_user_id = user.id
        await record_doc_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            doc_type="JOB_WORK_CONTRACT",
            doc_id=contract.id,
            event="RECEIPT",
            summary=f"Receipt {receipt_no} amount {s2(amount)}",
            extra={"receipt_id": receipt.id, "bill_id": bill.id, "voucher_id": voucher.id},
        )
        await db.commit()
        return receipt_out(receipt)
    except HTTPException:
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


async def list_receipts(db: AsyncSession, tenant: Tenant, contract_id: int):
    await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id)
    rows = (
        await db.execute(
            select(JobWorkReceipt)
            .where(JobWorkReceipt.tenant_id == tenant.id, JobWorkReceipt.contract_id == contract_id)
            .order_by(JobWorkReceipt.id.desc())
        )
    ).scalars().all()
    return [receipt_out(r) for r in rows]


async def open_ar_amount(db: AsyncSession, tenant_id: int, contract_id: int) -> Decimal:
    rows = (
        await db.execute(
            select(JobWorkBill).where(
                JobWorkBill.tenant_id == tenant_id,
                JobWorkBill.contract_id == contract_id,
                JobWorkBill.status.in_(("OPEN", "PARTIAL")),
            )
        )
    ).scalars().all()
    total = ZERO
    for b in rows:
        total += money2(b.gross_amount) - money2(b.amount_received)
    return money2(total)

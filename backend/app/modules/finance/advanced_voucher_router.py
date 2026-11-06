"""Sprint 4: advanced vouchers HTTP API (classes, recurring, CN/DN, registers)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.permissions import (
    PERMISSION_CREDIT_NOTE_CREATE,
    PERMISSION_DEBIT_NOTE_CREATE,
    PERMISSION_RECURRING_VOUCHER_CREATE,
    PERMISSION_RECURRING_VOUCHER_DELETE,
    PERMISSION_RECURRING_VOUCHER_EDIT,
    PERMISSION_RECURRING_VOUCHER_VIEW,
    PERMISSION_STOCK_TRANSFER_VOUCHER_CREATE,
    PERMISSION_VOUCHER_CLASS_CREATE,
    PERMISSION_VOUCHER_CLASS_DELETE,
    PERMISSION_VOUCHER_CLASS_EDIT,
    PERMISSION_VOUCHER_CLASS_VIEW,
    PERMISSION_VOUCHER_TYPE_CONFIG,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_credit_debit_note_enabled,
    is_memorandum_voucher_enabled,
    is_optional_voucher_enabled,
    is_post_dated_voucher_enabled,
    is_recurring_voucher_enabled,
    is_stock_transfer_voucher_enabled,
    is_voucher_class_enabled,
)
from app.common.ownership import ensure_owned
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.advanced_vouchers import RecurringVoucherTemplate, VoucherClass
from app.models.finance import ChartOfAccount, CostCenter, Voucher, VoucherType
from app.modules.finance.advanced_voucher_service import (
    activate_due_post_dated,
    assert_voucher_line_refs,
    convert_memorandum_to_regular,
    convert_optional_to_books,
    create_note_voucher,
    create_stock_transfer_voucher,
    ensure_voucher_type_row,
    generate_from_recurring_template,
    recurring_out,
    voucher_class_out,
)
from app.modules.finance.posting_core import assert_dict_lines_balanced
from app.modules.finance.voucher_controls import allocate_series_voucher_number

router = APIRouter(tags=["finance-advanced-vouchers"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


async def _validate_voucher_class_refs(db: AsyncSession, tenant_id: int, body: "VoucherClassBody") -> None:
    await ensure_owned(db, ChartOfAccount, body.default_ledger_id, tenant_id, "Account")
    await ensure_owned(db, CostCenter, body.default_cost_center_id, tenant_id, "Cost center")
    tpl_lines = [ln for ln in (body.line_templates or []) if ln.get("account_id") not in (None, "")]
    if tpl_lines:
        await assert_voucher_line_refs(db, tenant_id, tpl_lines)


async def _validate_recurring_refs(db: AsyncSession, tenant_id: int, body: "RecurringBody") -> None:
    await ensure_owned(db, VoucherClass, body.voucher_class_id, tenant_id, "Voucher class")
    lines = (body.voucher_template or {}).get("lines") or []
    if lines:
        await assert_voucher_line_refs(db, tenant_id, lines)
        assert_dict_lines_balanced(
            [{"entry_type": ln.get("entry_type") or "DEBIT", "amount": ln.get("amount")} for ln in lines],
            label="Recurring template",
        )


async def _require_posting_permission(db: AsyncSession, user: User, tenant_id: int) -> None:
    """Putting a voucher into the books needs the same role as posting one."""
    from app.modules.finance.router import _require_manager_or_admin

    await _require_manager_or_admin(db, user, tenant_id)


def _require_flag(enabled: bool, flag_name: str) -> None:
    if not enabled:
        raise HTTPException(
            status_code=404,
            detail=f"Feature disabled. Enable tenant feature flag {flag_name}.",
        )


# --- Schemas ---


class VoucherClassBody(BaseModel):
    name: str
    voucher_type: str
    default_ledger_id: int | None = None
    default_narration: str | None = None
    default_cost_center_id: int | None = None
    line_templates: list[dict[str, Any]] | None = None
    auto_tax: bool = False
    auto_round_off: bool = False
    auto_bill_allocation: bool = False
    is_active: bool = True


class RecurringBody(BaseModel):
    name: str
    voucher_type: str
    voucher_class_id: int | None = None
    frequency: Literal["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] = "MONTHLY"
    start_date: date
    end_date: date | None = None
    next_due_date: date | None = None
    voucher_template: dict[str, Any]
    generate_as_status: Literal["DRAFT", "POSTED"] = "DRAFT"
    is_active: bool = True


class NoteCreateBody(BaseModel):
    voucher_date: date
    description: str = ""
    party_ledger_id: int
    original_bill_id: int
    amount: Decimal
    revenue_or_purchase_account_id: int
    party_account_id: int | None = None
    tax_account_id: int | None = None
    tax_amount: Decimal = Decimal("0")
    currency: str = "BDT"
    post: bool = False
    stock_returns: list[dict[str, Any]] | None = None


class StockTransferItemBody(BaseModel):
    stock_item_id: int
    qty: Decimal
    batch_id: int | None = None


class StockTransferVoucherBody(BaseModel):
    from_godown_id: int
    to_godown_id: int
    items: list[StockTransferItemBody] = Field(default_factory=list)
    notes: str | None = None
    auto_fifo: bool = True


class SpecialVoucherCreateBody(BaseModel):
    voucher_type: Literal["MEMORANDUM", "OPTIONAL"] = "MEMORANDUM"
    voucher_date: date
    description: str | None = None
    reference: str | None = None
    include_in_books: bool = False
    is_post_dated: bool = False
    lines: list[dict[str, Any]] = Field(default_factory=list)
    currency: str = "BDT"


class VoucherTypeFlagBody(BaseModel):
    is_active: bool | None = None
    is_credit_note: bool | None = None
    is_debit_note: bool | None = None
    is_memorandum: bool | None = None
    is_optional: bool | None = None
    is_post_dated: bool | None = None
    is_stock_transfer: bool | None = None
    voucher_class_id: int | None = None


# --- Voucher type config ---


@router.get("/finance/voucher-types/advanced")
async def list_advanced_voucher_types(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_VOUCHER_TYPE_CONFIG)
    for code, name, flags in [
        ("CREDIT_NOTE", "Credit Note", {"is_credit_note": True}),
        ("DEBIT_NOTE", "Debit Note", {"is_debit_note": True}),
        ("STOCK_TRANSFER", "Stock Transfer", {"is_stock_transfer": True, "is_memorandum": True}),
        ("MEMORANDUM", "Memorandum", {"is_memorandum": True}),
        ("OPTIONAL", "Optional", {"is_optional": True}),
    ]:
        await ensure_voucher_type_row(db, tenant.id, code, name, flags=flags)
    await db.commit()
    rows = list(
        (
            await db.execute(select(VoucherType).where(VoucherType.tenant_id == tenant.id).order_by(VoucherType.code))
        )
        .scalars()
        .all()
    )
    return {
        "rows": [
            {
                "id": r.id,
                "code": r.code,
                "name": r.name,
                "is_active": r.is_active,
                "is_system": r.is_system,
                "is_credit_note": r.is_credit_note,
                "is_debit_note": r.is_debit_note,
                "is_memorandum": r.is_memorandum,
                "is_optional": r.is_optional,
                "is_post_dated": r.is_post_dated,
                "is_stock_transfer": r.is_stock_transfer,
                "voucher_class_id": r.voucher_class_id,
            }
            for r in rows
        ],
        "feature_flags": {
            "credit_debit_note_enabled": is_credit_debit_note_enabled(tenant.feature_flags),
            "stock_transfer_voucher_enabled": is_stock_transfer_voucher_enabled(tenant.feature_flags),
            "memorandum_voucher_enabled": is_memorandum_voucher_enabled(tenant.feature_flags),
            "optional_voucher_enabled": is_optional_voucher_enabled(tenant.feature_flags),
            "post_dated_voucher_enabled": is_post_dated_voucher_enabled(tenant.feature_flags),
            "recurring_voucher_enabled": is_recurring_voucher_enabled(tenant.feature_flags),
            "voucher_class_enabled": is_voucher_class_enabled(tenant.feature_flags),
        },
    }


@router.patch("/finance/voucher-types/advanced/{type_id}")
async def patch_advanced_voucher_type(
    type_id: int,
    body: VoucherTypeFlagBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_VOUCHER_TYPE_CONFIG)
    row = await db.get(VoucherType, type_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher type not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "is_active": row.is_active,
        "is_credit_note": row.is_credit_note,
        "is_debit_note": row.is_debit_note,
        "is_memorandum": row.is_memorandum,
        "is_optional": row.is_optional,
        "is_post_dated": row.is_post_dated,
        "is_stock_transfer": row.is_stock_transfer,
        "voucher_class_id": row.voucher_class_id,
    }


# --- Voucher classes ---


@router.get("/finance/voucher-classes")
async def list_voucher_classes(
    voucher_type: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_voucher_class_enabled(tenant.feature_flags), "voucher_class_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_VOUCHER_CLASS_VIEW)
    q = select(VoucherClass).where(VoucherClass.tenant_id == tenant.id).order_by(VoucherClass.name)
    if voucher_type:
        q = q.where(VoucherClass.voucher_type == voucher_type.upper())
    rows = list((await db.execute(q)).scalars().all())
    return {"rows": [voucher_class_out(r) for r in rows]}


@router.post("/finance/voucher-classes")
async def create_voucher_class(
    body: VoucherClassBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_voucher_class_enabled(tenant.feature_flags), "voucher_class_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_VOUCHER_CLASS_CREATE)
    await _validate_voucher_class_refs(db, tenant.id, body)
    row = VoucherClass(
        tenant_id=tenant.id,
        name=body.name.strip(),
        voucher_type=body.voucher_type.strip().upper(),
        default_ledger_id=body.default_ledger_id,
        default_narration=body.default_narration,
        default_cost_center_id=body.default_cost_center_id,
        line_templates=body.line_templates or [],
        auto_tax=body.auto_tax,
        auto_round_off=body.auto_round_off,
        auto_bill_allocation=body.auto_bill_allocation,
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Voucher class name already exists")
    await db.refresh(row)
    return voucher_class_out(row)


@router.get("/finance/voucher-classes/{class_id}")
async def get_voucher_class(
    class_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_voucher_class_enabled(tenant.feature_flags), "voucher_class_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_VOUCHER_CLASS_VIEW)
    row = await db.get(VoucherClass, class_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher class not found")
    return voucher_class_out(row)


@router.put("/finance/voucher-classes/{class_id}")
async def update_voucher_class(
    class_id: int,
    body: VoucherClassBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_voucher_class_enabled(tenant.feature_flags), "voucher_class_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_VOUCHER_CLASS_EDIT)
    row = await db.get(VoucherClass, class_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher class not found")
    await _validate_voucher_class_refs(db, tenant.id, body)
    row.name = body.name.strip()
    row.voucher_type = body.voucher_type.strip().upper()
    row.default_ledger_id = body.default_ledger_id
    row.default_narration = body.default_narration
    row.default_cost_center_id = body.default_cost_center_id
    row.line_templates = body.line_templates or []
    row.auto_tax = body.auto_tax
    row.auto_round_off = body.auto_round_off
    row.auto_bill_allocation = body.auto_bill_allocation
    row.is_active = body.is_active
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Voucher class name already exists")
    await db.refresh(row)
    return voucher_class_out(row)


@router.delete("/finance/voucher-classes/{class_id}")
async def delete_voucher_class(
    class_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_voucher_class_enabled(tenant.feature_flags), "voucher_class_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_VOUCHER_CLASS_DELETE)
    row = await db.get(VoucherClass, class_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher class not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/finance/voucher-classes/{class_id}/prefills")
async def voucher_class_prefills(
    class_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_voucher_class_enabled(tenant.feature_flags), "voucher_class_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_VOUCHER_CLASS_VIEW)
    row = await db.get(VoucherClass, class_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher class not found")
    return {
        "voucher_type": row.voucher_type,
        "description": row.default_narration,
        "default_ledger_id": row.default_ledger_id,
        "default_cost_center_id": row.default_cost_center_id,
        "lines": row.line_templates or [],
        "auto_tax": row.auto_tax,
        "auto_round_off": row.auto_round_off,
        "auto_bill_allocation": row.auto_bill_allocation,
        "voucher_class_id": row.id,
    }


# --- Recurring ---


@router.get("/finance/recurring-vouchers")
async def list_recurring(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_recurring_voucher_enabled(tenant.feature_flags), "recurring_voucher_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_RECURRING_VOUCHER_VIEW)
    rows = list(
        (
            await db.execute(
                select(RecurringVoucherTemplate)
                .where(RecurringVoucherTemplate.tenant_id == tenant.id)
                .order_by(RecurringVoucherTemplate.name)
            )
        )
        .scalars()
        .all()
    )
    return {"rows": [recurring_out(r) for r in rows]}


@router.post("/finance/recurring-vouchers")
async def create_recurring(
    body: RecurringBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_recurring_voucher_enabled(tenant.feature_flags), "recurring_voucher_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_RECURRING_VOUCHER_CREATE)
    await _validate_recurring_refs(db, tenant.id, body)
    row = RecurringVoucherTemplate(
        tenant_id=tenant.id,
        name=body.name.strip(),
        voucher_type=body.voucher_type.strip().upper(),
        voucher_class_id=body.voucher_class_id,
        frequency=body.frequency,
        start_date=body.start_date,
        end_date=body.end_date,
        next_due_date=body.next_due_date or body.start_date,
        voucher_template=body.voucher_template,
        generate_as_status=body.generate_as_status,
        is_active=body.is_active,
        created_by=user.id,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Recurring template name already exists")
    await db.refresh(row)
    return recurring_out(row)


@router.put("/finance/recurring-vouchers/{template_id}")
async def update_recurring(
    template_id: int,
    body: RecurringBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_recurring_voucher_enabled(tenant.feature_flags), "recurring_voucher_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_RECURRING_VOUCHER_EDIT)
    row = await db.get(RecurringVoucherTemplate, template_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Template not found")
    await _validate_recurring_refs(db, tenant.id, body)
    row.name = body.name.strip()
    row.voucher_type = body.voucher_type.strip().upper()
    row.voucher_class_id = body.voucher_class_id
    row.frequency = body.frequency
    row.start_date = body.start_date
    row.end_date = body.end_date
    if body.next_due_date:
        row.next_due_date = body.next_due_date
    row.voucher_template = body.voucher_template
    row.generate_as_status = body.generate_as_status
    row.is_active = body.is_active
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Recurring template name already exists")
    await db.refresh(row)
    return recurring_out(row)


@router.delete("/finance/recurring-vouchers/{template_id}")
async def delete_recurring(
    template_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_recurring_voucher_enabled(tenant.feature_flags), "recurring_voucher_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_RECURRING_VOUCHER_DELETE)
    row = await db.get(RecurringVoucherTemplate, template_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.post("/finance/recurring-vouchers/{template_id}/generate")
async def generate_recurring_now(
    template_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_recurring_voucher_enabled(tenant.feature_flags), "recurring_voucher_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_RECURRING_VOUCHER_EDIT)
    row = await db.get(RecurringVoucherTemplate, template_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Template not found")
    # Manual generate creates the next scheduled period now (even if not due yet), dated on its
    # period date, so the schedule does not move.
    voucher = await generate_from_recurring_template(
        db, tenant.id, row, created_by=user.id, as_of=today_local(tenant), allow_early=True
    )
    if not voucher:
        raise HTTPException(status_code=400, detail="Nothing generated (inactive or past end date)")
    await db.commit()
    await db.refresh(voucher)
    return {
        "voucher_id": voucher.id,
        "voucher_number": voucher.voucher_number,
        "template": recurring_out(row),
    }


@router.get("/finance/recurring-vouchers/{template_id}/history")
async def recurring_history(
    template_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_recurring_voucher_enabled(tenant.feature_flags), "recurring_voucher_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_RECURRING_VOUCHER_VIEW)
    row = await db.get(RecurringVoucherTemplate, template_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Template not found")
    vouchers = list(
        (
            await db.execute(
                select(Voucher)
                .where(
                    Voucher.tenant_id == tenant.id,
                    Voucher.source_module == "RECURRING",
                    Voucher.source_module_ref == str(template_id),
                )
                .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return {
        "rows": [
            {
                "id": v.id,
                "voucher_number": v.voucher_number,
                "voucher_date": v.voucher_date.isoformat(),
                "status": v.status,
                "description": v.description,
            }
            for v in vouchers
        ]
    }


# --- Credit / Debit notes ---


@router.post("/finance/credit-notes")
async def create_credit_note(
    body: NoteCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_credit_debit_note_enabled(tenant.feature_flags), "credit_debit_note_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_CREDIT_NOTE_CREATE)
    voucher = await create_note_voucher(
        db,
        tenant.id,
        note_kind="CREDIT_NOTE",
        voucher_date=body.voucher_date,
        description=body.description or "Credit note",
        party_ledger_id=body.party_ledger_id,
        original_bill_id=body.original_bill_id,
        amount=body.amount,
        revenue_or_purchase_account_id=body.revenue_or_purchase_account_id,
        party_account_id=body.party_account_id,
        tax_account_id=body.tax_account_id,
        tax_amount=body.tax_amount,
        created_by=user.id,
        currency=body.currency,
        stock_returns=body.stock_returns,
    )
    await db.commit()
    await db.refresh(voucher)
    return {
        "id": voucher.id,
        "voucher_number": voucher.voucher_number,
        "voucher_type": voucher.voucher_type,
        "status": voucher.status,
        "original_party_bill_id": voucher.original_party_bill_id,
    }


@router.post("/finance/debit-notes")
async def create_debit_note(
    body: NoteCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_credit_debit_note_enabled(tenant.feature_flags), "credit_debit_note_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_DEBIT_NOTE_CREATE)
    voucher = await create_note_voucher(
        db,
        tenant.id,
        note_kind="DEBIT_NOTE",
        voucher_date=body.voucher_date,
        description=body.description or "Debit note",
        party_ledger_id=body.party_ledger_id,
        original_bill_id=body.original_bill_id,
        amount=body.amount,
        revenue_or_purchase_account_id=body.revenue_or_purchase_account_id,
        party_account_id=body.party_account_id,
        tax_account_id=body.tax_account_id,
        tax_amount=body.tax_amount,
        created_by=user.id,
        currency=body.currency,
        stock_returns=body.stock_returns,
    )
    await db.commit()
    await db.refresh(voucher)
    return {
        "id": voucher.id,
        "voucher_number": voucher.voucher_number,
        "voucher_type": voucher.voucher_type,
        "status": voucher.status,
        "original_party_bill_id": voucher.original_party_bill_id,
    }


# --- Stock transfer voucher ---


@router.post("/finance/stock-transfer-vouchers")
async def create_stock_transfer_voucher_api(
    body: StockTransferVoucherBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_stock_transfer_voucher_enabled(tenant.feature_flags), "stock_transfer_voucher_enabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_STOCK_TRANSFER_VOUCHER_CREATE)
    result = await create_stock_transfer_voucher(
        db,
        tenant.id,
        from_godown_id=body.from_godown_id,
        to_godown_id=body.to_godown_id,
        items=[i.model_dump() for i in body.items],
        notes=body.notes,
        created_by=user.id,
        auto_fifo=body.auto_fifo,
        feature_flags=tenant.feature_flags,
    )
    await db.commit()
    return result


# --- Special vouchers + registers ---


@router.post("/finance/special-vouchers")
async def create_special_voucher(
    body: SpecialVoucherCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    vtype = body.voucher_type.upper()
    if vtype == "MEMORANDUM":
        _require_flag(is_memorandum_voucher_enabled(tenant.feature_flags), "memorandum_voucher_enabled")
    else:
        _require_flag(is_optional_voucher_enabled(tenant.feature_flags), "optional_voucher_enabled")
    if body.is_post_dated:
        _require_flag(is_post_dated_voucher_enabled(tenant.feature_flags), "post_dated_voucher_enabled")
    await assert_voucher_line_refs(db, tenant.id, body.lines)
    assert_dict_lines_balanced(
        [{"entry_type": ln.get("entry_type") or "DEBIT", "amount": ln.get("amount")} for ln in body.lines],
        label="Special voucher",
    )

    await ensure_voucher_type_row(
        db,
        tenant.id,
        vtype,
        "Memorandum" if vtype == "MEMORANDUM" else "Optional",
        flags={"is_memorandum": vtype == "MEMORANDUM", "is_optional": vtype == "OPTIONAL"},
    )
    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant.id,
        voucher_date=body.voucher_date,
        voucher_type=vtype,
        branch_code="MAIN",
    )
    is_pd = bool(body.is_post_dated or body.voucher_date > today_local(tenant))
    voucher = Voucher(
        tenant_id=tenant.id,
        voucher_number=voucher_number,
        voucher_type=vtype,
        voucher_date=body.voucher_date,
        status="DRAFT",
        description=body.description,
        reference=body.reference,
        currency=body.currency,
        base_currency=body.currency,
        exchange_rate=Decimal("1"),
        is_memorandum=vtype == "MEMORANDUM",
        is_optional=vtype == "OPTIONAL",
        include_in_books=bool(body.include_in_books) if vtype == "OPTIONAL" else False,
        is_post_dated=is_pd,
        books_applied=False,
        created_by=user.id,
        fiscal_year=fy,
        series_sequence=series_seq,
        number_series_key=series_key,
    )
    db.add(voucher)
    await db.flush()
    from app.models.finance import VoucherLine

    for ln in body.lines:
        db.add(
            VoucherLine(
                tenant_id=tenant.id,
                voucher_id=voucher.id,
                account_id=int(ln["account_id"]),
                cost_center_id=ln.get("cost_center_id"),
                entry_type=str(ln.get("entry_type") or "DEBIT").upper(),
                amount=str(ln.get("amount") or 0),
                base_amount=str(ln.get("amount") or 0),
                currency=body.currency,
                exchange_rate="1",
                notes=ln.get("notes"),
            )
        )
    await db.commit()
    await db.refresh(voucher)
    return {
        "id": voucher.id,
        "voucher_number": voucher.voucher_number,
        "voucher_type": voucher.voucher_type,
        "is_memorandum": voucher.is_memorandum,
        "is_optional": voucher.is_optional,
        "is_post_dated": voucher.is_post_dated,
        "include_in_books": voucher.include_in_books,
        "status": voucher.status,
    }


@router.get("/finance/registers/post-dated")
async def post_dated_register(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_post_dated_voucher_enabled(tenant.feature_flags), "post_dated_voucher_enabled")
    today = today_local(tenant)
    rows = list(
        (
            await db.execute(
                select(Voucher)
                .where(Voucher.tenant_id == tenant.id, Voucher.is_post_dated.is_(True))
                .order_by(Voucher.voucher_date, Voucher.id)
            )
        )
        .scalars()
        .all()
    )
    from app.models.finance import VoucherLine

    debit_by_voucher: dict[int, Decimal] = {}
    if rows:
        debit_rows = await db.execute(
            select(VoucherLine.voucher_id, func.sum(VoucherLine.amount))
            .where(VoucherLine.voucher_id.in_([v.id for v in rows]), VoucherLine.entry_type == "DEBIT")
            .group_by(VoucherLine.voucher_id)
        )
        debit_by_voucher = {int(vid): Decimal(str(total or 0)) for vid, total in debit_rows.all()}
    out = []
    for v in rows:
        days = (v.voucher_date - today).days
        amt = Decimal("0") + debit_by_voucher.get(v.id, Decimal("0"))
        out.append(
            {
                "id": v.id,
                "voucher_number": v.voucher_number,
                "voucher_date": v.voucher_date.isoformat(),
                "voucher_type": v.voucher_type,
                "status": v.status,
                "description": v.description,
                "amount": str(amt),
                "days_until_active": days,
            }
        )
    return {"rows": out}


@router.get("/finance/registers/memorandum")
async def memorandum_register(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_memorandum_voucher_enabled(tenant.feature_flags), "memorandum_voucher_enabled")
    rows = list(
        (
            await db.execute(
                select(Voucher)
                .where(
                    Voucher.tenant_id == tenant.id,
                    or_(Voucher.is_memorandum.is_(True), Voucher.voucher_type == "MEMORANDUM"),
                )
                .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
            )
        )
        .scalars()
        .all()
    )
    return {
        "rows": [
            {
                "id": v.id,
                "voucher_number": v.voucher_number,
                "voucher_date": v.voucher_date.isoformat(),
                "status": v.status,
                "description": v.description,
                "voucher_type": v.voucher_type,
            }
            for v in rows
        ]
    }


@router.get("/finance/registers/optional")
async def optional_register(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_optional_voucher_enabled(tenant.feature_flags), "optional_voucher_enabled")
    rows = list(
        (
            await db.execute(
                select(Voucher)
                .where(
                    Voucher.tenant_id == tenant.id,
                    or_(Voucher.is_optional.is_(True), Voucher.voucher_type == "OPTIONAL"),
                )
                .order_by(Voucher.voucher_date.desc(), Voucher.id.desc())
            )
        )
        .scalars()
        .all()
    )
    return {
        "rows": [
            {
                "id": v.id,
                "voucher_number": v.voucher_number,
                "voucher_date": v.voucher_date.isoformat(),
                "status": v.status,
                "description": v.description,
                "include_in_books": v.include_in_books,
                "books_applied": v.books_applied,
            }
            for v in rows
        ]
    }


@router.post("/finance/vouchers/{voucher_id}/convert-memorandum")
async def convert_memorandum_api(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_memorandum_voucher_enabled(tenant.feature_flags), "memorandum_voucher_enabled")
    await _require_posting_permission(db, user, tenant.id)
    voucher = await convert_memorandum_to_regular(
        db, tenant.id, voucher_id, feature_flags=tenant.feature_flags, user_id=user.id
    )
    await db.commit()
    await db.refresh(voucher)
    return {
        "id": voucher.id,
        "voucher_type": voucher.voucher_type,
        "is_memorandum": voucher.is_memorandum,
        "include_in_books": voucher.include_in_books,
        "books_applied": voucher.books_applied,
        "status": voucher.status,
    }


@router.post("/finance/vouchers/{voucher_id}/include-in-books")
async def include_optional_in_books_api(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_optional_voucher_enabled(tenant.feature_flags), "optional_voucher_enabled")
    await _require_posting_permission(db, user, tenant.id)
    voucher = await convert_optional_to_books(
        db, tenant.id, voucher_id, feature_flags=tenant.feature_flags, user_id=user.id
    )
    await db.commit()
    await db.refresh(voucher)
    return {
        "id": voucher.id,
        "include_in_books": voucher.include_in_books,
        "books_applied": voucher.books_applied,
        "status": voucher.status,
    }


@router.post("/finance/registers/post-dated/activate-due")
async def activate_post_dated_now(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_flag(is_post_dated_voucher_enabled(tenant.feature_flags), "post_dated_voucher_enabled")
    await _require_posting_permission(db, user, tenant.id)
    ids = await activate_due_post_dated(db, tenant.id, feature_flags=tenant.feature_flags, user_id=user.id)
    await db.commit()
    return {"activated_ids": ids, "count": len(ids)}

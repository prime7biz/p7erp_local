"""Look up a printed document by its QR verification id without a login.

A verification id is unique across all companies, so the lookup runs in RLS bypass and the
session is pinned to the document's own company before anything else is read.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.rls import bind_session_bypass, bind_session_tenant
from app.common.tenant_feature_keys import is_public_document_verification_enabled
from app.models.finance import Voucher, VoucherLine
from app.models.inventory import (
    DeliveryChallan,
    EnhancedGatePass,
    GoodsReceiving,
    ProcessOrder,
    ProductionMaterialIssue,
    WarehouseTransfer,
)
from app.models.hr_onboarding import HrGeneratedEmployeeDocument
from app.models.tenant import Tenant
from app.models.merch import Quotation
from app.modules.document_verify.schemas import PublicDocumentVerification, QuotationPublicVerification
from app.modules.finance.voucher_signature import compute_voucher_signature_hash
from app.modules.inventory.document_qr_service import payload_signature_is_valid, rebuild_payload_for_verify

VERIFICATION_ID_RE = re.compile(r"^VFY-[0-9A-F]{16}$")

_INVENTORY_MODELS: tuple[tuple[str, Any], ...] = (
    ("DELIVERY_CHALLAN", DeliveryChallan),
    ("ENHANCED_GATE_PASS", EnhancedGatePass),
    ("GOODS_RECEIVING", GoodsReceiving),
    ("PRODUCTION_MATERIAL_ISSUE", ProductionMaterialIssue),
    ("PROCESS_ORDER", ProcessOrder),
    ("WAREHOUSE_TRANSFER", WarehouseTransfer),
)

_LABELS: dict[str, str] = {
    "VOUCHER": "Accounting voucher",
    "DELIVERY_CHALLAN": "Delivery challan",
    "ENHANCED_GATE_PASS": "Gate pass",
    "GOODS_RECEIVING": "Goods receiving note (GRN)",
    "PRODUCTION_MATERIAL_ISSUE": "Production material issue",
    "PROCESS_ORDER": "Process order",
    "WAREHOUSE_TRANSFER": "Warehouse transfer",
}

_CODE_FIELDS: dict[str, str] = {
    "DELIVERY_CHALLAN": "challan_code",
    "ENHANCED_GATE_PASS": "gate_pass_code",
    "GOODS_RECEIVING": "grn_code",
    "PRODUCTION_MATERIAL_ISSUE": "issue_code",
    "PROCESS_ORDER": "process_number",
    "WAREHOUSE_TRANSFER": "transfer_code",
}

_DATE_PAYLOAD_FIELDS: dict[str, str] = {
    "DELIVERY_CHALLAN": "delivery_date",
    "GOODS_RECEIVING": "received_date",
    "PRODUCTION_MATERIAL_ISSUE": "issue_date",
    "WAREHOUSE_TRANSFER": "transfer_date",
}

_LINE_QTY_FIELDS: dict[str, str] = {
    "DELIVERY_CHALLAN": "quantity",
    "GOODS_RECEIVING": "accepted_qty",
    "PRODUCTION_MATERIAL_ISSUE": "actual_issue_qty",
    "WAREHOUSE_TRANSFER": "quantity",
}


def normalize_verification_id(raw: str | None) -> str | None:
    vid = (raw or "").strip().upper()
    return vid if VERIFICATION_ID_RE.fullmatch(vid) else None


def _to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _qty_text(value: Decimal | None) -> str | None:
    if value is None:
        return None
    text = format(value.normalize(), "f")
    return "0" if text in ("-0", "") else text


def _iso_date(value: date | datetime | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    return value.isoformat()


async def _company_if_enabled(db: AsyncSession, tenant_id: int) -> Tenant | None:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None or not is_public_document_verification_enabled(tenant.feature_flags):
        return None
    return tenant


async def _verify_voucher(db: AsyncSession, voucher: Voucher) -> PublicDocumentVerification | None:
    tenant = await _company_if_enabled(db, voucher.tenant_id)
    if tenant is None:
        return None
    await bind_session_tenant(db, tenant.id)
    lines = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id).order_by(VoucherLine.id)))
        .scalars()
        .all()
    )
    is_valid = bool(voucher.signature_hash) and voucher.signature_hash == compute_voucher_signature_hash(
        voucher, lines
    )
    debit_total = sum(
        (_to_decimal(ln.amount) or Decimal("0") for ln in lines if (ln.entry_type or "").upper() == "DEBIT"),
        Decimal("0"),
    )
    return PublicDocumentVerification(
        is_valid=is_valid,
        document_type="VOUCHER",
        document_label=f"{_LABELS['VOUCHER']} ({(voucher.voucher_type or '').title()})".replace(" ()", ""),
        document_number=voucher.voucher_number,
        document_date=_iso_date(voucher.voucher_date),
        status=(voucher.status or "").upper() or None,
        company_name=tenant.name,
        amount=f"{debit_total:.2f}",
        currency=voucher.currency,
        signed_at=voucher.signed_at.isoformat() if voucher.signed_at else None,
    )


def _inventory_quantities(doc_type: str, payload: dict[str, Any]) -> tuple[str | None, int | None]:
    if doc_type == "PROCESS_ORDER":
        qty = _to_decimal(payload.get("actual_output_qty")) or _to_decimal(payload.get("expected_output_qty"))
        return _qty_text(qty), None
    field = _LINE_QTY_FIELDS.get(doc_type)
    if field is None:
        return None, None
    lines = payload.get("lines") or []
    total = sum((_to_decimal(ln.get(field)) or Decimal("0") for ln in lines), Decimal("0"))
    return _qty_text(total), len(lines)


async def _verify_inventory(db: AsyncSession, doc_type: str, row: Any) -> PublicDocumentVerification | None:
    tenant = await _company_if_enabled(db, row.tenant_id)
    if tenant is None:
        return None
    await bind_session_tenant(db, tenant.id)
    payload = await rebuild_payload_for_verify(db, tenant.id, doc_type, row.id)
    if payload is None:
        return None
    is_valid, _ = payload_signature_is_valid(doc_type, getattr(row, "signature_hash", None), payload)
    date_field = _DATE_PAYLOAD_FIELDS.get(doc_type)
    doc_date = payload.get(date_field) if date_field else _iso_date(getattr(row, "created_at", None))
    quantity, line_count = _inventory_quantities(doc_type, payload)
    signed_at = getattr(row, "signed_at", None)
    return PublicDocumentVerification(
        is_valid=is_valid,
        document_type=doc_type,
        document_label=_LABELS[doc_type],
        document_number=getattr(row, _CODE_FIELDS[doc_type], None),
        document_date=doc_date,
        status=(getattr(row, "status", None) or "").upper() or None,
        company_name=tenant.name,
        quantity=quantity,
        line_count=line_count,
        signed_at=signed_at.isoformat() if signed_at else None,
    )


def _money_text(value: Any) -> str | None:
    dec = _to_decimal(value)
    return None if dec is None else f"{dec:.4f}"


async def _verify_quotation(db: AsyncSession, quotation: Quotation) -> QuotationPublicVerification | None:
    """Buyer-safe fields only: no customer, cost, margin or note. Valid only for the current SENT / CONVERTED version."""
    from decimal import Decimal, ROUND_HALF_UP

    from app.modules.quotations.verification_service import is_verifiable

    tenant = await _company_if_enabled(db, quotation.tenant_id)
    if tenant is None:
        return None
    # Fail closed: non-verifiable rows look like "not found" (no commercial fields with is_valid=false).
    if not is_verifiable(quotation):
        return None
    await bind_session_tenant(db, tenant.id)
    qty = quotation.projected_quantity or 0
    order_total = _to_decimal(quotation.total_amount if quotation.total_amount is not None else quotation.quoted_price)
    unit_price: str | None = None
    if order_total is not None and qty > 0:
        unit_price = f"{(order_total / Decimal(qty)).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP):.4f}"
    return QuotationPublicVerification(
        is_valid=True,
        company_name=tenant.name,
        code=quotation.quotation_code,
        version_no=quotation.version_no,
        status=(quotation.status or "").upper(),
        style_ref=quotation.style_ref,
        quantity=quotation.projected_quantity,
        quoted_unit_price=unit_price,
        total_amount=_money_text(quotation.total_amount if quotation.total_amount is not None else quotation.quoted_price),
        currency=quotation.currency,
        valid_until=_iso_date(quotation.valid_until),
    )


async def verify_document_publicly(
    db: AsyncSession, raw_verification_id: str
) -> PublicDocumentVerification | QuotationPublicVerification | None:
    """None means "not found" — also used when the owning company has not enabled public verification."""
    vid = normalize_verification_id(raw_verification_id)
    if vid is None:
        return None
    await bind_session_bypass(db)
    voucher = (await db.execute(select(Voucher).where(Voucher.verification_id == vid))).scalars().first()
    if voucher is not None:
        return await _verify_voucher(db, voucher)
    for doc_type, model in _INVENTORY_MODELS:
        row = (await db.execute(select(model).where(model.verification_id == vid))).scalars().first()
        if row is not None:
            return await _verify_inventory(db, doc_type, row)
    quotation = (await db.execute(select(Quotation).where(Quotation.verification_id == vid))).scalars().first()
    if quotation is not None:
        return await _verify_quotation(db, quotation)
    hr_doc = (
        await db.execute(select(HrGeneratedEmployeeDocument).where(HrGeneratedEmployeeDocument.verification_id == vid))
    ).scalars().first()
    if hr_doc is not None:
        tenant = await _company_if_enabled(db, hr_doc.tenant_id)
        if tenant is None:
            return None
        await bind_session_tenant(db, tenant.id)
        from app.modules.hr.generated_documents import public_verification

        return public_verification(hr_doc, tenant.name)
    return None

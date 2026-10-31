"""Sprint 3 GST / tax ledger HTTP API."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_GST_RETURN_EXPORT,
    PERMISSION_GST_RETURN_VIEW,
    PERMISSION_TAX_LEDGER_CREATE,
    PERMISSION_TAX_LEDGER_DELETE,
    PERMISSION_TAX_LEDGER_EDIT,
    PERMISSION_TAX_LEDGER_VIEW,
    PERMISSION_TAX_SETTINGS_EDIT,
    PERMISSION_TAX_SETTINGS_VIEW,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    GST_SETTINGS_KEY,
    get_gst_settings,
    is_gst_system_enabled,
)
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.finance import ChartOfAccount, Voucher
from app.models.gst_tax import TaxLedger, VoucherTaxLine
from app.modules.finance.gst_return_service import (
    export_gstr1_portal_json,
    generate_gstr1,
    generate_gstr2,
    generate_gstr3b,
    itc_summary,
)
from app.modules.finance.tax_calculation_service import (
    calculate_tax_on_voucher,
    calculate_tax_preview,
    tax_ledger_out,
    voucher_tax_line_out,
)

router = APIRouter(tags=["finance-gst"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


def _require_gst(tenant: Tenant) -> None:
    if not is_gst_system_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="GST system is disabled. Enable tenant feature flag gst_system_enabled.",
        )


# --- Schemas ---


class TaxLedgerCreate(BaseModel):
    chart_account_id: int
    tax_type: Literal["CGST", "SGST", "IGST", "UTGST", "VAT", "CST"]
    tax_rate: Decimal
    gst_type: Literal["GOODS", "SERVICES"] = "GOODS"
    nature_of_transaction: str | None = None
    is_active: bool = True
    effective_from: date | None = None
    effective_to: date | None = None


class TaxLedgerUpdate(BaseModel):
    chart_account_id: int | None = None
    nature_of_transaction: str | None = None
    is_active: bool | None = None
    effective_from: date | None = None
    effective_to: date | None = None


class TaxPreviewLineIn(BaseModel):
    taxable_amount: Decimal
    gst_rate: Decimal
    hsn_code: str | None = None
    voucher_line_id: int | None = None


class TaxPreviewBody(BaseModel):
    taxable_lines: list[TaxPreviewLineIn]
    place_of_supply_state: str | None = None
    direction: Literal["OUTWARD", "INWARD"] = "OUTWARD"
    is_union_territory: bool = False


class CalculateTaxBody(BaseModel):
    apply: bool = False
    place_of_supply_state: str | None = None
    direction: Literal["OUTWARD", "INWARD"] | None = None
    taxable_lines: list[TaxPreviewLineIn] | None = None


class GstSettingsBody(BaseModel):
    registration_type: Literal["Regular", "Composition", "SEZ"] | None = "Regular"
    gstin: str | None = None
    state_code: str | None = None
    state: str | None = None
    default_place_of_supply: str | None = None
    is_union_territory: bool = False
    default_gst_rate: str | None = "18"
    reverse_charge_enabled: bool = False


# --- Tax ledgers ---


@router.get("/finance/tax-ledgers")
async def list_tax_ledgers(
    active_only: bool = Query(default=True),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_TAX_LEDGER_VIEW)
    q = select(TaxLedger).where(TaxLedger.tenant_id == tenant.id).order_by(TaxLedger.tax_type, TaxLedger.tax_rate)
    if active_only:
        q = q.where(TaxLedger.is_active.is_(True))
    rows = list((await db.execute(q)).scalars().all())
    return [tax_ledger_out(r) for r in rows]


@router.post("/finance/tax-ledgers")
async def create_tax_ledger(
    body: TaxLedgerCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_TAX_LEDGER_CREATE)
    acct = await db.get(ChartOfAccount, body.chart_account_id)
    if not acct or acct.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Invalid chart account")
    row = TaxLedger(
        tenant_id=tenant.id,
        chart_account_id=body.chart_account_id,
        tax_type=body.tax_type,
        tax_rate=body.tax_rate,
        gst_type=body.gst_type,
        nature_of_transaction=body.nature_of_transaction,
        is_active=body.is_active,
        effective_from=body.effective_from,
        effective_to=body.effective_to,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(
            status_code=400,
            detail="Duplicate tax_type + rate + gst_type for this tenant",
        )
    await db.refresh(row)
    return tax_ledger_out(row)


@router.get("/finance/tax-ledgers/{ledger_id}")
async def get_tax_ledger(
    ledger_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_TAX_LEDGER_VIEW)
    row = await db.get(TaxLedger, ledger_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Tax ledger not found")
    return tax_ledger_out(row)


@router.patch("/finance/tax-ledgers/{ledger_id}")
async def update_tax_ledger(
    ledger_id: int,
    body: TaxLedgerUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_TAX_LEDGER_EDIT)
    row = await db.get(TaxLedger, ledger_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Tax ledger not found")
    data = body.model_dump(exclude_unset=True)
    if "chart_account_id" in data and data["chart_account_id"] is not None:
        acct = await db.get(ChartOfAccount, data["chart_account_id"])
        if not acct or acct.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Invalid chart account")
    for k, v in data.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return tax_ledger_out(row)


@router.delete("/finance/tax-ledgers/{ledger_id}")
async def deactivate_tax_ledger(
    ledger_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_TAX_LEDGER_DELETE)
    row = await db.get(TaxLedger, ledger_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Tax ledger not found")
    row.is_active = False
    await db.commit()
    return {"ok": True, "id": ledger_id, "is_active": False}


# --- Tax preview / apply ---


@router.post("/finance/tax/preview")
async def tax_preview(
    body: TaxPreviewBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_TAX_LEDGER_VIEW)
    settings = get_gst_settings(tenant.feature_flags)
    return await calculate_tax_preview(
        db,
        tenant.id,
        taxable_lines=[ln.model_dump() for ln in body.taxable_lines],
        company_state=settings.get("state_code") or settings.get("state"),
        place_of_supply_state=body.place_of_supply_state
        or settings.get("default_place_of_supply")
        or settings.get("state_code"),
        direction=body.direction,
        is_union_territory=body.is_union_territory or bool(settings.get("is_union_territory")),
        feature_flags=tenant.feature_flags,
    )


@router.post("/finance/vouchers/{voucher_id}/calculate-tax")
async def voucher_calculate_tax(
    voucher_id: int,
    body: CalculateTaxBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_TAX_LEDGER_VIEW)
    body = body or CalculateTaxBody()
    result = await calculate_tax_on_voucher(
        db,
        tenant.id,
        voucher_id,
        feature_flags=tenant.feature_flags,
        place_of_supply_state=body.place_of_supply_state,
        direction=body.direction,
        apply=body.apply,
        taxable_lines_override=[ln.model_dump() for ln in body.taxable_lines] if body.taxable_lines else None,
    )
    if body.apply:
        await db.commit()
    return result


@router.get("/finance/vouchers/{voucher_id}/tax-lines")
async def list_voucher_tax_lines(
    voucher_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_TAX_LEDGER_VIEW)
    v = await db.get(Voucher, voucher_id)
    if not v or v.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Voucher not found")
    rows = list(
        (
            await db.execute(
                select(VoucherTaxLine).where(
                    VoucherTaxLine.tenant_id == tenant.id,
                    VoucherTaxLine.voucher_id == voucher_id,
                )
            )
        )
        .scalars()
        .all()
    )
    out = []
    for r in rows:
        ledger = await db.get(TaxLedger, r.tax_ledger_id)
        out.append(voucher_tax_line_out(r, ledger))
    return out


# --- GST settings ---


@router.get("/finance/gst/settings")
async def get_settings(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_TAX_SETTINGS_VIEW)
    return get_gst_settings(tenant.feature_flags)


@router.put("/finance/gst/settings")
async def put_settings(
    body: GstSettingsBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_TAX_SETTINGS_EDIT)
    flags = dict(tenant.feature_flags or {})
    current = get_gst_settings(flags)
    current.update({k: v for k, v in body.model_dump().items() if v is not None or k in {"is_union_territory", "reverse_charge_enabled"}})
    # Always persist booleans from body
    current["is_union_territory"] = body.is_union_territory
    current["reverse_charge_enabled"] = body.reverse_charge_enabled
    flags[GST_SETTINGS_KEY] = current
    tenant.feature_flags = flags
    await db.commit()
    return current


# --- GST returns ---


@router.get("/finance/gst/gstr1")
async def api_gstr1(
    from_date: date = Query(...),
    to_date: date = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_GST_RETURN_VIEW)
    return await generate_gstr1(db, tenant.id, from_date, to_date)


@router.get("/finance/gst/gstr2")
async def api_gstr2(
    from_date: date = Query(...),
    to_date: date = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_GST_RETURN_VIEW)
    return await generate_gstr2(db, tenant.id, from_date, to_date)


@router.get("/finance/gst/gstr3b")
async def api_gstr3b(
    from_date: date = Query(...),
    to_date: date = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_GST_RETURN_VIEW)
    return await generate_gstr3b(db, tenant.id, from_date, to_date)


@router.get("/finance/gst/itc-summary")
async def api_itc(
    from_date: date = Query(...),
    to_date: date = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_GST_RETURN_VIEW)
    return await itc_summary(db, tenant.id, from_date, to_date)


@router.post("/finance/gst/export-gstr1")
async def api_export_gstr1(
    from_date: date = Query(...),
    to_date: date = Query(...),
    format: Literal["json", "excel"] = Query(default="json"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_gst(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_GST_RETURN_EXPORT)
    settings = get_gst_settings(tenant.feature_flags)
    payload = await export_gstr1_portal_json(
        db,
        tenant.id,
        from_date,
        to_date,
        gstin=settings.get("gstin"),
    )
    if format == "excel":
        # Client can convert JSON; return rows for CSV/Excel export
        gstr1 = await generate_gstr1(db, tenant.id, from_date, to_date)
        return {"format": "excel_rows", "rows": gstr1["supplies"], "portal_json": payload}
    return payload

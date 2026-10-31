"""Sprint 5: TDS HTTP API."""

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
    PERMISSION_TDS_CREATE,
    PERMISSION_TDS_EDIT,
    PERMISSION_TDS_RETURN_EXPORT,
    PERMISSION_TDS_VIEW,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_tds_system_enabled
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.party_ledger import PartyLedger
from app.models.tds import TdsDeduction, TdsSection
from app.modules.finance.tds_service import (
    calculate_tds_on_payment,
    create_tds_deduction_record,
    create_tds_liability_voucher,
    generate_tds_return,
    tds_deduction_out,
    tds_section_out,
)

router = APIRouter(tags=["finance-tds"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


def _require_tds(tenant: Tenant) -> None:
    if not is_tds_system_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="TDS system is disabled. Enable tenant feature flag tds_system_enabled.",
        )


class TdsSectionBody(BaseModel):
    section_code: str
    description: str | None = None
    threshold_amount: Decimal = Decimal("0")
    tds_rate: Decimal = Decimal("0")
    rate_company: Decimal | None = None
    rate_non_company: Decimal | None = None
    is_active: bool = True


class TdsCalcBody(BaseModel):
    party_ledger_id: int
    payment_amount: Decimal
    section_code: str | None = None
    is_company: bool = False


class TdsDeductionCreateBody(BaseModel):
    party_ledger_id: int
    tds_section_id: int
    taxable_amount: Decimal
    tds_amount: Decimal
    voucher_id: int | None = None
    deduction_date: date | None = None
    notes: str | None = None
    create_liability_voucher: bool = False
    vendor_ap_account_id: int | None = None
    tds_payable_account_id: int | None = None
    bank_account_id: int | None = None


class AssignTdsBody(BaseModel):
    tds_section_id: int | None = None


class TdsStatusBody(BaseModel):
    status: Literal["PENDING", "DEPOSITED", "CERTIFICATE_ISSUED"]
    certificate_number: str | None = None
    certificate_date: date | None = None


class TdsSettingsBody(BaseModel):
    tds_payable_account_id: int | None = None


@router.get("/finance/tds/sections")
async def list_tds_sections(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_VIEW)
    rows = list(
        (
            await db.execute(
                select(TdsSection).where(TdsSection.tenant_id == tenant.id).order_by(TdsSection.section_code)
            )
        )
        .scalars()
        .all()
    )
    return {"rows": [tds_section_out(r) for r in rows]}


@router.post("/finance/tds/sections")
async def create_tds_section(
    body: TdsSectionBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_CREATE)
    row = TdsSection(
        tenant_id=tenant.id,
        section_code=body.section_code.strip().upper(),
        description=body.description,
        threshold_amount=body.threshold_amount,
        tds_rate=body.tds_rate,
        rate_company=body.rate_company,
        rate_non_company=body.rate_non_company,
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Section code already exists")
    await db.refresh(row)
    return tds_section_out(row)


@router.put("/finance/tds/sections/{section_id}")
async def update_tds_section(
    section_id: int,
    body: TdsSectionBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_EDIT)
    row = await db.get(TdsSection, section_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="TDS section not found")
    row.section_code = body.section_code.strip().upper()
    row.description = body.description
    row.threshold_amount = body.threshold_amount
    row.tds_rate = body.tds_rate
    row.rate_company = body.rate_company
    row.rate_non_company = body.rate_non_company
    row.is_active = body.is_active
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Section code already exists")
    await db.refresh(row)
    return tds_section_out(row)


@router.post("/finance/tds/calculate")
async def calc_tds(
    body: TdsCalcBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_VIEW)
    return await calculate_tds_on_payment(
        db,
        tenant.id,
        party_ledger_id=body.party_ledger_id,
        payment_amount=body.payment_amount,
        section_code=body.section_code,
        is_company=body.is_company,
    )


@router.get("/finance/tds/deductions")
async def list_deductions(
    party_ledger_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_VIEW)
    q = select(TdsDeduction).where(TdsDeduction.tenant_id == tenant.id).order_by(TdsDeduction.id.desc())
    if party_ledger_id:
        q = q.where(TdsDeduction.party_ledger_id == party_ledger_id)
    if status:
        q = q.where(TdsDeduction.status == status.upper())
    rows = list((await db.execute(q.limit(500))).scalars().all())
    return {"rows": [tds_deduction_out(r) for r in rows]}


@router.post("/finance/tds/deductions")
async def create_deduction(
    body: TdsDeductionCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_CREATE)
    row = await create_tds_deduction_record(
        db,
        tenant.id,
        party_ledger_id=body.party_ledger_id,
        tds_section_id=body.tds_section_id,
        taxable_amount=body.taxable_amount,
        tds_amount=body.tds_amount,
        voucher_id=body.voucher_id,
        deduction_date=body.deduction_date,
        created_by=user.id,
        notes=body.notes,
    )
    if body.create_liability_voucher:
        if not body.vendor_ap_account_id or not body.tds_payable_account_id:
            raise HTTPException(status_code=400, detail="vendor_ap_account_id and tds_payable_account_id required")
        await create_tds_liability_voucher(
            db,
            tenant.id,
            deduction=row,
            vendor_ap_account_id=body.vendor_ap_account_id,
            tds_payable_account_id=body.tds_payable_account_id,
            bank_account_id=body.bank_account_id,
            include_bank_net=bool(body.bank_account_id),
            created_by=user.id,
        )
    await db.commit()
    await db.refresh(row)
    return tds_deduction_out(row)


@router.patch("/finance/tds/deductions/{deduction_id}")
async def patch_deduction_status(
    deduction_id: int,
    body: TdsStatusBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_EDIT)
    row = await db.get(TdsDeduction, deduction_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Deduction not found")
    row.status = body.status
    if body.certificate_number is not None:
        row.certificate_number = body.certificate_number
    if body.certificate_date is not None:
        row.certificate_date = body.certificate_date
    await db.commit()
    await db.refresh(row)
    return tds_deduction_out(row)


@router.put("/finance/party-ledgers/{ledger_id}/tds-section")
async def assign_party_tds_section(
    ledger_id: int,
    body: AssignTdsBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_EDIT)
    ledger = await db.get(PartyLedger, ledger_id)
    if not ledger or ledger.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    if body.tds_section_id:
        sec = await db.get(TdsSection, body.tds_section_id)
        if not sec or sec.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="TDS section not found")
    ledger.tds_section_id = body.tds_section_id
    await db.commit()
    return {"id": ledger.id, "tds_section_id": ledger.tds_section_id}


@router.get("/finance/tds/returns")
async def tds_return(
    year: int = Query(...),
    quarter: int = Query(..., ge=1, le=4),
    form: Literal["26Q", "24Q"] = Query(default="26Q"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_VIEW)
    return await generate_tds_return(db, tenant.id, year=year, quarter=quarter, form=form)


@router.post("/finance/tds/returns/export")
async def tds_return_export(
    year: int = Query(...),
    quarter: int = Query(..., ge=1, le=4),
    form: Literal["26Q", "24Q"] = Query(default="26Q"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_RETURN_EXPORT)
    data = await generate_tds_return(db, tenant.id, year=year, quarter=quarter, form=form)
    # Excel-friendly flat rows (frontend can CSV; API returns structured JSON)
    return {"format": "json", "filename": f"Form_{form}_Q{quarter}_{year}.json", **data}


@router.get("/finance/tds/settings")
async def get_tds_settings(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_VIEW)
    flags = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    settings = flags.get("tds_settings") if isinstance(flags.get("tds_settings"), dict) else {}
    return {"tds_payable_account_id": settings.get("tds_payable_account_id")}


@router.put("/finance/tds/settings")
async def put_tds_settings(
    body: TdsSettingsBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_tds(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_TDS_EDIT)
    flags = dict(tenant.feature_flags) if isinstance(tenant.feature_flags, dict) else {}
    settings = dict(flags.get("tds_settings") or {}) if isinstance(flags.get("tds_settings"), dict) else {}
    settings["tds_payable_account_id"] = body.tds_payable_account_id
    flags["tds_settings"] = settings
    tenant.feature_flags = flags
    await db.commit()
    return settings

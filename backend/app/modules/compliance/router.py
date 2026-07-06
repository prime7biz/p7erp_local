"""Bangladesh statutory compliance HTTP API."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.cache import cache_delete, cache_get_json, cache_set_json, tax_config_cache_key
from app.common.money_schema import MoneyStrNonNeg
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.compliance import BondedWarehouseEntry, PayrollStatutorySummary, TenantStatutoryTaxConfig
from app.modules.compliance.statutory_tax_service import (
    apply_taxes_to_line,
    compute_payroll_statutory,
    format_money,
)

router = APIRouter(prefix="/compliance", tags=["compliance"])


class TaxConfigBody(BaseModel):
    tax_code: str = Field(..., max_length=16)
    rate_pct: str
    registration_no: str | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    is_active: bool = True
    notes: str | None = None


class TaxConfigOut(TaxConfigBody):
    id: int
    tenant_id: int


class TaxLineCalcBody(BaseModel):
    line_amount: MoneyStrNonNeg
    apply_vat: bool = True
    apply_vds: bool = False
    apply_tds: bool = False


class BondedEntryBody(BaseModel):
    reference_no: str
    entry_type: str = "IMPORT"
    ud_no: str | None = None
    up_no: str | None = None
    trade_case_id: int | None = None
    btb_lc_id: int | None = None
    item_description: str | None = None
    quantity: str | None = None
    value_bdt: MoneyStrNonNeg | None = None
    status: str = "OPEN"
    entry_date: date | None = None
    notes: str | None = None


class BondedEntryOut(BondedEntryBody):
    id: int
    tenant_id: int


class PayrollStatutoryCalcBody(BaseModel):
    gross_pay: MoneyStrNonNeg
    ait_rate_pct: str = "0"
    pf_employee_rate_pct: str = "0"
    pf_employer_rate_pct: str = "0"
    period_year: int | None = None
    period_month: int | None = None
    payroll_run_id: int | None = None
    persist: bool = False


@router.get("/tax-config")
async def list_tax_config(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    cache_key = tax_config_cache_key(tenant.id)
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return cached

    rows = (
        await db.execute(
            select(TenantStatutoryTaxConfig)
            .where(TenantStatutoryTaxConfig.tenant_id == tenant.id)
            .order_by(TenantStatutoryTaxConfig.tax_code)
        )
    ).scalars().all()
    payload = {
        "items": [
            TaxConfigOut(
                id=r.id,
                tenant_id=r.tenant_id,
                tax_code=r.tax_code,
                rate_pct=str(r.rate_pct),
                registration_no=r.registration_no,
                effective_from=r.effective_from,
                effective_to=r.effective_to,
                is_active=r.is_active,
                notes=r.notes,
            ).model_dump(mode="json")
            for r in rows
        ]
    }
    await cache_set_json(cache_key, payload, settings.api_cache_tax_config_ttl_seconds)
    return payload


@router.post("/tax-config", response_model=TaxConfigOut)
async def upsert_tax_config(
    body: TaxConfigBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    code = body.tax_code.strip().upper()
    try:
        existing = (
            await db.execute(
                select(TenantStatutoryTaxConfig).where(
                    TenantStatutoryTaxConfig.tenant_id == tenant.id,
                    TenantStatutoryTaxConfig.tax_code == code,
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.rate_pct = Decimal(body.rate_pct)
            existing.registration_no = body.registration_no
            existing.effective_from = body.effective_from
            existing.effective_to = body.effective_to
            existing.is_active = body.is_active
            existing.notes = body.notes
            row = existing
        else:
            row = TenantStatutoryTaxConfig(
                tenant_id=tenant.id,
                tax_code=code,
                rate_pct=Decimal(body.rate_pct),
                registration_no=body.registration_no,
                effective_from=body.effective_from,
                effective_to=body.effective_to,
                is_active=body.is_active,
                notes=body.notes,
            )
            db.add(row)
        await db.commit()
        await db.refresh(row)
        await cache_delete(tax_config_cache_key(tenant.id))
        return TaxConfigOut(
            id=row.id,
            tenant_id=row.tenant_id,
            tax_code=row.tax_code,
            rate_pct=str(row.rate_pct),
            registration_no=row.registration_no,
            effective_from=row.effective_from,
            effective_to=row.effective_to,
            is_active=row.is_active,
            notes=row.notes,
        )
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.post("/tax/calculate-line")
async def calculate_line_tax(
    body: TaxLineCalcBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await apply_taxes_to_line(
        db,
        tenant.id,
        line_amount=Decimal(body.line_amount),
        apply_vat=body.apply_vat,
        apply_vds=body.apply_vds,
        apply_tds=body.apply_tds,
    )


@router.get("/bonded-warehouse")
async def list_bonded_entries(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    status: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    q = select(BondedWarehouseEntry).where(BondedWarehouseEntry.tenant_id == tenant.id)
    if status:
        q = q.where(BondedWarehouseEntry.status == status.upper())
    q = q.order_by(BondedWarehouseEntry.id.desc()).offset(offset).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            BondedEntryOut(
                id=r.id,
                tenant_id=r.tenant_id,
                reference_no=r.reference_no,
                entry_type=r.entry_type,
                ud_no=r.ud_no,
                up_no=r.up_no,
                trade_case_id=r.trade_case_id,
                btb_lc_id=r.btb_lc_id,
                item_description=r.item_description,
                quantity=str(r.quantity) if r.quantity is not None else None,
                value_bdt=str(r.value_bdt) if r.value_bdt is not None else None,
                status=r.status,
                entry_date=r.entry_date,
                notes=r.notes,
            )
            for r in rows
        ],
        "limit": limit,
        "offset": offset,
    }


@router.post("/bonded-warehouse", response_model=BondedEntryOut)
async def create_bonded_entry(
    body: BondedEntryBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        row = BondedWarehouseEntry(
            tenant_id=tenant.id,
            reference_no=body.reference_no.strip(),
            entry_type=body.entry_type.upper(),
            ud_no=body.ud_no,
            up_no=body.up_no,
            trade_case_id=body.trade_case_id,
            btb_lc_id=body.btb_lc_id,
            item_description=body.item_description,
            quantity=Decimal(body.quantity) if body.quantity else None,
            value_bdt=Decimal(body.value_bdt) if body.value_bdt else None,
            status=body.status.upper(),
            entry_date=body.entry_date,
            notes=body.notes,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return BondedEntryOut(
            id=row.id,
            tenant_id=row.tenant_id,
            reference_no=row.reference_no,
            entry_type=row.entry_type,
            ud_no=row.ud_no,
            up_no=row.up_no,
            trade_case_id=row.trade_case_id,
            btb_lc_id=row.btb_lc_id,
            item_description=row.item_description,
            quantity=str(row.quantity) if row.quantity is not None else None,
            value_bdt=str(row.value_bdt) if row.value_bdt else None,
            status=row.status,
            entry_date=row.entry_date,
            notes=row.notes,
        )
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.post("/payroll/statutory-calculate")
async def payroll_statutory_calculate(
    body: PayrollStatutoryCalcBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = compute_payroll_statutory(
        gross_pay=Decimal(body.gross_pay),
        ait_rate_pct=Decimal(body.ait_rate_pct),
        pf_employee_rate_pct=Decimal(body.pf_employee_rate_pct),
        pf_employer_rate_pct=Decimal(body.pf_employer_rate_pct),
    )
    if body.persist and body.period_year and body.period_month:
        try:
            summary = PayrollStatutorySummary(
                tenant_id=tenant.id,
                payroll_run_id=body.payroll_run_id,
                period_year=body.period_year,
                period_month=body.period_month,
                gross_total=Decimal(result["gross_total"]),
                ait_total=Decimal(result["ait_total"]),
                pf_employee_total=Decimal(result["pf_employee_total"]),
                pf_employer_total=Decimal(result["pf_employer_total"]),
                net_payable=Decimal(result["net_payable"]),
            )
            db.add(summary)
            await db.commit()
            result["summary_id"] = summary.id
        except Exception:
            await safe_async_session_rollback(db)
            raise HTTPException(status_code=409, detail="Statutory summary for period already exists or invalid data")
    return result


@router.get("/reports/vat-summary")
async def vat_summary_report(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
):
    """Advisory VAT summary placeholder — extend with posted bill lines in future."""
    rates = await apply_taxes_to_line(db, tenant.id, line_amount=Decimal("0"))
    return {
        "period": f"{year}-{month:02d}",
        "tenant_id": tenant.id,
        "message": "Configure tax rates and post AP/AR bills with tax lines for full VAT return.",
        "rates_configured": rates.get("rates_used", {}),
    }

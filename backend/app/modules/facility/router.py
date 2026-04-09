"""Internal APIs: facilities and utilizations."""

from __future__ import annotations

from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.permissions import require_internal_permission
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db
from app.external_access.constants import PRINCIPAL_FINANCIER
from app.models import (
    ExternalPrincipal,
    Facility,
    FacilityTransaction,
    FacilityUtilization,
    InterestAccrual,
    RepaymentScheduleLine,
    Tenant,
    User,
)
from app.modules.facility.accrual_service import accrual_month_key, reverse_accrual, run_monthly_accrual
from app.modules.facility.gl_service import create_disbursement_draft
from app.modules.facility.repayment_service import (
    create_repayment_draft_for_line,
    generate_due_vouchers,
    mark_overdue_lines,
)
from app.modules.facility.schemas import (
    AccrualRunBody,
    CalculateEmiBody,
    FacilityCreateBody,
    FacilityPatchBody,
    RegenerateScheduleBody,
    ReverseAccrualBody,
    SnapshotGenerateBody,
    UtilizationCreateBody,
    UtilizationPatchBody,
)
from app.modules.facility.emi_service import preview_emi
from app.modules.facility.schedule_service import replace_schedule_for_utilization, update_utilization_classification
from app.modules.facility.snapshot_service import build_facility_snapshot_payload, upsert_month_facility_snapshot

router = APIRouter(prefix="/facility", tags=["facility"])


def _require_facility_enabled() -> None:
    if not get_settings().facility_management_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Facility management is disabled")


@router.get("/financier-principals")
async def list_financier_principals(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.facilities.read")),
):
    _require_facility_enabled()
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    r = await db.execute(
        select(ExternalPrincipal).where(
            ExternalPrincipal.tenant_id == tenant.id,
            ExternalPrincipal.principal_type == PRINCIPAL_FINANCIER,
            ExternalPrincipal.is_active.is_(True),
        )
    )
    rows = list(r.scalars().all())
    return [{"id": p.id, "full_name": p.full_name, "email": p.email} for p in rows]


@router.get("/facilities")
async def list_facilities(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.facilities.read")),
    status_filter: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    _require_facility_enabled()
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    q = select(Facility).where(Facility.tenant_id == tenant.id)
    if status_filter:
        q = q.where(Facility.status == status_filter.strip().lower())
    q = q.order_by(Facility.id.desc()).offset(offset).limit(limit)
    return list((await db.execute(q)).scalars().all())


@router.post("/facilities", status_code=201)
async def create_facility(
    body: FacilityCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.facilities.write")),
):
    _require_facility_enabled()
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    if body.financier_party_id is not None:
        ep = await db.get(ExternalPrincipal, body.financier_party_id)
        if not ep or ep.tenant_id != tenant.id or ep.principal_type != PRINCIPAL_FINANCIER:
            raise HTTPException(status_code=400, detail="Invalid financier principal")
    code = await next_tenant_code(db, model=Facility, tenant_id=tenant.id, prefix="FC-", width=5)
    fac = Facility(
        tenant_id=tenant.id,
        facility_code=code,
        facility_type=body.facility_type.strip().lower(),
        financier_party_id=body.financier_party_id,
        financier_name=body.financier_name,
        linked_master_contract_id=body.linked_master_contract_id,
        linked_btb_lc_id=body.linked_btb_lc_id,
        sanctioned_amount=body.sanctioned_amount,
        currency=body.currency,
        exchange_rate_to_base=body.exchange_rate_to_base,
        base_currency_amount=None,
        rate_source=body.rate_source,
        manual_rate_override_reason=body.manual_rate_override_reason,
        utilized_amount=0,
        available_amount=body.sanctioned_amount,
        sanction_date=body.sanction_date,
        expiry_date=body.expiry_date,
        interest_rate=body.interest_rate,
        interest_type=body.interest_type,
        penalty_interest_rate=body.penalty_interest_rate,
        penalty_method=body.penalty_method,
        status="draft",
        gl_liability_account_id=body.gl_liability_account_id,
        gl_interest_expense_account_id=body.gl_interest_expense_account_id,
        gl_interest_payable_account_id=body.gl_interest_payable_account_id,
        gl_penalty_expense_account_id=body.gl_penalty_expense_account_id,
        linked_bank_account_id=body.linked_bank_account_id,
        repayment_source_account_id=body.repayment_source_account_id,
        notes=body.notes,
        created_by=user.id,
    )
    db.add(fac)
    await db.commit()
    await db.refresh(fac)
    return fac


@router.get("/facilities/{facility_id}")
async def get_facility(
    facility_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.facilities.read")),
):
    _require_facility_enabled()
    fac = await db.get(Facility, facility_id)
    if not fac or fac.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Facility not found")
    utils = list(
        (
            await db.execute(
                select(FacilityUtilization).where(FacilityUtilization.facility_id == facility_id)
            )
        ).scalars().all()
    )
    return {"facility": fac, "utilizations": utils}


@router.patch("/facilities/{facility_id}")
async def patch_facility(
    facility_id: int,
    body: FacilityPatchBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.facilities.edit")),
):
    _require_facility_enabled()
    fac = await db.get(Facility, facility_id)
    if not fac or fac.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Facility not found")
    if fac.status == "active":
        for k in ("sanctioned_amount", "gl_liability_account_id"):
            if getattr(body, k, None) is not None:
                raise HTTPException(status_code=400, detail="Cannot change key fields on active facility")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(fac, k, v)
    await db.commit()
    await db.refresh(fac)
    return fac


@router.delete("/facilities/{facility_id}")
async def delete_facility(
    facility_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.facilities.edit")),
):
    _require_facility_enabled()
    fac = await db.get(Facility, facility_id)
    if not fac or fac.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Facility not found")
    if fac.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft facilities can be deleted")
    await db.delete(fac)
    await db.commit()
    return {"ok": True}


@router.get("/facilities/{facility_id}/utilizations")
async def list_utilizations(
    facility_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.utilizations.read")),
):
    _require_facility_enabled()
    fac = await db.get(Facility, facility_id)
    if not fac or fac.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Facility not found")
    return list(
        (
            await db.execute(
                select(FacilityUtilization).where(FacilityUtilization.facility_id == facility_id)
            )
        ).scalars().all()
    )


@router.post("/facilities/{facility_id}/utilizations", status_code=201)
async def create_utilization(
    facility_id: int,
    body: UtilizationCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.utilizations.write")),
):
    _require_facility_enabled()
    fac = await db.get(Facility, facility_id)
    if not fac or fac.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Facility not found")
    if fac.status not in ("draft", "active"):
        raise HTTPException(status_code=400, detail="Facility not open for utilizations")
    code = await next_tenant_code(db, model=FacilityUtilization, tenant_id=tenant.id, prefix="FU-", width=5)
    util = FacilityUtilization(
        tenant_id=tenant.id,
        facility_id=facility_id,
        utilization_code=code,
        utilization_type=body.utilization_type,
        principal_amount=body.principal_amount,
        currency=body.currency,
        exchange_rate_to_base=body.exchange_rate_to_base,
        rate_source=body.rate_source,
        manual_rate_override_reason=body.manual_rate_override_reason,
        disbursement_date=body.disbursement_date,
        first_accrual_date=body.first_accrual_date,
        first_repayment_date=body.first_repayment_date or body.disbursement_date,
        maturity_date=body.maturity_date,
        moratorium_months=body.moratorium_months,
        grace_days=body.grace_days,
        interest_rate=body.interest_rate,
        interest_type=body.interest_type,
        repayment_policy=body.repayment_policy,
        installment_frequency=body.installment_frequency,
        num_installments=body.num_installments,
        linked_btb_lc_id=body.linked_btb_lc_id,
        linked_purchase_order_id=body.linked_purchase_order_id,
        manual_schedule_json=body.manual_schedule_json,
        outstanding_principal=0,
        status="draft",
        created_by=user.id,
        notes=body.notes,
    )
    db.add(util)
    await db.flush()
    update_utilization_classification(util, date.today())
    await replace_schedule_for_utilization(
        db, facility=fac, util=util, grace_days=body.grace_days
    )
    await db.commit()
    await db.refresh(util)
    return util


@router.get("/utilizations/{utilization_id}")
async def get_utilization(
    utilization_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.utilizations.read")),
):
    _require_facility_enabled()
    util = await db.get(FacilityUtilization, utilization_id)
    if not util or util.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Not found")
    fac = await db.get(Facility, util.facility_id)
    sched = list(
        (
            await db.execute(
                select(RepaymentScheduleLine)
                .where(RepaymentScheduleLine.facility_utilization_id == utilization_id)
                .order_by(RepaymentScheduleLine.installment_number)
            )
        ).scalars().all()
    )
    return {"utilization": util, "facility": fac, "schedule": sched}


@router.patch("/utilizations/{utilization_id}")
async def patch_utilization(
    utilization_id: int,
    body: UtilizationPatchBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.utilizations.edit")),
):
    _require_facility_enabled()
    util = await db.get(FacilityUtilization, utilization_id)
    if not util or util.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Not found")
    if util.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft utilizations can be patched this way")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(util, k, v)
    update_utilization_classification(util, date.today())
    await db.commit()
    await db.refresh(util)
    return util


@router.post("/utilizations/{utilization_id}/regenerate-schedule")
async def regenerate_schedule(
    utilization_id: int,
    body: RegenerateScheduleBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.utilizations.edit")),
):
    _require_facility_enabled()
    util = await db.get(FacilityUtilization, utilization_id)
    if not util or util.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Not found")
    fac = await db.get(Facility, util.facility_id)
    if not fac:
        raise HTTPException(status_code=400, detail="Facility missing")
    gd = body.grace_days if body.grace_days is not None else util.grace_days
    await replace_schedule_for_utilization(db, facility=fac, util=util, grace_days=gd)
    await db.commit()
    await db.refresh(util)
    return {"ok": True, "schedule_generation_version": util.schedule_generation_version}


@router.post("/utilizations/{utilization_id}/activate")
async def activate_utilization(
    utilization_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.utilizations.approve")),
):
    _require_facility_enabled()
    util = await db.get(FacilityUtilization, utilization_id)
    if not util or util.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Not found")
    if util.status != "draft":
        raise HTTPException(status_code=400, detail="Utilization not in draft")
    fac = await db.get(Facility, util.facility_id)
    if not fac:
        raise HTTPException(status_code=400, detail="Facility missing")
    from app.models.finance import BankAccount
    from app.modules.facility.account_resolver import resolve_facility_accounts

    acc = await resolve_facility_accounts(db, tenant.id, fac)
    liability_id = acc["liability"]
    if not liability_id:
        raise HTTPException(status_code=400, detail="Facility liability GL missing (configure facility or run system COA seed)")

    bank_gl = None
    if fac.linked_bank_account_id:
        ba = await db.get(BankAccount, fac.linked_bank_account_id)
        if ba and ba.tenant_id == tenant.id:
            bank_gl = ba.gl_account_id
    if not bank_gl and fac.repayment_source_account_id:
        bank_gl = fac.repayment_source_account_id
    if not bank_gl:
        raise HTTPException(status_code=400, detail="Configure linked bank or repayment source GL")
    base_ccy = tenant.base_currency or "BDT"
    v = await create_disbursement_draft(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        util_id=util.id,
        principal=float(util.principal_amount or 0),
        bank_or_cash_account_id=bank_gl,
        liability_account_id=liability_id,
        voucher_date=util.disbursement_date or date.today(),
        base_currency=base_ccy,
    )
    util.disbursement_voucher_id = v.id
    fac.status = "active"
    await db.commit()
    await db.refresh(util)
    return {"utilization": util, "disbursement_voucher_id": v.id}


@router.delete("/utilizations/{utilization_id}")
async def delete_utilization(
    utilization_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.utilizations.edit")),
):
    _require_facility_enabled()
    util = await db.get(FacilityUtilization, utilization_id)
    if not util or util.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Not found")
    if util.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft can be deleted")
    await db.delete(util)
    await db.commit()
    return {"ok": True}


@router.get("/utilizations/{utilization_id}/schedule")
async def get_schedule(
    utilization_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.utilizations.read")),
):
    _require_facility_enabled()
    util = await db.get(FacilityUtilization, utilization_id)
    if not util or util.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Not found")
    return list(
        (
            await db.execute(
                select(RepaymentScheduleLine)
                .where(RepaymentScheduleLine.facility_utilization_id == utilization_id)
                .order_by(RepaymentScheduleLine.installment_number)
            )
        ).scalars().all()
    )


@router.get("/utilizations/{utilization_id}/transactions")
async def util_transactions(
    utilization_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.facilities.read")),
):
    _require_facility_enabled()
    util = await db.get(FacilityUtilization, utilization_id)
    if not util or util.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Not found")
    return list(
        (
            await db.execute(
                select(FacilityTransaction).where(
                    FacilityTransaction.facility_utilization_id == utilization_id
                )
            )
        ).scalars().all()
    )


@router.get("/facilities/{facility_id}/transactions")
async def facility_transactions(
    facility_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.facilities.read")),
):
    _require_facility_enabled()
    fac = await db.get(Facility, facility_id)
    if not fac or fac.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Not found")
    return list(
        (
            await db.execute(
                select(FacilityTransaction).where(FacilityTransaction.facility_id == facility_id)
            )
        ).scalars().all()
    )


@router.post("/calculate-emi")
async def calculate_emi(
    body: CalculateEmiBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    _: None = Depends(require_internal_permission("facility.utilizations.read")),
):
    _require_facility_enabled()
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    prev = preview_emi(
        principal=body.principal,
        annual_interest_rate_percent=body.annual_interest_rate_percent,
        repayment_policy=body.repayment_policy,
        num_installments=body.num_installments,
        installment_frequency=body.installment_frequency,
        moratorium_months=body.moratorium_months,
        interest_type=body.interest_type,
    )
    return {
        "emi_amount": prev.emi_amount,
        "total_interest": prev.total_interest,
        "total_repayable": prev.total_repayable,
        "rows": [r.__dict__ for r in prev.rows],
    }


@router.get("/summary")
async def facility_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.facilities.read")),
):
    _require_facility_enabled()
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    n_fac = (
        await db.execute(select(func.count()).select_from(Facility).where(Facility.tenant_id == tenant.id))
    ).scalar_one()
    debt = (
        await db.execute(
            select(func.coalesce(func.sum(FacilityUtilization.outstanding_principal), 0)).where(
                FacilityUtilization.tenant_id == tenant.id,
                FacilityUtilization.status == "active",
            )
        )
    ).scalar_one()
    today = date.today()
    next_month = accrual_month_key(today)
    emi_next = (
        await db.execute(
            select(func.coalesce(func.sum(RepaymentScheduleLine.emi_amount), 0)).where(
                RepaymentScheduleLine.tenant_id == tenant.id,
                RepaymentScheduleLine.status.in_(("upcoming", "due", "overdue", "partially_paid")),
            )
        )
    ).scalar_one()
    return {
        "facilities_count": int(n_fac or 0),
        "active_debt_principal": float(debt or 0),
        "schedule_emi_outstanding_all_lines": float(emi_next or 0),
        "note": "Post disbursement voucher to activate utilization; EMI sum is across all open schedule lines.",
    }


@router.post("/run-monthly-accrual")
async def api_run_accrual(
    body: AccrualRunBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.accrual.write")),
):
    _require_facility_enabled()
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    out = await run_monthly_accrual(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        accrual_month=body.accrual_month.strip(),
        accrual_date=body.accrual_date,
    )
    await db.commit()
    return out


@router.post("/accruals/{accrual_id}/reverse")
async def api_reverse_accrual(
    accrual_id: int,
    body: ReverseAccrualBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.accrual.write")),
):
    _require_facility_enabled()
    row = await reverse_accrual(
        db,
        tenant_id=tenant.id,
        accrual_id=accrual_id,
        reason=body.reason,
        user_id=user.id,
    )
    await db.commit()
    if row is None:
        return {"ok": True, "cancelled_pending": True}
    await db.refresh(row)
    return row


@router.get("/utilizations/{utilization_id}/accruals")
async def list_accruals(
    utilization_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.accrual.read")),
):
    _require_facility_enabled()
    util = await db.get(FacilityUtilization, utilization_id)
    if not util or util.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Not found")
    return list(
        (
            await db.execute(
                select(InterestAccrual).where(InterestAccrual.facility_utilization_id == utilization_id)
            )
        ).scalars().all()
    )


@router.get("/upcoming-obligations")
async def upcoming_obligations(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    # Same as GET /summary: tenant-wide EMI aggregates for planning; not a repayment action.
    _: None = Depends(require_internal_permission("facility.facilities.read")),
):
    _require_facility_enabled()
    lines = list(
        (
            await db.execute(
                select(RepaymentScheduleLine)
                .where(
                    RepaymentScheduleLine.tenant_id == tenant.id,
                    RepaymentScheduleLine.status.in_(("upcoming", "due", "overdue", "partially_paid")),
                )
                .order_by(RepaymentScheduleLine.due_date)
            )
        ).scalars().all()
    )
    by_month: dict[str, float] = {}
    for ln in lines:
        key = f"{ln.due_date.year:04d}-{ln.due_date.month:02d}"
        by_month[key] = by_month.get(key, 0) + float(ln.emi_amount or 0)
    return {"by_month": by_month, "lines_count": len(lines)}


@router.post("/utilizations/{utilization_id}/record-payment-draft")
async def record_payment_draft(
    utilization_id: int,
    schedule_line_id: int = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.repayments.write")),
):
    _require_facility_enabled()
    util = await db.get(FacilityUtilization, utilization_id)
    if not util or util.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Not found")
    line, v = await create_repayment_draft_for_line(
        db, tenant_id=tenant.id, user_id=user.id, schedule_line_id=schedule_line_id
    )
    if line.facility_utilization_id != utilization_id:
        raise HTTPException(status_code=400, detail="Line does not belong to this utilization")
    await db.commit()
    return {"schedule_line_id": line.id, "voucher_id": v.id}


@router.post("/generate-due-vouchers")
async def api_gen_due(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.repayments.write")),
):
    _require_facility_enabled()
    n = await generate_due_vouchers(db, tenant_id=tenant.id, user_id=user.id)
    await db.commit()
    return {"drafts_created": n}


@router.post("/update-overdue-status")
async def api_overdue(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.repayments.write")),
):
    _require_facility_enabled()
    n = await mark_overdue_lines(db, tenant_id=tenant.id)
    await db.commit()
    return {"lines_marked_overdue": n}


@router.post("/snapshots/generate")
async def generate_facility_snapshots(
    body: SnapshotGenerateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_permission("facility.reports.export")),
):
    """Freeze month-end facility payloads for lender packs / financier portal."""
    _require_facility_enabled()
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    ym = body.snapshot_month.strip()
    parts = ym.split("-")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="snapshot_month must be YYYY-MM")
    try:
        y, m = int(parts[0]), int(parts[1])
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid snapshot_month") from e
    if y < 2000 or m < 1 or m > 12:
        raise HTTPException(status_code=400, detail="Invalid snapshot_month")
    last_day = monthrange(y, m)[1]
    snap_date = date(y, m, last_day)
    q = select(Facility).where(Facility.tenant_id == tenant.id)
    if body.facility_id is not None:
        q = q.where(Facility.id == body.facility_id)
    facs = list((await db.execute(q)).scalars().all())
    if body.facility_id is not None and not facs:
        raise HTTPException(status_code=404, detail="Facility not found")
    created: list[int] = []
    for fac in facs:
        payload = await build_facility_snapshot_payload(db, tenant_id=tenant.id, facility_id=fac.id)
        row = await upsert_month_facility_snapshot(
            db,
            tenant_id=tenant.id,
            snapshot_month=ym,
            snapshot_date=snap_date,
            facility_id=fac.id,
            utilization_id=None,
            snapshot_type="month_end",
            data=payload,
            user_id=user.id,
        )
        created.append(row.id)
    await db.commit()
    return {"snapshot_ids": created, "snapshot_month": ym, "facilities_processed": len(created)}

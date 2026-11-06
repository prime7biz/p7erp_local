"""Payroll documents from a frozen snapshot (salary privacy: manager/admin or ``hr.payroll.manage`` only).

POST /hr/payroll/runs/{id}/document-snapshot        freeze an approved / finalized run
GET  /hr/payroll/runs/{id}/document-snapshot        active snapshot metadata
GET  /hr/payroll/runs/{id}/salary-sheet             JSON or PDF; department-wise + top sheet
GET  /hr/payroll/runs/{id}/wage-register.pdf        restricted register for payment signatures
GET  /hr/payroll/runs/{id}/payslips.zip             private individual wage slips
GET  /hr/payroll/runs/{id}/acknowledgements         who has been paid / signed
POST /hr/payroll/runs/{id}/acknowledgements         record payment evidence for one line
"""

from __future__ import annotations

import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import PERMISSION_HR_PAYROLL_MANAGE, assert_hr_manager_or_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.hr_lifecycle import HrPayrollAcknowledgement, HrPayrollDocumentSnapshot
from app.models.hr_payroll import PayrollRun, PayrollRunLine
from app.modules.audit.service import log_action
from app.modules.hr_payroll import register_service as reg

router = APIRouter(prefix="/hr/payroll", tags=["hr-payroll-registers"])

EVIDENCE_FOR = {"CASH": "REVENUE_STAMP_SIGNATURE", "BANK_TRANSFER": "BANK_REFERENCE", "MFS": "MFS_REFERENCE"}


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _guard(db: AsyncSession, user: User, tenant: Tenant) -> None:
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)


async def _run(db: AsyncSession, tenant_id: int, run_id: int, *, lock: bool = False) -> PayrollRun:
    stmt = select(PayrollRun).where(PayrollRun.id == run_id, PayrollRun.tenant_id == tenant_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    return run


def _meta(s: HrPayrollDocumentSnapshot) -> dict:
    data = s.snapshot_json or {}
    return {
        "id": s.id,
        "payroll_run_id": s.payroll_run_id,
        "status": s.status,
        "content_sha256": s.content_sha256,
        "generated_at": s.generated_at.isoformat(),
        "employees": (data.get("totals") or {}).get("employees"),
        "totals": data.get("totals"),
        "reconciled": data.get("reconciled"),
    }


async def _data(db: AsyncSession, tenant_id: int, run_id: int) -> dict:
    await _run(db, tenant_id, run_id)
    snap = await reg.active_snapshot(db, tenant_id, run_id)
    if snap is None:
        raise HTTPException(status_code=409, detail="Freeze the payroll documents first (run must be finalized or approved)")
    return snap.snapshot_json


@router.post("/runs/{run_id}/document-snapshot", status_code=status.HTTP_201_CREATED)
async def create_document_snapshot(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    run = await _run(db, tenant.id, run_id, lock=True)
    snap, created = await reg.freeze_run(db, tenant, run, user.id)
    if not created:
        return _meta(snap)
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_PAYROLL_DOCUMENTS_FROZEN",
                     resource=f"hr.payroll.run:{run.id}", details=snap.content_sha256)
    await db.commit()
    await db.refresh(snap)
    return _meta(snap)


@router.get("/runs/{run_id}/document-snapshot")
async def get_document_snapshot(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    await _run(db, tenant.id, run_id)
    snap = await reg.active_snapshot(db, tenant.id, run_id)
    return _meta(snap) if snap else None


@router.get("/runs/{run_id}/salary-sheet")
async def salary_sheet(
    run_id: int,
    department_id: int | None = None,
    format: str = Query(default="json", pattern="^(json|pdf)$"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    data = await _data(db, tenant.id, run_id)
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_SALARY_SHEET_VIEWED",
                     resource=f"hr.payroll.run:{run_id}", details=f"format={format} department={department_id}")
    await db.commit()
    if format == "pdf":
        pdf = await asyncio.to_thread(reg.salary_sheet_pdf, data, department_id)
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="salary-sheet-{data["run"]["period_code"]}.pdf"', "Cache-Control": "private, no-store"})
    return {"run": data["run"], "reconciled": data["reconciled"], **reg.department_sheets(data, department_id)}


@router.get("/runs/{run_id}/wage-register.pdf")
async def wage_register(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    data = await _data(db, tenant.id, run_id)
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_WAGE_REGISTER_PRINTED", resource=f"hr.payroll.run:{run_id}")
    await db.commit()
    pdf = await asyncio.to_thread(reg.wage_register_pdf, data)
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="wage-register-{data["run"]["period_code"]}.pdf"', "Cache-Control": "private, no-store"})


@router.get("/runs/{run_id}/payslips.zip")
async def payslips(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    data = await _data(db, tenant.id, run_id)
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_PAYSLIPS_BULK_DOWNLOADED", resource=f"hr.payroll.run:{run_id}")
    await db.commit()
    blob = await asyncio.to_thread(reg.payslips_zip, data)
    return Response(blob, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="wage-slips-{data["run"]["period_code"]}.zip"', "Cache-Control": "private, no-store"})


class AckBody(BaseModel):
    run_line_id: int
    payment_method: str = Field(..., pattern="^(CASH|BANK_TRANSFER|MFS)$")
    payment_reference: str | None = Field(None, max_length=64)
    evidence_ref: str | None = Field(None, max_length=255)
    signature_collected: bool = False
    acknowledged_at: datetime | None = None


@router.get("/runs/{run_id}/acknowledgements")
async def list_acknowledgements(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    data = await _data(db, tenant.id, run_id)
    acks = {
        a.payroll_run_line_id: a
        for a in (
            await db.execute(
                select(HrPayrollAcknowledgement).where(
                    HrPayrollAcknowledgement.tenant_id == tenant.id,
                    HrPayrollAcknowledgement.payroll_run_line_id.in_([ln["run_line_id"] for ln in data["lines"]] or [0]),
                )
            )
        ).scalars()
    }
    rows = []
    for ln in data["lines"]:
        a = acks.get(ln["run_line_id"])
        rows.append({
            "run_line_id": ln["run_line_id"], "employee_code": ln["employee_code"], "name": ln["name"],
            "department": ln["department"], "net": ln["net"],
            "acknowledged": a is not None,
            "payment_method": a.payment_method if a else None, "evidence_type": a.evidence_type if a else None,
            "payment_reference": a.payment_reference if a else None,
            "acknowledged_at": a.acknowledged_at.isoformat() if a else None,
        })
    return {"rows": rows, "pending": sum(1 for r in rows if not r["acknowledged"])}


@router.post("/runs/{run_id}/acknowledgements", status_code=status.HTTP_201_CREATED)
async def record_acknowledgement(
    run_id: int,
    body: AckBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _guard(db, user, tenant)
    data = await _data(db, tenant.id, run_id)
    line = (
        await db.execute(
            select(PayrollRunLine)
            .where(PayrollRunLine.id == body.run_line_id, PayrollRunLine.tenant_id == tenant.id, PayrollRunLine.run_id == run_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if line is None or body.run_line_id not in {ln["run_line_id"] for ln in data["lines"]}:
        raise HTTPException(status_code=404, detail="Payroll line not found in this run")
    if body.payment_method == "CASH" and not body.signature_collected:
        raise HTTPException(status_code=400, detail="Cash wages need the worker's signature on the revenue stamp first")
    if body.payment_method in ("BANK_TRANSFER", "MFS") and not (body.payment_reference or "").strip():
        raise HTTPException(status_code=400, detail="Enter the bank / mobile-financial transaction reference")
    dup = (
        await db.execute(
            select(HrPayrollAcknowledgement.id).where(
                HrPayrollAcknowledgement.tenant_id == tenant.id, HrPayrollAcknowledgement.payroll_run_line_id == line.id
            )
        )
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="Payment is already acknowledged for this employee")
    ack = HrPayrollAcknowledgement(
        tenant_id=tenant.id, payroll_run_line_id=line.id, payment_method=body.payment_method,
        evidence_type=EVIDENCE_FOR[body.payment_method], payment_reference=(body.payment_reference or "").strip() or None,
        evidence_ref=(body.evidence_ref or "").strip() or None,
        acknowledged_at=(body.acknowledged_at or datetime.utcnow()).replace(tzinfo=None), recorded_by=user.id,
    )
    db.add(ack)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_WAGE_PAYMENT_ACKNOWLEDGED",
                     resource=f"hr.payroll.line:{line.id}", details=f"{body.payment_method} {ack.payment_reference or ''}")
    await db.commit()
    return {"id": ack.id, "run_line_id": line.id, "payment_method": ack.payment_method, "evidence_type": ack.evidence_type}

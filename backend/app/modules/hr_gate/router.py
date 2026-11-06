"""Temporary employee gate passes (printable, internal QR) and the gate scan log.

GET  /hr/gate-passes                 hr.gate_pass.manage
POST /hr/gate-passes                 hr.gate_pass.manage (DRAFT)
POST /hr/gate-passes/{id}/activate   hr.gate_pass.manage
POST /hr/gate-passes/{id}/revoke     hr.gate_pass.manage
GET  /hr/gate-passes/{id}/print      hr.gate_pass.manage (PDF with QR)
POST /hr/gate-passes/verify          hr.gate_pass.scan  (read-only check)
POST /hr/gate-passes/scan            hr.gate_pass.scan  (records ALLOWED / DENIED; idempotent per key)
GET  /hr/gate-events                 hr.gate_pass.manage

The QR holds an HMAC token; only its SHA-256 hash is stored, and lookups are always inside the
caller's company (another company's pass looks exactly like an unknown code). Employee ID cards
(``P7EMP:...``) can be scanned at the same gate.
"""

from __future__ import annotations

import hashlib
import hmac
import io
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import now_local
from app.common.codegen import next_tenant_code_entity_key
from app.common.permissions import (
    PERMISSION_HR_GATE_PASS_MANAGE,
    PERMISSION_HR_GATE_PASS_SCAN,
    assert_hr_manager_or_permission,
)
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_lifecycle import HrEmployeeGateEvent, HrEmployeeGatePass
from app.modules.audit.service import log_action
from app.modules.hr.hr_document_generator_service import _draw_qr, verify_employee_card_qr

router = APIRouter(prefix="/hr", tags=["hr-gate-pass"])

QR_PREFIX = "P7GP:"
MAX_PASS_DAYS = 31

PASS_FIELDS = (
    "id", "pass_code", "employee_id", "person_name", "mobile", "identity_ref", "sponsor_employee_id", "purpose",
    "permitted_zones", "valid_from", "valid_to", "status", "issued_by", "issued_at", "revoked_by", "revoked_at",
    "revoke_reason", "created_at",
)


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _out(row: HrEmployeeGatePass) -> dict[str, Any]:
    out = {}
    for f in PASS_FIELDS:
        v = getattr(row, f)
        out[f] = v.isoformat() if isinstance(v, datetime) else v
    return out


def _now(tenant: Tenant) -> datetime:
    return now_local(tenant).replace(tzinfo=None)


def qr_token(row: HrEmployeeGatePass) -> str:
    key = hashlib.sha256(b"p7-gate-pass-v1:" + get_settings().jwt_secret.encode()).digest()
    msg = f"{row.tenant_id}:{row.id}:{row.pass_code}:{row.created_at.isoformat()}".encode()
    return QR_PREFIX + hmac.new(key, msg, hashlib.sha256).hexdigest()[:40]


def token_hash(token: str) -> str:
    return hashlib.sha256(token.strip().encode()).hexdigest()


async def _locked_pass(db: AsyncSession, tenant_id: int, pass_id: int) -> HrEmployeeGatePass:
    row = (
        await db.execute(
            select(HrEmployeeGatePass)
            .where(HrEmployeeGatePass.id == pass_id, HrEmployeeGatePass.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Gate pass not found")
    return row


class GatePassCreate(BaseModel):
    employee_id: int | None = None
    person_name: str = Field(..., min_length=1, max_length=128)
    mobile: str = Field(..., min_length=6, max_length=32)
    identity_ref: str | None = Field(None, max_length=64, description="Last digits of NID / birth registration")
    sponsor_employee_id: int | None = None
    purpose: str = Field(..., min_length=2, max_length=1000)
    permitted_zones: list[str] = Field(default_factory=list, max_length=20)
    valid_from: datetime
    valid_to: datetime

    @model_validator(mode="after")
    def _window(self) -> "GatePassCreate":
        if self.valid_to <= self.valid_from:
            raise ValueError("valid_to must be after valid_from")
        if (self.valid_to - self.valid_from).days > MAX_PASS_DAYS:
            raise ValueError(f"A temporary pass can be valid for at most {MAX_PASS_DAYS} days")
        return self


class RevokeBody(BaseModel):
    reason: str = Field(..., min_length=2, max_length=255)


class ScanBody(BaseModel):
    qr: str = Field(..., min_length=4, max_length=200)
    direction: str = Field(default="IN", pattern="^(IN|OUT)$")
    gate: str = Field(default="MAIN", min_length=1, max_length=64)
    zone: str | None = Field(None, max_length=64)
    idempotency_key: str = Field(..., min_length=8, max_length=64)


class VerifyBody(BaseModel):
    qr: str = Field(..., min_length=4, max_length=200)
    zone: str | None = Field(None, max_length=64)


@router.get("/gate-passes")
async def list_gate_passes(
    status_filter: str | None = Query(default=None, alias="status"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_GATE_PASS_MANAGE)
    stmt = select(HrEmployeeGatePass).where(HrEmployeeGatePass.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(HrEmployeeGatePass.status == status_filter.strip().upper())
    rows = (await db.execute(stmt.order_by(HrEmployeeGatePass.id.desc()).limit(500))).scalars().all()
    now = _now(tenant)
    return [{**_out(r), "expired": r.status == "ACTIVE" and r.valid_to < now} for r in rows]


@router.post("/gate-passes", status_code=status.HTTP_201_CREATED)
async def create_gate_pass(
    body: GatePassCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_GATE_PASS_MANAGE)
    for emp_id in (body.employee_id, body.sponsor_employee_id):
        if emp_id is not None:
            emp = await db.get(Employee, emp_id)
            if emp is None or emp.tenant_id != tenant.id:
                raise HTTPException(status_code=404, detail="Employee not found")
    code = await next_tenant_code_entity_key(db, tenant_id=tenant.id, entity_key="hr_gate_pass", prefix="GP-", width=6)
    row = HrEmployeeGatePass(
        tenant_id=tenant.id, pass_code=code, employee_id=body.employee_id, person_name=body.person_name.strip(),
        mobile=body.mobile.strip(), identity_ref=(body.identity_ref or "").strip() or None,
        sponsor_employee_id=body.sponsor_employee_id, purpose=body.purpose.strip(),
        permitted_zones=[z.strip().upper() for z in body.permitted_zones if z.strip()],
        valid_from=body.valid_from.replace(tzinfo=None), valid_to=body.valid_to.replace(tzinfo=None),
        status="DRAFT", qr_token_hash=f"pending-{tenant.id}-{code}", created_by=user.id, created_at=datetime.utcnow(),
    )
    db.add(row)
    await db.flush()
    row.qr_token_hash = token_hash(qr_token(row))
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_GATE_PASS_CREATED", resource=f"hr.gate_pass:{row.id}", details=code)
    await db.commit()
    await db.refresh(row)
    return _out(row)


@router.post("/gate-passes/{pass_id}/activate")
async def activate_gate_pass(
    pass_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_GATE_PASS_MANAGE)
    row = await _locked_pass(db, tenant.id, pass_id)
    if row.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Pass is {row.status}")
    if row.valid_to <= _now(tenant):
        raise HTTPException(status_code=409, detail="The validity window has already ended")
    row.status, row.issued_by, row.issued_at = "ACTIVE", user.id, datetime.utcnow()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_GATE_PASS_ACTIVATED", resource=f"hr.gate_pass:{row.id}")
    await db.commit()
    await db.refresh(row)
    return _out(row)


@router.post("/gate-passes/{pass_id}/revoke")
async def revoke_gate_pass(
    pass_id: int,
    body: RevokeBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_GATE_PASS_MANAGE)
    row = await _locked_pass(db, tenant.id, pass_id)
    if row.status == "REVOKED":
        return _out(row)
    row.status, row.revoked_by, row.revoked_at, row.revoke_reason = "REVOKED", user.id, datetime.utcnow(), body.reason.strip()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_GATE_PASS_REVOKED", resource=f"hr.gate_pass:{row.id}", details=row.revoke_reason)
    await db.commit()
    await db.refresh(row)
    return _out(row)


@router.get("/gate-passes/{pass_id}/print")
async def print_gate_pass(
    pass_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_GATE_PASS_MANAGE)
    row = await db.get(HrEmployeeGatePass, pass_id)
    if row is None or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Gate pass not found")
    if row.status not in ("ACTIVE", "DRAFT"):
        raise HTTPException(status_code=409, detail=f"A {row.status} pass cannot be printed")
    w, h = 100 * mm, 65 * mm
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w, h))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(6 * mm, h - 9 * mm, (getattr(tenant, "name", None) or "Company")[:40])
    c.setFont("Helvetica-Bold", 9)
    c.drawString(6 * mm, h - 15 * mm, f"TEMPORARY GATE PASS  {row.pass_code}")
    c.setFont("Helvetica", 8)
    c.drawString(6 * mm, h - 22 * mm, f"Name: {row.person_name[:34]}")
    c.drawString(6 * mm, h - 27 * mm, f"Mobile: {row.mobile}")
    c.drawString(6 * mm, h - 32 * mm, f"Purpose: {row.purpose[:36]}")
    c.drawString(6 * mm, h - 37 * mm, f"Valid: {row.valid_from:%d-%b-%Y %H:%M}")
    c.drawString(6 * mm, h - 42 * mm, f"   to: {row.valid_to:%d-%b-%Y %H:%M}")
    if row.permitted_zones:
        c.drawString(6 * mm, h - 47 * mm, f"Zones: {', '.join(row.permitted_zones)[:34]}")
    if row.status == "DRAFT":
        c.setFont("Helvetica-Bold", 9)
        c.drawString(6 * mm, 6 * mm, "DRAFT - NOT VALID UNTIL ACTIVATED")
    _draw_qr(c, qr_token(row), w - 34 * mm, h - 46 * mm, 30 * mm)
    c.save()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_GATE_PASS_PRINTED", resource=f"hr.gate_pass:{row.id}")
    await db.commit()
    return Response(buf.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{row.pass_code}.pdf"'})


async def _evaluate(db: AsyncSession, tenant: Tenant, qr: str, zone: str | None) -> tuple[str, str, HrEmployeeGatePass | None, dict]:
    """(result, reason, pass, holder) without writing anything."""
    text = qr.strip()
    now = _now(tenant)
    if text.startswith("P7EMP:"):
        card = verify_employee_card_qr(text)
        if card is None or card[0] != tenant.id:
            return "DENIED", "Unknown or forged ID card", None, {}
        emp = (
            await db.execute(select(Employee).where(Employee.tenant_id == tenant.id, Employee.employee_code == card[1]))
        ).scalar_one_or_none()
        if emp is None or not emp.is_active:
            return "DENIED", "Employee is not active", None, {}
        return "ALLOWED", f"EMPLOYEE_CARD:{emp.employee_code}", None, {"type": "EMPLOYEE", "employee_code": emp.employee_code, "name": " ".join(p for p in (emp.first_name, emp.last_name) if p)}
    if not text.startswith(QR_PREFIX):
        return "DENIED", "Not a company pass", None, {}
    row = (
        await db.execute(
            select(HrEmployeeGatePass).where(
                HrEmployeeGatePass.tenant_id == tenant.id, HrEmployeeGatePass.qr_token_hash == token_hash(text)
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return "DENIED", "Unknown pass", None, {}
    holder = {"type": "GATE_PASS", "pass_code": row.pass_code, "name": row.person_name, "valid_to": row.valid_to.isoformat()}
    if row.status != "ACTIVE":
        return "DENIED", f"Pass is {row.status}", row, holder
    if now < row.valid_from:
        return "DENIED", "Pass is not valid yet", row, holder
    if now > row.valid_to:
        return "DENIED", "Pass has expired", row, holder
    if row.permitted_zones and (zone or "").strip().upper() not in row.permitted_zones:
        return "DENIED", "Zone not allowed for this pass", row, holder
    return "ALLOWED", "Valid pass", row, holder


@router.post("/gate-passes/verify")
async def verify_gate_pass(
    body: VerifyBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_GATE_PASS_SCAN)
    result, reason, _row, holder = await _evaluate(db, tenant, body.qr, body.zone)
    return {"result": result, "reason": reason, "holder": holder}


@router.post("/gate-passes/scan")
async def scan_gate_pass(
    body: ScanBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_GATE_PASS_SCAN)
    existing = (
        await db.execute(
            select(HrEmployeeGateEvent).where(
                HrEmployeeGateEvent.tenant_id == tenant.id, HrEmployeeGateEvent.idempotency_key == body.idempotency_key
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return {"result": existing.result, "reason": existing.reason, "event_id": existing.id, "duplicate": True}
    result, reason, row, holder = await _evaluate(db, tenant, body.qr, body.zone)
    if row is not None and row.status == "ACTIVE" and reason == "Pass has expired":
        locked = await _locked_pass(db, tenant.id, row.id)
        locked.status = "EXPIRED"
    event = HrEmployeeGateEvent(
        tenant_id=tenant.id, gate_pass_id=row.id if row else None, event_at=_now(tenant), direction=body.direction,
        gate=body.gate.strip(), guard_user_id=user.id, result=result, reason=reason[:255],
        idempotency_key=body.idempotency_key,
    )
    db.add(event)
    await db.flush()
    await db.commit()
    return {"result": result, "reason": reason, "holder": holder, "event_id": event.id, "duplicate": False}


@router.get("/gate-events")
async def list_gate_events(
    gate_pass_id: int | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_GATE_PASS_MANAGE)
    stmt = select(HrEmployeeGateEvent).where(HrEmployeeGateEvent.tenant_id == tenant.id)
    if gate_pass_id is not None:
        stmt = stmt.where(HrEmployeeGateEvent.gate_pass_id == gate_pass_id)
    rows = (await db.execute(stmt.order_by(HrEmployeeGateEvent.event_at.desc()).limit(500))).scalars().all()
    return [
        {
            "id": e.id, "gate_pass_id": e.gate_pass_id, "event_at": e.event_at.isoformat(), "direction": e.direction,
            "gate": e.gate, "guard_user_id": e.guard_user_id, "result": e.result, "reason": e.reason,
        }
        for e in rows
    ]

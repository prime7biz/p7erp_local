"""Temporary gate pass create / activate, shared by the gate-pass endpoints and employee onboarding.

Nothing here commits. Callers check ``hr.gate_pass.manage`` first.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import now_local
from app.common.codegen import next_tenant_code_entity_key
from app.config import get_settings
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_lifecycle import HrEmployeeGatePass
from app.modules.audit.service import log_action

QR_PREFIX = "P7GP:"
MAX_PASS_DAYS = 31


def tenant_now(tenant: Tenant) -> datetime:
    return now_local(tenant).replace(tzinfo=None)


def qr_token(row: HrEmployeeGatePass) -> str:
    key = hashlib.sha256(b"p7-gate-pass-v1:" + get_settings().jwt_secret.encode()).digest()
    msg = f"{row.tenant_id}:{row.id}:{row.pass_code}:{row.created_at.isoformat()}".encode()
    return QR_PREFIX + hmac.new(key, msg, hashlib.sha256).hexdigest()[:40]


def token_hash(token: str) -> str:
    return hashlib.sha256(token.strip().encode()).hexdigest()


async def create_draft_pass(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    employee_id: int | None,
    person_name: str,
    mobile: str,
    identity_ref: str | None,
    sponsor_employee_id: int | None,
    purpose: str,
    permitted_zones: list[str],
    valid_from: datetime,
    valid_to: datetime,
) -> HrEmployeeGatePass:
    if valid_to <= valid_from:
        raise HTTPException(status_code=400, detail="valid_to must be after valid_from")
    if (valid_to - valid_from).days > MAX_PASS_DAYS:
        raise HTTPException(status_code=400, detail=f"A temporary pass can be valid for at most {MAX_PASS_DAYS} days")
    for emp_id in (employee_id, sponsor_employee_id):
        if emp_id is not None:
            emp = await db.get(Employee, emp_id)
            if emp is None or emp.tenant_id != tenant.id:
                raise HTTPException(status_code=404, detail="Employee not found")
    code = await next_tenant_code_entity_key(db, tenant_id=tenant.id, entity_key="hr_gate_pass", prefix="GP-", width=6)
    row = HrEmployeeGatePass(
        tenant_id=tenant.id, pass_code=code, employee_id=employee_id, person_name=person_name.strip(),
        mobile=mobile.strip(), identity_ref=(identity_ref or "").strip() or None,
        sponsor_employee_id=sponsor_employee_id, purpose=purpose.strip(),
        permitted_zones=[z.strip().upper() for z in permitted_zones if z.strip()],
        valid_from=valid_from.replace(tzinfo=None), valid_to=valid_to.replace(tzinfo=None),
        status="DRAFT", qr_token_hash=f"pending-{tenant.id}-{code}", created_by=user.id, created_at=datetime.utcnow(),
    )
    db.add(row)
    await db.flush()
    row.qr_token_hash = token_hash(qr_token(row))
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_GATE_PASS_CREATED", resource=f"hr.gate_pass:{row.id}", details=code)
    return row


async def activate_pass(db: AsyncSession, *, tenant: Tenant, user: User, row: HrEmployeeGatePass) -> HrEmployeeGatePass:
    """``row`` must be locked by the caller."""
    if row.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Pass is {row.status}")
    if row.valid_to <= tenant_now(tenant):
        raise HTTPException(status_code=409, detail="The validity window has already ended")
    row.status, row.issued_by, row.issued_at = "ACTIVE", user.id, datetime.utcnow()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_GATE_PASS_ACTIVATED", resource=f"hr.gate_pass:{row.id}")
    return row

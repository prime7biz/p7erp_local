"""Printable letters linked to APPLIED HR class requests."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_class_request import HrClassRequest
from app.models.hr_onboarding import HrGeneratedEmployeeDocument
from app.modules.audit.service import log_action
from app.modules.hr import generated_documents

LETTER_TYPES_BY_KIND = {
    "PROMOTION": "PROMOTION_LETTER",
    "INCREMENT": "INCREMENT_LETTER",
    "CORRECTION": "CORRECTION_LETTER",
    "RESIGNATION": "RESIGNATION_ACCEPTANCE",
    "DISCONTINUE": "DISCONTINUATION_LETTER",
    "LEAVE": "LEAVE_SLIP",
    "WARNING": "WARNING_LETTER",
    "NEW_EMPLOYEE": "APPOINTMENT_LETTER",
}


async def issue_letter(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    request_pk: int,
    document_type: str | None = None,
    generation_request_id: str | None = None,
) -> dict[str, Any]:
    req = await db.get(HrClassRequest, request_pk)
    if req is None or req.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="HR request not found")
    if req.status != "APPLIED":
        raise HTTPException(status_code=409, detail="Letters can only be issued from APPLIED requests")
    if not req.employee_id:
        raise HTTPException(status_code=400, detail="Request has no employee to letter")
    emp = await ensure_owned(db, Employee, req.employee_id, tenant.id, "Employee", status_code=404)
    assert emp is not None
    doc_type = (document_type or LETTER_TYPES_BY_KIND.get(req.kind) or "APPOINTMENT_LETTER").upper()
    rid = generation_request_id or f"hrletter-{req.id}-{doc_type.lower()}"

    if doc_type in {"APPOINTMENT_LETTER", "JOB_DESCRIPTION"}:
        existing = (
            await db.execute(
                select(HrGeneratedEmployeeDocument).where(
                    HrGeneratedEmployeeDocument.tenant_id == tenant.id,
                    HrGeneratedEmployeeDocument.generation_request_id == rid,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            return generated_documents.document_out(existing)
        from app.modules.hr.employee_service import employee_field_access

        access = await employee_field_access(db, user, tenant.id)
        row, _created, _outdated = await generated_documents.issue_document(
            db,
            tenant=tenant,
            user_id=user.id,
            employee_id=emp.id,
            document_type=doc_type,
            access=access,
            request_id=rid,
            reissue=False,
        )
        if hasattr(row, "hr_class_request_id"):
            row.hr_class_request_id = req.id
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            action="HR_CLASS_LETTER_ISSUED",
            resource=f"hr.generated_document:{row.id}",
            details=f"request={req.id} type={doc_type}",
        )
        return generated_documents.document_out(row)

    # Printable JSON letter (PDF clients render from this). Linked by request id in the payload.
    letter = {
        "document_type": doc_type,
        "hr_class_request_id": req.id,
        "request_no": req.request_no,
        "kind": req.kind,
        "employee_id": emp.id,
        "employee_code": emp.employee_code,
        "employee_name": f"{emp.first_name} {emp.last_name or ''}".strip(),
        "reason": req.reason,
        "payload": req.payload or {},
        "approved_by": req.approved_by,
        "approved_at": req.approved_at.isoformat() if req.approved_at else None,
        "issued_at": datetime.utcnow().isoformat(),
        "generation_request_id": rid,
    }
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="HR_CLASS_LETTER_ISSUED",
        resource=f"hr.class_request:{req.id}",
        details=f"type={doc_type}",
    )
    return letter

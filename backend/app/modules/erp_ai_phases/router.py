"""HTTP routes for ERP AI Phases 16–20 (document validation, copilot, governance)."""

from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Role, Tenant, User
from app.modules.ai_tool.audit import log_ai_event
from app.modules.erp_ai_phases import copilot_service as copilot_svc
from app.modules.erp_ai_phases import document_ai_service as doc_ai_svc
from app.modules.erp_ai_phases import governance_service as gov_svc
from app.modules.erp_ai_phases.feature_flags import require_phase

router = APIRouter(prefix="/erp-ai", tags=["erp-ai-phases"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _is_admin(user: User, db: AsyncSession) -> bool:
    role = await db.get(Role, user.role_id)
    if not role:
        return False
    return role.name.lower() in {"admin", "super_admin", "superadmin", "owner"}


class DocumentValidateBody(BaseModel):
    entity_type: str = Field(..., min_length=2, max_length=32)
    entity_id: int = Field(..., ge=1)
    extracted_fields: dict = Field(default_factory=dict)


@router.post("/document/validate")
async def document_validate(
    body: DocumentValidateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_phase("document_ai_validation", tenant=tenant)
    out = await doc_ai_svc.validate_extracted_against_entity(
        db,
        tenant_id=tenant.id,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        extracted_fields=body.extracted_fields,
    )
    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="DOCUMENT_AI_VALIDATE",
        resource=f"{body.entity_type}:{body.entity_id}",
        details_json={"mismatch_count": out.get("mismatch_count"), "ok": out.get("ok")},
        reason_code="ADVISORY_COMPARE",
    )
    await db.commit()
    return out


class CopilotQueryBody(BaseModel):
    intent: str = Field(..., min_length=3, max_length=64)


@router.post("/copilot/safe-query")
async def copilot_safe_query(
    body: CopilotQueryBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_phase("ai_copilot_readonly", tenant=tenant)
    out = await copilot_svc.run_safe_copilot_intent(db, tenant_id=tenant.id, intent=body.intent)
    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="AI_COPILOT_SAFE_QUERY",
        resource=body.intent,
        details_json={"ok": out.get("ok")},
        reason_code="READONLY_TEMPLATE",
    )
    await db.commit()
    return out


class GovernanceProposeBody(BaseModel):
    rule_code: str = Field(..., min_length=2, max_length=64)
    payload_json: dict | None = None
    idempotency_key: str | None = Field(default=None, max_length=128)


@router.post("/governance/proposals")
async def governance_propose(
    body: GovernanceProposeBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_phase("ai_controlled_automation", tenant=tenant)
    rule_eval = await gov_svc.evaluate_registered_rule(
        db,
        tenant_id=tenant.id,
        rule_code=body.rule_code,
        payload_json=body.payload_json,
    )
    row = await gov_svc.create_proposal(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        rule_code=body.rule_code,
        payload_json=body.payload_json,
        idempotency_key=body.idempotency_key,
    )
    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="AI_CONTROLLED_ACTION_PROPOSED",
        resource=f"proposal:{row.id}",
        details_json={"rule_code": row.rule_code, "rule_evaluation": rule_eval},
        reason_code="AWAITING_APPROVAL",
    )
    await db.commit()
    await db.refresh(row)
    return {
        "id": row.id,
        "status": row.status,
        "rule_code": row.rule_code,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "rule_evaluation": rule_eval,
    }


@router.post("/governance/proposals/{proposal_id}/approve")
async def governance_approve(
    proposal_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_phase("ai_controlled_automation", tenant=tenant)
    if not await _is_admin(user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    row = await gov_svc.approve_proposal(db, tenant_id=tenant.id, proposal_id=proposal_id, approver_user_id=user.id)
    if not row:
        raise HTTPException(status_code=404, detail="Proposal not found")
    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="AI_CONTROLLED_ACTION_APPROVED",
        resource=f"proposal:{proposal_id}",
        reason_code="APPROVED",
    )
    await db.commit()
    return {"id": row.id, "status": row.status}


class GovernanceRejectBody(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)


@router.post("/governance/proposals/{proposal_id}/reject")
async def governance_reject(
    proposal_id: int,
    body: GovernanceRejectBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_phase("ai_controlled_automation", tenant=tenant)
    if not await _is_admin(user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    row = await gov_svc.reject_proposal(
        db,
        tenant_id=tenant.id,
        proposal_id=proposal_id,
        reviewer_user_id=user.id,
        reason=body.reason,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Proposal not found")
    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="AI_CONTROLLED_ACTION_REJECTED",
        resource=f"proposal:{proposal_id}",
        reason_code="REJECTED",
    )
    await db.commit()
    return {"id": row.id, "status": row.status}


@router.post("/governance/proposals/{proposal_id}/rollback")
async def governance_rollback(
    proposal_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    require_phase("ai_controlled_automation", tenant=tenant)
    if not await _is_admin(user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    row = await gov_svc.mark_rollback(db, tenant_id=tenant.id, proposal_id=proposal_id)
    if not row:
        raise HTTPException(status_code=404, detail="Proposal not found")
    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="AI_CONTROLLED_ACTION_ROLLBACK_MARKED",
        resource=f"proposal:{proposal_id}",
        reason_code="ROLLBACK",
    )
    await db.commit()
    return {"id": row.id, "status": row.status}

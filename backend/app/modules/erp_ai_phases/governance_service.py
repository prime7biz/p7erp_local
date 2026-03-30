"""Phase 20: propose controlled automation actions — persistence + approval workflow (no auto-exec here)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AiAutomationRule
from app.models.ai_controlled_action import AiControlledActionProposal
from app.modules.erp_ai_phases.rule_evaluator import evaluate_condition


async def evaluate_registered_rule(
    db: AsyncSession,
    *,
    tenant_id: int,
    rule_code: str,
    payload_json: dict | None,
) -> dict[str, Any]:
    code = (rule_code or "").strip()
    r = await db.execute(
        select(AiAutomationRule).where(
            AiAutomationRule.tenant_id == tenant_id,
            AiAutomationRule.rule_code == code,
        )
    )
    row = r.scalar_one_or_none()
    if not row:
        return {
            "rule_defined": False,
            "evaluation": None,
            "confidence": 0.4,
            "reason_codes": ["RULE_CODE_NOT_REGISTERED"],
        }
    if not row.is_enabled:
        return {
            "rule_defined": True,
            "rule_active": False,
            "evaluation": None,
            "confidence": 0.4,
            "reason_codes": ["RULE_INACTIVE"],
        }
    cond = row.condition_json if isinstance(row.condition_json, dict) else None
    ev = evaluate_condition(cond, payload_json)
    return {
        "rule_defined": True,
        "rule_active": True,
        "rule_id": row.id,
        "evaluation": ev,
        "confidence": float(ev.get("confidence") or 0.5),
        "reason_codes": list(ev.get("reason_codes") or []),
    }


async def create_proposal(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    rule_code: str,
    payload_json: dict | None,
    idempotency_key: str | None,
) -> AiControlledActionProposal:
    key = (idempotency_key or "").strip() or None
    if key:
        r = await db.execute(
            select(AiControlledActionProposal).where(
                AiControlledActionProposal.tenant_id == tenant_id,
                AiControlledActionProposal.idempotency_key == key,
            )
        )
        existing = r.scalar_one_or_none()
        if existing:
            return existing

    row = AiControlledActionProposal(
        tenant_id=tenant_id,
        created_by_user_id=user_id,
        rule_code=(rule_code or "").strip()[:64],
        payload_json=payload_json,
        status="proposed",
        idempotency_key=key[:128] if key else None,
    )
    db.add(row)
    await db.flush()
    return row


async def approve_proposal(
    db: AsyncSession,
    *,
    tenant_id: int,
    proposal_id: int,
    approver_user_id: int,
) -> AiControlledActionProposal | None:
    row = await db.get(AiControlledActionProposal, proposal_id)
    if not row or row.tenant_id != tenant_id:
        return None
    if row.status != "proposed":
        return row
    row.status = "approved"
    row.approved_by_user_id = approver_user_id
    row.approved_at = datetime.utcnow()
    await db.flush()
    return row


async def reject_proposal(
    db: AsyncSession,
    *,
    tenant_id: int,
    proposal_id: int,
    reviewer_user_id: int,
    reason: str | None,
) -> AiControlledActionProposal | None:
    row = await db.get(AiControlledActionProposal, proposal_id)
    if not row or row.tenant_id != tenant_id:
        return None
    if row.status != "proposed":
        return row
    row.status = "rejected"
    row.rejected_by_user_id = reviewer_user_id
    row.rejected_at = datetime.utcnow()
    row.rejected_reason = (reason or "")[:2000] or None
    await db.flush()
    return row


async def mark_rollback(
    db: AsyncSession,
    *,
    tenant_id: int,
    proposal_id: int,
) -> AiControlledActionProposal | None:
    row = await db.get(AiControlledActionProposal, proposal_id)
    if not row or row.tenant_id != tenant_id:
        return None
    row.rolled_back_at = datetime.utcnow()
    row.status = "rolled_back"
    await db.flush()
    return row

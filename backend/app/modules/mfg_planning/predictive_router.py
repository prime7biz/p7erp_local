"""Manufacturing Intelligence Phase 4 write routes (plan 15 sections 7, D21, D22, 17.8, 17.9).

Prefix ``/api/v1/mfg-intelligence`` (shared with the read-only routers). Router level: ``production.planning.read``.
Both routes: tenant mismatch 403, 404 unless ``manufacturing_intelligence_v1`` AND ``mfg_predictive_intelligence_v1``.

| Endpoint | Extra gates | Writes |
|---|---|---|
| POST /recommendations/{finding_id}/decision | admin / manager or ``ai.agents.confirm``; LATE_MATERIAL also inventory read (RBAC enforce) | one ``ai_agent_decisions`` row, the finding's decision status, AI audit |
| POST /predictive/explain | flag ``mfg_predictive_ai_text_v1`` (else 404), AI module access, AI policy + ``ai.tools.production.read``, heavy rate limit, daily AI quota | provider usage row, AI audit |

A decision records the human choice only: it never creates or changes a plan, order, purchase order, payroll,
financing or shipment row. The UI then opens the existing screen named in ``next_step``.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.permissions import assert_delegate_manager_or_permission, require_internal_permission
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Order, SewingLine, Tenant, User
from app.models.mfg_predictive import MfgPredictiveFinding
from app.modules.ai_tool.audit import log_ai_event
from app.modules.ai_tool.guardrails import enforce_ai_daily_tenant_quota, rate_limit_dependency
from app.modules.mfg_intelligence.flags import predictive_ai_text_on, require_predictive_enabled
from app.modules.mfg_intelligence.router import _get_order, _may_see_material_detail
from app.modules.mfg_planning import predictive_explain as px
from app.modules.mfg_planning import predictive_writer as w

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/mfg-intelligence",
    tags=["mfg-intelligence-predictive"],
    dependencies=[Depends(require_internal_permission("production.planning.read"))],
)

CONFIRM_PERMISSION = "ai.agents.confirm"
EXPLAIN_TOOL = "mfg_predictive_explain"
INVENTORY_KINDS = ("LATE_MATERIAL",)


def _guard(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    require_predictive_enabled(tenant)


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DecisionIn(_In):
    decision: Literal["ACCEPT", "REJECT"]
    note: str | None = Field(default=None, max_length=500)


class ExplainIn(_In):
    subject: Literal["order", "finding"]
    record_id: int = Field(..., ge=1)


def _decision_out(row: Any, finding: MfgPredictiveFinding, replayed: bool) -> dict[str, Any]:
    payload = finding.payload if isinstance(finding.payload, dict) else {}
    screen = (payload.get("recommendation") or {}).get("screen") if row.decision == "ACCEPTED" else None
    return {
        "finding_id": finding.id,
        "decision_id": row.id,
        "decision": row.decision,
        "note": row.note,
        "decided_by": row.decided_by,
        "decided_at": row.decided_at,
        "replayed": replayed,
        "finding_status": finding.status,
        "decision_status": finding.decision_status,
        "deadline_date": row.deadline_date,
        "next_step": screen if isinstance(screen, dict) else None,
        "recommendation": row.recommendation_json or {},
    }


@router.post("/recommendations/{finding_id}/decision")
async def decide_recommendation(
    finding_id: int,
    body: DecisionIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    tid, uid = tenant.id, user.id
    try:
        await assert_delegate_manager_or_permission(db, user, tid, permission_key=CONFIRM_PERMISSION)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires admin/manager role or permission '{CONFIRM_PERMISSION}'",
        ) from None
    may_see_material = await _may_see_material_detail(db, user, tenant)
    decision = "ACCEPTED" if body.decision == "ACCEPT" else "REJECTED"
    note = (body.note or "").strip() or None
    try:
        finding = await w.lock_finding(db, tid, finding_id)
        if finding.kind in INVENTORY_KINDS and not may_see_material:
            raise w.DecisionError(403, "Material recommendations need inventory read access")
        row, replayed = await w.record_decision(
            db, tenant_id=tid, user_id=uid, finding=finding, decision=decision, note=note
        )
    except w.DecisionError as exc:
        # Nothing was written (a rule check, not a database error); the request's session releases the row lock.
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from None
    out = _decision_out(row, finding, replayed)
    if not replayed:
        await log_ai_event(
            db,
            tenant_id=tid,
            user_id=uid,
            action="MFG_RECOMMENDATION_DECIDED",
            resource=f"mfg_intelligence.{finding.kind.lower()}",
            details=f"{finding.kind} {decision}"[:300],
            details_json={"finding_id": finding.id, "kind": finding.kind, "decision": decision, "note": bool(note)},
            decision="allow",
            approval_status="approved" if decision == "ACCEPTED" else "rejected",
        )
    await db.commit()
    return out


async def _finding_subject(db: AsyncSession, tenant: Tenant, user: User, finding_id: int) -> px.ExplainSubject:
    row = (
        await db.execute(
            select(MfgPredictiveFinding, Order.order_code, SewingLine.line_code)
            .outerjoin(Order, (Order.id == MfgPredictiveFinding.order_id) & (Order.tenant_id == tenant.id))
            .outerjoin(SewingLine, (SewingLine.id == MfgPredictiveFinding.line_id) & (SewingLine.tenant_id == tenant.id))
            .where(MfgPredictiveFinding.tenant_id == tenant.id, MfgPredictiveFinding.id == finding_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    finding, order_code, line_code = row
    if finding.kind in INVENTORY_KINDS and not await _may_see_material_detail(db, user, tenant):
        raise HTTPException(status_code=403, detail="Material recommendations need inventory read access")
    return px.finding_subject(finding, order_code, line_code)


@router.post("/predictive/explain", dependencies=[Depends(rate_limit_dependency("heavy"))])
async def explain_prediction(
    body: ExplainIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    if not predictive_ai_text_on(tenant):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    from app.modules.ai_tool.authz import require_ai_access
    from app.modules.ai_tool.policy_eval import evaluate_ai_safety_for_user

    tid, uid = tenant.id, user.id
    await require_ai_access(db, user)
    ok, reason = await evaluate_ai_safety_for_user(
        db,
        user=user,
        tenant=tenant,
        tool_name=EXPLAIN_TOOL,
        module="manufacturing",
        safety_class="READ_ONLY",
        permission_key="ai.tools.production.read",
    )
    if not ok:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason or "AI is not allowed for this data")
    as_of = today_local(tenant)
    # Ownership (404) and the inventory gate (403) come before the daily AI quota is consumed.
    if body.subject == "order":
        from app.modules.mfg_intelligence.delivery_forecast_service import forecast_deliveries

        order = await _get_order(db, tid, body.record_id)
        await enforce_ai_daily_tenant_quota(tenant_id=tid)
        forecast = (await forecast_deliveries(db, tenant, [order], today=as_of, include_details=True))[0]
        subject = px.order_subject(forecast)
    else:
        subject = await _finding_subject(db, tenant, user, body.record_id)
        await enforce_ai_daily_tenant_quota(tenant_id=tid)

    from app.common.gemini_client import generate_text_for_tenant

    raw: str | None = None
    failure: str | None = None
    try:
        raw = await asyncio.wait_for(
            generate_text_for_tenant(db, tid, uid, EXPLAIN_TOOL, px.build_prompt(subject)),
            timeout=px.EXPLAIN_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        failure = "timeout"
        await safe_async_session_rollback(db)
    except Exception:  # noqa: BLE001 - any provider problem falls back to the rule text
        logger.info("mfg_predictive_explain_provider_failed tenant_id=%s", tid)
        failure = "provider_error"
        await safe_async_session_rollback(db)
    answer = None
    if failure is None:
        answer, failure = px.validated_text(raw, subject)
    source = "ai" if answer else "rules"
    await log_ai_event(
        db,
        tenant_id=tid,
        user_id=uid,
        action="MFG_PREDICTIVE_EXPLAIN",
        resource="mfg_intelligence.explain",
        details=f"{body.subject} {body.record_id} {source}"[:300],
        details_json={"subject": body.subject, "record_id": body.record_id, "source": source, "failure": failure},
        decision="allow" if answer else "warn",
    )
    await db.commit()
    return {
        "subject": body.subject,
        "record_id": body.record_id,
        "as_of": as_of,
        "source": source,
        "tag": "AI_TEXT" if answer else "RULES",
        "text": answer["summary"] if answer else subject.rules_text,
        "findings": answer["findings"] if answer else [],
        "rules_text": subject.rules_text,
        "facts": px.facts_out(subject),
        "dates": subject.dates,
        "fallback_reason": failure,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }

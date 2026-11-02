"""Governed AI endpoints.

- Exception agents (flag `ai_exception_agents_enabled`): findings are listed for review; a person
  must confirm before anyone is notified. Every confirm / dismiss is stored and audited.
- Owner brief: counts + optional AI narrative; sending it to managers needs confirmation.
- Dashboard metric cards (flag `ai_dashboard_cards_enabled`): a question picks ONE metric from a
  whitelisted catalog; values come from fixed queries.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import assert_delegate_manager_or_permission
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_ai_dashboard_cards_enabled, is_ai_exception_agents_enabled
from app.database import get_db, safe_async_session_rollback
from app.models import Role, Tenant, User
from app.models.ai_agents import AiAgentDecision
from app.modules.ai_tool.audit import log_ai_event
from app.modules.ai_tool.screen_context import can_access_module
from app.modules.governed_ai.detectors import AGENTS, DETECTORS, sort_findings
from app.modules.governed_ai.metrics import BY_ID, CATALOG, Metric, match_metric
from app.modules.notifications.service import notify_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/governed-ai", tags=["governed-ai"])

AGENT_PERMISSION = {"tna_delay": "merch.access", "lc_expiry": "trade.access", "bom_shortfall": "merch.access"}
NOTIFIED_HIDE_DAYS = 3
DISMISSED_HIDE_DAYS = 7
CONFIRM_PERMISSION = "ai.agents.confirm"
BRIEF_TIMEOUT_SECONDS = 20


def _tenant_guard(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _agents_guard(user: User, tenant: Tenant) -> None:
    _tenant_guard(user, tenant)
    if not is_ai_exception_agents_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FEATURE_DISABLED", "message": "AI exception agents are not enabled for this company."},
        )


def _cards_guard(user: User, tenant: Tenant) -> None:
    _tenant_guard(user, tenant)
    if not is_ai_dashboard_cards_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FEATURE_DISABLED", "message": "Ask-a-metric dashboard cards are not enabled for this company."},
        )


async def _can_confirm(db: AsyncSession, user: User, tenant: Tenant) -> bool:
    try:
        await assert_delegate_manager_or_permission(db, user, tenant.id, permission_key=CONFIRM_PERMISSION)
        return True
    except HTTPException:
        return False


async def _allowed_agents(db: AsyncSession, tenant: Tenant, user: User) -> list[str]:
    return [a for a in AGENTS if await can_access_module(db, tenant, user, AGENT_PERMISSION[a])]


async def _run_agents(db: AsyncSession, tenant_id: int, agents: list[str]) -> list[dict[str, Any]]:
    """Run detectors. Callers must finish permission checks first (a failed detector rolls back)."""
    out: list[dict[str, Any]] = []
    for agent in agents:
        try:
            out.extend((await DETECTORS[agent](db, tenant_id))[:50])
        except Exception:
            # One broken detector must not hide the others.
            logger.exception("governed_ai_detector_failed agent=%s tenant_id=%s", agent, tenant_id)
            await safe_async_session_rollback(db)
    return out


async def _hidden_keys(db: AsyncSession, tenant_id: int) -> set[str]:
    since = datetime.utcnow() - timedelta(days=max(NOTIFIED_HIDE_DAYS, DISMISSED_HIDE_DAYS))
    rows = (
        await db.execute(
            select(AiAgentDecision.exception_key, AiAgentDecision.decision, AiAgentDecision.decided_at).where(
                AiAgentDecision.tenant_id == tenant_id, AiAgentDecision.decided_at >= since
            )
        )
    ).all()
    now = datetime.utcnow()
    hidden: set[str] = set()
    for key, decision, at in rows:
        days = NOTIFIED_HIDE_DAYS if decision == "NOTIFIED" else DISMISSED_HIDE_DAYS
        if at >= now - timedelta(days=days):
            hidden.add(key)
    return hidden


async def _manager_ids(db: AsyncSession, tenant_id: int) -> list[int]:
    return list(
        (
            await db.execute(
                select(User.id)
                .join(Role, Role.id == User.role_id)
                .where(
                    User.tenant_id == tenant_id,
                    User.is_active.is_(True),
                    func.lower(Role.name).in_(("admin", "manager", "owner")),
                )
                .limit(20)
            )
        ).scalars()
    )


async def _recipients(db: AsyncSession, tenant_id: int, finding: dict[str, Any]) -> list[int]:
    assignee = finding.get("assignee_user_id")
    if assignee:
        ok = (
            await db.execute(
                select(User.id).where(User.id == assignee, User.tenant_id == tenant_id, User.is_active.is_(True))
            )
        ).scalar_one_or_none()
        if ok:
            return [ok]
    return await _manager_ids(db, tenant_id)


def _public(f: dict[str, Any], recipients_hint: str) -> dict[str, Any]:
    return {
        **{k: v for k, v in f.items() if k != "assignee_user_id"},
        "suggested_action": {"type": "notify", "label": recipients_hint},
    }


# ---------------------------------------------------------------- exception agents


@router.get("/exceptions")
async def list_exceptions(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _agents_guard(user, tenant)
    tid = tenant.id
    agents = await _allowed_agents(db, tenant, user)
    can_confirm = await _can_confirm(db, user, tenant)
    findings = await _run_agents(db, tid, agents)
    hidden = await _hidden_keys(db, tid)
    visible = [f for f in findings if f["key"] not in hidden]
    counts = {a: sum(1 for f in visible if f["agent"] == a) for a in agents}
    return {
        "agents": [{"id": a, "label": AGENTS[a], "count": counts[a]} for a in agents],
        "can_confirm": can_confirm,
        "hidden_recently": len(findings) - len(visible),
        "items": [
            _public(f, "Notify the assignee" if f.get("assignee_user_id") else "Notify managers")
            for f in sort_findings(visible)
        ],
    }


class ConfirmBody(BaseModel):
    key: str = Field(..., min_length=3, max_length=160)
    decision: Literal["notify", "dismiss"]
    note: str | None = Field(default=None, max_length=500)


@router.post("/exceptions/confirm")
async def confirm_exception(
    body: ConfirmBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _agents_guard(user, tenant)
    tid, uid = tenant.id, user.id
    if not await _can_confirm(db, user, tenant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires admin/manager role or permission '{CONFIRM_PERMISSION}'",
        )
    agent = next((a for a in AGENTS if body.key.startswith(_key_prefix(a))), None)
    if agent is None:
        raise HTTPException(status_code=400, detail="Unknown finding")
    if not await can_access_module(db, tenant, user, AGENT_PERMISSION[agent]):
        raise HTTPException(status_code=403, detail="You cannot act on this finding")
    # Re-detect server-side: never trust a finding sent by the browser.
    current = {f["key"]: f for f in await _run_agents(db, tid, [agent])}
    finding = current.get(body.key)
    if finding is None:
        raise HTTPException(status_code=409, detail="This finding is no longer open. Refresh the list.")

    recipients: list[int] = []
    if body.decision == "notify":
        recipients = [r for r in await _recipients(db, tid, finding) if r != uid]
    note = (body.note or "").strip() or None
    decision = AiAgentDecision(
        tenant_id=tid,
        agent=agent,
        exception_key=body.key,
        decision="NOTIFIED" if body.decision == "notify" else "DISMISSED",
        note=note,
        recipients_count=len(recipients),
        decided_by=uid,
    )
    db.add(decision)
    for rid in recipients:
        notify_user(
            db,
            tenant_id=tid,
            user_id=rid,
            kind="ai_agent",
            title=f"[{AGENTS[agent]}] {finding['title']}"[:200],
            body=(f"{finding['detail']} {finding['recommended_action']}" + (f" Note: {note}" if note else ""))[:1000],
            href=finding.get("href"),
            actor_user_id=uid,
        )
    await log_ai_event(
        db,
        tenant_id=tid,
        user_id=uid,
        action="AGENT_ACTION_CONFIRMED" if body.decision == "notify" else "AGENT_FINDING_DISMISSED",
        resource=f"governed_ai.{agent}",
        details=finding["title"][:300],
        details_json={"key": body.key, "recipients": len(recipients), "note": bool(note)},
        decision="allow",
        approval_status="approved" if body.decision == "notify" else "rejected",
    )
    await db.commit()
    return {"ok": True, "decision": decision.decision, "recipients": len(recipients)}


def _key_prefix(agent: str) -> str:
    return {
        "tna_delay": "tna_action_overdue:",
        "lc_expiry": "trade_lc_expiry_soon:",
        "bom_shortfall": "bom_shortfall:",
    }[agent]


# ---------------------------------------------------------------- owner brief


async def _brief_payload(db: AsyncSession, tenant: Tenant, user: User) -> dict[str, Any]:
    tid = tenant.id
    agents = await _allowed_agents(db, tenant, user)
    brief_metrics = [
        BY_ID[mid]
        for mid in ("open_orders", "late_orders", "orders_due_14d", "vouchers_in_workflow", "open_pos")
        if await can_access_module(db, tenant, user, BY_ID[mid].permission)
    ]
    findings = sort_findings(await _run_agents(db, tid, agents))
    metrics: dict[str, Any] = {}
    for m in brief_metrics:
        try:
            metrics[m.label] = (await m.compute(db, tid))["value"]
        except Exception:
            logger.exception("governed_ai_brief_metric_failed metric=%s", m.id)
            await safe_async_session_rollback(db)
    counts = {AGENTS[a]: sum(1 for f in findings if f["agent"] == a) for a in agents}
    highlights = [{"title": f["title"], "detail": f["detail"], "href": f.get("href"), "severity": f["severity"]} for f in findings[:5]]
    lines = [f"{k}: {v}" for k, v in metrics.items()]
    lines += [f"{k} exceptions: {v}" for k, v in counts.items()]
    rules_text = "Today: " + "; ".join(lines) + "." if lines else "Nothing to report."
    if highlights:
        rules_text += " Top items: " + " | ".join(h["title"] for h in highlights[:3]) + "."
    return {"metrics": metrics, "exception_counts": counts, "highlights": highlights, "rules_text": rules_text}


@router.get("/owner-brief")
async def owner_brief(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    use_ai: bool = True,
):
    _agents_guard(user, tenant)
    tid, uid = tenant.id, user.id
    payload = await _brief_payload(db, tenant, user)
    narrative, source = payload["rules_text"], "rules"
    if use_ai:
        try:
            from app.common.gemini_client import generate_text_for_tenant

            prompt = (
                "Write a 4-6 sentence morning brief for the owner of a garment factory / buying house. "
                "Use ONLY these figures; do not invent numbers. Mention the most urgent items first.\n"
                f"Figures: {payload['metrics']}\nExceptions: {payload['exception_counts']}\n"
                f"Top items: {[h['title'] + ' — ' + h['detail'] for h in payload['highlights']]}"
            )
            text = await asyncio.wait_for(
                generate_text_for_tenant(db, tid, uid, "brief", prompt), timeout=BRIEF_TIMEOUT_SECONDS
            )
            if text and len(text.strip()) > 20:
                narrative, source = text.strip(), "ai"
        except Exception:
            logger.info("governed_ai_brief_ai_unavailable tenant_id=%s", tid)
            await safe_async_session_rollback(db)
    await log_ai_event(
        db,
        tenant_id=tid,
        user_id=uid,
        action="OWNER_BRIEF_GENERATED",
        resource="governed_ai.owner_brief",
        details=narrative[:300],
        details_json={"source": source},
        decision="allow",
    )
    await db.commit()
    return {**payload, "narrative": narrative, "source": source, "generated_at": datetime.utcnow().isoformat() + "Z"}


class SendBriefBody(BaseModel):
    narrative: str = Field(..., min_length=10, max_length=4000)


@router.post("/owner-brief/send")
async def send_owner_brief(
    body: SendBriefBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _agents_guard(user, tenant)
    if not await _can_confirm(db, user, tenant):
        raise HTTPException(status_code=403, detail=f"Requires admin/manager role or permission '{CONFIRM_PERMISSION}'")
    recipients = [r for r in await _manager_ids(db, tenant.id) if r != user.id]
    for rid in recipients:
        notify_user(
            db,
            tenant_id=tenant.id,
            user_id=rid,
            kind="ai_brief",
            title="Owner brief",
            body=body.narrative[:1000],
            href="/app/ai/agents",
            actor_user_id=user.id,
        )
    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="OWNER_BRIEF_SENT",
        resource="governed_ai.owner_brief",
        details=body.narrative[:300],
        details_json={"recipients": len(recipients)},
        decision="allow",
        approval_status="approved",
    )
    await db.commit()
    return {"ok": True, "recipients": len(recipients)}


# ---------------------------------------------------------------- metric cards


async def _allowed_metrics(db: AsyncSession, tenant: Tenant, user: User) -> list[Metric]:
    return [m for m in CATALOG if await can_access_module(db, tenant, user, m.permission)]


def _metric_meta(m: Metric) -> dict[str, Any]:
    return {"id": m.id, "label": m.label, "description": m.description, "unit": m.unit, "href": m.href}


@router.get("/metrics")
async def list_metrics(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _cards_guard(user, tenant)
    return {"items": [_metric_meta(m) for m in await _allowed_metrics(db, tenant, user)]}


async def _value(db: AsyncSession, tenant_id: int, m: Metric) -> dict[str, Any]:
    try:
        return await m.compute(db, tenant_id)
    except Exception:
        logger.exception("governed_ai_metric_failed metric=%s tenant_id=%s", m.id, tenant_id)
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=503, detail="This figure could not be calculated right now") from None


@router.get("/metrics/{metric_id}")
async def get_metric(
    metric_id: str,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _cards_guard(user, tenant)
    m = BY_ID.get(metric_id)
    if m is None or not await can_access_module(db, tenant, user, m.permission):
        raise HTTPException(status_code=404, detail="Metric not found")
    return {**_metric_meta(m), **await _value(db, tenant.id, m)}


class AskBody(BaseModel):
    question: str = Field(..., min_length=2, max_length=300)


@router.post("/metrics/ask")
async def ask_metric(
    body: AskBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _cards_guard(user, tenant)
    tid, uid = tenant.id, user.id
    allowed = await _allowed_metrics(db, tenant, user)
    allowed_ids = {m.id for m in allowed}
    metric, suggestions = match_metric(body.question, allowed_ids)
    method = "keywords"
    if metric is None and allowed:
        try:
            from app.common.gemini_client import generate_text_for_tenant

            menu = "\n".join(f"{m.id}: {m.label} — {m.description}" for m in allowed)
            prompt = (
                "Pick the ONE metric id that best answers the question, or reply NONE. "
                "Reply with the id only.\n"
                f"Metrics:\n{menu}\nQuestion: {body.question}"
            )
            raw = await asyncio.wait_for(
                generate_text_for_tenant(db, tid, uid, "brief", prompt), timeout=BRIEF_TIMEOUT_SECONDS
            )
            pick = (raw or "").strip().split()[0].strip("`'\".,") if raw and raw.strip() else ""
            if pick in allowed_ids:
                metric, method = BY_ID[pick], "ai"
        except Exception:
            await safe_async_session_rollback(db)
    await log_ai_event(
        db,
        tenant_id=tid,
        user_id=uid,
        action="METRIC_QUESTION",
        resource="governed_ai.metrics",
        details=body.question[:300],
        details_json={"metric_id": metric.id if metric else None, "method": method},
        decision="allow" if metric else "warn",
    )
    await db.commit()
    if metric is None:
        return {
            "matched": False,
            "message": "I can only answer from the metric list. Try one of these.",
            "suggestions": [_metric_meta(BY_ID[i]) for i in suggestions if i in BY_ID],
        }
    return {
        "matched": True,
        "method": method,
        "metric": {**_metric_meta(metric), **await _value(db, tid, metric)},
        "suggestions": [_metric_meta(BY_ID[i]) for i in suggestions if i in BY_ID],
    }

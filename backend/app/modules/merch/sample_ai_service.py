"""Governed AI plan proposals for merch samples (proposal → human apply)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GarmentStyle, User
from app.models.merch import MerchSampleAiProposal, MerchSampleRequest, MerchSampleTask
from app.modules.ai_tool.audit import log_ai_event
from app.modules.ai_tool.llm_provider import get_llm_provider
from app.modules.master_data_ai.gateway import invoke_structured_llm


class SamplePlanTaskItem(BaseModel):
    step_name: str = Field(..., min_length=1, max_length=255)
    sort_order: int = Field(0, ge=0)
    days_from_start: int = Field(0, ge=0, description="Day offset from schedule start (0 = first day)")
    duration_days: int = Field(1, ge=1, le=90)


class SamplePlanLlmOut(BaseModel):
    tasks: list[SamplePlanTaskItem] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list, max_length=8)


def _fallback_plan(sample_type: str, target: date | None) -> SamplePlanLlmOut:
    base = [
        ("Pattern / marker", 0, 2),
        ("Cutting", 2, 2),
        ("Sewing", 4, 4),
        ("Finishing & QC", 8, 2),
        ("Dispatch / courier", 10, 1),
    ]
    tasks = [
        SamplePlanTaskItem(
            step_name=name,
            sort_order=i,
            days_from_start=off,
            duration_days=dur,
        )
        for i, (name, off, dur) in enumerate(base)
    ]
    notes: list[str] = []
    if target:
        notes.append(f"Target completion {target.isoformat()} — adjust dates in the task list after apply.")
    notes.append(f"Sample type: {sample_type} — verify steps match your factory SOP.")
    return SamplePlanLlmOut(tasks=tasks, risk_notes=notes[:8])


async def create_plan_proposal(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    sample: MerchSampleRequest,
) -> tuple[MerchSampleAiProposal, SamplePlanLlmOut]:
    """Call LLM for structured plan; persist proposal row (pending)."""
    style = await db.get(GarmentStyle, sample.style_id)
    style_code = style.style_code if style and style.tenant_id == tenant_id else "?"
    style_name = (style.name or "") if style else ""

    target = sample.target_date
    start_hint = date.today()
    prompt = f"""You are a garment factory sample room planner. Propose a realistic sequence of production steps.
Rules:
- Return JSON-matching schema only: tasks with step_name, sort_order, days_from_start, duration_days.
- Use 4–8 tasks. days_from_start is cumulative offset from schedule start (day 0 = first day of work).
- duration_days is how many calendar days that step typically needs.
- No PII; style is identified only by codes below.
- risk_notes: up to 5 short strings (capacity, material, courier risks).

Context:
- sample_type: {sample.sample_type}
- sample_subtype: {sample.sample_subtype or "n/a"}
- style_code: {style_code}
- style_name: {style_name[:120]}
- target_date: {target.isoformat() if target else "not set"}
- schedule_start_hint: {start_hint.isoformat()}
"""
    provider = get_llm_provider()
    parsed, err, prov_name = await invoke_structured_llm(
        provider,
        operation="merch_sample_plan",
        prompt=prompt,
        response_model=SamplePlanLlmOut,
        tenant_id=tenant_id,
        request_id=f"sample-{sample.id}",
    )
    out = parsed if parsed and not err and parsed.tasks else _fallback_plan(sample.sample_type, target)
    if err or not parsed or not parsed.tasks:
        out = _fallback_plan(sample.sample_type, target)

    proposal_payload: dict[str, Any] = {
        "tasks": [t.model_dump() for t in out.tasks],
        "risk_notes": out.risk_notes,
        "model_note": "llm" if parsed and parsed.tasks and not err else f"fallback_stub_or_error:{err or 'empty'}",
        "provider": prov_name,
    }
    row = MerchSampleAiProposal(
        tenant_id=tenant_id,
        sample_request_id=sample.id,
        created_by_id=user.id,
        proposal_json=proposal_payload,
        status="pending",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="MERCH_SAMPLE_PLAN_PROPOSAL",
        severity="INFO",
        resource=f"merch_sample:{sample.id}",
        details_json={"proposal_id": row.id, "provider": prov_name},
        decision="allow",
    )
    await db.commit()

    return row, out


async def apply_plan_proposal(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    sample: MerchSampleRequest,
    proposal_id: int,
    schedule_start: date | None = None,
) -> tuple[list[MerchSampleTask], MerchSampleAiProposal]:
    """Materialize proposal tasks as MerchSampleTask rows; mark proposal applied."""
    prop = await db.get(MerchSampleAiProposal, proposal_id)
    if not prop or prop.tenant_id != tenant_id or prop.sample_request_id != sample.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")
    if prop.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Proposal already used or rejected")

    payload = prop.proposal_json or {}
    raw_tasks = payload.get("tasks") or []
    start = schedule_start or date.today()

    created: list[MerchSampleTask] = []
    for i, t in enumerate(raw_tasks):
        if not isinstance(t, dict):
            continue
        name = str(t.get("step_name") or "").strip()
        if not name:
            continue
        sort_order = int(t.get("sort_order") if t.get("sort_order") is not None else i)
        d0 = int(t.get("days_from_start") or 0)
        dur = int(t.get("duration_days") or 1)
        dur = max(1, min(90, dur))
        ps = start + timedelta(days=d0)
        pe = ps + timedelta(days=dur - 1)
        row = MerchSampleTask(
            tenant_id=tenant_id,
            sample_request_id=sample.id,
            sort_order=sort_order,
            step_name=name[:255],
            planned_start=ps,
            planned_end=pe,
            pct_complete=Decimal("0"),
        )
        db.add(row)
        created.append(row)

    prop.status = "applied"
    prop.applied_at = datetime.utcnow()
    prop.applied_by_id = user.id

    await db.commit()
    for r in created:
        await db.refresh(r)

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="MERCH_SAMPLE_PLAN_APPLY",
        severity="INFO",
        resource=f"merch_sample:{sample.id}",
        details_json={"proposal_id": proposal_id, "tasks_created": len(created)},
        decision="allow",
    )
    await db.commit()

    return created, prop

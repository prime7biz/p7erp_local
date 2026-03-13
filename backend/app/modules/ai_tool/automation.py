from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Followup, User
from app.modules.ai_tool import repository
from app.modules.ai_tool.authz import has_tool_permission
from app.modules.ai_tool.security import confirmation_token_hash, confirmation_token_last4, normalize_confirmation_token


@dataclass(slots=True)
class AutomationRuleTemplate:
    rule_code: str
    action_key: str
    label: str
    permission_key: str
    requires_confirmation: bool = True
    is_enabled: bool = True
    policy_json: dict[str, Any] | None = None


@dataclass(slots=True)
class ActionProposal:
    action_key: str
    rule_code: str
    label: str
    preview_text: str
    risk_level: str
    requires_confirmation: bool
    input_json: dict[str, Any]
    blocked_reason: str | None = None


RULES: dict[str, AutomationRuleTemplate] = {
    "DRAFT_NOTE_TASK": AutomationRuleTemplate(
        rule_code="DRAFT_NOTE_TASK",
        action_key="draft_note_task",
        label="Create draft note/task",
        permission_key="ai.tools.automation.draft",
        policy_json={"write_scope": "ai_only"},
    ),
    "DRAFT_REMINDER_FOLLOWUP": AutomationRuleTemplate(
        rule_code="DRAFT_REMINDER_FOLLOWUP",
        action_key="draft_reminder_followup",
        label="Create draft reminder/follow-up",
        permission_key="ai.tools.automation.followup",
        policy_json={"write_scope": "order_followup_draft"},
    ),
    "DRAFT_MESSAGE": AutomationRuleTemplate(
        rule_code="DRAFT_MESSAGE",
        action_key="generate_message_draft",
        label="Generate message/email draft",
        permission_key="ai.tools.automation.draft",
        policy_json={"write_scope": "ai_only"},
    ),
    "DRAFT_SUMMARY": AutomationRuleTemplate(
        rule_code="DRAFT_SUMMARY",
        action_key="prepare_business_summary_draft",
        label="Prepare draft business summary",
        permission_key="ai.tools.automation.draft",
        policy_json={"write_scope": "ai_only"},
    ),
}


RESTRICTED_KEYWORDS = {"approve", "approval", "post voucher", "release payment", "delete", "finalize", "submit payroll"}


async def ensure_default_rules(db: AsyncSession, *, tenant_id: int) -> None:
    for template in RULES.values():
        existing = await repository.get_automation_rule_by_code(db, tenant_id=tenant_id, rule_code=template.rule_code)
        if existing:
            continue
        await repository.create_automation_rule(
            db,
            tenant_id=tenant_id,
            rule_code=template.rule_code,
            action_key=template.action_key,
            label=template.label,
            is_enabled=template.is_enabled,
            requires_confirmation=template.requires_confirmation,
            permission_key=template.permission_key,
            policy_json=template.policy_json or {},
        )


def _extract_order_id(prompt: str) -> int | None:
    match = re.search(r"\border\s*#?\s*(\d+)\b", prompt.lower())
    if match:
        return int(match.group(1))
    return None


def _detect_action(prompt: str) -> ActionProposal:
    text = prompt.lower().strip()
    if any(k in text for k in RESTRICTED_KEYWORDS):
        return ActionProposal(
            action_key="blocked",
            rule_code="BLOCKED",
            label="Restricted action",
            preview_text="This action is restricted and cannot be automated.",
            risk_level="HIGH",
            requires_confirmation=True,
            input_json={},
            blocked_reason="Sensitive workflow action is not allowed in AI automation phase.",
        )
    if any(k in text for k in {"follow up", "follow-up", "reminder", "remind"}):
        order_id = _extract_order_id(prompt)
        if order_id is None:
            return ActionProposal(
                action_key="draft_reminder_followup",
                rule_code="DRAFT_REMINDER_FOLLOWUP",
                label="Create draft reminder/follow-up",
                preview_text="Cannot create follow-up draft without an order ID in the request.",
                risk_level="MEDIUM",
                requires_confirmation=True,
                input_json={"order_id": None, "prompt": prompt},
                blocked_reason="Missing order ID. Example: 'Create follow-up for order 123'.",
            )
        due_date = date.today() + timedelta(days=2)
        return ActionProposal(
            action_key="draft_reminder_followup",
            rule_code="DRAFT_REMINDER_FOLLOWUP",
            label="Create draft reminder/follow-up",
            preview_text=f"Will create a draft follow-up for order {order_id} due on {due_date.isoformat()}",
            risk_level="MEDIUM",
            requires_confirmation=True,
            input_json={"order_id": order_id, "due_date": due_date.isoformat(), "prompt": prompt},
        )
    if any(k in text for k in {"email", "message", "note", "reply"}):
        return ActionProposal(
            action_key="generate_message_draft",
            rule_code="DRAFT_MESSAGE",
            label="Generate message/email draft",
            preview_text="Will generate a draft message for review. No record will be posted automatically.",
            risk_level="LOW",
            requires_confirmation=True,
            input_json={"prompt": prompt},
        )
    if any(k in text for k in {"summary", "brief", "recap"}):
        return ActionProposal(
            action_key="prepare_business_summary_draft",
            rule_code="DRAFT_SUMMARY",
            label="Prepare draft business summary",
            preview_text="Will prepare a draft business summary text only.",
            risk_level="LOW",
            requires_confirmation=True,
            input_json={"prompt": prompt},
        )
    return ActionProposal(
        action_key="draft_note_task",
        rule_code="DRAFT_NOTE_TASK",
        label="Create draft note/task",
        preview_text="Will prepare a draft note/task from this request.",
        risk_level="LOW",
        requires_confirmation=True,
        input_json={"prompt": prompt},
    )


async def propose_action(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    prompt: str,
    request_id: str,
    session_id: int | None,
    message_id: int | None,
):
    await ensure_default_rules(db, tenant_id=tenant_id)
    proposal = _detect_action(prompt)
    if proposal.rule_code == "BLOCKED":
        return None, proposal, None
    rule = await repository.get_automation_rule_by_code(db, tenant_id=tenant_id, rule_code=proposal.rule_code)
    if not rule or not rule.is_enabled:
        proposal.blocked_reason = "Action rule is disabled by policy."
        return None, proposal, None

    permission_key = rule.permission_key or "ai.tools.automation.draft"
    allowed = await has_tool_permission(db, user, permission_key)
    if not allowed:
        proposal.blocked_reason = f"Missing permission: {permission_key}"
        return rule, proposal, None

    token = uuid4().hex[:16].upper()
    token_normalized = normalize_confirmation_token(token)
    run = await repository.create_action_run(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        session_id=session_id,
        message_id=message_id,
        rule_id=rule.id,
        request_id=request_id,
        action_key=proposal.action_key,
        status="PROPOSED",
        requires_confirmation=rule.requires_confirmation,
        confirmation_token=None,
        confirmation_token_hash=confirmation_token_hash(token_normalized),
        confirmation_token_last4=confirmation_token_last4(token_normalized),
        risk_level=proposal.risk_level,
        prompt_text=prompt,
        preview_text=proposal.preview_text,
        input_json=proposal.input_json,
    )
    setattr(run, "_plain_confirmation_token", token_normalized)
    return rule, proposal, run


async def confirm_and_execute_action(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    action_run_id: int,
    confirmation_token: str,
) -> tuple[Any, dict[str, Any] | None, str | None]:
    run = await repository.get_action_run(db, tenant_id=tenant_id, action_run_id=action_run_id)
    if not run:
        return None, None, "Action run not found"
    if run.user_id != user.id:
        return run, None, "You cannot confirm another user's action run"
    if run.status != "PROPOSED":
        return run, None, f"Action run status is {run.status}; cannot confirm now"
    token_normalized = normalize_confirmation_token(confirmation_token)
    token_hash = confirmation_token_hash(token_normalized)
    # Backward compatibility: allow plaintext token rows created before hashing rollout.
    plaintext_ok = bool(run.confirmation_token and run.confirmation_token == token_normalized)
    hashed_ok = bool(run.confirmation_token_hash and run.confirmation_token_hash == token_hash)
    if not (plaintext_ok or hashed_ok):
        return run, None, "Invalid confirmation token"

    await repository.mark_action_run_confirmed(db, row=run)

    output: dict[str, Any]
    try:
        if run.action_key == "draft_reminder_followup":
            order_id = int((run.input_json or {}).get("order_id") or 0)
            if order_id <= 0:
                raise ValueError("Missing order ID in action input")
            order_row = await repository.get_order_by_id(db, tenant_id=tenant_id, order_id=order_id)
            if not order_row:
                raise ValueError("Order not found in tenant scope")
            due_date_raw = (run.input_json or {}).get("due_date")
            due = date.fromisoformat(str(due_date_raw)) if due_date_raw else None
            row = Followup(
                tenant_id=tenant_id,
                order_id=order_id,
                title="AI Draft Reminder Follow-up",
                due_date=due,
                status="OPEN",
                severity="MEDIUM",
                notes=f"[AI-DRAFT] {run.prompt_text[:500]}",
            )
            db.add(row)
            await db.flush()
            output = {"created_followup_id": row.id, "order_id": order_id, "mode": "draft_record_created"}
        elif run.action_key == "generate_message_draft":
            output = {"draft_message": f"Draft message:\n{run.prompt_text}", "mode": "draft_text_only"}
        elif run.action_key == "prepare_business_summary_draft":
            output = {"draft_summary": f"Draft business summary:\n{run.prompt_text}", "mode": "draft_text_only"}
        else:
            output = {"draft_note": f"Draft note/task:\n{run.prompt_text}", "mode": "draft_text_only"}
        await repository.complete_action_run(db, row=run, status="EXECUTED", output_json=output)
        return run, output, None
    except Exception as exc:
        await repository.complete_action_run(db, row=run, status="FAILED", output_json={}, error_text=str(exc))
        return run, None, str(exc)

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_tool import AiAuditLog


def _canonical_action_name(action: str) -> str:
    value = (action or "").strip().upper()
    if not value:
        return "AI_EVENT"
    return value


def _derive_decision(action: str, severity: str) -> str:
    lowered = (action or "").lower()
    if "blocked" in lowered or "denied" in lowered:
        return "deny"
    if "failed" in lowered or "error" in lowered:
        return "error"
    if (severity or "").upper() in {"WARN", "WARNING"}:
        return "warn"
    return "allow"


async def log_ai_event(
    db: AsyncSession,
    *,
    tenant_id: int,
    action: str,
    severity: str = "INFO",
    user_id: int | None = None,
    session_id: int | None = None,
    message_id: int | None = None,
    tool_invocation_id: int | None = None,
    request_id: str | None = None,
    resource: str | None = None,
    details: str | None = None,
    details_json: dict | None = None,
    decision: str | None = None,
    reason_code: str | None = None,
    error_category: str | None = None,
) -> AiAuditLog:
    merged_details: dict[str, Any] = {}
    if isinstance(details_json, dict):
        merged_details.update(details_json)
    merged_details["decision"] = (decision or _derive_decision(action, severity)).lower()
    if reason_code:
        merged_details["reason_code"] = reason_code
    if error_category:
        merged_details["error_category"] = error_category

    row = AiAuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        message_id=message_id,
        tool_invocation_id=tool_invocation_id,
        request_id=request_id,
        action=_canonical_action_name(action),
        severity=severity,
        resource=resource,
        details=details,
        details_json=merged_details or None,
    )
    db.add(row)
    await db.flush()
    return row

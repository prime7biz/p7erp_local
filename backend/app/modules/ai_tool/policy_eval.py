"""Tenant / role AI permission policies (Phase-2)."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant, User
from app.models.ai_tool import AiPermissionPolicy
from app.modules.ai_tool.authz import has_tool_permission

_SAFETY_RANK = {"READ_ONLY": 1, "DRAFT_ONLY": 2, "COMMIT_REQUIRED": 3, "*": 99}


def _rank_safety(s: str) -> int:
    return _SAFETY_RANK.get((s or "READ_ONLY").upper(), 1)


def _matches(pattern: str, value: str) -> bool:
    p = (pattern or "*").strip()
    if p == "*":
        return True
    return p.lower() == (value or "").lower()


async def evaluate_ai_policy(
    db: AsyncSession,
    *,
    user: User,
    tenant: Tenant,
    tool_name: str,
    module: str,
    safety_class: str,
) -> tuple[bool, str | None]:
    """
    Returns (allowed, denial_reason). Empty policy table = no extra restrictions here
    (caller should still use has_tool_permission for tool keys).
    """
    flags = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    if flags.get("ai_enabled") is False:
        return False, "AI is disabled for this tenant."

    mods = flags.get("ai_modules_enabled")
    if isinstance(mods, list) and mods and module:
        if module.lower() not in {str(m).lower() for m in mods}:
            return False, f"AI module '{module}' is not enabled for this tenant."

    max_s = flags.get("ai_max_safety_class")
    if isinstance(max_s, str) and max_s.strip():
        if _rank_safety(safety_class) > _rank_safety(max_s):
            return False, f"Action exceeds tenant max safety class ({max_s})."

    q = await db.execute(
        select(AiPermissionPolicy).where(
            AiPermissionPolicy.tenant_id == tenant.id,
            AiPermissionPolicy.is_active.is_(True),
            or_(AiPermissionPolicy.role_id.is_(None), AiPermissionPolicy.role_id == user.role_id),
        )
    )
    policies = list(q.scalars().all())
    if not policies:
        return True, None

    matches = [
        p
        for p in policies
        if _matches(p.module, module) and _matches(p.tool_name, tool_name)
    ]
    if not matches:
        return True, None

    matches.sort(key=lambda p: p.priority, reverse=True)
    top = matches[0]
    if top.action == "deny":
        return False, "Denied by tenant AI permission policy."

    allowed_max = (top.safety_class_allowed or "*").upper()
    if allowed_max != "*" and _rank_safety(safety_class) > _rank_safety(allowed_max):
        return False, f"Policy allows at most {allowed_max} for this tool/module."

    return True, None


async def evaluate_ai_safety_for_user(
    db: AsyncSession,
    *,
    user: User,
    tenant: Tenant,
    tool_name: str,
    module: str,
    safety_class: str,
    permission_key: str,
) -> tuple[bool, str | None]:
    """Policy matrix + legacy has_tool_permission (backward compatible)."""
    ok, reason = await evaluate_ai_policy(
        db, user=user, tenant=tenant, tool_name=tool_name, module=module, safety_class=safety_class
    )
    if not ok:
        return False, reason

    if not await has_tool_permission(db, user, permission_key):
        return False, "Missing tool permission."

    return True, None

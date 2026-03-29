"""RBAC for order AI — Role.permissions JSON; missing key => allow."""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.modules.ai_tool.authz import can_use_ai_module, get_user_role_scoped_to_tenant

OrderAiCapability = Literal[
    "extract",
    "enrich",
    "validate",
    "validate_execution",
    "planning_risk_check",
    "atp_ctp_summary",
    "dedupe",
    "summary",
    "next_actions",
    "audit",
    "planning_audit",
    "simulation_audit",
    "capacity_bottleneck_scan",
    "what_if_simulation",
    "promise_sensitivity_check",
    "execution_planning_summary",
    "apply_suggestions",
    "discard_suggestions",
]

_CAP_PERMISSION_KEY: dict[OrderAiCapability, str] = {
    "extract": "orders.ai.extract",
    "enrich": "orders.ai.enrich",
    "validate": "orders.ai.validate",
    "validate_execution": "orders.ai.validate_execution",
    "planning_risk_check": "orders.ai.planning_risk_check",
    "atp_ctp_summary": "orders.ai.atp_ctp_summary",
    "dedupe": "orders.ai.dedupe",
    "summary": "orders.ai.summary",
    "next_actions": "orders.ai.next_actions",
    "audit": "orders.ai.audit",
    "planning_audit": "orders.ai.planning_audit",
    "simulation_audit": "orders.ai.simulation_audit",
    "capacity_bottleneck_scan": "orders.ai.capacity_bottleneck_scan",
    "what_if_simulation": "orders.ai.what_if_simulation",
    "promise_sensitivity_check": "orders.ai.promise_sensitivity_check",
    "execution_planning_summary": "orders.ai.execution_planning_summary",
    "apply_suggestions": "orders.ai.apply_suggestions",
    "discard_suggestions": "orders.ai.discard_suggestions",
}

_ROLE_ALLOW_ALL = {
    "admin",
    "manager",
    "owner",
    "super_admin",
    "superadmin",
}


def _permission_truthy(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "allow", "enabled", "read", "write"}
    if isinstance(value, (int, float)):
        return value > 0
    if isinstance(value, dict):
        if "enabled" in value:
            return _permission_truthy(value.get("enabled"))
        if "read" in value:
            return _permission_truthy(value.get("read"))
    return False


async def require_order_ai_capability(db: AsyncSession, user: User, capability: OrderAiCapability) -> None:
    if not await can_use_ai_module(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AI_FORBIDDEN", "message": "Your role cannot use AI features."},
        )
    role = await get_user_role_scoped_to_tenant(db, user, user.tenant_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AI_FORBIDDEN", "message": "No role assigned for this tenant."},
        )
    role_name = (role.name or "").strip().lower()
    if role_name in _ROLE_ALLOW_ALL:
        return

    perms = role.permissions or {}
    pkey = _CAP_PERMISSION_KEY[capability]
    if pkey in perms and not _permission_truthy(perms[pkey]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AI_CAPABILITY_DENIED", "message": f"Permission {pkey} is disabled for your role."},
        )

    scope = perms.get("orders.ai")
    if isinstance(scope, dict):
        nested = scope.get(capability)
        if nested is not None and not _permission_truthy(nested):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "AI_CAPABILITY_DENIED", "message": "This order AI action is disabled for your role."},
            )
        if nested is not None and _permission_truthy(nested):
            return

    if isinstance(scope, dict) and "enabled" in scope and not _permission_truthy(scope.get("enabled")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AI_CAPABILITY_DENIED", "message": "Order AI is disabled for your role."},
        )

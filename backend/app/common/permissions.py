"""Canonical internal RBAC registry and permission checks (tenant staff roles)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.tenant_feature_keys import RBAC_MODE_ENFORCE, RBAC_MODE_OFF, get_tenant_rbac_mode
from app.database import get_db
from app.models import Role, Tenant, User

logger = logging.getLogger(__name__)

# --- Material control & AP governance (optional JSON on Role.permissions) ---
PERMISSION_BOM_PRICE_OVERRIDE = "bom.price_override"
PERMISSION_INVENTORY_NON_PO_RECEIPT_APPROVE = "inventory.non_po_receipt_approve"
PERMISSION_INVENTORY_OVER_RECEIPT_APPROVE = "inventory.over_receipt_approve"
PERMISSION_INVENTORY_OVER_ISSUE_APPROVE = "inventory.over_issue_approve"
PERMISSION_INVENTORY_PROCESS_ORDER_APPROVE = "inventory.process_order_approve"
PERMISSION_FINANCE_AP_POSTING_APPROVE = "finance.ap_posting_approve"

MATERIAL_CONTROL_GOVERNANCE_KEYS: list[dict[str, str]] = [
    {
        "key": PERMISSION_BOM_PRICE_OVERRIDE,
        "label": "Override BOM expected unit price after BOM is approved/frozen",
        "group": "Material control",
    },
    {
        "key": PERMISSION_INVENTORY_NON_PO_RECEIPT_APPROVE,
        "label": "Post goods receipt (receive) for non-PO GRNs",
        "group": "Material control",
    },
    {
        "key": PERMISSION_INVENTORY_OVER_RECEIPT_APPROVE,
        "label": "Receive quantities above PO line pending balance",
        "group": "Material control",
    },
    {
        "key": PERMISSION_INVENTORY_OVER_ISSUE_APPROVE,
        "label": "Approve production material issues above standard tolerance",
        "group": "Material control",
    },
    {
        "key": PERMISSION_INVENTORY_PROCESS_ORDER_APPROVE,
        "label": "Approve received process orders (final sign-off)",
        "group": "Material control",
    },
    {
        "key": PERMISSION_FINANCE_AP_POSTING_APPROVE,
        "label": "Post vendor bills to AP (book GRNI clearing)",
        "group": "Finance",
    },
]

# Module id -> { label, access_key, submodules: { sub_id -> { label, levels } } }
PERMISSION_REGISTRY: dict[str, Any] = {
    "merch": {
        "label": "Merchandising",
        "access_key": "merch.access",
        "submodules": {
            "inquiries": {"label": "Inquiries", "levels": ["read", "write", "edit", "approve"]},
            "quotations": {"label": "Quotations", "levels": ["read", "write", "edit", "approve"]},
            "orders": {"label": "Orders", "levels": ["read", "write", "edit", "approve"]},
            "pi": {"label": "Proforma invoices", "levels": ["read", "write", "edit", "approve"]},
            "styles": {"label": "Styles / BOM", "levels": ["read", "write", "edit", "approve"]},
            "customers": {"label": "Customers", "levels": ["read", "write", "edit", "approve"]},
        },
    },
    "inventory": {
        "label": "Inventory",
        "access_key": "inventory.access",
        "submodules": {
            "items": {"label": "Items", "levels": ["read", "write", "edit", "approve"]},
            "warehouses": {"label": "Warehouses", "levels": ["read", "write", "edit"]},
            "transfers": {"label": "Transfers", "levels": ["read", "write", "edit", "approve"]},
            "adjustments": {"label": "Adjustments", "levels": ["read", "write", "edit", "approve"]},
        },
    },
    "production": {
        "label": "Production",
        "access_key": "production.access",
        "submodules": {
            "planning": {"label": "Planning", "levels": ["read", "write", "edit", "approve"]},
            "lines": {"label": "Lines / operations", "levels": ["read", "write", "edit"]},
            "reports": {"label": "Reports", "levels": ["read"]},
        },
    },
    "finance": {
        "label": "Finance",
        "access_key": "finance.access",
        "submodules": {
            "accounts": {"label": "Accounts", "levels": ["read", "write", "edit", "approve"]},
            "journals": {"label": "Journals", "levels": ["read", "write", "edit", "approve"]},
            "invoices": {"label": "Invoices", "levels": ["read", "write", "edit", "approve"]},
            "payments": {"label": "Payments", "levels": ["read", "write", "edit", "approve"]},
            "reports": {"label": "Reports", "levels": ["read"]},
        },
    },
    "hr": {
        "label": "HR",
        "access_key": "hr.access",
        "submodules": {
            "employees": {"label": "Employees", "levels": ["read", "write", "edit", "approve"]},
            "attendance": {"label": "Attendance", "levels": ["read", "write", "edit"]},
            "payroll": {"label": "Payroll", "levels": ["read", "write", "edit", "approve"]},
        },
    },
    "trade": {
        "label": "Trade",
        "access_key": "trade.access",
        "submodules": {
            "cases": {"label": "Trade cases", "levels": ["read", "write", "edit", "approve"]},
            "documents": {"label": "Documents", "levels": ["read", "write", "edit"]},
            "lc": {"label": "Letters of credit", "levels": ["read", "write", "edit", "approve"]},
        },
    },
    "settings": {
        "label": "Settings",
        "access_key": "settings.access",
        "submodules": {
            "users": {"label": "Users", "levels": ["read", "write", "edit"]},
            "roles": {"label": "Roles", "levels": ["read", "write", "edit"]},
            "company": {"label": "Company profile", "levels": ["read", "edit"]},
            "external": {"label": "External access", "levels": ["read", "write", "edit"]},
        },
    },
    "reports": {
        "label": "Reports",
        "access_key": "reports.access",
        "submodules": {
            "all": {"label": "All reports", "levels": ["read", "export"]},
        },
    },
    "ai": {
        "label": "AI tools",
        "access_key": "ai.access",
        "submodules": {
            "all": {"label": "AI features", "levels": ["read", "write"]},
        },
    },
    "facility": {
        "label": "Loans & Facilities",
        "access_key": "facility.access",
        "submodules": {
            "facilities": {"label": "Facilities", "levels": ["read", "write", "edit", "approve"]},
            "utilizations": {"label": "Utilizations / Drawdowns", "levels": ["read", "write", "edit", "approve"]},
            "accrual": {"label": "Interest Accrual", "levels": ["read", "write"]},
            "repayments": {"label": "Repayments", "levels": ["read", "write", "approve"]},
            "reports": {"label": "Facility Reports", "levels": ["read", "export"]},
        },
    },
    "business_overview": {
        "label": "Business Overview",
        "access_key": "business_overview.access",
        "submodules": {
            "dashboard": {"label": "Dashboard", "levels": ["read"]},
            "ai_insights": {"label": "AI Insights", "levels": ["read"]},
            "reports": {"label": "Reports", "levels": ["read", "export"]},
        },
    },
}


def permissions_registry_api_payload() -> dict[str, Any]:
    """JSON-safe tree for GET /settings/permissions-registry."""
    modules_out: list[dict[str, Any]] = []
    for mid, m in PERMISSION_REGISTRY.items():
        subs_out: list[dict[str, Any]] = []
        for sid, sm in (m.get("submodules") or {}).items():
            subs_out.append(
                {
                    "id": sid,
                    "label": sm.get("label", sid),
                    "levels": list(sm.get("levels") or []),
                }
            )
        modules_out.append(
            {
                "id": mid,
                "label": m.get("label", mid),
                "access_key": m.get("access_key"),
                "submodules": subs_out,
            }
        )
    return {
        "modules": modules_out,
        "governance_toggle_keys": list(MATERIAL_CONTROL_GOVERNANCE_KEYS),
    }


async def assert_delegate_manager_or_permission(
    db: AsyncSession,
    user: User,
    tenant_id: int,
    *,
    permission_key: str,
) -> None:
    """Allow if user is admin/manager, or role.permissions grants the boolean key."""
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    rn = (role.name if role else "").strip().lower()
    if rn in {"admin", "manager"}:
        return
    if internal_permission_granted(role=role, permission_key=permission_key):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Requires admin/manager role or permission '{permission_key}'",
    )


async def get_user_role_for_tenant(db: AsyncSession, user: User, tenant_id: int) -> Role | None:
    if user.tenant_id != tenant_id:
        return None
    return await get_user_role_scoped_to_tenant(db, user, tenant_id)


def internal_permission_granted(*, role: Role | None, permission_key: str) -> bool:
    """Return True if role grants permission_key (admin always True)."""
    if role is None:
        return False
    if (role.name or "").lower() == "admin":
        return True
    perms = role.permissions if isinstance(role.permissions, dict) else {}
    if perms.get("*") is True:
        return True
    if perms.get(permission_key) is True:
        return True
    parts = permission_key.split(".")
    if len(parts) >= 1:
        if perms.get(f"{parts[0]}.*") is True:
            return True
    return False


def require_internal_permission(permission_key: str):
    """FastAPI Depends() factory for a single permission key on internal JWT users."""

    async def _dep(
        request: Request,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = tenant_result.scalar_one_or_none()
        rbac_mode = get_tenant_rbac_mode(tenant.feature_flags if tenant else None)
        if rbac_mode == RBAC_MODE_OFF:
            return

        role = await get_user_role_for_tenant(db, user, user.tenant_id)
        granted = internal_permission_granted(role=role, permission_key=permission_key)
        if granted:
            return

        role_name = (role.name if role else "").strip().lower() or "unknown"
        if rbac_mode != RBAC_MODE_ENFORCE:
            logger.warning(
                "rbac_shadow_denial tenant_id=%s user_id=%s role=%s permission=%s method=%s path=%s request_id=%s",
                user.tenant_id,
                user.id,
                role_name,
                permission_key,
                request.method,
                request.url.path,
                request.headers.get("X-Request-Id"),
            )
            return
        if not granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission_key}",
            )

    return _dep

from typing import Any

from pydantic import BaseModel

from app.models import TenantType


class MeResponse(BaseModel):
    """Current user + tenant info for UI (tenant name, tenant_type, company_code for sidebar)."""
    user_id: int
    tenant_id: int
    email: str
    username: str | None = None
    first_name: str | None
    last_name: str | None
    tenant_name: str
    tenant_type: TenantType
    company_code: str | None = None
    feature_flags: dict[str, Any] | None = None
    role_name: str
    role_permissions: dict[str, Any]
    # Fixed-class authority (null/empty while user_authority_classes_v1 is OFF).
    authority_classes_enabled: bool = False
    authority_class: str | None = None
    is_tenant_super_admin: bool = False
    module_grants: list[str] = []
    available_modules: list[str] = []
    # True when flag OFF, or Class 1/Super with finance (P&L + Balance Sheet).
    can_view_pnl_balance_sheet: bool = True

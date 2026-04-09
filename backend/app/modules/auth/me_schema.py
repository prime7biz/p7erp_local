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

from pydantic import BaseModel

from app.models import TenantType


class MeResponse(BaseModel):
    """Current user + tenant info for UI (tenant name, tenant_type for sidebar)."""
    user_id: int
    tenant_id: int
    email: str
    username: str
    first_name: str | None
    last_name: str | None
    tenant_name: str
    tenant_type: TenantType

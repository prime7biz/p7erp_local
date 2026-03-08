from pydantic import BaseModel

from app.models import TenantType


class TenantCreate(BaseModel):
    name: str
    domain: str | None = None
    tenant_type: TenantType = TenantType.both


class TenantResponse(BaseModel):
    id: int
    name: str
    domain: str | None
    tenant_type: TenantType
    company_code: str | None
    is_active: bool

    model_config = {"from_attributes": True}

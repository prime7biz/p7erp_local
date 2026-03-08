from datetime import datetime
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    tenant_id: int
    user_id: int | None
    action: str
    resource: str | None
    details: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

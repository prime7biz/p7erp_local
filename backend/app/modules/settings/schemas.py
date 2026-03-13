from datetime import datetime

from pydantic import BaseModel, Field

from app.models import CommissionMode, TenantType


class SettingsConfigResponse(BaseModel):
    tenant_id: int
    company_name: str
    company_code: str | None
    domain: str | None
    logo: str | None
    tenant_type: TenantType
    default_commission_mode: CommissionMode
    is_active: bool


class SettingsConfigUpdate(BaseModel):
    company_name: str = Field(min_length=2, max_length=255)
    domain: str | None = Field(default=None, max_length=255)
    logo: str | None = Field(default=None, max_length=512)
    tenant_type: TenantType
    default_commission_mode: CommissionMode | None = None


class BackupStatusResponse(BaseModel):
    enabled: bool
    provider: str
    retention_days: int
    last_backup_at: datetime | None
    last_backup_status: str
    last_backup_note: str | None


class BackupHistoryRow(BaseModel):
    id: int
    created_at: datetime
    status: str
    note: str | None
    initiated_by_user_id: int | None


class SettingsRoleResponse(BaseModel):
    id: int
    tenant_id: int | None
    name: str
    display_name: str
    permissions: dict

    model_config = {"from_attributes": True}


class SettingsRoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    display_name: str = Field(min_length=2, max_length=128)
    permissions: dict = Field(default_factory=dict)


class SettingsRoleUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=128)
    permissions: dict | None = None


class SettingsUserResponse(BaseModel):
    id: int
    tenant_id: int
    role_id: int
    email: str
    username: str
    first_name: str | None
    last_name: str | None
    is_active: bool
    role_name: str


class SettingsUserCreate(BaseModel):
    role_id: int
    email: str = Field(min_length=5, max_length=255)
    username: str = Field(min_length=3, max_length=128)
    password: str = Field(min_length=6, max_length=128)
    first_name: str | None = Field(default=None, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    is_active: bool = True


class SettingsUserUpdate(BaseModel):
    role_id: int | None = None
    email: str | None = Field(default=None, min_length=5, max_length=255)
    username: str | None = Field(default=None, min_length=3, max_length=128)
    first_name: str | None = Field(default=None, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)


class SettingsAuditLogRow(BaseModel):
    id: int
    tenant_id: int
    user_id: int | None
    action: str
    resource: str | None
    details: str | None
    created_at: datetime


class SettingsAuditLogListResponse(BaseModel):
    items: list[SettingsAuditLogRow]
    total: int
    limit: int
    offset: int


class SettingsPricingResponse(BaseModel):
    """Stub: current subscription/plan for the tenant."""
    plan: str = "trial"
    display_name: str = "Trial"
    max_users: int | None = None
    features: list[str] = Field(default_factory=lambda: ["Full access during trial"])


class SettingsChequeTemplateRow(BaseModel):
    """Stub: one cheque template row."""
    id: int
    name: str
    is_default: bool = False


class SettingsChequeTemplatesListResponse(BaseModel):
    items: list[SettingsChequeTemplateRow]
    total: int


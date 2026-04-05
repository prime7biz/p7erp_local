from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class ExternalAccessOverviewResponse(BaseModel):
    customer_portal_enabled: bool
    financier_portal_enabled: bool
    customer_notes_enabled: bool
    financier_financial_summary_enabled: bool
    financier_projection_enabled: bool
    external_portal_document_downloads_enabled: bool
    customer_principal_count: int
    financier_principal_count: int
    pending_invitation_count: int


class ExternalFeatureFlagsPatch(BaseModel):
    customer_portal_enabled: bool | None = None
    financier_portal_enabled: bool | None = None
    customer_notes_enabled: bool | None = None
    financier_financial_summary_enabled: bool | None = None
    financier_projection_enabled: bool | None = None
    external_portal_document_downloads_enabled: bool | None = None


class ExternalPrincipalAdminRow(BaseModel):
    id: int
    email: str
    full_name: str
    principal_type: str
    is_active: bool
    locked_at: datetime | None
    last_login_at: datetime | None
    accepted_at: datetime | None
    role_codes: list[str]
    customer_ids: list[int] | None = None
    access_scope: str | None = None
    financier_party_id: int | None = None


class ExternalPrincipalListResponse(BaseModel):
    items: list[ExternalPrincipalAdminRow]
    total: int


class ExternalInviteCustomerRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    role_codes: list[str] = Field(..., min_length=1)
    customer_ids: list[int] = Field(..., min_length=1)


class ExternalInviteFinancierRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    role_codes: list[str] = Field(..., min_length=1)
    access_scope: str = Field(default="orders_and_pipeline")
    financier_party_id: int | None = None


class ExternalInviteResponse(BaseModel):
    invitation_id: int
    expires_at: datetime
    invite_token: str
    message: str = "Share this token with the invitee (integrate email in production)."


class ExternalPrincipalPatchRequest(BaseModel):
    is_active: bool | None = None
    full_name: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    role_codes: list[str] | None = None
    customer_ids: list[int] | None = None
    access_scope: str | None = None
    financier_party_id: int | None = None


class ExternalAuditRow(BaseModel):
    id: int
    action: str
    resource_type: str
    resource_id: int | None
    external_principal_id: int | None
    internal_user_id: int | None
    created_at: datetime
    details_json: dict | None = None


class ExternalAuditListResponse(BaseModel):
    items: list[ExternalAuditRow]
    total: int


class ExternalMessageResponse(BaseModel):
    message: str

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class ExternalLoginRequest(BaseModel):
    company_code: str = Field(..., min_length=1)
    email: EmailStr
    password: str = Field(..., min_length=1)
    principal_type: str = Field(..., description="customer or financier")


class ExternalTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    tenant_id: int
    principal_type: str


class ExternalRefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class ExternalMeResponse(BaseModel):
    principal_id: int
    tenant_id: int
    tenant_name: str
    company_code: str | None
    tenant_address: str | None = None
    tenant_phone: str | None = None
    email: str
    full_name: str
    principal_type: str
    role_codes: list[str]
    feature_flags: dict | None = None
    must_reset_password: bool = False
    financier_access_scope: str | None = Field(
        default=None, description="Highest financier access scope (financier logins only)."
    )


class ExternalAcceptInviteRequest(BaseModel):
    token: str = Field(..., min_length=10)
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    phone: str | None = Field(None, max_length=50)


class ExternalRequestPasswordResetRequest(BaseModel):
    company_code: str = Field(..., min_length=1)
    email: EmailStr
    principal_type: str


class ExternalResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)


class ExternalMessageResponse(BaseModel):
    message: str

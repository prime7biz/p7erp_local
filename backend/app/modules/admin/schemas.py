"""Pydantic schemas for platform admin API."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field

from app.models.tenant import TenantType


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


class AdminMeResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    last_login: datetime | None


class AdminChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class TenantListItem(BaseModel):
    id: int
    name: str
    company_code: str | None
    tenant_type: TenantType
    is_active: bool
    deleted_at: datetime | None
    created_at: datetime


class TenantCreateBody(BaseModel):
    name: str
    tenant_type: TenantType = TenantType.both
    domain: str | None = None


class TenantUpdateBody(BaseModel):
    name: str | None = None
    domain: str | None = None
    tenant_type: TenantType | None = None
    is_active: bool | None = None
    feature_flags: dict[str, Any] | None = None


class TenantDetailResponse(BaseModel):
    id: int
    name: str
    company_code: str | None
    domain: str | None
    tenant_type: TenantType
    is_active: bool
    deleted_at: datetime | None
    feature_flags: dict[str, Any] | None
    country_code: str | None
    timezone: str | None
    created_at: datetime
    updated_at: datetime


class TenantStatsResponse(BaseModel):
    user_count: int
    order_count: int
    customer_count: int
    storage_bytes_used: int


class TenantUserListItem(BaseModel):
    id: int
    username: str
    email: str
    first_name: str | None
    last_name: str | None
    is_active: bool
    last_login: datetime | None
    role_name: str | None


class ImpersonateResponse(BaseModel):
    access_token: str
    tenant_id: int
    expires_in_minutes: int


class PaginatedMeta(BaseModel):
    total: int
    page: int
    page_size: int


class AdminUserResetPasswordResponse(BaseModel):
    temporary_password: str


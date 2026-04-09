"""Pydantic schemas for staff invitations."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class StaffInviteCreateRequest(BaseModel):
    email: EmailStr
    first_name: str | None = Field(default=None, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    role_id: int


class StaffInviteRowResponse(BaseModel):
    id: int
    tenant_id: int
    email: str
    first_name: str | None
    last_name: str | None
    role_id: int
    role_name: str
    status: str
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime


class StaffInviteCreateResponse(BaseModel):
    invitation: StaffInviteRowResponse
    invite_token_plain: str | None = None  # dev / SMTP fallback only


class AcceptStaffInviteRequest(BaseModel):
    token: str = Field(min_length=16)
    password: str = Field(min_length=8, max_length=128)
    first_name: str | None = Field(default=None, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)

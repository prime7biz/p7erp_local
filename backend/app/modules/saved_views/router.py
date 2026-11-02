"""Saved list views: each user's named grid setups, optionally shared with their tenant."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.saved_view import UserSavedView

router = APIRouter(prefix="/saved-views", tags=["saved-views"])

MAX_CONFIG_BYTES = 16_000
MAX_VIEWS_PER_TABLE = 50


class SavedViewBody(BaseModel):
    table_key: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9._-]*$")
    name: str = Field(..., min_length=1, max_length=120)
    config: dict[str, Any] = Field(default_factory=dict)
    is_shared: bool = False

    @field_validator("config")
    @classmethod
    def _small_config(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(v)) > MAX_CONFIG_BYTES:
            raise ValueError("config too large")
        return v


class SavedViewPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    config: dict[str, Any] | None = None
    is_shared: bool | None = None

    @field_validator("config")
    @classmethod
    def _small_config(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is not None and len(json.dumps(v)) > MAX_CONFIG_BYTES:
            raise ValueError("config too large")
        return v


class SavedViewOut(BaseModel):
    id: int
    table_key: str
    name: str
    config: dict[str, Any]
    is_shared: bool
    is_mine: bool
    updated_at: datetime


def _out(row: UserSavedView, user: User) -> SavedViewOut:
    return SavedViewOut(
        id=row.id,
        table_key=row.table_key,
        name=row.name,
        config=row.config or {},
        is_shared=row.is_shared,
        is_mine=row.user_id == user.id,
        updated_at=row.updated_at,
    )


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _own_view(db: AsyncSession, tenant: Tenant, user: User, view_id: int) -> UserSavedView:
    row = await db.get(UserSavedView, view_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Saved view not found")
    if row.user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can change this view")
    return row


@router.get("", response_model=list[SavedViewOut])
async def list_saved_views(
    table_key: str = Query(..., min_length=1, max_length=64),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = (
        await db.execute(
            select(UserSavedView)
            .where(
                UserSavedView.tenant_id == tenant.id,
                UserSavedView.table_key == table_key,
                or_(UserSavedView.user_id == user.id, UserSavedView.is_shared.is_(True)),
            )
            .order_by(UserSavedView.name)
        )
    ).scalars().all()
    return [_out(r, user) for r in rows]


@router.post("", response_model=SavedViewOut, status_code=201)
async def create_saved_view(
    body: SavedViewBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    existing = (
        await db.execute(
            select(UserSavedView.id).where(
                UserSavedView.tenant_id == tenant.id,
                UserSavedView.user_id == user.id,
                UserSavedView.table_key == body.table_key,
            )
        )
    ).scalars().all()
    if len(existing) >= MAX_VIEWS_PER_TABLE:
        raise HTTPException(status_code=400, detail="Too many saved views for this list")
    row = UserSavedView(
        tenant_id=tenant.id,
        user_id=user.id,
        table_key=body.table_key,
        name=body.name.strip(),
        config=body.config,
        is_shared=body.is_shared,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _out(row, user)


@router.patch("/{view_id}", response_model=SavedViewOut)
async def update_saved_view(
    view_id: int,
    body: SavedViewPatch,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await _own_view(db, tenant, user, view_id)
    if body.name is not None:
        row.name = body.name.strip()
    if body.config is not None:
        row.config = body.config
    if body.is_shared is not None:
        row.is_shared = body.is_shared
    await db.commit()
    await db.refresh(row)
    return _out(row, user)


@router.delete("/{view_id}", status_code=204)
async def delete_saved_view(
    view_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await _own_view(db, tenant, user, view_id)
    await db.delete(row)
    await db.commit()

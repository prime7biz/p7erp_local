"""
Costing engine master data APIs (PrimeX parity).
List endpoints for item categories, item units, items, and currencies.
Used by the quotation costing form.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Currency,
    Item,
    ItemCategory,
    ItemUnit,
    Tenant,
    User,
)

router = APIRouter(prefix="/costing", tags=["costing"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


# ----- Response schemas -----
class ItemCategoryResponse(BaseModel):
    id: int
    tenant_id: int
    category_code: str
    name: str
    description: str | None
    is_active: bool

    class Config:
        from_attributes = True


class ItemUnitResponse(BaseModel):
    id: int
    tenant_id: int
    unit_code: str
    name: str
    description: str | None
    is_active: bool

    class Config:
        from_attributes = True


class ItemResponse(BaseModel):
    id: int
    tenant_id: int
    item_code: str
    name: str
    description: str | None
    category_id: int
    unit_id: int
    default_cost: str
    is_active: bool

    class Config:
        from_attributes = True


class CurrencyResponse(BaseModel):
    id: int
    code: str
    name: str
    is_active: bool

    class Config:
        from_attributes = True


# ----- Item categories -----
@router.get("/item-categories", response_model=list[ItemCategoryResponse])
async def list_item_categories(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List item categories for the current tenant (for material costing)."""
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(ItemCategory)
        .where(ItemCategory.tenant_id == tenant.id, ItemCategory.is_active.is_(True))
        .order_by(ItemCategory.category_code)
    )
    rows = result.scalars().all()
    return [
        ItemCategoryResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            category_code=r.category_code,
            name=r.name,
            description=r.description,
            is_active=r.is_active,
        )
        for r in rows
    ]


# ----- Item units -----
@router.get("/item-units", response_model=list[ItemUnitResponse])
async def list_item_units(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List item units for the current tenant (Yard, Kg, Pcs, etc.)."""
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(ItemUnit)
        .where(ItemUnit.tenant_id == tenant.id, ItemUnit.is_active.is_(True))
        .order_by(ItemUnit.unit_code)
    )
    rows = result.scalars().all()
    return [
        ItemUnitResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            unit_code=r.unit_code,
            name=r.name,
            description=r.description,
            is_active=r.is_active,
        )
        for r in rows
    ]


# ----- Items -----
@router.get("/items", response_model=list[ItemResponse])
async def list_items(
    category_id: int | None = Query(default=None, description="Filter by category"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List items for the current tenant (for material dropdown in quotation)."""
    _ensure_tenant(user, tenant)
    stmt = (
        select(Item)
        .where(Item.tenant_id == tenant.id, Item.is_active.is_(True))
        .order_by(Item.item_code)
    )
    if category_id is not None:
        stmt = stmt.where(Item.category_id == category_id)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        ItemResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            item_code=r.item_code,
            name=r.name,
            description=r.description,
            category_id=r.category_id,
            unit_id=r.unit_id,
            default_cost=r.default_cost,
            is_active=r.is_active,
        )
        for r in rows
    ]


# ----- Currencies -----
@router.get("/currencies", response_model=list[CurrencyResponse])
async def list_currencies(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List currencies (global master, used for quotation target/quoted price)."""
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(Currency)
        .where(Currency.is_active.is_(True))
        .order_by(Currency.code)
    )
    rows = result.scalars().all()
    return [
        CurrencyResponse(
            id=r.id,
            code=r.code,
            name=r.name,
            is_active=r.is_active,
        )
        for r in rows
    ]

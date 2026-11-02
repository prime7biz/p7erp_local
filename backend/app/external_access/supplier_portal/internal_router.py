"""Staff view of supplier responses on a purchase order (internal JWT, /api/v1)."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import ExternalPrincipal, Tenant, User
from app.models.inventory import PurchaseOrder
from app.models.supplier_portal import SupplierPoUpdate

router = APIRouter(prefix="/inventory", tags=["inventory"])


class SupplierUpdateRow(BaseModel):
    id: int
    kind: str
    expected_ship_date: date | None
    message: str | None
    created_at: datetime
    supplier_user: str | None


@router.get("/purchase-orders/{po_id}/supplier-updates", response_model=list[SupplierUpdateRow])
async def list_supplier_updates(
    po_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    po = await db.get(PurchaseOrder, po_id)
    if not po or po.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    rows = (
        await db.execute(
            select(SupplierPoUpdate, ExternalPrincipal.full_name)
            .outerjoin(ExternalPrincipal, ExternalPrincipal.id == SupplierPoUpdate.external_principal_id)
            .where(SupplierPoUpdate.tenant_id == tenant.id, SupplierPoUpdate.purchase_order_id == po.id)
            .order_by(SupplierPoUpdate.id.desc())
            .limit(100)
        )
    ).all()
    return [
        SupplierUpdateRow(
            id=u.id,
            kind=u.kind,
            expected_ship_date=u.expected_ship_date,
            message=u.message,
            created_at=u.created_at,
            supplier_user=name,
        )
        for u, name in rows
    ]

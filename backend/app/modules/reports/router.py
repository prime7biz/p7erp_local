from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Customer, GoodsReceiving, Order, PurchaseOrder, Tenant, User


router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/tenant-overview")
async def tenant_overview(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Simple overview report for the current tenant."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

    customers_q = await db.execute(
        select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant.id)
    )
    customers_count = int(customers_q.scalar() or 0)

    orders_q = await db.execute(
        select(func.count()).select_from(Order).where(Order.tenant_id == tenant.id)
    )
    orders_count = int(orders_q.scalar() or 0)

    by_status_q = await db.execute(
        select(Order.status, func.count())
        .where(Order.tenant_id == tenant.id)
        .group_by(Order.status)
    )
    by_status = [
        {"status": status or "UNKNOWN", "count": int(count)}
        for status, count in by_status_q.all()
    ]

    return {
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "customers": customers_count,
        "orders": orders_count,
        "orders_by_status": by_status,
    }


@router.get("/customer-performance")
async def customer_performance(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Very lightweight customer performance report (orders per customer)."""
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

    # Count orders per customer; placeholder for revenue once order amounts exist.
    q = await db.execute(
        select(Customer.id, Customer.name, func.count(Order.id))
        .select_from(Customer)
        .join(Order, Order.customer_id == Customer.id, isouter=True)
        .where(Customer.tenant_id == tenant.id)
        .group_by(Customer.id, Customer.name)
        .order_by(Customer.name)
    )
    rows = q.all()
    return [
        {
            "customer_id": cid,
            "customer_name": name,
            "orders": int(count),
        }
        for cid, name, count in rows
    ]


# ---------- Purchase Orders report ----------
@router.get("/purchase-orders")
async def report_purchase_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List purchase orders for report (PO code, supplier, dates, status)."""
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = select(PurchaseOrder).where(PurchaseOrder.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(PurchaseOrder.status == status_filter)
    stmt = stmt.order_by(PurchaseOrder.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "po_code": r.po_code,
            "supplier_name": r.supplier_name,
            "order_date": r.order_date.isoformat() if r.order_date else None,
            "expected_date": r.expected_date.isoformat() if r.expected_date else None,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# ---------- GRN report ----------
@router.get("/grn")
async def report_grn(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List goods receiving notes for report."""
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = select(GoodsReceiving).where(GoodsReceiving.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(GoodsReceiving.status == status_filter)
    stmt = stmt.order_by(GoodsReceiving.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "grn_code": r.grn_code,
            "purchase_order_id": r.purchase_order_id,
            "received_date": r.received_date.isoformat() if r.received_date else None,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# ---------- Sales Orders report ----------
@router.get("/sales-orders")
async def report_sales_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List sales orders (Order) with customer name for report."""
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = (
        select(Order.id, Order.order_code, Order.style_ref, Order.order_date, Order.delivery_date, Order.quantity, Order.status, Order.created_at, Customer.name.label("customer_name"))
        .select_from(Order)
        .join(Customer, Order.customer_id == Customer.id, isouter=True)
        .where(Order.tenant_id == tenant.id)
    )
    if status_filter:
        stmt = stmt.where(Order.status == status_filter)
    stmt = stmt.order_by(Order.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.all()
    return [
        {
            "id": r.id,
            "order_code": r.order_code,
            "customer_name": r.customer_name or "—",
            "style_ref": r.style_ref,
            "order_date": r.order_date.isoformat() if r.order_date else None,
            "delivery_date": r.delivery_date.isoformat() if r.delivery_date else None,
            "quantity": r.quantity,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


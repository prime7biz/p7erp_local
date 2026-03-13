from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Customer, CustomerIntermediary, Order, OrderAmendment, Quotation, Tenant, User
from app.modules.orders.schemas import OrderCreate, OrderResponse, OrderUpdate


router = APIRouter(prefix="/orders", tags=["orders"])


async def _next_order_code(db: AsyncSession, tenant_id: int) -> str:
  return await next_tenant_code(
    db,
    model=Order,
    tenant_id=tenant_id,
    prefix="ORD-",
    width=4,
  )


def _to_order_response(order: Order) -> OrderResponse:
  commission_value = float(order.commission_value) if order.commission_value is not None else None
  return OrderResponse(
    id=order.id,
    tenant_id=order.tenant_id,
    customer_id=order.customer_id,
    quotation_id=order.quotation_id,
    order_code=order.order_code,
    style_ref=order.style_ref,
    customer_intermediary_id=order.customer_intermediary_id,
    shipping_term=order.shipping_term,
    commission_mode=order.commission_mode,
    commission_type=order.commission_type,
    commission_value=commission_value,
    order_date=order.order_date.isoformat() if order.order_date else None,
    delivery_date=order.delivery_date.isoformat() if order.delivery_date else None,
    quantity=order.quantity,
    status=order.status,
    remarks=order.remarks,
    created_at=order.created_at.isoformat(),
    updated_at=order.updated_at.isoformat(),
  )


async def _validate_customer_intermediary(
  db: AsyncSession, *, tenant_id: int, customer_id: int, customer_intermediary_id: int
) -> None:
  link = await db.get(CustomerIntermediary, customer_intermediary_id)
  if not link or link.tenant_id != tenant_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer intermediary link not found")
  if link.customer_id != customer_id:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Customer intermediary link does not belong to this customer",
    )


@router.get("", response_model=list[OrderResponse])
async def list_orders(
  *,
  search: str | None = Query(default=None, description="Search by order code or style"),
  status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
  created_from: date | None = Query(default=None, description="Created at from (inclusive)"),
  created_to: date | None = Query(default=None, description="Created at to (inclusive)"),
  limit: int = Query(default=50, ge=1, le=200),
  offset: int = Query(default=0, ge=0),
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  stmt = select(Order).where(Order.tenant_id == tenant.id)

  if search:
    pattern = f"%{search.lower()}%"
    stmt = stmt.where(
      or_(
        func.lower(Order.order_code).like(pattern),
        func.lower(Order.style_ref).like(pattern),
      )
    )

  if status_filter:
    stmt = stmt.where(Order.status == status_filter)

  if created_from:
    start_dt = datetime.combine(created_from, time.min)
    stmt = stmt.where(Order.created_at >= start_dt)
  if created_to:
    end_dt = datetime.combine(created_to, time.max)
    stmt = stmt.where(Order.created_at <= end_dt)

  stmt = stmt.order_by(Order.created_at.desc()).limit(limit).offset(offset)

  result = await db.execute(stmt)
  rows = result.scalars().all()
  return [_to_order_response(r) for r in rows]


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
  body: OrderCreate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  customer = await db.get(Customer, body.customer_id)
  if not customer or customer.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

  if body.quotation_id is not None:
    quotation = await db.get(Quotation, body.quotation_id)
    if not quotation or quotation.tenant_id != tenant.id:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quotation not found")
  if body.customer_intermediary_id is not None:
    await _validate_customer_intermediary(
      db,
      tenant_id=tenant.id,
      customer_id=body.customer_id,
      customer_intermediary_id=body.customer_intermediary_id,
    )

  code = await _next_order_code(db, tenant.id)
  status_value = body.status or "DRAFT"
  order = Order(
    tenant_id=tenant.id,
    customer_id=body.customer_id,
    quotation_id=body.quotation_id,
    order_code=code,
    style_ref=body.style_ref,
    customer_intermediary_id=body.customer_intermediary_id,
    shipping_term=body.shipping_term,
    commission_mode=body.commission_mode,
    commission_type=body.commission_type,
    commission_value=body.commission_value,
    order_date=body.order_date,
    delivery_date=body.delivery_date,
    quantity=body.quantity,
    status=status_value,
    remarks=body.remarks,
  )
  db.add(order)
  await db.flush()
  await db.refresh(order)
  return _to_order_response(order)


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
  order_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  order = await db.get(Order, order_id)
  if not order or order.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

  return _to_order_response(order)


@router.patch("/{order_id}", response_model=OrderResponse)
async def update_order(
  order_id: int,
  body: OrderUpdate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  order = await db.get(Order, order_id)
  if not order or order.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

  if body.style_ref is not None:
    order.style_ref = body.style_ref
  if body.customer_intermediary_id is not None:
    await _validate_customer_intermediary(
      db,
      tenant_id=tenant.id,
      customer_id=order.customer_id,
      customer_intermediary_id=body.customer_intermediary_id,
    )
    order.customer_intermediary_id = body.customer_intermediary_id
  if body.shipping_term is not None:
    order.shipping_term = body.shipping_term
  if body.commission_mode is not None:
    order.commission_mode = body.commission_mode
  if body.commission_type is not None:
    order.commission_type = body.commission_type
  if body.commission_value is not None:
    order.commission_value = body.commission_value
  if body.order_date is not None:
    order.order_date = body.order_date
  if body.delivery_date is not None:
    order.delivery_date = body.delivery_date
  if body.quantity is not None:
    order.quantity = body.quantity
  if body.status is not None:
    order.status = body.status
  if body.remarks is not None:
    order.remarks = body.remarks

  await db.flush()
  await db.refresh(order)
  return _to_order_response(order)


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order(
  order_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  order = await db.get(Order, order_id)
  if not order or order.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
  await db.delete(order)
  await db.flush()


@router.post("/from-quotation/{quotation_id}", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order_from_quotation(
  quotation_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """Convert a quotation into a basic order, similar to the reference workflow."""
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  quotation = await db.get(Quotation, quotation_id)
  if not quotation or quotation.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

  customer = await db.get(Customer, quotation.customer_id)
  if not customer or customer.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

  code = await _next_order_code(db, tenant.id)
  order = Order(
    tenant_id=tenant.id,
    customer_id=quotation.customer_id,
    quotation_id=quotation.id,
    order_code=code,
    style_ref=quotation.style_ref,
    customer_intermediary_id=quotation.customer_intermediary_id,
    shipping_term=quotation.shipping_term,
    commission_mode=quotation.commission_mode,
    commission_type=quotation.commission_type,
    commission_value=quotation.commission_value,
    order_date=None,
    delivery_date=None,
    quantity=None,
    status="NEW",
    remarks=quotation.notes,
  )
  db.add(order)
  await db.flush()
  await db.refresh(order)

  return _to_order_response(order)


class OrderStatusBody(BaseModel):
  status: str


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
  order_id: int,
  body: OrderStatusBody,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  order = await db.get(Order, order_id)
  if not order or order.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
  order.status = body.status
  await db.flush()
  await db.refresh(order)
  return _to_order_response(order)


class OrderAmendmentCreate(BaseModel):
  field_changed: str
  old_value: str | None = None
  new_value: str | None = None
  reason: str | None = None
  status: str = "APPROVED"


@router.get("/{order_id}/amendments")
async def list_order_amendments(
  order_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  result = await db.execute(
    select(OrderAmendment)
    .where(OrderAmendment.tenant_id == tenant.id, OrderAmendment.order_id == order_id)
    .order_by(OrderAmendment.amendment_no.desc(), OrderAmendment.id.desc())
  )
  return result.scalars().all()


@router.post("/{order_id}/amendments", status_code=201)
async def create_order_amendment(
  order_id: int,
  body: OrderAmendmentCreate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  order = await db.get(Order, order_id)
  if not order or order.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
  current = await db.execute(
    select(func.max(OrderAmendment.amendment_no)).where(
      OrderAmendment.tenant_id == tenant.id, OrderAmendment.order_id == order_id
    )
  )
  next_no = (current.scalar() or 0) + 1
  row = OrderAmendment(
    tenant_id=tenant.id,
    order_id=order_id,
    amendment_no=next_no,
    field_changed=body.field_changed,
    old_value=body.old_value,
    new_value=body.new_value,
    reason=body.reason,
    status=body.status,
  )
  db.add(row)
  await db.flush()
  await db.refresh(row)
  return row


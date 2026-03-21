from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.db_errors import flush_handling_duplicate_document_code
from app.common.tenant import require_tenant
from app.common.workflow import (
  ORDER_TRANSITIONS,
  QUOTATION_TRANSITIONS,
  validate_transition,
)
from app.database import get_db
from app.models import (
  Bom,
  BomItem,
  Customer,
  CustomerIntermediary,
  FollowupActionTemplate,
  Item,
  Order,
  OrderAmendment,
  OrderFollowupAction,
  Quotation,
  StockMovement,
  Tenant,
  User,
)
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


async def _get_existing_order_for_quotation(
  db: AsyncSession, *, tenant_id: int, quotation_id: int
) -> Order | None:
  result = await db.execute(
    select(Order)
    .where(
      Order.tenant_id == tenant_id,
      Order.quotation_id == quotation_id,
    )
    .order_by(Order.created_at.desc(), Order.id.desc())
    .limit(1)
  )
  return result.scalar_one_or_none()


async def _auto_generate_followup_actions_if_missing(
  db: AsyncSession,
  *,
  tenant_id: int,
  order: Order,
  next_status: str,
) -> None:
  status_key = (next_status or "").strip().upper()
  if status_key not in {"NEW", "IN_PROGRESS"}:
    return

  existing = await db.execute(
    select(func.count())
    .select_from(OrderFollowupAction)
    .where(
      OrderFollowupAction.tenant_id == tenant_id,
      OrderFollowupAction.order_id == order.id,
    )
  )
  if (existing.scalar() or 0) > 0:
    return

  templates_result = await db.execute(
    select(FollowupActionTemplate)
    .where(
      FollowupActionTemplate.tenant_id == tenant_id,
      FollowupActionTemplate.is_active == True,
      or_(
        FollowupActionTemplate.buyer_id.is_(None),
        FollowupActionTemplate.buyer_id == order.customer_id,
      ),
    )
    .order_by(FollowupActionTemplate.sequence_no.asc(), FollowupActionTemplate.id.asc())
  )
  templates = templates_result.scalars().all()
  if not templates:
    return

  for template in templates:
    planned_date = None
    if order.delivery_date and template.default_days_before_delivery is not None:
      planned_date = order.delivery_date - timedelta(days=int(template.default_days_before_delivery))
    db.add(
      OrderFollowupAction(
        tenant_id=tenant_id,
        order_id=order.id,
        template_id=template.id,
        sequence_no=template.sequence_no,
        phase=template.phase,
        action_group=template.action_group,
        title=template.name,
        is_template_generated=True,
        is_mandatory=template.is_mandatory,
        is_active=template.is_active,
        planned_date=planned_date,
        status="pending",
      )
    )


def _safe_float(value: str | int | float | None) -> float:
  try:
    return float(value or 0)
  except (TypeError, ValueError):
    return 0.0


class PromiseCheckLine(BaseModel):
  item_id: int
  item_code: str
  required_qty: float
  available_qty: float
  shortage_qty: float


class PromiseCheckOut(BaseModel):
  order_id: int
  atp_ok: bool
  ctp_ok: bool
  reasons: list[str]
  lines: list[PromiseCheckLine]


class PromiseSummaryItem(BaseModel):
  order_id: int
  order_code: str
  status: str
  atp_ok: bool
  ctp_ok: bool
  reasons: list[str]


class PromiseSummaryOut(BaseModel):
  scanned_count: int
  blocked_count: int
  atp_fail_count: int
  ctp_fail_count: int
  items: list[PromiseSummaryItem]


async def _run_promise_check(
  db: AsyncSession,
  *,
  tenant_id: int,
  order: Order,
) -> PromiseCheckOut:
  resolved_order_id = order.id or 0
  reasons: list[str] = []
  lines: list[PromiseCheckLine] = []
  atp_ok = True
  ctp_ok = True

  if not order.delivery_date:
    ctp_ok = False
    reasons.append("Delivery date is missing")
  elif order.delivery_date < date.today():
    ctp_ok = False
    reasons.append("Delivery date is in the past")

  if not order.quotation_id:
    atp_ok = False
    reasons.append("Order has no quotation linked for style/BOM resolution")
    return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)

  quotation = await db.get(Quotation, order.quotation_id)
  if not quotation or quotation.tenant_id != tenant_id or not quotation.style_id:
    atp_ok = False
    reasons.append("Order quotation/style is missing")
    return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)

  order_qty = _safe_float(order.quantity)
  if order_qty <= 0:
    atp_ok = False
    reasons.append("Order quantity must be positive")
    return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)

  bom_result = await db.execute(
    select(Bom)
    .where(
      Bom.tenant_id == tenant_id,
      Bom.style_id == quotation.style_id,
      Bom.status.in_(("APPROVED", "FROZEN")),
    )
    .order_by(Bom.version_no.desc())
    .limit(1)
  )
  bom = bom_result.scalar_one_or_none()
  if not bom:
    atp_ok = False
    reasons.append("No APPROVED/FROZEN BOM found for order style")
    return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)

  bom_lines = (
    await db.execute(
      select(BomItem).where(
        BomItem.tenant_id == tenant_id,
        BomItem.bom_id == bom.id,
        BomItem.item_id.isnot(None),
      )
    )
  ).scalars().all()
  if not bom_lines:
    atp_ok = False
    reasons.append("BOM has no inventory-linked items")
    return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)

  item_ids = [line.item_id for line in bom_lines if line.item_id is not None]
  items_result = (
    await db.execute(select(Item).where(Item.tenant_id == tenant_id, Item.id.in_(item_ids)))
  ).scalars().all()
  items_by_id = {i.id: i for i in items_result}

  mov_result = (
    await db.execute(
      select(StockMovement).where(
        StockMovement.tenant_id == tenant_id,
        StockMovement.item_id.in_(item_ids),
      )
    )
  ).scalars().all()
  in_qty_by_item: dict[int, float] = defaultdict(float)
  out_qty_by_item: dict[int, float] = defaultdict(float)
  for m in mov_result:
    q = _safe_float(m.quantity)
    mt = (m.movement_type or "").upper()
    if mt == "IN":
      in_qty_by_item[m.item_id] += q
    elif mt == "OUT":
      out_qty_by_item[m.item_id] += q

  for line in bom_lines:
    if line.item_id is None:
      continue
    item = items_by_id.get(line.item_id)
    if not item:
      continue
    base = _safe_float(line.base_consumption)
    wastage = _safe_float(line.wastage_pct) / 100.0
    required_qty = order_qty * base * (1.0 + wastage)
    in_qty = in_qty_by_item.get(line.item_id, 0.0)
    out_qty = out_qty_by_item.get(line.item_id, 0.0)
    available_qty = round(in_qty - out_qty, 4)
    shortage_qty = round(max(0.0, required_qty - available_qty), 4)
    if shortage_qty > 0:
      atp_ok = False
    lines.append(
      PromiseCheckLine(
        item_id=line.item_id,
        item_code=item.item_code or str(line.item_id),
        required_qty=round(required_qty, 4),
        available_qty=available_qty,
        shortage_qty=shortage_qty,
      )
    )

  if not atp_ok:
    reasons.append("Insufficient stock for one or more BOM items")
  return PromiseCheckOut(order_id=resolved_order_id, atp_ok=atp_ok, ctp_ok=ctp_ok, reasons=reasons, lines=lines)


@router.get("", response_model=list[OrderResponse])
async def list_orders(
  *,
  search: str | None = Query(default=None, description="Search by order code or style"),
  status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
  created_from: date | None = Query(default=None, description="Created at from (inclusive)"),
  created_to: date | None = Query(default=None, description="Created at to (inclusive)"),
  limit: int = Query(default=50, ge=1, le=500),
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
    existing_order = await _get_existing_order_for_quotation(
      db, tenant_id=tenant.id, quotation_id=body.quotation_id
    )
    if existing_order:
      raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"Quotation already converted to order {existing_order.order_code}",
      )
  if body.customer_intermediary_id is not None:
    await _validate_customer_intermediary(
      db,
      tenant_id=tenant.id,
      customer_id=body.customer_id,
      customer_intermediary_id=body.customer_intermediary_id,
    )

  code = await _next_order_code(db, tenant.id)
  status_value = validate_transition(
    ORDER_TRANSITIONS,
    "DRAFT",
    body.status or "DRAFT",
    fallback="DRAFT",
    entity_label="order",
  )
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
  if status_value == "IN_PROGRESS":
    promise = await _run_promise_check(db, tenant_id=tenant.id, order=order)
    if not (promise.atp_ok and promise.ctp_ok):
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Promise check failed: {'; '.join(promise.reasons) or 'ATP/CTP not satisfied'}",
      )
  db.add(order)
  if body.quotation_id is not None:
    quotation.status = validate_transition(
      QUOTATION_TRANSITIONS,
      quotation.status,
      "CONVERTED",
      fallback="DRAFT",
      entity_label="quotation",
    )
  await flush_handling_duplicate_document_code(db)
  await _auto_generate_followup_actions_if_missing(
    db,
    tenant_id=tenant.id,
    order=order,
    next_status=order.status,
  )
  await db.refresh(order)
  return _to_order_response(order)


@router.get("/promise-summary", response_model=PromiseSummaryOut)
async def get_orders_promise_summary(
  statuses: str | None = Query(default="NEW,IN_PROGRESS", description="Comma-separated order statuses to scan"),
  limit: int = Query(default=25, ge=1, le=100),
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  status_values = [s.strip().upper() for s in (statuses or "").split(",") if s.strip()]
  if not status_values:
    status_values = ["NEW", "IN_PROGRESS"]

  orders = (
    await db.execute(
      select(Order)
      .where(
        Order.tenant_id == tenant.id,
        Order.status.in_(status_values),
      )
      .order_by(Order.updated_at.desc())
      .limit(limit)
    )
  ).scalars().all()

  blocked_count = 0
  atp_fail_count = 0
  ctp_fail_count = 0
  items: list[PromiseSummaryItem] = []
  for order in orders:
    check = await _run_promise_check(db, tenant_id=tenant.id, order=order)
    is_blocked = not (check.atp_ok and check.ctp_ok)
    if is_blocked:
      blocked_count += 1
    if not check.atp_ok:
      atp_fail_count += 1
    if not check.ctp_ok:
      ctp_fail_count += 1
    items.append(
      PromiseSummaryItem(
        order_id=order.id,
        order_code=order.order_code,
        status=order.status,
        atp_ok=check.atp_ok,
        ctp_ok=check.ctp_ok,
        reasons=check.reasons,
      )
    )
  return PromiseSummaryOut(
    scanned_count=len(orders),
    blocked_count=blocked_count,
    atp_fail_count=atp_fail_count,
    ctp_fail_count=ctp_fail_count,
    items=items,
  )


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


@router.get("/{order_id}/promise-check", response_model=PromiseCheckOut)
async def get_order_promise_check(
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
  return await _run_promise_check(db, tenant_id=tenant.id, order=order)


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
    order.status = validate_transition(
      ORDER_TRANSITIONS,
      order.status,
      body.status,
      fallback="DRAFT",
      entity_label="order",
    )
    if order.status == "IN_PROGRESS":
      promise = await _run_promise_check(db, tenant_id=tenant.id, order=order)
      if not (promise.atp_ok and promise.ctp_ok):
        raise HTTPException(
          status_code=status.HTTP_400_BAD_REQUEST,
          detail=f"Promise check failed: {'; '.join(promise.reasons) or 'ATP/CTP not satisfied'}",
        )
  if body.remarks is not None:
    order.remarks = body.remarks

  await db.flush()
  await _auto_generate_followup_actions_if_missing(
    db,
    tenant_id=tenant.id,
    order=order,
    next_status=order.status,
  )
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
  existing_order = await _get_existing_order_for_quotation(
    db, tenant_id=tenant.id, quotation_id=quotation_id
  )
  if existing_order:
    raise HTTPException(
      status_code=status.HTTP_409_CONFLICT,
      detail=f"Quotation already converted to order {existing_order.order_code}",
    )

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
  quotation.status = validate_transition(
    QUOTATION_TRANSITIONS,
    quotation.status,
    "CONVERTED",
    fallback="DRAFT",
    entity_label="quotation",
  )
  await flush_handling_duplicate_document_code(db)
  await _auto_generate_followup_actions_if_missing(
    db,
    tenant_id=tenant.id,
    order=order,
    next_status=order.status,
  )
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
  order.status = validate_transition(
    ORDER_TRANSITIONS,
    order.status,
    body.status,
    fallback="DRAFT",
    entity_label="order",
  )
  if order.status == "IN_PROGRESS":
    promise = await _run_promise_check(db, tenant_id=tenant.id, order=order)
    if not (promise.atp_ok and promise.ctp_ok):
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Promise check failed: {'; '.join(promise.reasons) or 'ATP/CTP not satisfied'}",
      )
  await db.flush()
  await _auto_generate_followup_actions_if_missing(
    db,
    tenant_id=tenant.id,
    order=order,
    next_status=order.status,
  )
  await db.refresh(order)
  return _to_order_response(order)


class OrderAmendmentCreate(BaseModel):
  field_changed: str
  old_value: str | None = None
  new_value: str | None = None
  reason: str | None = None
  status: str = "APPROVED"


class OrderAmendmentOut(BaseModel):
  id: int
  tenant_id: int
  order_id: int
  amendment_no: int
  field_changed: str
  old_value: str | None
  new_value: str | None
  reason: str | None
  status: str
  created_at: datetime
  updated_at: datetime


@router.get("/{order_id}/amendments", response_model=list[OrderAmendmentOut])
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


@router.post("/{order_id}/amendments", response_model=OrderAmendmentOut, status_code=201)
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


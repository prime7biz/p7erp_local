from datetime import date, datetime, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import clamp_page_size, safe_page, total_pages
from app.common.codegen import next_tenant_code
from app.common.db_errors import flush_handling_duplicate_document_code
from app.common.tenant import require_tenant
from app.common.workflow import (
  ORDER_TRANSITIONS,
  PIPELINE_STAGES,
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
  Role,
  SewingLineStyleConfig,
  StockMovement,
  Tenant,
  User,
)
from app.modules.orders.order_ai_router import router as order_ai_subrouter
from app.modules.orders.order_ai_schemas import OrderAiIndicatorsOut
from app.modules.orders.pipeline_service import (
  auto_advance_order_pipeline,
  build_milestone_payload,
  suggest_na_steps,
)
from app.modules.orders.promise_checks import run_order_promise_check
from app.modules.orders.order_ai_service import compute_order_ai_indicators
from app.modules.orders.commercial_numeraire import resolve_commercial_book_currency
from app.modules.orders.commercial_snapshot_service import (
  build_commercial_alignment_payload,
  build_order_commercial_snapshot_at_conversion,
)
from app.modules.orders.schemas import (
  OrderCommercialAlignmentOut,
  OrderCreate,
  OrderListPageResponse,
  OrderMilestoneStepOut,
  OrderMilestonesOut,
  OrderPipelineSettingsPatch,
  OrderResponse,
  OrderUpdate,
  PromiseCheckLine,
  PromiseCheckOut,
)
from app.modules.orders.commercial_change_authz import require_commercial_capability
from app.modules.orders.commercial_fields import list_order_commercial_patch_violations
from app.modules.orders.planning_grounding_schemas import PlanningGroundingSnapshot, PlanningGroundingSummaryRow
from app.modules.orders.planning_grounding_service import (
  compute_planning_grounding_snapshot,
  compute_planning_grounding_summaries,
)


router = APIRouter(prefix="/orders", tags=["orders"])
router.include_router(order_ai_subrouter, prefix="/ai")


async def _next_order_code(db: AsyncSession, tenant_id: int) -> str:
  return await next_tenant_code(
    db,
    model=Order,
    tenant_id=tenant_id,
    prefix="ORD-",
    width=4,
  )


def _pipeline_na_as_list(order: Order) -> list[str] | None:
  raw = getattr(order, "pipeline_na_steps", None)
  if raw is None:
    return None
  if isinstance(raw, list):
    return [str(x) for x in raw]
  if isinstance(raw, dict) and "steps" in raw:
    return [str(x) for x in raw.get("steps", [])]
  return None


def _to_order_response(
  order: Order,
  *,
  ai_indicators: OrderAiIndicatorsOut | None = None,
  tenant: Tenant | None = None,
  customer_name: str | None = None,
  quotation_code: str | None = None,
) -> OrderResponse:
  commission_value = float(order.commission_value) if order.commission_value is not None else None
  snap = order.commercial_snapshot_json if isinstance(order.commercial_snapshot_json, dict) else None
  book = None
  if tenant is not None:
    doc_ccy = snap.get("document_currency") if snap else None
    book = resolve_commercial_book_currency(tenant, doc_ccy)
  rm_pct = getattr(order, "rm_received_pct", None)
  rm_out = float(rm_pct) if rm_pct is not None else None
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
    pipeline_status=getattr(order, "pipeline_status", None),
    pipeline_na_steps=_pipeline_na_as_list(order),
    order_type=getattr(order, "order_type", None),
    master_contract_id=getattr(order, "master_contract_id", None),
    rm_inhouse_pct=rm_out,
    remarks=order.remarks,
    created_at=order.created_at.isoformat(),
    updated_at=order.updated_at.isoformat(),
    ai_indicators=ai_indicators,
    commercial_snapshot=snap,
    commercial_book_currency=book,
    customer_name=customer_name,
    quotation_code=quotation_code,
  )


async def _is_tenant_admin(user: User, db: AsyncSession) -> bool:
  role = await db.get(Role, user.role_id)
  if not role:
    return False
  return role.name.lower() in {"admin", "super_admin", "superadmin", "owner"}


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
  if status_key not in {"NEW", "CONFIRMED", "IN_PROGRESS"}:
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


@router.get("", response_model=list[OrderResponse])
async def list_orders(
  *,
  search: str | None = Query(default=None, description="Search by order code or style"),
  status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
  created_from: date | None = Query(default=None, description="Created at from (inclusive)"),
  created_to: date | None = Query(default=None, description="Created at to (inclusive)"),
  ai_indicators: int = Query(default=0, ge=0, le=1, description="Include AI indicators when 1"),
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
  layout_counts: dict[int, int] = {}
  if ai_indicators and rows:
    oids = [r.id for r in rows]
    cnt_r = await db.execute(
      select(SewingLineStyleConfig.order_id, func.count(SewingLineStyleConfig.id))
      .where(
        SewingLineStyleConfig.tenant_id == tenant.id,
        SewingLineStyleConfig.order_id.in_(oids),
      )
      .group_by(SewingLineStyleConfig.order_id)
    )
    for oid, c in cnt_r.all():
      if oid is not None:
        layout_counts[int(oid)] = int(c)

  return [
    _to_order_response(
      r,
      ai_indicators=compute_order_ai_indicators(
        r,
        production_layout_row_count=layout_counts.get(r.id) if ai_indicators else None,
      )
      if ai_indicators
      else None,
      tenant=tenant,
    )
    for r in rows
  ]


@router.get("/paginated", response_model=OrderListPageResponse)
async def list_orders_paginated(
  *,
  search: str | None = Query(default=None, description="Search by order code or style"),
  status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
  created_from: date | None = Query(default=None, description="Created at from (inclusive)"),
  created_to: date | None = Query(default=None, description="Created at to (inclusive)"),
  ai_indicators: int = Query(default=0, ge=0, le=1, description="Include AI indicators when 1"),
  page: int = Query(default=1, ge=1),
  page_size: int = Query(default=10, ge=1, le=500),
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  ps = clamp_page_size(page_size)

  def _apply_filters(stmt):
    s = stmt.where(Order.tenant_id == tenant.id)
    if search:
      pattern = f"%{search.lower()}%"
      s = s.where(
        or_(
          func.lower(Order.order_code).like(pattern),
          func.lower(Order.style_ref).like(pattern),
        )
      )
    if status_filter:
      s = s.where(Order.status == status_filter)
    if created_from:
      start_dt = datetime.combine(created_from, time.min)
      s = s.where(Order.created_at >= start_dt)
    if created_to:
      end_dt = datetime.combine(created_to, time.max)
      s = s.where(Order.created_at <= end_dt)
    return s

  count_stmt = _apply_filters(select(func.count()).select_from(Order))
  total = int((await db.execute(count_stmt)).scalar_one() or 0)
  tp = total_pages(total, ps)
  pg = safe_page(page, total, ps)
  offset = (pg - 1) * ps

  list_stmt = (
    _apply_filters(
      select(Order, Customer.name, Quotation.quotation_code)
      .outerjoin(Customer, (Customer.id == Order.customer_id) & (Customer.tenant_id == tenant.id))
      .outerjoin(Quotation, (Quotation.id == Order.quotation_id) & (Quotation.tenant_id == tenant.id))
    )
    .order_by(Order.created_at.desc())
    .limit(ps)
    .offset(offset)
  )
  result = await db.execute(list_stmt)
  row_tuples = result.all()
  orders_only = [r for r, _, _ in row_tuples]
  layout_counts: dict[int, int] = {}
  if ai_indicators and orders_only:
    oids = [r.id for r in orders_only]
    cnt_r = await db.execute(
      select(SewingLineStyleConfig.order_id, func.count(SewingLineStyleConfig.id))
      .where(
        SewingLineStyleConfig.tenant_id == tenant.id,
        SewingLineStyleConfig.order_id.in_(oids),
      )
      .group_by(SewingLineStyleConfig.order_id)
    )
    for oid, c in cnt_r.all():
      if oid is not None:
        layout_counts[int(oid)] = int(c)

  items: list[OrderResponse] = []
  for order, cust_name, quot_code in row_tuples:
    items.append(
      _to_order_response(
        order,
        ai_indicators=compute_order_ai_indicators(
          order,
          production_layout_row_count=layout_counts.get(order.id) if ai_indicators else None,
        )
        if ai_indicators
        else None,
        tenant=tenant,
        customer_name=cust_name,
        quotation_code=quot_code,
      )
    )

  return OrderListPageResponse(
    items=items,
    total=total,
    page=pg,
    page_size=ps,
    total_pages=tp,
  )


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
  await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=order.id)
  await db.refresh(order)
  return _to_order_response(order, tenant=tenant)


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
    check = await run_order_promise_check(db, tenant_id=tenant.id, order=order)
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


@router.get("/planning-grounding-summary", response_model=list[PlanningGroundingSummaryRow])
async def get_planning_grounding_summary(
  order_ids: str = Query(default="", description="Comma-separated order IDs (max 80)"),
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  await require_commercial_capability(db, user, "view_planning_grounding")
  ids: list[int] = []
  for part in (order_ids or "").split(","):
    p = part.strip()
    if p.isdigit():
      ids.append(int(p))
  if not ids:
    return []
  return await compute_planning_grounding_summaries(db, tenant_id=tenant.id, order_ids=ids)


@router.get("/{order_id}/materials")
async def get_order_materials(
  order_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """PrimeX-style alias: same payload as GET /api/v1/merch/orders/{order_id}/material-requirement."""
  from app.modules.merch.router import get_order_material_requirement

  return await get_order_material_requirement(order_id, tenant, user, db)


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
  order_id: int,
  ai_indicators: int = Query(default=0, ge=0, le=1, description="Include AI indicators when 1"),
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  order = await db.get(Order, order_id)
  if not order or order.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

  layout_count: int | None = None
  if ai_indicators:
    layout_count = int(
      (
        await db.execute(
          select(func.count())
          .select_from(SewingLineStyleConfig)
          .where(
            SewingLineStyleConfig.tenant_id == tenant.id,
            SewingLineStyleConfig.order_id == order.id,
          )
        )
      ).scalar_one()
      or 0
    )

  return _to_order_response(
    order,
    ai_indicators=compute_order_ai_indicators(
      order,
      production_layout_row_count=layout_count if ai_indicators else None,
    )
    if ai_indicators
    else None,
    tenant=tenant,
  )


@router.get("/{order_id}/commercial-alignment", response_model=OrderCommercialAlignmentOut)
async def get_order_commercial_alignment(
  order_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """Read-only quotation↔order commercial comparison (no mutations)."""
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  order = await db.get(Order, order_id)
  if not order or order.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
  live_q: Quotation | None = None
  if order.quotation_id is not None:
    live_q = await db.get(Quotation, order.quotation_id)
    if live_q is not None and live_q.tenant_id != tenant.id:
      live_q = None
  payload = build_commercial_alignment_payload(tenant=tenant, order=order, live_quotation=live_q)
  return OrderCommercialAlignmentOut.model_validate(payload)


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
  return await run_order_promise_check(db, tenant_id=tenant.id, order=order)


@router.get("/{order_id}/planning-grounding", response_model=PlanningGroundingSnapshot)
async def get_order_planning_grounding(
  order_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  await require_commercial_capability(db, user, "view_planning_grounding")
  snap = await compute_planning_grounding_snapshot(db, tenant_id=tenant.id, order_id=order_id)
  if not snap:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
  return snap


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

  patch_fields = body.model_dump(exclude_unset=True)
  blocked = list_order_commercial_patch_violations(order.status, patch_fields)
  if blocked:
    raise HTTPException(
      status_code=status.HTTP_409_CONFLICT,
      detail={
        "code": "COMMERCIAL_CHANGE_REQUIRED",
        "message": f"Order is in status {order.status}; use a commercial change request for: {', '.join(blocked)}",
        "fields": blocked,
      },
    )

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
  if body.remarks is not None:
    order.remarks = body.remarks

  await db.flush()
  await _auto_generate_followup_actions_if_missing(
    db,
    tenant_id=tenant.id,
    order=order,
    next_status=order.status,
  )
  await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=order.id)
  await db.refresh(order)
  return _to_order_response(order, tenant=tenant)


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
  commercial_snap = build_order_commercial_snapshot_at_conversion(quotation, tenant=tenant)
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
    order_date=quotation.quotation_date,
    delivery_date=quotation.projected_delivery_date,
    quantity=quotation.projected_quantity,
    status="NEW",
    remarks=quotation.notes,
    commercial_snapshot_json=commercial_snap,
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
  await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=order.id)
  await db.refresh(order)

  return _to_order_response(order, tenant=tenant)


class OrderStatusBody(BaseModel):
  status: str
  # Admin-only: set orders.pipeline_status directly (e.g. stuck pipeline)
  force_pipeline_status: str | None = None


@router.get("/{order_id}/milestones", response_model=OrderMilestonesOut)
async def get_order_milestones(
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
  await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=order_id)
  await db.refresh(order)
  payload = await build_milestone_payload(db, tenant_id=tenant.id, order_id=order_id)
  steps_raw = payload.get("steps") or []
  steps = [OrderMilestoneStepOut(**s) for s in steps_raw]
  return OrderMilestonesOut(
    pipeline_status=payload.get("pipeline_status") or order.pipeline_status,
    rm_inhouse_pct=float(payload.get("rm_inhouse_pct") or 0),
    steps=steps,
    tna_warnings=payload.get("tna_warnings") or [],
    pipeline_na_steps=payload.get("pipeline_na_steps") or [],
    order_type=payload.get("order_type"),
  )


@router.patch("/{order_id}/pipeline-settings", response_model=OrderMilestonesOut)
async def patch_order_pipeline_settings(
  order_id: int,
  body: OrderPipelineSettingsPatch,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  order = await db.get(Order, order_id)
  if not order or order.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
  if body.order_type is not None:
    order.order_type = body.order_type.strip().lower()[:16] or None
    if body.na_steps is None:
      order.pipeline_na_steps = suggest_na_steps(order.order_type)
  if body.na_steps is not None:
    order.pipeline_na_steps = [str(s).upper() for s in body.na_steps]
  await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=order_id)
  await db.commit()
  await db.refresh(order)
  payload = await build_milestone_payload(db, tenant_id=tenant.id, order_id=order_id)
  steps = [OrderMilestoneStepOut(**s) for s in (payload.get("steps") or [])]
  return OrderMilestonesOut(
    pipeline_status=payload.get("pipeline_status") or order.pipeline_status,
    rm_inhouse_pct=float(payload.get("rm_inhouse_pct") or 0),
    steps=steps,
    tna_warnings=payload.get("tna_warnings") or [],
    pipeline_na_steps=payload.get("pipeline_na_steps") or [],
    order_type=payload.get("order_type"),
  )


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
  pipeline_forced = False
  if body.force_pipeline_status:
    if not await _is_tenant_admin(user, db):
      raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    target = body.force_pipeline_status.strip().upper()
    if target not in PIPELINE_STAGES and target != "COMPLETED":
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pipeline_status")
    order.pipeline_status = target
    pipeline_forced = True
  order.status = validate_transition(
    ORDER_TRANSITIONS,
    order.status,
    body.status,
    fallback="DRAFT",
    entity_label="order",
  )
  await db.flush()
  await _auto_generate_followup_actions_if_missing(
    db,
    tenant_id=tenant.id,
    order=order,
    next_status=order.status,
  )
  if not pipeline_forced:
    await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=order_id)
  await db.refresh(order)
  return _to_order_response(order, tenant=tenant)


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


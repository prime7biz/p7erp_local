from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete

from app.common.auth import get_current_user
from app.common.money import (
  fabric_factor_from_input,
  format_money,
  format_pct,
  format_rate,
  line_consumption_from_input,
  line_money_from_input,
  line_pct_from_input,
  line_rate_from_input,
  parse_money,
)
from app.common.pagination import clamp_page_size, safe_page, total_pages
from app.common.codegen import next_tenant_code
from app.common.db_errors import flush_handling_duplicate_document_code
from app.common.delete_guards import ensure_quotation_deletable
from app.common.tenant import require_tenant
from app.common.workflow import (
  INQUIRY_TRANSITIONS,
  QUOTATION_TRANSITIONS,
  next_status_options,
  validate_transition,
)
from app.database import get_db
from app.models import (
    CommissionMode,
    Customer,
    CustomerIntermediary,
    GarmentStyle,
    Inquiry,
  InquiryEvent,
    Item,
    ItemUnit,
    Order,
    Quotation,
    QuotationManufacturing,
    QuotationMaterial,
    QuotationOtherCost,
    QuotationSizeRatio,
    Tenant,
    User,
)
from app.modules.quotations.schemas import (
    QuotationCreate,
    QuotationDetailResponse,
    QuotationFullUpdate,
    QuotationListPageResponse,
    QuotationManufacturingLine,
    QuotationMaterialLine,
    QuotationOtherCostLine,
    QuotationResponse,
    QuotationSizeRatioLine,
    QuotationUpdate,
)
from app.modules.quotations.quotation_ai_router import router as quotation_ai_subrouter
from app.modules.quotations import quotation_cost_benchmark_service as qcb_svc
from app.modules.quotations.quotation_ai_service import compute_quotation_ai_indicators
from app.modules.quotations.quotation_ai_schemas import QuotationAiIndicatorsOut
from app.modules.quotations.quotation_costing_feature import (
    is_quotation_cost_benchmark_enabled,
)
from app.modules.orders.commercial_fields import (
  is_quotation_commercial_locked,
  list_quotation_commercial_patch_violations,
)
from app.modules.orders.commercial_numeraire import resolve_commercial_book_currency
from app.modules.quotations.quotation_commercial_money import (
  MoneyParseError,
  collect_rollup_money_errors,
  cost_line_arrays_present_in_request,
  line_fx_to_quotation_multiplier,
  manufacturing_row_is_persisted_for_rollup,
  material_row_is_persisted_for_rollup,
  normalize_currency_code,
  other_cost_rollup_amount_string,
  other_cost_row_is_persisted_for_rollup,
  parse_money_decimal,
  validate_header_fx_rules,
  validate_line_fx_rules,
)


router = APIRouter(prefix="/quotations", tags=["quotations"])
router.include_router(quotation_ai_subrouter, prefix="/ai")

FOUR_DP = Decimal("0.0001")


def _quantize_money4(d: Decimal) -> Decimal:
  return d.quantize(FOUR_DP, rounding=ROUND_HALF_UP)


def _quotation_header_api_strings(q: Quotation) -> dict[str, str | None]:
  return {
    "target_price": format_money(q.target_price),
    "exchange_rate": format_rate(q.exchange_rate),
    "total_amount": format_money(q.total_amount),
    "material_cost": format_money(q.material_cost),
    "manufacturing_cost": format_money(q.manufacturing_cost),
    "other_cost": format_money(q.other_cost),
    "total_cost": format_money(q.total_cost),
    "cost_per_piece": format_money(q.cost_per_piece),
    "profit_percentage": format_pct(q.profit_percentage),
    "quoted_price": format_money(q.quoted_price),
  }


async def _next_quotation_code(db: AsyncSession, tenant_id: int) -> str:
  return await next_tenant_code(
    db,
    model=Quotation,
    tenant_id=tenant_id,
    prefix="QT-",
    width=4,
  )


def _to_quotation_response(
  quotation: Quotation,
  converted_order_id: int | None = None,
  ai_indicators: QuotationAiIndicatorsOut | None = None,
  *,
  tenant: Tenant | None = None,
  customer_name: str | None = None,
  inquiry_code: str | None = None,
) -> QuotationResponse:
  commission_value = (
    float(quotation.commission_value) if quotation.commission_value is not None else None
  )
  book_ccy = resolve_commercial_book_currency(tenant, quotation.currency) if tenant else None
  hdr = _quotation_header_api_strings(quotation)
  return QuotationResponse(
    id=quotation.id,
    tenant_id=quotation.tenant_id,
    customer_id=quotation.customer_id,
    inquiry_id=quotation.inquiry_id,
    quotation_code=quotation.quotation_code,
    style_ref=quotation.style_ref,
    style_id=quotation.style_id,
    customer_intermediary_id=quotation.customer_intermediary_id,
    shipping_term=quotation.shipping_term,
    commission_mode=quotation.commission_mode,
    commission_type=quotation.commission_type,
    commission_value=commission_value,
    department=quotation.department,
    projected_quantity=quotation.projected_quantity,
    quotation_date=quotation.quotation_date,
    projected_delivery_date=quotation.projected_delivery_date,
    target_price=hdr["target_price"],
    target_price_currency=quotation.target_price_currency,
    exchange_rate=hdr["exchange_rate"],
    currency=quotation.currency,
    total_amount=hdr["total_amount"],
    material_cost=hdr["material_cost"],
    manufacturing_cost=hdr["manufacturing_cost"],
    other_cost=hdr["other_cost"],
    total_cost=hdr["total_cost"],
    cost_per_piece=hdr["cost_per_piece"],
    profit_percentage=hdr["profit_percentage"],
    quoted_price=hdr["quoted_price"],
    status=quotation.status,
    next_status_options=next_status_options(
      QUOTATION_TRANSITIONS,
      quotation.status,
      fallback="DRAFT",
    ),
    is_converted_to_order=converted_order_id is not None,
    converted_order_id=converted_order_id,
    version_no=quotation.version_no,
    valid_until=quotation.valid_until,
    notes=quotation.notes,
    created_at=quotation.created_at.isoformat(),
    updated_at=quotation.updated_at.isoformat(),
    ai_indicators=ai_indicators,
    commercial_book_currency=book_ccy,
    customer_name=customer_name,
    inquiry_code=inquiry_code,
  )


async def _get_converted_order_map(
  db: AsyncSession, *, tenant_id: int, quotation_ids: list[int]
) -> dict[int, int]:
  if not quotation_ids:
    return {}
  result = await db.execute(
    select(Order.id, Order.quotation_id)
    .where(
      Order.tenant_id == tenant_id,
      Order.quotation_id.in_(quotation_ids),
    )
    .order_by(Order.created_at.desc(), Order.id.desc())
  )
  mapping: dict[int, int] = {}
  for order_id, quotation_id in result.all():
    if quotation_id is None:
      continue
    mapping.setdefault(quotation_id, order_id)
  return mapping


async def _validate_style(db: AsyncSession, *, tenant_id: int, style_id: int) -> None:
  style = await db.get(GarmentStyle, style_id)
  if not style or style.tenant_id != tenant_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Style not found")


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


@router.get("", response_model=list[QuotationResponse])
async def list_quotations(
  *,
  search: str | None = Query(default=None, description="Search by code, style, currency"),
  status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
  department: str | None = Query(default=None, description="Reserved for future department filter"),
  created_from: date | None = Query(default=None, description="Created at from (inclusive)"),
  created_to: date | None = Query(default=None, description="Created at to (inclusive)"),
  ai_indicators: int = Query(default=0, ge=0, le=1, description="Include AI indicators when 1"),
  benchmark_hint: int = Query(
      default=0,
      ge=0,
      le=1,
      description="When 1 with ai_indicators=1, attach last cost benchmark badge label per row (if feature enabled).",
  ),
  limit: int = Query(default=50, ge=1, le=500),
  offset: int = Query(default=0, ge=0),
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  stmt = select(Quotation).where(Quotation.tenant_id == tenant.id)

  if search:
    pattern = f"%{search.lower()}%"
    stmt = stmt.where(
      or_(
        func.lower(Quotation.quotation_code).like(pattern),
        func.lower(Quotation.style_ref).like(pattern),
        func.lower(Quotation.currency).like(pattern),
      )
    )

  if status_filter:
    stmt = stmt.where(Quotation.status == status_filter)
  if department:
    stmt = stmt.where(Quotation.department == department)

  if created_from:
    start_dt = datetime.combine(created_from, time.min)
    stmt = stmt.where(Quotation.created_at >= start_dt)
  if created_to:
    end_dt = datetime.combine(created_to, time.max)
    stmt = stmt.where(Quotation.created_at <= end_dt)

  stmt = stmt.order_by(Quotation.created_at.desc()).limit(limit).offset(offset)

  result = await db.execute(stmt)
  rows = result.scalars().all()
  converted_map = await _get_converted_order_map(
    db, tenant_id=tenant.id, quotation_ids=[r.id for r in rows]
  )
  bench_hints: dict[int, str] = {}
  if ai_indicators and benchmark_hint and is_quotation_cost_benchmark_enabled(tenant=tenant):
    bench_hints = await qcb_svc.benchmark_hints_for_quotation_ids(
      db, tenant_id=tenant.id, quotation_ids=[r.id for r in rows]
    )

  out: list[QuotationResponse] = []
  for r in rows:
    ind: QuotationAiIndicatorsOut | None = None
    if ai_indicators:
      ind = compute_quotation_ai_indicators(r, tenant=tenant, signal_scope="header_only")
      if is_quotation_cost_benchmark_enabled(tenant=tenant):
        ind = ind.model_copy(update={"cost_benchmark_enabled": True})
      if benchmark_hint and bench_hints:
        ind = ind.model_copy(
          update={"cost_benchmark_label": bench_hints.get(r.id)},
        )
    out.append(
      _to_quotation_response(
        r,
        converted_map.get(r.id),
        ai_indicators=ind,
        tenant=tenant,
      )
    )
  return out


@router.get("/paginated", response_model=QuotationListPageResponse)
async def list_quotations_paginated(
  *,
  search: str | None = Query(default=None, description="Search by code, style, currency"),
  status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
  department: str | None = Query(default=None, description="Reserved for future department filter"),
  created_from: date | None = Query(default=None, description="Created at from (inclusive)"),
  created_to: date | None = Query(default=None, description="Created at to (inclusive)"),
  ai_indicators: int = Query(default=0, ge=0, le=1, description="Include AI indicators when 1"),
  benchmark_hint: int = Query(
    default=0,
    ge=0,
    le=1,
    description="When 1 with ai_indicators=1, attach last cost benchmark badge label per row (if feature enabled).",
  ),
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
    s = stmt.where(Quotation.tenant_id == tenant.id)
    if search:
      pattern = f"%{search.lower()}%"
      s = s.where(
        or_(
          func.lower(Quotation.quotation_code).like(pattern),
          func.lower(Quotation.style_ref).like(pattern),
          func.lower(Quotation.currency).like(pattern),
        )
      )
    if status_filter:
      s = s.where(Quotation.status == status_filter)
    if department:
      s = s.where(Quotation.department == department)
    if created_from:
      start_dt = datetime.combine(created_from, time.min)
      s = s.where(Quotation.created_at >= start_dt)
    if created_to:
      end_dt = datetime.combine(created_to, time.max)
      s = s.where(Quotation.created_at <= end_dt)
    return s

  count_stmt = _apply_filters(select(func.count()).select_from(Quotation))
  total = int((await db.execute(count_stmt)).scalar_one() or 0)
  tp = total_pages(total, ps)
  pg = safe_page(page, total, ps)
  offset = (pg - 1) * ps

  list_stmt = (
    _apply_filters(
      select(Quotation, Customer.name, Inquiry.inquiry_code)
      .outerjoin(Customer, (Customer.id == Quotation.customer_id) & (Customer.tenant_id == tenant.id))
      .outerjoin(Inquiry, (Inquiry.id == Quotation.inquiry_id) & (Inquiry.tenant_id == tenant.id))
    )
    .order_by(Quotation.created_at.desc())
    .limit(ps)
    .offset(offset)
  )
  result = await db.execute(list_stmt)
  row_tuples = result.all()
  q_only = [r for r, _, _ in row_tuples]
  converted_map = await _get_converted_order_map(db, tenant_id=tenant.id, quotation_ids=[r.id for r in q_only])
  bench_hints: dict[int, str] = {}
  if ai_indicators and benchmark_hint and is_quotation_cost_benchmark_enabled(tenant=tenant) and q_only:
    bench_hints = await qcb_svc.benchmark_hints_for_quotation_ids(
      db, tenant_id=tenant.id, quotation_ids=[r.id for r in q_only]
    )

  items: list[QuotationResponse] = []
  for qrow, cust_name, inq_code in row_tuples:
    ind: QuotationAiIndicatorsOut | None = None
    if ai_indicators:
      ind = compute_quotation_ai_indicators(qrow, tenant=tenant, signal_scope="header_only")
      if is_quotation_cost_benchmark_enabled(tenant=tenant):
        ind = ind.model_copy(update={"cost_benchmark_enabled": True})
      if benchmark_hint and bench_hints:
        ind = ind.model_copy(update={"cost_benchmark_label": bench_hints.get(qrow.id)})
    items.append(
      _to_quotation_response(
        qrow,
        converted_map.get(qrow.id),
        ai_indicators=ind,
        tenant=tenant,
        customer_name=cust_name,
        inquiry_code=inq_code,
      )
    )

  return QuotationListPageResponse(items=items, total=total, page=pg, page_size=ps, total_pages=tp)


class InquiryToQuotationBody(BaseModel):
  """Payload for converting an inquiry into a quotation."""

  profit_percentage: float = 15.0


@router.post("/{quotation_id}/submit", response_model=QuotationResponse)
async def submit_quotation(
  quotation_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  quotation = await db.get(Quotation, quotation_id)
  if not quotation or quotation.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
  quotation.status = validate_transition(
    QUOTATION_TRANSITIONS,
    quotation.status,
    "SUBMITTED",
    fallback="DRAFT",
    entity_label="quotation",
  )
  await db.flush()
  await db.refresh(quotation)
  return _to_quotation_response(quotation, tenant=tenant)


@router.post("/{quotation_id}/approve", response_model=QuotationResponse)
async def approve_quotation(
  quotation_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  quotation = await db.get(Quotation, quotation_id)
  if not quotation or quotation.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
  quotation.status = validate_transition(
    QUOTATION_TRANSITIONS,
    quotation.status,
    "APPROVED",
    fallback="DRAFT",
    entity_label="quotation",
  )
  await db.flush()
  await db.refresh(quotation)
  return _to_quotation_response(quotation, tenant=tenant)


@router.post("/{quotation_id}/send", response_model=QuotationResponse)
async def send_quotation(
  quotation_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  quotation = await db.get(Quotation, quotation_id)
  if not quotation or quotation.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
  quotation.status = validate_transition(
    QUOTATION_TRANSITIONS,
    quotation.status,
    "SENT",
    fallback="DRAFT",
    entity_label="quotation",
  )
  await db.flush()
  await db.refresh(quotation)
  return _to_quotation_response(quotation, tenant=tenant)


@router.post("/{quotation_id}/revise", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
async def revise_quotation(
  quotation_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  quotation = await db.get(Quotation, quotation_id)
  if not quotation or quotation.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
  code = await _next_quotation_code(db, tenant.id)
  revised = Quotation(
    tenant_id=tenant.id,
    customer_id=quotation.customer_id,
    inquiry_id=quotation.inquiry_id,
    quotation_code=code,
    style_ref=quotation.style_ref,
    style_id=quotation.style_id,
    customer_intermediary_id=quotation.customer_intermediary_id,
    shipping_term=quotation.shipping_term,
    commission_mode=quotation.commission_mode,
    commission_type=quotation.commission_type,
    commission_value=quotation.commission_value,
    department=quotation.department,
    projected_quantity=quotation.projected_quantity,
    projected_delivery_date=quotation.projected_delivery_date,
    quotation_date=quotation.quotation_date,
    target_price=quotation.target_price,
    target_price_currency=quotation.target_price_currency,
    exchange_rate=quotation.exchange_rate,
    material_cost=quotation.material_cost,
    manufacturing_cost=quotation.manufacturing_cost,
    other_cost=quotation.other_cost,
    total_cost=quotation.total_cost,
    cost_per_piece=quotation.cost_per_piece,
    profit_percentage=quotation.profit_percentage,
    quoted_price=quotation.quoted_price,
    currency=quotation.currency,
    total_amount=quotation.total_amount,
    status="DRAFT",
    version_no=(quotation.version_no or 1) + 1,
    valid_until=quotation.valid_until,
    size_ratio_enabled=quotation.size_ratio_enabled,
    pack_ratio=quotation.pack_ratio,
    pcs_per_carton=quotation.pcs_per_carton,
    notes=quotation.notes,
  )
  db.add(revised)
  await flush_handling_duplicate_document_code(db)
  await db.refresh(revised)
  return _to_quotation_response(revised, tenant=tenant)


@router.post(
  "/from-inquiry/{inquiry_id}",
  response_model=QuotationResponse,
  status_code=status.HTTP_201_CREATED,
)
async def create_quotation_from_inquiry(
  inquiry_id: int,
  response: Response,
  body: InquiryToQuotationBody | None = None,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """Convert an inquiry into a basic quotation, similar to the reference workflow."""
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  inquiry = await db.get(Inquiry, inquiry_id)
  if not inquiry or inquiry.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")

  existing = await db.execute(
    select(Quotation)
    .where(
      Quotation.tenant_id == tenant.id,
      Quotation.inquiry_id == inquiry.id,
    )
    .order_by(Quotation.created_at.desc(), Quotation.id.desc())
    .limit(1)
  )
  existing_quotation = existing.scalar_one_or_none()
  if existing_quotation is not None:
    response.status_code = status.HTTP_200_OK
    converted_map = await _get_converted_order_map(
      db, tenant_id=tenant.id, quotation_ids=[existing_quotation.id]
    )
    return _to_quotation_response(
      existing_quotation,
      converted_map.get(existing_quotation.id),
      tenant=tenant,
    )

  customer = await db.get(Customer, inquiry.customer_id)
  if not customer or customer.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

  profit_dec = Decimal(str(body.profit_percentage if body else 15.0))
  profit_pct = float(profit_dec) / 100.0
  # We treat target_price as a base and apply a margin to simulate quotation pricing
  try:
    base_price = float(inquiry.target_price) if inquiry.target_price is not None else 0.0
  except (TypeError, ValueError):
    base_price = 0.0
  quoted_amount = base_price * (1.0 + profit_pct) if base_price > 0 else base_price
  qamt = _quantize_money4(Decimal(str(quoted_amount))) if quoted_amount else None
  tenant_default_mode = (
    tenant.default_commission_mode.value
    if tenant.default_commission_mode is not None
    else CommissionMode.EXCLUDE.value
  )
  inquiry_commission_mode = inquiry.commission_mode or tenant_default_mode

  code = await _next_quotation_code(db, tenant.id)
  quotation = Quotation(
    tenant_id=tenant.id,
    customer_id=inquiry.customer_id,
    inquiry_id=inquiry.id,
    quotation_code=code,
    style_ref=inquiry.style_ref,
    style_id=inquiry.style_id,
    customer_intermediary_id=inquiry.customer_intermediary_id,
    department=inquiry.department,
    projected_quantity=inquiry.quantity,
    projected_delivery_date=inquiry.expected_delivery_date,
    shipping_term=inquiry.shipping_term,
    commission_mode=inquiry_commission_mode,
    commission_type=inquiry.commission_type,
    commission_value=inquiry.commission_value,
    target_price=inquiry.target_price,
    target_price_currency=inquiry.target_price_currency or inquiry.currency or "USD",
    exchange_rate=inquiry.exchange_rate if inquiry.exchange_rate is not None else Decimal("1"),
    profit_percentage=profit_dec,
    currency=inquiry.currency or inquiry.target_price_currency or "USD",
    quoted_price=qamt,
    total_amount=qamt,
    status="NEW",
    version_no=1,
    valid_until=None,
    notes=inquiry.notes,
  )
  db.add(quotation)
  old_status = inquiry.status
  inquiry.status = validate_transition(
    INQUIRY_TRANSITIONS,
    inquiry.status,
    "CONVERTED",
    fallback="DRAFT",
    entity_label="inquiry",
  )
  db.add(
    InquiryEvent(
      tenant_id=tenant.id,
      inquiry_id=inquiry.id,
      event_type="converted_to_quotation",
      from_status=old_status,
      to_status=inquiry.status,
      notes=f"Converted to quotation {code}",
    )
  )
  await flush_handling_duplicate_document_code(db)
  await db.refresh(quotation)

  return _to_quotation_response(quotation, tenant=tenant)


@router.post("", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
async def create_quotation(
  body: QuotationCreate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  customer = await db.get(Customer, body.customer_id)
  if not customer or customer.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

  inquiry: Inquiry | None = None
  if body.inquiry_id is not None:
    inquiry = await db.get(Inquiry, body.inquiry_id)
    if not inquiry or inquiry.tenant_id != tenant.id:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inquiry not found")
  if body.style_id is not None:
    await _validate_style(db, tenant_id=tenant.id, style_id=body.style_id)
  if body.customer_intermediary_id is not None:
    await _validate_customer_intermediary(
      db,
      tenant_id=tenant.id,
      customer_id=body.customer_id,
      customer_intermediary_id=body.customer_intermediary_id,
    )
  tenant_default_mode = (
    tenant.default_commission_mode.value
    if tenant.default_commission_mode is not None
    else CommissionMode.EXCLUDE.value
  )
  commission_mode = body.commission_mode or tenant_default_mode

  code = await _next_quotation_code(db, tenant.id)
  quotation = Quotation(
    tenant_id=tenant.id,
    customer_id=body.customer_id,
    inquiry_id=body.inquiry_id,
    quotation_code=code,
    style_ref=body.style_ref,
    style_id=body.style_id,
    customer_intermediary_id=body.customer_intermediary_id,
    shipping_term=body.shipping_term,
    commission_mode=commission_mode,
    commission_type=body.commission_type,
    commission_value=body.commission_value,
    currency=body.currency,
    total_amount=parse_money(body.total_amount),
    status="DRAFT",
    version_no=1,
    valid_until=body.valid_until,
    notes=body.notes,
  )
  db.add(quotation)
  if inquiry is not None:
    current_inquiry_status = (inquiry.status or "DRAFT").strip().upper()
    if current_inquiry_status == "SUBMITTED":
      old_status = inquiry.status
      inquiry.status = validate_transition(
        INQUIRY_TRANSITIONS,
        inquiry.status,
        "CONVERTED",
        fallback="DRAFT",
        entity_label="inquiry",
      )
      db.add(
        InquiryEvent(
          tenant_id=tenant.id,
          inquiry_id=inquiry.id,
          event_type="converted_to_quotation",
          from_status=old_status,
          to_status=inquiry.status,
          notes=f"Converted to quotation {code}",
        )
      )
  await flush_handling_duplicate_document_code(db)
  await db.refresh(quotation)
  return _to_quotation_response(quotation, tenant=tenant)


def _material_to_line(m: QuotationMaterial) -> QuotationMaterialLine:
  return QuotationMaterialLine(
    id=m.id,
    serial_no=m.serial_no,
    category_id=m.category_id,
    item_id=m.item_id,
    description=m.description,
    unit=m.unit,
    consumption_per_dozen=format_rate(m.consumption_per_dozen) or "0",
    unit_price=format_money(m.unit_price) or "0",
    amount_per_dozen=format_money(m.amount_per_dozen) or "0",
    total_amount=format_money(m.total_amount) or "0",
    currency=m.currency or "USD",
    exchange_rate=format_rate(m.exchange_rate) or "1",
    base_amount=format_money(m.base_amount) or "0",
    local_amount=format_money(m.local_amount) or "0",
  )


def _manufacturing_to_line(m: QuotationManufacturing) -> QuotationManufacturingLine:
  return QuotationManufacturingLine(
    id=m.id,
    serial_no=m.serial_no,
    style_part=m.style_part,
    machines_required=m.machines_required,
    production_per_hour=format_rate(m.production_per_hour) or "0",
    production_per_day=format_rate(m.production_per_day) or "0",
    cost_per_machine=format_money(m.cost_per_machine) or "0",
    total_line_cost=format_money(m.total_line_cost) or "0",
    cost_per_dozen=format_money(m.cost_per_dozen) or "0",
    cm_per_piece=format_money(m.cm_per_piece) or "0",
    total_order_cost=format_money(m.total_order_cost) or "0",
    currency=m.currency or "USD",
    exchange_rate=format_rate(m.exchange_rate) or "1",
    base_amount=format_money(m.base_amount) or "0",
    local_amount=format_money(m.local_amount) or "0",
  )


def _other_cost_to_line(c: QuotationOtherCost) -> QuotationOtherCostLine:
  return QuotationOtherCostLine(
    id=c.id,
    serial_no=c.serial_no,
    cost_head=c.cost_head,
    percentage=format_pct(c.percentage) or "0",
    total_amount=format_money(c.total_amount) or "0",
    cost_type=c.cost_type or "fixed",
    value=format_money(c.value) or "0",
    based_on=c.based_on or "subtotal",
    calculated_amount=format_money(c.calculated_amount) or "0",
    notes=c.notes,
    currency=c.currency or "USD",
    exchange_rate=format_rate(c.exchange_rate) or "1",
    base_amount=format_money(c.base_amount) or "0",
    local_amount=format_money(c.local_amount) or "0",
  )


def _size_ratio_to_line(s: QuotationSizeRatio) -> QuotationSizeRatioLine:
  return QuotationSizeRatioLine(
    id=s.id,
    serial_no=s.serial_no,
    size=s.size,
    ratio_percentage=format_pct(s.ratio_percentage) or "0",
    fabric_factor=format_money(s.fabric_factor) or "1",
    quantity=s.quantity,
  )


@router.get("/{quotation_id}", response_model=QuotationDetailResponse)
async def get_quotation(
  quotation_id: int,
  ai_indicators: int = Query(default=0, ge=0, le=1, description="Include AI indicators when 1"),
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """Get quotation by ID with full cost breakdown (materials, manufacturing, other costs, size ratios)."""
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  quotation = await db.get(Quotation, quotation_id)
  if not quotation or quotation.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

  # Load cost children
  mat_result = await db.execute(
    select(QuotationMaterial).where(
      QuotationMaterial.quotation_id == quotation_id,
      QuotationMaterial.tenant_id == tenant.id,
    ).order_by(QuotationMaterial.serial_no)
  )
  mfg_result = await db.execute(
    select(QuotationManufacturing).where(
      QuotationManufacturing.quotation_id == quotation_id,
      QuotationManufacturing.tenant_id == tenant.id,
    ).order_by(QuotationManufacturing.serial_no)
  )
  other_result = await db.execute(
    select(QuotationOtherCost).where(
      QuotationOtherCost.quotation_id == quotation_id,
      QuotationOtherCost.tenant_id == tenant.id,
    ).order_by(QuotationOtherCost.serial_no)
  )
  sr_result = await db.execute(
    select(QuotationSizeRatio).where(
      QuotationSizeRatio.quotation_id == quotation_id,
      QuotationSizeRatio.tenant_id == tenant.id,
    ).order_by(QuotationSizeRatio.serial_no)
  )
  materials = [_material_to_line(r) for r in mat_result.scalars().all()]
  manufacturing = [_manufacturing_to_line(r) for r in mfg_result.scalars().all()]
  other_costs = [_other_cost_to_line(r) for r in other_result.scalars().all()]
  size_ratios = [_size_ratio_to_line(r) for r in sr_result.scalars().all()]
  converted_map = await _get_converted_order_map(
    db, tenant_id=tenant.id, quotation_ids=[quotation.id]
  )
  converted_order_id = converted_map.get(quotation.id)
  book_ccy = resolve_commercial_book_currency(tenant, quotation.currency)
  hdr = _quotation_header_api_strings(quotation)
  detail_ai = None
  if ai_indicators:
    detail_ai = compute_quotation_ai_indicators(
      quotation,
      tenant=tenant,
      signal_scope="full_costing",
      material_lines=[m.model_dump() for m in materials],
      manufacturing_lines=[m.model_dump() for m in manufacturing],
      other_cost_lines=[m.model_dump() for m in other_costs],
      size_ratio_lines=[s.model_dump() for s in size_ratios],
    )
    if is_quotation_cost_benchmark_enabled(tenant=tenant):
      hints = await qcb_svc.benchmark_hints_for_quotation_ids(
        db, tenant_id=tenant.id, quotation_ids=[quotation.id]
      )
      detail_ai = detail_ai.model_copy(
        update={
          "cost_benchmark_enabled": True,
          "cost_benchmark_label": hints.get(quotation.id),
        }
      )

  return QuotationDetailResponse(
    id=quotation.id,
    tenant_id=quotation.tenant_id,
    customer_id=quotation.customer_id,
    inquiry_id=quotation.inquiry_id,
    quotation_code=quotation.quotation_code,
    style_ref=quotation.style_ref,
    style_id=quotation.style_id,
    customer_intermediary_id=quotation.customer_intermediary_id,
    shipping_term=quotation.shipping_term,
    commission_mode=quotation.commission_mode,
    commission_type=quotation.commission_type,
    commission_value=float(quotation.commission_value) if quotation.commission_value is not None else None,
    department=quotation.department,
    projected_quantity=quotation.projected_quantity,
    projected_delivery_date=quotation.projected_delivery_date,
    quotation_date=quotation.quotation_date,
    target_price=hdr["target_price"],
    target_price_currency=quotation.target_price_currency,
    exchange_rate=hdr["exchange_rate"],
    material_cost=hdr["material_cost"],
    manufacturing_cost=hdr["manufacturing_cost"],
    other_cost=hdr["other_cost"],
    total_cost=hdr["total_cost"],
    cost_per_piece=hdr["cost_per_piece"],
    profit_percentage=hdr["profit_percentage"],
    quoted_price=hdr["quoted_price"],
    currency=quotation.currency,
    total_amount=hdr["total_amount"],
    status=quotation.status,
    is_converted_to_order=converted_order_id is not None,
    converted_order_id=converted_order_id,
    version_no=quotation.version_no,
    valid_until=quotation.valid_until,
    size_ratio_enabled=quotation.size_ratio_enabled,
    pack_ratio=quotation.pack_ratio,
    pcs_per_carton=quotation.pcs_per_carton,
    notes=quotation.notes,
    created_at=quotation.created_at.isoformat(),
    updated_at=quotation.updated_at.isoformat(),
    materials=materials,
    manufacturing=manufacturing,
    other_costs=other_costs,
    size_ratios=size_ratios,
    commercial_book_currency=book_ccy,
    ai_indicators=detail_ai,
  )


@router.patch("/{quotation_id}", response_model=QuotationResponse)
async def update_quotation(
  quotation_id: int,
  body: QuotationUpdate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  quotation = await db.get(Quotation, quotation_id)
  if not quotation or quotation.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

  patch_fields = body.model_dump(exclude_unset=True)
  blocked = list_quotation_commercial_patch_violations(quotation.status, patch_fields)
  if blocked:
    raise HTTPException(
      status_code=status.HTTP_409_CONFLICT,
      detail={
        "code": "COMMERCIAL_CHANGE_REQUIRED",
        "message": f"Quotation is in status {quotation.status}; use a commercial change request for: {', '.join(blocked)}",
        "fields": blocked,
      },
    )

  if body.style_ref is not None:
    quotation.style_ref = body.style_ref
  if body.style_id is not None:
    await _validate_style(db, tenant_id=tenant.id, style_id=body.style_id)
    quotation.style_id = body.style_id
  if body.customer_intermediary_id is not None:
    await _validate_customer_intermediary(
      db,
      tenant_id=tenant.id,
      customer_id=quotation.customer_id,
      customer_intermediary_id=body.customer_intermediary_id,
    )
    quotation.customer_intermediary_id = body.customer_intermediary_id
  if body.shipping_term is not None:
    quotation.shipping_term = body.shipping_term
  if body.commission_mode is not None:
    quotation.commission_mode = body.commission_mode
  if body.commission_type is not None:
    quotation.commission_type = body.commission_type
  if body.commission_value is not None:
    quotation.commission_value = body.commission_value
  if body.currency is not None:
    quotation.currency = normalize_currency_code(body.currency)
  if body.total_amount is not None:
    quotation.total_amount = parse_money(body.total_amount)
  if body.valid_until is not None:
    quotation.valid_until = body.valid_until
  if body.status is not None:
    quotation.status = validate_transition(
      QUOTATION_TRANSITIONS,
      quotation.status,
      body.status,
      fallback="DRAFT",
      entity_label="quotation",
    )
  if body.notes is not None:
    quotation.notes = body.notes

  await db.flush()
  await db.refresh(quotation)
  return _to_quotation_response(quotation, tenant=tenant)


@router.put("/{quotation_id}", response_model=QuotationDetailResponse)
async def full_update_quotation(
  quotation_id: int,
  body: QuotationFullUpdate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """Full update: header + materials, manufacturing, other costs, size ratios. Recomputes cost totals."""
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  quotation = await db.get(Quotation, quotation_id)
  if not quotation or quotation.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

  if is_quotation_commercial_locked(quotation.status):
    raise HTTPException(
      status_code=status.HTTP_409_CONFLICT,
      detail={
        "code": "COMMERCIAL_CHANGE_REQUIRED",
        "message": (
          f"Quotation is in status {quotation.status}. "
          "Full costing updates are blocked; use commercial change requests per field, duplicate/revise the quotation, "
          "or move status back to an editable state where permitted."
        ),
      },
    )

  # Update header
  if body.style_ref is not None:
    quotation.style_ref = body.style_ref
  if body.style_id is not None:
    await _validate_style(db, tenant_id=tenant.id, style_id=body.style_id)
    quotation.style_id = body.style_id
  if body.customer_intermediary_id is not None:
    await _validate_customer_intermediary(
      db,
      tenant_id=tenant.id,
      customer_id=quotation.customer_id,
      customer_intermediary_id=body.customer_intermediary_id,
    )
    quotation.customer_intermediary_id = body.customer_intermediary_id
  if body.shipping_term is not None:
    quotation.shipping_term = body.shipping_term
  if body.commission_mode is not None:
    quotation.commission_mode = body.commission_mode
  if body.commission_type is not None:
    quotation.commission_type = body.commission_type
  if body.commission_value is not None:
    quotation.commission_value = body.commission_value
  if body.department is not None:
    quotation.department = body.department
  if body.projected_quantity is not None:
    quotation.projected_quantity = body.projected_quantity
  if body.projected_delivery_date is not None:
    quotation.projected_delivery_date = body.projected_delivery_date
  if body.quotation_date is not None:
    quotation.quotation_date = body.quotation_date
  if body.target_price is not None:
    quotation.target_price = parse_money(body.target_price)
  if body.target_price_currency is not None:
    quotation.target_price_currency = normalize_currency_code(body.target_price_currency)
  if body.exchange_rate is not None:
    quotation.exchange_rate = parse_money(body.exchange_rate)
  if body.currency is not None:
    quotation.currency = normalize_currency_code(body.currency)
  if body.total_amount is not None:
    quotation.total_amount = parse_money(body.total_amount)
  if body.status is not None:
    quotation.status = validate_transition(
      QUOTATION_TRANSITIONS,
      quotation.status,
      body.status,
      fallback="DRAFT",
      entity_label="quotation",
    )
  if body.valid_until is not None:
    quotation.valid_until = body.valid_until
  if body.size_ratio_enabled is not None:
    quotation.size_ratio_enabled = body.size_ratio_enabled
  if body.pack_ratio is not None:
    quotation.pack_ratio = body.pack_ratio
  if body.pcs_per_carton is not None:
    quotation.pcs_per_carton = body.pcs_per_carton
  if body.notes is not None:
    quotation.notes = body.notes

  recompute_rollups = cost_line_arrays_present_in_request(
    body.materials,
    body.manufacturing,
    body.other_costs,
  )
  if recompute_rollups:
    rollup_errors = collect_rollup_money_errors(
      materials=body.materials,
      manufacturing=body.manufacturing,
      other_costs=body.other_costs,
    )
    if rollup_errors:
      raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={
          "code": "QUOTATION_MONEY_VALIDATION",
          "message": "Invalid money values in costing lines.",
          "errors": rollup_errors,
        },
      )

  # Replace materials
  if body.materials is not None:
    await db.execute(delete(QuotationMaterial).where(
      QuotationMaterial.quotation_id == quotation_id,
      QuotationMaterial.tenant_id == tenant.id,
    ))
    for i, row in enumerate(body.materials):
      if row.category_id is None and row.item_id is None and not (row.description or "").strip():
        continue
      if row.category_id is not None and row.item_id is None:
        raise HTTPException(
          status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
          detail={
            "code": "MATERIAL_ITEM_REQUIRED",
            "message": (
              f"Material line {i + 1}: select an inventory item when a category is chosen."
            ),
          },
        )
      effective_unit = (row.unit or "").strip()
      if row.item_id is not None:
        inv_item = await db.get(Item, row.item_id)
        if not inv_item or inv_item.tenant_id != tenant.id:
          raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
              "code": "MATERIAL_INVALID_ITEM",
              "message": f"Material line {i + 1}: item not found for this tenant.",
            },
          )
        uom = await db.get(ItemUnit, inv_item.unit_id)
        if not uom or uom.tenant_id != tenant.id:
          raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
              "code": "MATERIAL_INVALID_UNIT",
              "message": f"Material line {i + 1}: item has no valid unit of measure.",
            },
          )
        if not effective_unit:
          effective_unit = (uom.name or uom.unit_code or "").strip()
        if not effective_unit:
          raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
              "code": "MATERIAL_UOM_REQUIRED",
              "message": f"Material line {i + 1}: unit of measure is required.",
            },
          )
      db.add(QuotationMaterial(
        tenant_id=tenant.id,
        quotation_id=quotation_id,
        serial_no=row.serial_no or (i + 1),
        category_id=row.category_id,
        item_id=row.item_id,
        description=row.description,
        unit=effective_unit or (row.unit or ""),
        consumption_per_dozen=line_consumption_from_input(row.consumption_per_dozen),
        unit_price=line_money_from_input(row.unit_price),
        amount_per_dozen=line_money_from_input(row.amount_per_dozen),
        total_amount=line_money_from_input(row.total_amount),
        currency=row.currency or "USD",
        exchange_rate=line_rate_from_input(row.exchange_rate),
        base_amount=line_money_from_input(row.base_amount),
        local_amount=line_money_from_input(row.local_amount),
      ))

  # Replace manufacturing
  if body.manufacturing is not None:
    await db.execute(delete(QuotationManufacturing).where(
      QuotationManufacturing.quotation_id == quotation_id,
      QuotationManufacturing.tenant_id == tenant.id,
    ))
    for i, row in enumerate(body.manufacturing):
      if not (row.style_part or "").strip():
        continue
      db.add(QuotationManufacturing(
        tenant_id=tenant.id,
        quotation_id=quotation_id,
        serial_no=row.serial_no or (i + 1),
        style_part=row.style_part,
        machines_required=row.machines_required,
        production_per_hour=line_rate_from_input(row.production_per_hour, default=Decimal("0")),
        production_per_day=line_rate_from_input(row.production_per_day, default=Decimal("0")),
        cost_per_machine=line_money_from_input(row.cost_per_machine),
        total_line_cost=line_money_from_input(row.total_line_cost),
        cost_per_dozen=line_money_from_input(row.cost_per_dozen),
        cm_per_piece=line_money_from_input(row.cm_per_piece),
        total_order_cost=line_money_from_input(row.total_order_cost),
        currency=row.currency or "USD",
        exchange_rate=line_rate_from_input(row.exchange_rate),
        base_amount=line_money_from_input(row.base_amount),
        local_amount=line_money_from_input(row.local_amount),
      ))

  # Replace other costs
  if body.other_costs is not None:
    await db.execute(delete(QuotationOtherCost).where(
      QuotationOtherCost.quotation_id == quotation_id,
      QuotationOtherCost.tenant_id == tenant.id,
    ))
    for i, row in enumerate(body.other_costs):
      if not (row.cost_head or "").strip():
        continue
      db.add(QuotationOtherCost(
        tenant_id=tenant.id,
        quotation_id=quotation_id,
        serial_no=row.serial_no or (i + 1),
        cost_head=row.cost_head,
        percentage=line_pct_from_input(row.percentage),
        total_amount=line_money_from_input(row.total_amount),
        cost_type=row.cost_type or "fixed",
        value=line_money_from_input(row.value),
        based_on=row.based_on or "subtotal",
        calculated_amount=line_money_from_input(row.calculated_amount),
        notes=row.notes,
        currency=row.currency or "USD",
        exchange_rate=line_rate_from_input(row.exchange_rate),
        base_amount=line_money_from_input(row.base_amount),
        local_amount=line_money_from_input(row.local_amount),
      ))

  # Replace size ratios
  if body.size_ratios is not None:
    await db.execute(delete(QuotationSizeRatio).where(
      QuotationSizeRatio.quotation_id == quotation_id,
      QuotationSizeRatio.tenant_id == tenant.id,
    ))
    for i, row in enumerate(body.size_ratios):
      if not (row.size or "").strip():
        continue
      db.add(QuotationSizeRatio(
        tenant_id=tenant.id,
        quotation_id=quotation_id,
        serial_no=row.serial_no or (i + 1),
        size=row.size,
        ratio_percentage=line_pct_from_input(row.ratio_percentage),
        fabric_factor=fabric_factor_from_input(row.fabric_factor),
        quantity=row.quantity,
      ))

  await db.flush()

  total_cost = Decimal("0")
  if recompute_rollups:
    mat_total = Decimal("0")
    mfg_total = Decimal("0")
    other_total = Decimal("0")
    doc_cur = quotation.currency
    if body.materials:
      for row in body.materials:
        if not material_row_is_persisted_for_rollup(row):
          continue
        mat_total += parse_money_decimal(row.total_amount, field="materials[].total_amount")
    if body.manufacturing:
      for row in body.manufacturing:
        if not manufacturing_row_is_persisted_for_rollup(row):
          continue
        line_amt = parse_money_decimal(row.total_order_cost, field="manufacturing[].total_order_cost")
        fx = line_fx_to_quotation_multiplier(
          document_currency=doc_cur,
          line_currency=row.currency,
          exchange_rate=row.exchange_rate,
        )
        mfg_total += line_amt * fx
    if body.other_costs:
      for row in body.other_costs:
        if not other_cost_row_is_persisted_for_rollup(row):
          continue
        amt_src = other_cost_rollup_amount_string(row)
        if amt_src is None:
          continue
        raw = parse_money_decimal(amt_src, field="other_costs[].amount")
        cost_type = (getattr(row, "cost_type", None) or "fixed") or "fixed"
        if str(cost_type).strip().lower() == "percentage":
          other_total += raw
        else:
          fx = line_fx_to_quotation_multiplier(
            document_currency=doc_cur,
            line_currency=row.currency,
            exchange_rate=row.exchange_rate,
          )
          other_total += raw * fx
    total_cost = mat_total + mfg_total + other_total
    qty = Decimal(str(quotation.projected_quantity or 0))
    cost_per_piece = (total_cost / qty).quantize(FOUR_DP, rounding=ROUND_HALF_UP) if qty > 0 else Decimal("0")
    quotation.material_cost = _quantize_money4(mat_total)
    quotation.manufacturing_cost = _quantize_money4(mfg_total)
    quotation.other_cost = _quantize_money4(other_total)
    quotation.total_cost = _quantize_money4(total_cost)
    quotation.cost_per_piece = _quantize_money4(cost_per_piece)

  if body.profit_percentage is not None:
    quotation.profit_percentage = parse_money(body.profit_percentage)

  quoted_auto_derived = False
  if body.quoted_price is not None:
    quotation.quoted_price = parse_money(body.quoted_price)
  elif recompute_rollups and total_cost > 0 and quotation.profit_percentage:
    try:
      pct = parse_money_decimal(quotation.profit_percentage, field="profit_percentage") / Decimal("100")
    except MoneyParseError as e:
      raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={
          "code": "QUOTATION_MONEY_VALIDATION",
          "message": str(e),
          "field": "profit_percentage",
        },
      ) from e
    quoted_price = total_cost * (Decimal("1") + pct)
    quotation.quoted_price = _quantize_money4(quoted_price)
    quoted_auto_derived = True

  if body.total_amount is not None:
    quotation.total_amount = parse_money(body.total_amount)
  elif body.quoted_price is not None or quoted_auto_derived:
    quotation.total_amount = quotation.quoted_price

  fx_errs = validate_header_fx_rules(
    document_currency=quotation.currency,
    target_price_currency=quotation.target_price_currency,
    exchange_rate=quotation.exchange_rate,
  )
  line_fx_errs = validate_line_fx_rules(
    document_currency=quotation.currency,
    materials=body.materials,
    manufacturing=body.manufacturing,
    other_costs=body.other_costs,
  )
  combined_fx_errs = [*fx_errs, *line_fx_errs]
  if combined_fx_errs:
    raise HTTPException(
      status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
      detail={
        "code": "QUOTATION_FX_VALIDATION",
        "message": combined_fx_errs[0],
        "errors": combined_fx_errs,
      },
    )

  await db.flush()
  await db.refresh(quotation)
  # Return full detail (same session sees flushed children)
  return await get_quotation(quotation_id, tenant=tenant, user=user, db=db)


@router.delete("/{quotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quotation(
  quotation_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  quotation = await db.get(Quotation, quotation_id)
  if not quotation or quotation.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
  await ensure_quotation_deletable(db, tenant.id, quotation_id)
  await db.delete(quotation)
  await db.flush()


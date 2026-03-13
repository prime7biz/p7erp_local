from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    CommissionMode,
    Customer,
    CustomerIntermediary,
    GarmentStyle,
    Inquiry,
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
    QuotationManufacturingLine,
    QuotationMaterialLine,
    QuotationOtherCostLine,
    QuotationResponse,
    QuotationSizeRatioLine,
    QuotationUpdate,
)


router = APIRouter(prefix="/quotations", tags=["quotations"])


async def _next_quotation_code(db: AsyncSession, tenant_id: int) -> str:
  return await next_tenant_code(
    db,
    model=Quotation,
    tenant_id=tenant_id,
    prefix="QT-",
    width=4,
  )


def _to_quotation_response(quotation: Quotation) -> QuotationResponse:
  commission_value = (
    float(quotation.commission_value) if quotation.commission_value is not None else None
  )
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
    currency=quotation.currency,
    total_amount=quotation.total_amount,
    material_cost=quotation.material_cost,
    manufacturing_cost=quotation.manufacturing_cost,
    other_cost=quotation.other_cost,
    total_cost=quotation.total_cost,
    cost_per_piece=quotation.cost_per_piece,
    profit_percentage=quotation.profit_percentage,
    quoted_price=quotation.quoted_price,
    status=quotation.status,
    version_no=quotation.version_no,
    valid_until=quotation.valid_until,
    notes=quotation.notes,
    created_at=quotation.created_at.isoformat(),
    updated_at=quotation.updated_at.isoformat(),
  )


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
  limit: int = Query(default=50, ge=1, le=200),
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
  return [_to_quotation_response(r) for r in rows]


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
  if quotation.status not in ("DRAFT", "NEW"):
    raise HTTPException(status_code=400, detail="Only draft/new quotation can be submitted")
  quotation.status = "SUBMITTED"
  await db.flush()
  await db.refresh(quotation)
  return _to_quotation_response(quotation)


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
  if quotation.status not in ("SUBMITTED",):
    raise HTTPException(status_code=400, detail="Only submitted quotation can be approved")
  quotation.status = "APPROVED"
  await db.flush()
  await db.refresh(quotation)
  return _to_quotation_response(quotation)


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
  if quotation.status not in ("APPROVED",):
    raise HTTPException(status_code=400, detail="Only approved quotation can be sent")
  quotation.status = "SENT"
  await db.flush()
  await db.refresh(quotation)
  return _to_quotation_response(quotation)


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
  await db.flush()
  await db.refresh(revised)
  return _to_quotation_response(revised)


@router.post(
  "/from-inquiry/{inquiry_id}",
  response_model=QuotationResponse,
  status_code=status.HTTP_201_CREATED,
)
async def create_quotation_from_inquiry(
  inquiry_id: int,
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

  customer = await db.get(Customer, inquiry.customer_id)
  if not customer or customer.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")

  profit_pct = (body.profit_percentage if body else 15.0) / 100.0
  # We treat target_price as a base and apply a margin to simulate quotation pricing
  base_price = float(inquiry.target_price or 0) if inquiry.target_price is not None else 0.0
  quoted_amount = base_price * (1.0 + profit_pct) if base_price > 0 else base_price
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
    shipping_term=inquiry.shipping_term,
    commission_mode=inquiry_commission_mode,
    commission_type=inquiry.commission_type,
    commission_value=inquiry.commission_value,
    currency="USD",
    total_amount=str(quoted_amount) if quoted_amount else None,
    status="NEW",
    version_no=1,
    valid_until=None,
    notes=inquiry.notes,
  )
  db.add(quotation)
  await db.flush()
  await db.refresh(quotation)

  return _to_quotation_response(quotation)


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
    total_amount=body.total_amount,
    status="DRAFT",
    version_no=1,
    valid_until=body.valid_until,
    notes=body.notes,
  )
  db.add(quotation)
  await db.flush()
  await db.refresh(quotation)
  return _to_quotation_response(quotation)


def _material_to_line(m: QuotationMaterial) -> QuotationMaterialLine:
  return QuotationMaterialLine(
    id=m.id,
    serial_no=m.serial_no,
    category_id=m.category_id,
    item_id=m.item_id,
    description=m.description,
    unit=m.unit,
    consumption_per_dozen=m.consumption_per_dozen or "0",
    unit_price=m.unit_price or "0",
    amount_per_dozen=m.amount_per_dozen or "0",
    total_amount=m.total_amount or "0",
    currency=m.currency or "USD",
    exchange_rate=m.exchange_rate or "1",
    base_amount=m.base_amount or "0",
    local_amount=m.local_amount or "0",
  )


def _manufacturing_to_line(m: QuotationManufacturing) -> QuotationManufacturingLine:
  return QuotationManufacturingLine(
    id=m.id,
    serial_no=m.serial_no,
    style_part=m.style_part,
    machines_required=m.machines_required,
    production_per_hour=m.production_per_hour or "0",
    production_per_day=m.production_per_day or "0",
    cost_per_machine=m.cost_per_machine or "0",
    total_line_cost=m.total_line_cost or "0",
    cost_per_dozen=m.cost_per_dozen or "0",
    cm_per_piece=m.cm_per_piece or "0",
    total_order_cost=m.total_order_cost or "0",
    currency=m.currency or "USD",
    exchange_rate=m.exchange_rate or "1",
    base_amount=m.base_amount or "0",
    local_amount=m.local_amount or "0",
  )


def _other_cost_to_line(c: QuotationOtherCost) -> QuotationOtherCostLine:
  return QuotationOtherCostLine(
    id=c.id,
    serial_no=c.serial_no,
    cost_head=c.cost_head,
    percentage=c.percentage or "0",
    total_amount=c.total_amount or "0",
    cost_type=c.cost_type or "fixed",
    value=c.value or "0",
    based_on=c.based_on or "subtotal",
    calculated_amount=c.calculated_amount or "0",
    notes=c.notes,
    currency=c.currency or "USD",
    exchange_rate=c.exchange_rate or "1",
    base_amount=c.base_amount or "0",
    local_amount=c.local_amount or "0",
  )


def _size_ratio_to_line(s: QuotationSizeRatio) -> QuotationSizeRatioLine:
  return QuotationSizeRatioLine(
    id=s.id,
    serial_no=s.serial_no,
    size=s.size,
    ratio_percentage=s.ratio_percentage or "0",
    fabric_factor=s.fabric_factor or "1.0",
    quantity=s.quantity,
  )


@router.get("/{quotation_id}", response_model=QuotationDetailResponse)
async def get_quotation(
  quotation_id: int,
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
    status=quotation.status,
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
    quotation.currency = body.currency
  if body.total_amount is not None:
    quotation.total_amount = body.total_amount
  if body.valid_until is not None:
    quotation.valid_until = body.valid_until
  if body.status is not None:
    quotation.status = body.status
  if body.notes is not None:
    quotation.notes = body.notes

  await db.flush()
  await db.refresh(quotation)
  return _to_quotation_response(quotation)


def _parse_decimal(s: str | None) -> float:
  if s is None or s == "":
    return 0.0
  try:
    return float(s)
  except ValueError:
    return 0.0


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
    quotation.target_price = body.target_price
  if body.target_price_currency is not None:
    quotation.target_price_currency = body.target_price_currency
  if body.exchange_rate is not None:
    quotation.exchange_rate = body.exchange_rate
  if body.currency is not None:
    quotation.currency = body.currency
  if body.total_amount is not None:
    quotation.total_amount = body.total_amount
  if body.status is not None:
    quotation.status = body.status
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

  # Replace materials
  if body.materials is not None:
    await db.execute(delete(QuotationMaterial).where(
      QuotationMaterial.quotation_id == quotation_id,
      QuotationMaterial.tenant_id == tenant.id,
    ))
    for i, row in enumerate(body.materials):
      if row.category_id is None and row.item_id is None and not (row.description or "").strip():
        continue
      db.add(QuotationMaterial(
        tenant_id=tenant.id,
        quotation_id=quotation_id,
        serial_no=row.serial_no or (i + 1),
        category_id=row.category_id,
        item_id=row.item_id,
        description=row.description,
        unit=row.unit,
        consumption_per_dozen=row.consumption_per_dozen or "0",
        unit_price=row.unit_price or "0",
        amount_per_dozen=row.amount_per_dozen or "0",
        total_amount=row.total_amount or "0",
        currency=row.currency or "USD",
        exchange_rate=row.exchange_rate or "1",
        base_amount=row.base_amount or "0",
        local_amount=row.local_amount or "0",
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
        production_per_hour=row.production_per_hour or "0",
        production_per_day=row.production_per_day or "0",
        cost_per_machine=row.cost_per_machine or "0",
        total_line_cost=row.total_line_cost or "0",
        cost_per_dozen=row.cost_per_dozen or "0",
        cm_per_piece=row.cm_per_piece or "0",
        total_order_cost=row.total_order_cost or "0",
        currency=row.currency or "USD",
        exchange_rate=row.exchange_rate or "1",
        base_amount=row.base_amount or "0",
        local_amount=row.local_amount or "0",
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
        percentage=row.percentage or "0",
        total_amount=row.total_amount or "0",
        cost_type=row.cost_type or "fixed",
        value=row.value or "0",
        based_on=row.based_on or "subtotal",
        calculated_amount=row.calculated_amount or "0",
        notes=row.notes,
        currency=row.currency or "USD",
        exchange_rate=row.exchange_rate or "1",
        base_amount=row.base_amount or "0",
        local_amount=row.local_amount or "0",
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
        ratio_percentage=row.ratio_percentage or "0",
        fabric_factor=row.fabric_factor or "1.0",
        quantity=row.quantity,
      ))

  await db.flush()

  # Recompute totals from children if we have any cost lines
  mat_total = 0.0
  mfg_total = 0.0
  other_total = 0.0
  if body.materials:
    for row in body.materials:
      mat_total += _parse_decimal(row.total_amount)
  if body.manufacturing:
    for row in body.manufacturing:
      mfg_total += _parse_decimal(row.total_order_cost)
  if body.other_costs:
    for row in body.other_costs:
      other_total += _parse_decimal(row.calculated_amount or row.total_amount)
  total_cost = mat_total + mfg_total + other_total
  qty = quotation.projected_quantity or 0
  cost_per_piece = str(round(total_cost / qty, 4)) if qty > 0 else "0"
  quotation.material_cost = str(round(mat_total, 4))
  quotation.manufacturing_cost = str(round(mfg_total, 4))
  quotation.other_cost = str(round(other_total, 4))
  quotation.total_cost = str(round(total_cost, 4))
  quotation.cost_per_piece = cost_per_piece
  if body.profit_percentage is not None:
    quotation.profit_percentage = body.profit_percentage
  if body.quoted_price is not None:
    quotation.quoted_price = body.quoted_price
  elif total_cost > 0 and quotation.profit_percentage:
    pct = _parse_decimal(quotation.profit_percentage) / 100.0
    quotation.quoted_price = str(round(total_cost * (1.0 + pct), 4))
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
  await db.delete(quotation)
  await db.flush()


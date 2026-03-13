from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

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
  InquiryEvent,
  InquiryItem,
  Tenant,
  User,
)
from app.modules.inquiries.schemas import (
  InquiryCreate,
  InquiryItemCreate,
  InquiryItemResponse,
  InquiryResponse,
  InquiryUpdate,
)


router = APIRouter(prefix="/inquiries", tags=["inquiries"])


async def _next_inquiry_code(db: AsyncSession, tenant_id: int) -> str:
  return await next_tenant_code(
    db,
    model=Inquiry,
    tenant_id=tenant_id,
    prefix="INQ-",
    width=4,
  )


def _clean_optional_text(value: str | None) -> str | None:
  if value is None:
    return None
  cleaned = value.strip()
  return cleaned if cleaned else None


def _to_inquiry_item_model(
  item: InquiryItemCreate,
  *,
  tenant_id: int,
  inquiry_id: int,
  index: int,
) -> InquiryItem | None:
  item_name = _clean_optional_text(item.item_name)
  description = _clean_optional_text(item.description)
  quantity = item.quantity

  if item_name is None and description:
    item_name = description[:255]

  if item_name is None and description is None and quantity is None:
    return None

  sort_order = item.sort_order if item.sort_order is not None else (index + 1)
  return InquiryItem(
    tenant_id=tenant_id,
    inquiry_id=inquiry_id,
    item_name=item_name,
    description=description,
    quantity=quantity,
    sort_order=sort_order,
  )


async def _get_items_by_inquiry_id(
  db: AsyncSession, *, tenant_id: int, inquiry_ids: list[int]
) -> dict[int, list[InquiryItemResponse]]:
  if not inquiry_ids:
    return {}
  result = await db.execute(
    select(InquiryItem)
    .where(InquiryItem.tenant_id == tenant_id, InquiryItem.inquiry_id.in_(inquiry_ids))
    .order_by(InquiryItem.inquiry_id.asc(), InquiryItem.sort_order.asc(), InquiryItem.id.asc())
  )
  rows = result.scalars().all()
  grouped: dict[int, list[InquiryItemResponse]] = {}
  for row in rows:
    grouped.setdefault(row.inquiry_id, []).append(
      InquiryItemResponse(
        id=row.id,
        item_name=row.item_name,
        description=row.description,
        quantity=row.quantity,
        sort_order=row.sort_order,
      )
    )
  return grouped


async def _get_styles_by_id(
  db: AsyncSession, *, tenant_id: int, style_ids: list[int]
) -> dict[int, GarmentStyle]:
  if not style_ids:
    return {}
  result = await db.execute(
    select(GarmentStyle).where(
      GarmentStyle.tenant_id == tenant_id,
      GarmentStyle.id.in_(style_ids),
    )
  )
  return {row.id: row for row in result.scalars().all()}


def _serialize_inquiry(
  inquiry: Inquiry,
  items: list[InquiryItemResponse] | None = None,
  style: GarmentStyle | None = None,
) -> InquiryResponse:
  commission_value = float(inquiry.commission_value) if inquiry.commission_value is not None else None
  return InquiryResponse(
    id=inquiry.id,
    tenant_id=inquiry.tenant_id,
    customer_id=inquiry.customer_id,
    inquiry_code=inquiry.inquiry_code,
    style_ref=inquiry.style_ref,
    style_id=inquiry.style_id,
    style_name=style.name if style else None,
    style_image_url=style.style_image_url if style else None,
    customer_intermediary_id=inquiry.customer_intermediary_id,
    season=inquiry.season,
    department=inquiry.department,
    quantity=inquiry.quantity,
    target_price=inquiry.target_price,
    shipping_term=inquiry.shipping_term,
    commission_mode=inquiry.commission_mode,
    commission_type=inquiry.commission_type,
    commission_value=commission_value,
    status=inquiry.status,
    notes=inquiry.notes,
    items=items or [],
    created_at=inquiry.created_at.isoformat(),
    updated_at=inquiry.updated_at.isoformat(),
  )


async def _replace_inquiry_items(
  db: AsyncSession, *, tenant_id: int, inquiry_id: int, items: list[InquiryItemCreate]
) -> None:
  await db.execute(
    delete(InquiryItem).where(
      InquiryItem.tenant_id == tenant_id, InquiryItem.inquiry_id == inquiry_id
    )
  )
  for idx, raw_item in enumerate(items):
    model = _to_inquiry_item_model(
      raw_item, tenant_id=tenant_id, inquiry_id=inquiry_id, index=idx
    )
    if model is not None:
      db.add(model)


async def _validate_customer_intermediary(
  db: AsyncSession, *, tenant_id: int, customer_id: int, customer_intermediary_id: int
) -> None:
  link = await db.get(CustomerIntermediary, customer_intermediary_id)
  if not link or link.tenant_id != tenant_id:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Customer intermediary link not found",
    )
  if link.customer_id != customer_id:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Customer intermediary link does not belong to this customer",
    )


@router.get("", response_model=list[InquiryResponse])
async def list_inquiries(
  *,
  search: str | None = Query(default=None, description="Search by code, style, season, department"),
  status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
  department: str | None = Query(default=None, description="Filter by department"),
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

  stmt = select(Inquiry).where(Inquiry.tenant_id == tenant.id)

  if search:
    pattern = f"%{search.lower()}%"
    stmt = stmt.where(
      or_(
        func.lower(Inquiry.inquiry_code).like(pattern),
        func.lower(Inquiry.style_ref).like(pattern),
        func.lower(Inquiry.season).like(pattern),
        func.lower(Inquiry.department).like(pattern),
      )
    )

  if status_filter:
    stmt = stmt.where(Inquiry.status == status_filter)

  if department:
    stmt = stmt.where(Inquiry.department == department)

  if created_from:
    start_dt = datetime.combine(created_from, time.min)
    stmt = stmt.where(Inquiry.created_at >= start_dt)
  if created_to:
    end_dt = datetime.combine(created_to, time.max)
    stmt = stmt.where(Inquiry.created_at <= end_dt)

  stmt = stmt.order_by(Inquiry.created_at.desc()).limit(limit).offset(offset)

  result = await db.execute(stmt)
  rows = result.scalars().all()
  item_map = await _get_items_by_inquiry_id(
    db, tenant_id=tenant.id, inquiry_ids=[r.id for r in rows]
  )
  style_map = await _get_styles_by_id(
    db,
    tenant_id=tenant.id,
    style_ids=[r.style_id for r in rows if r.style_id is not None],
  )
  return [_serialize_inquiry(r, item_map.get(r.id, []), style_map.get(r.style_id or -1)) for r in rows]


@router.post("", response_model=InquiryResponse, status_code=status.HTTP_201_CREATED)
async def create_inquiry(
  body: InquiryCreate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  # ensure customer belongs to tenant
  customer = await db.get(Customer, body.customer_id)
  if not customer or customer.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")
  style = await db.get(GarmentStyle, body.style_id)
  if not style or style.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Style not found")
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

  code = await _next_inquiry_code(db, tenant.id)
  inquiry = Inquiry(
    tenant_id=tenant.id,
    customer_id=body.customer_id,
    inquiry_code=code,
    style_ref=body.style_ref,
    style_id=body.style_id,
    customer_intermediary_id=body.customer_intermediary_id,
    season=body.season,
    department=body.department,
    quantity=body.quantity,
    target_price=body.target_price,
    shipping_term=body.shipping_term,
    commission_mode=commission_mode,
    commission_type=body.commission_type,
    commission_value=body.commission_value,
    status="DRAFT",
    notes=body.notes,
  )
  db.add(inquiry)
  await db.flush()
  await _replace_inquiry_items(
    db, tenant_id=tenant.id, inquiry_id=inquiry.id, items=body.items
  )
  await db.refresh(inquiry)
  item_map = await _get_items_by_inquiry_id(db, tenant_id=tenant.id, inquiry_ids=[inquiry.id])
  return _serialize_inquiry(inquiry, item_map.get(inquiry.id, []), style)


@router.get("/{inquiry_id}", response_model=InquiryResponse)
async def get_inquiry(
  inquiry_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  inquiry = await db.get(Inquiry, inquiry_id)
  if not inquiry or inquiry.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")

  item_map = await _get_items_by_inquiry_id(db, tenant_id=tenant.id, inquiry_ids=[inquiry.id])
  style = None
  if inquiry.style_id is not None:
    style = await db.get(GarmentStyle, inquiry.style_id)
    if style and style.tenant_id != tenant.id:
      style = None
  return _serialize_inquiry(inquiry, item_map.get(inquiry.id, []), style)


@router.patch("/{inquiry_id}", response_model=InquiryResponse)
async def update_inquiry(
  inquiry_id: int,
  body: InquiryUpdate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  inquiry = await db.get(Inquiry, inquiry_id)
  if not inquiry or inquiry.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")

  if body.style_ref is not None:
    inquiry.style_ref = body.style_ref
  if body.style_id is not None:
    style = await db.get(GarmentStyle, body.style_id)
    if not style or style.tenant_id != tenant.id:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Style not found")
    inquiry.style_id = body.style_id
  if body.customer_intermediary_id is not None:
    await _validate_customer_intermediary(
      db,
      tenant_id=tenant.id,
      customer_id=inquiry.customer_id,
      customer_intermediary_id=body.customer_intermediary_id,
    )
    inquiry.customer_intermediary_id = body.customer_intermediary_id
  if body.season is not None:
    inquiry.season = body.season
  if body.department is not None:
    inquiry.department = body.department
  if body.quantity is not None:
    inquiry.quantity = body.quantity
  if body.target_price is not None:
    inquiry.target_price = body.target_price
  if body.shipping_term is not None:
    inquiry.shipping_term = body.shipping_term
  if body.commission_mode is not None:
    inquiry.commission_mode = body.commission_mode
  if body.commission_type is not None:
    inquiry.commission_type = body.commission_type
  if body.commission_value is not None:
    inquiry.commission_value = body.commission_value
  if body.status is not None:
    inquiry.status = body.status
  if body.notes is not None:
    inquiry.notes = body.notes
  if body.items is not None:
    await _replace_inquiry_items(
      db, tenant_id=tenant.id, inquiry_id=inquiry.id, items=body.items
    )

  await db.flush()
  await db.refresh(inquiry)
  item_map = await _get_items_by_inquiry_id(db, tenant_id=tenant.id, inquiry_ids=[inquiry.id])
  style = None
  if inquiry.style_id is not None:
    style = await db.get(GarmentStyle, inquiry.style_id)
    if style and style.tenant_id != tenant.id:
      style = None
  return _serialize_inquiry(inquiry, item_map.get(inquiry.id, []), style)


@router.delete("/{inquiry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inquiry(
  inquiry_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  inquiry = await db.get(Inquiry, inquiry_id)
  if not inquiry or inquiry.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")
  await db.execute(
    delete(InquiryItem).where(
      InquiryItem.tenant_id == tenant.id, InquiryItem.inquiry_id == inquiry.id
    )
  )
  await db.delete(inquiry)
  await db.flush()


class InquiryStatusBody(BaseModel):
  status: str
  notes: str | None = None


@router.patch("/{inquiry_id}/status", response_model=InquiryResponse)
async def update_inquiry_status(
  inquiry_id: int,
  body: InquiryStatusBody,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  inquiry = await db.get(Inquiry, inquiry_id)
  if not inquiry or inquiry.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")
  old_status = inquiry.status
  inquiry.status = body.status
  db.add(
    InquiryEvent(
      tenant_id=tenant.id,
      inquiry_id=inquiry.id,
      event_type="status_change",
      from_status=old_status,
      to_status=body.status,
      notes=body.notes,
    )
  )
  await db.flush()
  await db.refresh(inquiry)
  item_map = await _get_items_by_inquiry_id(db, tenant_id=tenant.id, inquiry_ids=[inquiry.id])
  style = None
  if inquiry.style_id is not None:
    style = await db.get(GarmentStyle, inquiry.style_id)
    if style and style.tenant_id != tenant.id:
      style = None
  return _serialize_inquiry(inquiry, item_map.get(inquiry.id, []), style)


@router.get("/{inquiry_id}/trace")
async def get_inquiry_trace(
  inquiry_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  inquiry = await db.get(Inquiry, inquiry_id)
  if not inquiry or inquiry.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")
  result = await db.execute(
    select(InquiryEvent)
    .where(InquiryEvent.tenant_id == tenant.id, InquiryEvent.inquiry_id == inquiry_id)
    .order_by(InquiryEvent.created_at.desc())
  )
  return result.scalars().all()


from datetime import date, datetime, time
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.document_history import record_doc_event
from app.common.money import format_money, format_rate, parse_money
from app.common.ownership import ensure_owned
from app.common.pagination import clamp_page_size, safe_page, total_pages
from app.common.codegen import next_tenant_code
from app.common.db_errors import flush_handling_duplicate_document_code
from app.common.delete_guards import ensure_inquiry_deletable
from app.common.storage import FileStorageService
from app.common.tenant import require_tenant
from app.common.workflow import INQUIRY_TRANSITIONS, next_status_options, validate_transition
from app.database import get_db
from app.models import (
  CommissionMode,
  Customer,
  CustomerIntermediary,
  GarmentStyle,
  Inquiry,
  InquiryEvent,
  InquiryItem,
  Quotation,
  Tenant,
  User,
)
from app.modules.audit.service import log_action_best_effort
from app.modules.inquiries.inquiry_ai_router import router as inquiry_ai_subrouter
from app.modules.inquiries.inquiry_ai_service import compute_inquiry_ai_indicators
from app.modules.inquiries.related_service import get_inquiry_related
from app.modules.inquiries.schemas import (
  InquiryAiIndicatorsOut,
  InquiryCreate,
  InquiryItemCreate,
  InquiryItemResponse,
  InquiryListPageResponse,
  InquiryRelatedResponse,
  InquiryResponse,
  InquiryUpdate,
  TechnicalFileOut,
)

MAX_INQUIRY_TECHNICAL_FILES = 10

# Extension must match declared Content-Type (upload endpoint only).
_INQUIRY_TECH_EXT_MIME: dict[str, str] = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

TERMINAL_INQUIRY_STATUSES = frozenset({"CONVERTED", "LOST", "CANCELLED"})


def _assert_inquiry_editable(inquiry: Inquiry) -> None:
  if inquiry.status in TERMINAL_INQUIRY_STATUSES:
    raise HTTPException(
      status_code=status.HTTP_409_CONFLICT,
      detail=f"Inquiry is {inquiry.status} and cannot be edited",
    )


router = APIRouter(prefix="/inquiries", tags=["inquiries"])
router.include_router(inquiry_ai_subrouter, prefix="/ai")


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


async def _get_converted_quotation_map(
  db: AsyncSession, *, tenant_id: int, inquiry_ids: list[int]
) -> dict[int, int]:
  if not inquiry_ids:
    return {}
  result = await db.execute(
    select(Quotation.id, Quotation.inquiry_id)
    .where(
      Quotation.tenant_id == tenant_id,
      Quotation.inquiry_id.in_(inquiry_ids),
      Quotation.superseded_at.is_(None),
    )
    .order_by(Quotation.created_at.desc(), Quotation.id.desc())
  )
  mapping: dict[int, int] = {}
  for quotation_id, inquiry_id in result.all():
    if inquiry_id is None:
      continue
    mapping.setdefault(inquiry_id, quotation_id)
  return mapping


def _serialize_technical_files(raw: list | dict | None) -> list[TechnicalFileOut]:
  if not raw or not isinstance(raw, list):
    return []
  out: list[TechnicalFileOut] = []
  for entry in raw:
    if not isinstance(entry, dict):
      continue
    filename = entry.get("filename")
    file_id = entry.get("id")
    if not filename or not file_id:
      continue
    out.append(
      TechnicalFileOut(
        id=str(file_id),
        name=entry.get("name"),
        filename=str(filename),
        url=entry.get("url"),
        content_type=entry.get("content_type"),
        size_bytes=entry.get("size_bytes"),
        uploaded_at=entry.get("uploaded_at"),
      )
    )
  return out


def _normalize_upload_content_type(content_type: str | None) -> str:
  if not content_type:
    return ""
  return content_type.lower().split(";")[0].strip()


def _assert_inquiry_tech_ext_mime(filename: str | None, content_type: str | None) -> str:
  """Reject extension / Content-Type mismatch before save_file."""
  suffix = Path(filename or "").suffix.lower()
  expected = _INQUIRY_TECH_EXT_MIME.get(suffix)
  if expected is None:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Unsupported technical file extension.",
    )
  ct = _normalize_upload_content_type(content_type)
  allowed = {expected}
  if expected == "image/jpeg":
    allowed.add("image/jpg")
  if ct not in allowed:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="File extension does not match Content-Type.",
    )
  return expected


def _serialize_inquiry(
  inquiry: Inquiry,
  items: list[InquiryItemResponse] | None = None,
  style: GarmentStyle | None = None,
  converted_quotation_id: int | None = None,
  ai_indicators: InquiryAiIndicatorsOut | None = None,
  customer_name: str | None = None,
) -> InquiryResponse:
  commission_value = float(inquiry.commission_value) if inquiry.commission_value is not None else None
  color_options = inquiry.color_options if isinstance(inquiry.color_options, list) else None
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
    target_price=format_money(inquiry.target_price),
    target_price_currency=inquiry.target_price_currency,
    currency=inquiry.currency,
    exchange_rate=format_rate(inquiry.exchange_rate),
    expected_delivery_date=inquiry.expected_delivery_date.isoformat() if inquiry.expected_delivery_date else None,
    shipping_term=inquiry.shipping_term,
    commission_mode=inquiry.commission_mode,
    commission_type=inquiry.commission_type,
    commission_value=commission_value,
    status=inquiry.status,
    next_status_options=next_status_options(
      INQUIRY_TRANSITIONS,
      inquiry.status,
      fallback="DRAFT",
    ),
    is_converted_to_quotation=converted_quotation_id is not None,
    converted_quotation_id=converted_quotation_id,
    notes=inquiry.notes,
    inquiry_type=inquiry.inquiry_type,
    brand=inquiry.brand,
    season_year=inquiry.season_year,
    material_composition=inquiry.material_composition,
    size_range=inquiry.size_range,
    color_options=[str(c) for c in color_options] if color_options is not None else None,
    country_of_origin=inquiry.country_of_origin,
    special_requirements=inquiry.special_requirements,
    contact_person=inquiry.contact_person,
    technical_files=_serialize_technical_files(inquiry.technical_files),
    items=items or [],
    created_at=inquiry.created_at.isoformat(),
    updated_at=inquiry.updated_at.isoformat(),
    ai_indicators=ai_indicators,
    customer_name=customer_name,
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
) -> CustomerIntermediary:
  link = await ensure_owned(
    db,
    CustomerIntermediary,
    customer_intermediary_id,
    tenant_id,
    "Customer intermediary",
    status_code=404,
  )
  assert link is not None
  if link.customer_id != customer_id:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Customer intermediary not found",
    )
  return link


@router.get("", response_model=list[InquiryResponse])
async def list_inquiries(
  *,
  search: str | None = Query(default=None, description="Search by code, style, season, department"),
  status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
  department: str | None = Query(default=None, description="Filter by department"),
  created_from: date | None = Query(default=None, description="Created at from (inclusive)"),
  created_to: date | None = Query(default=None, description="Created at to (inclusive)"),
  limit: int = Query(default=50, ge=1, le=500),
  offset: int = Query(default=0, ge=0),
  ai_indicators: int = Query(
    default=0,
    ge=0,
    le=1,
    description="When 1, include rules-based AI indicators (no LLM) on each row.",
  ),
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
  converted_map = await _get_converted_quotation_map(
    db, tenant_id=tenant.id, inquiry_ids=[r.id for r in rows]
  )
  return [
    _serialize_inquiry(
      r,
      item_map.get(r.id, []),
      style_map.get(r.style_id or -1),
      converted_map.get(r.id),
      compute_inquiry_ai_indicators(r) if ai_indicators else None,
    )
    for r in rows
  ]


@router.get("/paginated", response_model=InquiryListPageResponse)
async def list_inquiries_paginated(
  *,
  search: str | None = Query(
    default=None,
    description="Search by code, customer name, style, brand, season, department",
  ),
  status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
  department: str | None = Query(default=None, description="Filter by department"),
  inquiry_type: str | None = Query(default=None, description="Filter by inquiry type"),
  created_from: date | None = Query(default=None, description="Created at from (inclusive)"),
  created_to: date | None = Query(default=None, description="Created at to (inclusive)"),
  ai_indicators: int = Query(
    default=0,
    ge=0,
    le=1,
    description="When 1, include rules-based AI indicators (no LLM) on each row.",
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
  customer_join = (Customer.id == Inquiry.customer_id) & (Customer.tenant_id == tenant.id)

  def _apply_filters(stmt):
    s = stmt.where(Inquiry.tenant_id == tenant.id)
    if search:
      pattern = f"%{search.lower()}%"
      s = s.where(
        or_(
          func.lower(Inquiry.inquiry_code).like(pattern),
          func.lower(Inquiry.style_ref).like(pattern),
          func.lower(Inquiry.season).like(pattern),
          func.lower(Inquiry.department).like(pattern),
          func.lower(func.coalesce(Inquiry.brand, "")).like(pattern),
          func.lower(func.coalesce(Customer.name, "")).like(pattern),
        )
      )
    if status_filter:
      s = s.where(Inquiry.status == status_filter)
    if department:
      s = s.where(Inquiry.department == department)
    if inquiry_type:
      s = s.where(Inquiry.inquiry_type == inquiry_type)
    if created_from:
      start_dt = datetime.combine(created_from, time.min)
      s = s.where(Inquiry.created_at >= start_dt)
    if created_to:
      end_dt = datetime.combine(created_to, time.max)
      s = s.where(Inquiry.created_at <= end_dt)
    return s

  count_stmt = _apply_filters(
    select(func.count())
    .select_from(Inquiry)
    .outerjoin(Customer, customer_join)
  )
  total = int((await db.execute(count_stmt)).scalar_one() or 0)
  tp = total_pages(total, ps)
  pg = safe_page(page, total, ps)
  offset = (pg - 1) * ps

  list_stmt = (
    _apply_filters(
      select(Inquiry, Customer.name)
      .outerjoin(Customer, customer_join)
    )
    .order_by(Inquiry.created_at.desc())
    .limit(ps)
    .offset(offset)
  )
  result = await db.execute(list_stmt)
  row_tuples = result.all()
  inquiries_only = [r for r, _ in row_tuples]
  item_map = await _get_items_by_inquiry_id(
    db, tenant_id=tenant.id, inquiry_ids=[r.id for r in inquiries_only]
  )
  style_map = await _get_styles_by_id(
    db,
    tenant_id=tenant.id,
    style_ids=[r.style_id for r in inquiries_only if r.style_id is not None],
  )
  converted_map = await _get_converted_quotation_map(
    db, tenant_id=tenant.id, inquiry_ids=[r.id for r in inquiries_only]
  )

  items: list[InquiryResponse] = []
  for inq, cust_name in row_tuples:
    items.append(
      _serialize_inquiry(
        inq,
        item_map.get(inq.id, []),
        style_map.get(inq.style_id or -1),
        converted_map.get(inq.id),
        compute_inquiry_ai_indicators(inq) if ai_indicators else None,
        customer_name=cust_name,
      )
    )

  return InquiryListPageResponse(items=items, total=total, page=pg, page_size=ps, total_pages=tp)


@router.post("", response_model=InquiryResponse, status_code=status.HTTP_201_CREATED)
async def create_inquiry(
  body: InquiryCreate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  customer = await ensure_owned(
    db, Customer, body.customer_id, tenant.id, "Customer", status_code=404
  )
  assert customer is not None
  style = await ensure_owned(
    db, GarmentStyle, body.style_id, tenant.id, "Style", status_code=404
  )
  assert style is not None
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
    target_price=parse_money(body.target_price),
    target_price_currency=body.target_price_currency,
    currency=body.currency,
    exchange_rate=parse_money(body.exchange_rate),
    expected_delivery_date=body.expected_delivery_date,
    shipping_term=body.shipping_term,
    commission_mode=commission_mode,
    commission_type=body.commission_type,
    commission_value=body.commission_value,
    status="DRAFT",
    notes=body.notes,
    inquiry_type=body.inquiry_type,
    brand=_clean_optional_text(body.brand),
    season_year=_clean_optional_text(body.season_year),
    material_composition=_clean_optional_text(body.material_composition),
    size_range=_clean_optional_text(body.size_range),
    color_options=body.color_options,
    country_of_origin=_clean_optional_text(body.country_of_origin),
    special_requirements=_clean_optional_text(body.special_requirements),
    contact_person=_clean_optional_text(body.contact_person),
    technical_files=None,
  )
  db.add(inquiry)
  await flush_handling_duplicate_document_code(db)
  await _replace_inquiry_items(
    db, tenant_id=tenant.id, inquiry_id=inquiry.id, items=body.items
  )
  await log_action_best_effort(
    db,
    tenant_id=tenant.id,
    action="INQUIRY_CREATED",
    user_id=user.id,
    resource=f"inquiry:{inquiry.id}",
    details=f"Created inquiry {inquiry.inquiry_code}",
  )
  await record_doc_event(
    db,
    tenant_id=tenant.id,
    user_id=user.id,
    doc_type="inquiry",
    doc_id=inquiry.id,
    event="created",
    summary=f"Created inquiry {inquiry.inquiry_code}",
    to_status="DRAFT",
  )
  await db.refresh(inquiry)
  item_map = await _get_items_by_inquiry_id(db, tenant_id=tenant.id, inquiry_ids=[inquiry.id])
  converted_map = await _get_converted_quotation_map(
    db, tenant_id=tenant.id, inquiry_ids=[inquiry.id]
  )
  return _serialize_inquiry(
    inquiry,
    item_map.get(inquiry.id, []),
    style,
    converted_map.get(inquiry.id),
  )


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
  converted_map = await _get_converted_quotation_map(
    db, tenant_id=tenant.id, inquiry_ids=[inquiry.id]
  )
  return _serialize_inquiry(
    inquiry,
    item_map.get(inquiry.id, []),
    style,
    converted_map.get(inquiry.id),
  )


@router.get("/{inquiry_id}/pdf")
async def inquiry_pdf(
  inquiry_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  """Server PDF for phone Save PDF / Share (tenant-scoped)."""
  from fastapi.responses import Response
  from app.modules.merch.doc_pdf import render_simple_doc_pdf

  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
  inquiry = await db.get(Inquiry, inquiry_id)
  if not inquiry or inquiry.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")
  pdf_lines: list[tuple[str, object]] = [
    ("Code", inquiry.inquiry_code),
    ("Status", inquiry.status),
    ("Style ref", inquiry.style_ref),
    ("Season", inquiry.season),
  ]
  if inquiry.brand:
    pdf_lines.append(("Brand", inquiry.brand))
  if inquiry.inquiry_type:
    pdf_lines.append(("Inquiry Type", inquiry.inquiry_type))
  if inquiry.material_composition:
    pdf_lines.append(("Composition", inquiry.material_composition[:90]))
  if inquiry.size_range:
    pdf_lines.append(("Size Range", inquiry.size_range))
  if isinstance(inquiry.color_options, list) and inquiry.color_options:
    pdf_lines.append(("Colors", ", ".join(str(c) for c in inquiry.color_options)[:90]))
  if inquiry.country_of_origin:
    pdf_lines.append(("COO", inquiry.country_of_origin))
  pdf_lines.extend(
    [
      ("Quantity", inquiry.quantity),
      ("Target price", inquiry.target_price),
      ("Currency", inquiry.currency or inquiry.target_price_currency),
      ("Expected delivery", inquiry.expected_delivery_date),
      ("Shipping term", inquiry.shipping_term),
      ("Notes", (inquiry.notes or "")[:90]),
    ]
  )
  content = render_simple_doc_pdf(
    tenant=tenant,
    title="Inquiry",
    lines=pdf_lines,
  )
  filename = f"{inquiry.inquiry_code or f'inquiry-{inquiry.id}'}.pdf".replace("/", "-")
  return Response(
    content=content,
    media_type="application/pdf",
    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
  )


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
  _assert_inquiry_editable(inquiry)

  if body.status is not None:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Use PATCH /inquiries/{id}/status to change status",
    )

  if body.style_ref is not None:
    inquiry.style_ref = body.style_ref
  if body.style_id is not None:
    await ensure_owned(
      db, GarmentStyle, body.style_id, tenant.id, "Style", status_code=404
    )
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
    inquiry.target_price = parse_money(body.target_price)
  if body.target_price_currency is not None:
    inquiry.target_price_currency = body.target_price_currency
  if body.currency is not None:
    inquiry.currency = body.currency
  if body.exchange_rate is not None:
    inquiry.exchange_rate = parse_money(body.exchange_rate)
  if body.expected_delivery_date is not None:
    inquiry.expected_delivery_date = body.expected_delivery_date
  if body.shipping_term is not None:
    inquiry.shipping_term = body.shipping_term
  if body.commission_mode is not None:
    inquiry.commission_mode = body.commission_mode
  if body.commission_type is not None:
    inquiry.commission_type = body.commission_type
  if body.commission_value is not None:
    inquiry.commission_value = body.commission_value
  if body.notes is not None:
    inquiry.notes = body.notes
  if body.inquiry_type is not None:
    inquiry.inquiry_type = body.inquiry_type
  if body.brand is not None:
    inquiry.brand = _clean_optional_text(body.brand)
  if body.season_year is not None:
    inquiry.season_year = _clean_optional_text(body.season_year)
  if body.material_composition is not None:
    inquiry.material_composition = _clean_optional_text(body.material_composition)
  if body.size_range is not None:
    inquiry.size_range = _clean_optional_text(body.size_range)
  if body.color_options is not None:
    inquiry.color_options = body.color_options
  if body.country_of_origin is not None:
    inquiry.country_of_origin = _clean_optional_text(body.country_of_origin)
  if body.special_requirements is not None:
    inquiry.special_requirements = _clean_optional_text(body.special_requirements)
  if body.contact_person is not None:
    inquiry.contact_person = _clean_optional_text(body.contact_person)
  if body.items is not None:
    await _replace_inquiry_items(
      db, tenant_id=tenant.id, inquiry_id=inquiry.id, items=body.items
    )

  await db.flush()
  await log_action_best_effort(
    db,
    tenant_id=tenant.id,
    action="INQUIRY_UPDATED",
    user_id=user.id,
    resource=f"inquiry:{inquiry.id}",
    details=f"Updated inquiry {inquiry.inquiry_code}",
  )
  await record_doc_event(
    db,
    tenant_id=tenant.id,
    user_id=user.id,
    doc_type="inquiry",
    doc_id=inquiry.id,
    event="updated",
    summary=f"Updated inquiry {inquiry.inquiry_code}",
    to_status=inquiry.status,
  )
  await db.refresh(inquiry)
  item_map = await _get_items_by_inquiry_id(db, tenant_id=tenant.id, inquiry_ids=[inquiry.id])
  style = None
  if inquiry.style_id is not None:
    style = await db.get(GarmentStyle, inquiry.style_id)
    if style and style.tenant_id != tenant.id:
      style = None
  converted_map = await _get_converted_quotation_map(
    db, tenant_id=tenant.id, inquiry_ids=[inquiry.id]
  )
  return _serialize_inquiry(
    inquiry,
    item_map.get(inquiry.id, []),
    style,
    converted_map.get(inquiry.id),
  )


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
  await ensure_inquiry_deletable(db, tenant.id, inquiry_id)
  code = inquiry.inquiry_code
  for entry in _serialize_technical_files(inquiry.technical_files):
    FileStorageService.delete_file(tenant.id, "inquiry_tech_files", entry.filename)
  await db.execute(
    delete(InquiryItem).where(
      InquiryItem.tenant_id == tenant.id, InquiryItem.inquiry_id == inquiry.id
    )
  )
  await db.delete(inquiry)
  await log_action_best_effort(
    db,
    tenant_id=tenant.id,
    action="INQUIRY_DELETED",
    user_id=user.id,
    resource=f"inquiry:{inquiry_id}",
    details=f"Deleted inquiry {code}",
  )
  await db.flush()


class InquiryStatusBody(BaseModel):
  status: str
  notes: str | None = None


class InquiryTraceEventOut(BaseModel):
  id: int
  tenant_id: int
  inquiry_id: int
  event_type: str
  from_status: str | None
  to_status: str | None
  notes: str | None
  created_at: datetime


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
  if body.status.strip().upper() == "CONVERTED":
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Convert via POST /quotations/from-inquiry/{id}",
    )
  old_status = inquiry.status
  inquiry.status = validate_transition(
    INQUIRY_TRANSITIONS,
    inquiry.status,
    body.status,
    fallback="DRAFT",
    entity_label="inquiry",
  )
  db.add(
    InquiryEvent(
      tenant_id=tenant.id,
      inquiry_id=inquiry.id,
      event_type="status_change",
      from_status=old_status,
      to_status=inquiry.status,
      notes=body.notes,
    )
  )
  await log_action_best_effort(
    db,
    tenant_id=tenant.id,
    action="INQUIRY_STATUS_CHANGED",
    user_id=user.id,
    resource=f"inquiry:{inquiry.id}",
    details=f"Inquiry {inquiry.inquiry_code}: {old_status} → {inquiry.status}",
  )
  await record_doc_event(
    db,
    tenant_id=tenant.id,
    user_id=user.id,
    doc_type="inquiry",
    doc_id=inquiry.id,
    event="status",
    summary=f"Inquiry {inquiry.inquiry_code}: {old_status} → {inquiry.status}",
    from_status=old_status,
    to_status=inquiry.status,
    reason=body.notes,
  )
  await db.flush()
  await db.refresh(inquiry)
  item_map = await _get_items_by_inquiry_id(db, tenant_id=tenant.id, inquiry_ids=[inquiry.id])
  style = None
  if inquiry.style_id is not None:
    style = await db.get(GarmentStyle, inquiry.style_id)
    if style and style.tenant_id != tenant.id:
      style = None
  converted_map = await _get_converted_quotation_map(
    db, tenant_id=tenant.id, inquiry_ids=[inquiry.id]
  )
  return _serialize_inquiry(
    inquiry,
    item_map.get(inquiry.id, []),
    style,
    converted_map.get(inquiry.id),
  )


@router.post(
  "/{inquiry_id}/clone",
  response_model=InquiryResponse,
  status_code=status.HTTP_201_CREATED,
)
async def clone_inquiry(
  inquiry_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  source = await db.get(Inquiry, inquiry_id)
  if not source or source.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")

  tenant_default_mode = (
    tenant.default_commission_mode.value
    if tenant.default_commission_mode is not None
    else CommissionMode.EXCLUDE.value
  )
  commission_mode = source.commission_mode or tenant_default_mode
  code = await _next_inquiry_code(db, tenant.id)
  inquiry = Inquiry(
    tenant_id=tenant.id,
    customer_id=source.customer_id,
    inquiry_code=code,
    style_ref=source.style_ref,
    style_id=source.style_id,
    customer_intermediary_id=source.customer_intermediary_id,
    season=source.season,
    department=source.department,
    quantity=source.quantity,
    target_price=source.target_price,
    target_price_currency=source.target_price_currency,
    currency=source.currency,
    exchange_rate=source.exchange_rate,
    expected_delivery_date=source.expected_delivery_date,
    shipping_term=source.shipping_term,
    commission_mode=commission_mode,
    commission_type=source.commission_type,
    commission_value=source.commission_value,
    status="DRAFT",
    notes=source.notes,
    inquiry_type=source.inquiry_type,
    brand=source.brand,
    season_year=source.season_year,
    material_composition=source.material_composition,
    size_range=source.size_range,
    color_options=list(source.color_options) if isinstance(source.color_options, list) else source.color_options,
    country_of_origin=source.country_of_origin,
    special_requirements=source.special_requirements,
    contact_person=source.contact_person,
    technical_files=None,
  )
  db.add(inquiry)
  await flush_handling_duplicate_document_code(db)

  source_item_map = await _get_items_by_inquiry_id(
    db, tenant_id=tenant.id, inquiry_ids=[source.id]
  )
  clone_items = [
    InquiryItemCreate(
      item_name=it.item_name,
      description=it.description,
      quantity=it.quantity,
      sort_order=it.sort_order,
    )
    for it in source_item_map.get(source.id, [])
  ]
  await _replace_inquiry_items(
    db, tenant_id=tenant.id, inquiry_id=inquiry.id, items=clone_items
  )
  db.add(
    InquiryEvent(
      tenant_id=tenant.id,
      inquiry_id=inquiry.id,
      event_type="cloned",
      from_status=None,
      to_status="DRAFT",
      notes=f"Cloned from {source.inquiry_code}",
    )
  )
  await log_action_best_effort(
    db,
    tenant_id=tenant.id,
    action="INQUIRY_CREATED",
    user_id=user.id,
    resource=f"inquiry:{inquiry.id}",
    details=f"Created inquiry {inquiry.inquiry_code} (cloned from {source.inquiry_code})",
  )
  await record_doc_event(
    db,
    tenant_id=tenant.id,
    user_id=user.id,
    doc_type="inquiry",
    doc_id=inquiry.id,
    event="created",
    summary=f"Created inquiry {inquiry.inquiry_code} (cloned from {source.inquiry_code})",
    to_status="DRAFT",
    extra={"cloned_from_inquiry_id": source.id, "cloned_from_code": source.inquiry_code},
  )
  await db.refresh(inquiry)
  item_map = await _get_items_by_inquiry_id(db, tenant_id=tenant.id, inquiry_ids=[inquiry.id])
  style = None
  if inquiry.style_id is not None:
    style = await db.get(GarmentStyle, inquiry.style_id)
    if style and style.tenant_id != tenant.id:
      style = None
  converted_map = await _get_converted_quotation_map(
    db, tenant_id=tenant.id, inquiry_ids=[inquiry.id]
  )
  return _serialize_inquiry(
    inquiry,
    item_map.get(inquiry.id, []),
    style,
    converted_map.get(inquiry.id),
  )


@router.post(
  "/{inquiry_id}/technical-files",
  response_model=InquiryResponse,
)
async def upload_inquiry_technical_file(
  inquiry_id: int,
  file: UploadFile = File(...),
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  inquiry = await db.get(Inquiry, inquiry_id)
  if not inquiry or inquiry.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")
  _assert_inquiry_editable(inquiry)

  existing = list(inquiry.technical_files) if isinstance(inquiry.technical_files, list) else []
  if len(existing) >= MAX_INQUIRY_TECHNICAL_FILES:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=f"Maximum {MAX_INQUIRY_TECHNICAL_FILES} technical files allowed",
    )

  _assert_inquiry_tech_ext_mime(file.filename, file.content_type)
  original_name = Path(file.filename or "file").name
  safe_filename, api_url, _disk = await FileStorageService.save_file(
    file, tenant.id, "inquiry_tech_files"
  )
  # size from disk after save (UploadFile may be consumed)
  disk_path = FileStorageService.resolve_path(tenant.id, "inquiry_tech_files", safe_filename)
  size_bytes = disk_path.stat().st_size if disk_path is not None else None
  entry = {
    "id": str(uuid4()),
    "name": original_name,
    "filename": safe_filename,
    "url": api_url,
    "content_type": _normalize_upload_content_type(file.content_type) or None,
    "size_bytes": size_bytes,
    "uploaded_at": datetime.utcnow().isoformat(),
  }
  existing.append(entry)
  inquiry.technical_files = existing
  await db.flush()
  await log_action_best_effort(
    db,
    tenant_id=tenant.id,
    action="INQUIRY_UPDATED",
    user_id=user.id,
    resource=f"inquiry:{inquiry.id}",
    details=f"Uploaded technical file on inquiry {inquiry.inquiry_code}",
  )
  await db.refresh(inquiry)
  item_map = await _get_items_by_inquiry_id(db, tenant_id=tenant.id, inquiry_ids=[inquiry.id])
  style = None
  if inquiry.style_id is not None:
    style = await db.get(GarmentStyle, inquiry.style_id)
    if style and style.tenant_id != tenant.id:
      style = None
  converted_map = await _get_converted_quotation_map(
    db, tenant_id=tenant.id, inquiry_ids=[inquiry.id]
  )
  return _serialize_inquiry(
    inquiry,
    item_map.get(inquiry.id, []),
    style,
    converted_map.get(inquiry.id),
  )


@router.delete(
  "/{inquiry_id}/technical-files/{file_id}",
  response_model=InquiryResponse,
)
async def delete_inquiry_technical_file(
  inquiry_id: int,
  file_id: str,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

  inquiry = await db.get(Inquiry, inquiry_id)
  if not inquiry or inquiry.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")
  _assert_inquiry_editable(inquiry)

  existing = list(inquiry.technical_files) if isinstance(inquiry.technical_files, list) else []
  match = None
  remaining: list = []
  for entry in existing:
    if isinstance(entry, dict) and str(entry.get("id")) == str(file_id):
      match = entry
      continue
    remaining.append(entry)
  if match is None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technical file not found")

  filename = match.get("filename")
  if filename:
    FileStorageService.delete_file(tenant.id, "inquiry_tech_files", str(filename))
  inquiry.technical_files = remaining
  await db.flush()
  await log_action_best_effort(
    db,
    tenant_id=tenant.id,
    action="INQUIRY_UPDATED",
    user_id=user.id,
    resource=f"inquiry:{inquiry.id}",
    details=f"Deleted technical file on inquiry {inquiry.inquiry_code}",
  )
  await db.refresh(inquiry)
  item_map = await _get_items_by_inquiry_id(db, tenant_id=tenant.id, inquiry_ids=[inquiry.id])
  style = None
  if inquiry.style_id is not None:
    style = await db.get(GarmentStyle, inquiry.style_id)
    if style and style.tenant_id != tenant.id:
      style = None
  converted_map = await _get_converted_quotation_map(
    db, tenant_id=tenant.id, inquiry_ids=[inquiry.id]
  )
  return _serialize_inquiry(
    inquiry,
    item_map.get(inquiry.id, []),
    style,
    converted_map.get(inquiry.id),
  )


@router.get("/{inquiry_id}/related", response_model=InquiryRelatedResponse)
async def get_inquiry_related_records(
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
  return await get_inquiry_related(db, tenant=tenant, user=user, inquiry=inquiry)


@router.get("/{inquiry_id}/trace", response_model=list[InquiryTraceEventOut])
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


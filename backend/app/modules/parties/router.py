from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Customer, CustomerIntermediary, Intermediary, Tenant, User
from app.modules.parties.schemas import (
  CustomerIntermediaryCreate,
  CustomerIntermediaryResponse,
  CustomerIntermediaryUpdate,
  IntermediaryCreate,
  IntermediaryResponse,
  IntermediaryUpdate,
)


router = APIRouter(prefix="/parties", tags=["parties"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
  if user.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _clean_optional(value: str | None) -> str | None:
  if value is None:
    return None
  cleaned = value.strip()
  return cleaned or None


def _to_intermediary_response(row: Intermediary) -> IntermediaryResponse:
  return IntermediaryResponse(
    id=row.id,
    tenant_id=row.tenant_id,
    code=row.code,
    name=row.name,
    kind=row.kind,
    contact_name=row.contact_name,
    contact_email=row.contact_email,
    contact_phone=row.contact_phone,
    contact_address=row.contact_address,
    is_active=row.is_active,
    notes=row.notes,
    created_at=row.created_at.isoformat(),
    updated_at=row.updated_at.isoformat(),
  )


def _to_customer_intermediary_response(
  row: CustomerIntermediary, intermediary: Intermediary | None
) -> CustomerIntermediaryResponse:
  return CustomerIntermediaryResponse(
    id=row.id,
    tenant_id=row.tenant_id,
    customer_id=row.customer_id,
    intermediary_id=row.intermediary_id,
    intermediary_code=intermediary.code if intermediary else None,
    intermediary_name=intermediary.name if intermediary else None,
    commission_type=row.commission_type,
    commission_value=float(row.commission_value) if row.commission_value is not None else None,
    is_primary=row.is_primary,
    notes=row.notes,
    created_at=row.created_at.isoformat(),
    updated_at=row.updated_at.isoformat(),
  )


async def _ensure_customer(db: AsyncSession, *, tenant_id: int, customer_id: int) -> None:
  customer = await db.get(Customer, customer_id)
  if not customer or customer.tenant_id != tenant_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer not found")


async def _ensure_intermediary(db: AsyncSession, *, tenant_id: int, intermediary_id: int) -> None:
  intermediary = await db.get(Intermediary, intermediary_id)
  if not intermediary or intermediary.tenant_id != tenant_id:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Intermediary not found")


@router.get("/intermediaries", response_model=list[IntermediaryResponse])
async def list_intermediaries(
  *,
  q: str | None = Query(default=None, description="Search by code/name/email/phone"),
  kind: str | None = Query(default=None, description="BUYING_HOUSE or AGENT"),
  is_active: bool | None = Query(default=None),
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  _ensure_tenant(user, tenant)
  stmt = select(Intermediary).where(Intermediary.tenant_id == tenant.id)
  if q:
    pattern = f"%{q.strip().lower()}%"
    stmt = stmt.where(
      or_(
        func.lower(Intermediary.code).like(pattern),
        func.lower(Intermediary.name).like(pattern),
        func.lower(Intermediary.contact_email).like(pattern),
        func.lower(Intermediary.contact_phone).like(pattern),
      )
    )
  if kind:
    stmt = stmt.where(Intermediary.kind == kind.strip().upper())
  if is_active is not None:
    stmt = stmt.where(Intermediary.is_active == is_active)
  result = await db.execute(stmt.order_by(Intermediary.created_at.desc()))
  return [_to_intermediary_response(row) for row in result.scalars().all()]


@router.post("/intermediaries", response_model=IntermediaryResponse, status_code=status.HTTP_201_CREATED)
async def create_intermediary(
  body: IntermediaryCreate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  _ensure_tenant(user, tenant)
  code = _clean_optional(body.code)
  if code is None:
    code = await next_tenant_code(db, model=Intermediary, tenant_id=tenant.id, prefix="INT-", width=4)
  else:
    code = code.upper()
  existing = await db.execute(
    select(Intermediary).where(Intermediary.tenant_id == tenant.id, Intermediary.code == code)
  )
  if existing.scalar_one_or_none():
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Intermediary code already exists")

  kind_value = body.kind.strip().upper()
  if kind_value not in {"BUYING_HOUSE", "AGENT"}:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="kind must be BUYING_HOUSE or AGENT")

  row = Intermediary(
    tenant_id=tenant.id,
    code=code,
    name=body.name.strip(),
    kind=kind_value,
    contact_name=_clean_optional(body.contact_name),
    contact_email=_clean_optional(body.contact_email),
    contact_phone=_clean_optional(body.contact_phone),
    contact_address=_clean_optional(body.contact_address),
    is_active=body.is_active,
    notes=_clean_optional(body.notes),
  )
  db.add(row)
  await db.flush()
  await db.refresh(row)
  return _to_intermediary_response(row)


@router.get("/intermediaries/{intermediary_id}", response_model=IntermediaryResponse)
async def get_intermediary(
  intermediary_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  _ensure_tenant(user, tenant)
  row = await db.get(Intermediary, intermediary_id)
  if not row or row.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intermediary not found")
  return _to_intermediary_response(row)


@router.patch("/intermediaries/{intermediary_id}", response_model=IntermediaryResponse)
async def update_intermediary(
  intermediary_id: int,
  body: IntermediaryUpdate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  _ensure_tenant(user, tenant)
  row = await db.get(Intermediary, intermediary_id)
  if not row or row.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intermediary not found")

  if body.code is not None:
    code = body.code.strip().upper()
    if not code:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code cannot be empty")
    existing = await db.execute(
      select(Intermediary).where(
        Intermediary.tenant_id == tenant.id,
        Intermediary.code == code,
        Intermediary.id != intermediary_id,
      )
    )
    if existing.scalar_one_or_none():
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Intermediary code already exists")
    row.code = code
  if body.name is not None:
    row.name = body.name.strip()
  if body.kind is not None:
    kind_value = body.kind.strip().upper()
    if kind_value not in {"BUYING_HOUSE", "AGENT"}:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="kind must be BUYING_HOUSE or AGENT")
    row.kind = kind_value
  if body.contact_name is not None:
    row.contact_name = _clean_optional(body.contact_name)
  if body.contact_email is not None:
    row.contact_email = _clean_optional(body.contact_email)
  if body.contact_phone is not None:
    row.contact_phone = _clean_optional(body.contact_phone)
  if body.contact_address is not None:
    row.contact_address = _clean_optional(body.contact_address)
  if body.is_active is not None:
    row.is_active = body.is_active
  if body.notes is not None:
    row.notes = _clean_optional(body.notes)

  await db.flush()
  await db.refresh(row)
  return _to_intermediary_response(row)


@router.delete("/intermediaries/{intermediary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_intermediary(
  intermediary_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  _ensure_tenant(user, tenant)
  row = await db.get(Intermediary, intermediary_id)
  if not row or row.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intermediary not found")
  await db.delete(row)
  await db.flush()


@router.get("/customer-intermediaries", response_model=list[CustomerIntermediaryResponse])
async def list_customer_intermediaries(
  *,
  customer_id: int | None = Query(default=None, gt=0),
  intermediary_id: int | None = Query(default=None, gt=0),
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  _ensure_tenant(user, tenant)
  stmt = select(CustomerIntermediary).where(CustomerIntermediary.tenant_id == tenant.id)
  if customer_id is not None:
    stmt = stmt.where(CustomerIntermediary.customer_id == customer_id)
  if intermediary_id is not None:
    stmt = stmt.where(CustomerIntermediary.intermediary_id == intermediary_id)
  rows = (await db.execute(stmt.order_by(CustomerIntermediary.created_at.desc()))).scalars().all()
  intermediary_ids = list({row.intermediary_id for row in rows})
  intermediaries = {}
  if intermediary_ids:
    intermediary_rows = (
      await db.execute(
        select(Intermediary).where(
          Intermediary.tenant_id == tenant.id,
          Intermediary.id.in_(intermediary_ids),
        )
      )
    ).scalars().all()
    intermediaries = {row.id: row for row in intermediary_rows}
  return [_to_customer_intermediary_response(row, intermediaries.get(row.intermediary_id)) for row in rows]


@router.post(
  "/customer-intermediaries",
  response_model=CustomerIntermediaryResponse,
  status_code=status.HTTP_201_CREATED,
)
async def create_customer_intermediary(
  body: CustomerIntermediaryCreate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  _ensure_tenant(user, tenant)
  await _ensure_customer(db, tenant_id=tenant.id, customer_id=body.customer_id)
  await _ensure_intermediary(db, tenant_id=tenant.id, intermediary_id=body.intermediary_id)
  if body.commission_type is not None and body.commission_type not in {"PERCENTAGE", "FIXED"}:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="commission_type must be PERCENTAGE or FIXED")

  existing = await db.execute(
    select(CustomerIntermediary).where(
      CustomerIntermediary.tenant_id == tenant.id,
      CustomerIntermediary.customer_id == body.customer_id,
      CustomerIntermediary.intermediary_id == body.intermediary_id,
    )
  )
  if existing.scalar_one_or_none():
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer intermediary link already exists")

  row = CustomerIntermediary(
    tenant_id=tenant.id,
    customer_id=body.customer_id,
    intermediary_id=body.intermediary_id,
    commission_type=body.commission_type,
    commission_value=body.commission_value,
    is_primary=body.is_primary,
    notes=_clean_optional(body.notes),
  )
  db.add(row)
  await db.flush()
  await db.refresh(row)
  intermediary = await db.get(Intermediary, row.intermediary_id)
  return _to_customer_intermediary_response(row, intermediary)


@router.patch("/customer-intermediaries/{link_id}", response_model=CustomerIntermediaryResponse)
async def update_customer_intermediary(
  link_id: int,
  body: CustomerIntermediaryUpdate,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  _ensure_tenant(user, tenant)
  row = await db.get(CustomerIntermediary, link_id)
  if not row or row.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer intermediary link not found")

  next_customer_id = body.customer_id if body.customer_id is not None else row.customer_id
  next_intermediary_id = body.intermediary_id if body.intermediary_id is not None else row.intermediary_id
  if body.customer_id is not None:
    await _ensure_customer(db, tenant_id=tenant.id, customer_id=body.customer_id)
    row.customer_id = body.customer_id
  if body.intermediary_id is not None:
    await _ensure_intermediary(db, tenant_id=tenant.id, intermediary_id=body.intermediary_id)
    row.intermediary_id = body.intermediary_id
  if body.commission_type is not None:
    if body.commission_type not in {"PERCENTAGE", "FIXED"}:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="commission_type must be PERCENTAGE or FIXED",
      )
    row.commission_type = body.commission_type
  if body.commission_value is not None:
    row.commission_value = body.commission_value
  if body.is_primary is not None:
    row.is_primary = body.is_primary
  if body.notes is not None:
    row.notes = _clean_optional(body.notes)

  existing = await db.execute(
    select(CustomerIntermediary).where(
      CustomerIntermediary.tenant_id == tenant.id,
      CustomerIntermediary.customer_id == next_customer_id,
      CustomerIntermediary.intermediary_id == next_intermediary_id,
      CustomerIntermediary.id != row.id,
    )
  )
  if existing.scalar_one_or_none():
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer intermediary link already exists")

  await db.flush()
  await db.refresh(row)
  intermediary = await db.get(Intermediary, row.intermediary_id)
  return _to_customer_intermediary_response(row, intermediary)


@router.delete("/customer-intermediaries/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer_intermediary(
  link_id: int,
  tenant: Tenant = Depends(require_tenant),
  user: User = Depends(get_current_user),
  db: AsyncSession = Depends(get_db),
):
  _ensure_tenant(user, tenant)
  row = await db.get(CustomerIntermediary, link_id)
  if not row or row.tenant_id != tenant.id:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer intermediary link not found")
  await db.delete(row)
  await db.flush()

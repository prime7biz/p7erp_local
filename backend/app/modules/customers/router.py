from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Customer, Tenant, User
from app.modules.customers.schemas import (
    CustomerCreate,
    CustomerListPageResponse,
    CustomerLogoUploadResponse,
    CustomerResponse,
    CustomerUpdate,
)

router = APIRouter(prefix="/customers", tags=["customers"])
LOGO_MAX_BYTES = 2 * 1024 * 1024
ALLOWED_LOGO_CONTENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
CUSTOMER_LOGO_DIR = Path(__file__).resolve().parents[3] / "media" / "customer_logos"


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _customer_to_response(customer: Customer) -> CustomerResponse:
    return CustomerResponse(
        id=customer.id,
        tenant_id=customer.tenant_id,
        customer_code=customer.customer_code,
        name=customer.name,
        address=customer.address,
        country=customer.country,
        email=customer.email,
        phone=customer.phone,
        website=customer.website,
        legal_entity_name=customer.legal_entity_name,
        trade_name=customer.trade_name,
        tax_id_vat_number=customer.tax_id_vat_number,
        customer_type=customer.customer_type,
        status=customer.status,
        primary_contact_name=customer.primary_contact_name,
        designation=customer.designation,
        contact_email=customer.contact_email,
        contact_phone=customer.contact_phone,
        phone_country_code=customer.phone_country_code,
        subscribe_newsletter=customer.subscribe_newsletter,
        company_logo_url=customer.company_logo_url,
        billing_address_line1=customer.billing_address_line1,
        billing_city=customer.billing_city,
        billing_postal_code=customer.billing_postal_code,
        billing_country=customer.billing_country,
        shipping_address_line1=customer.shipping_address_line1,
        shipping_city=customer.shipping_city,
        shipping_postal_code=customer.shipping_postal_code,
        shipping_country=customer.shipping_country,
        same_as_billing=customer.same_as_billing,
        created_at=customer.created_at.isoformat(),
        updated_at=customer.updated_at.isoformat(),
    )


def _apply_customer_filters(
    stmt,
    *,
    tenant_id: int,
    q: str | None,
    status_filter: str | None,
    country: str | None,
    customer_type: str | None,
):
    stmt = stmt.where(Customer.tenant_id == tenant_id)
    if q:
        pattern = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Customer.customer_code).like(pattern),
                func.lower(Customer.name).like(pattern),
                func.lower(Customer.legal_entity_name).like(pattern),
                func.lower(Customer.trade_name).like(pattern),
                func.lower(Customer.contact_email).like(pattern),
                func.lower(Customer.email).like(pattern),
                func.lower(Customer.contact_phone).like(pattern),
                func.lower(Customer.phone).like(pattern),
            )
        )
    if status_filter:
        stmt = stmt.where(func.lower(Customer.status) == status_filter.strip().lower())
    if country:
        country_val = country.strip().lower()
        stmt = stmt.where(
            or_(
                func.lower(Customer.billing_country) == country_val,
                func.lower(Customer.country) == country_val,
            )
        )
    if customer_type:
        stmt = stmt.where(func.lower(Customer.customer_type) == customer_type.strip().lower())
    return stmt


@router.get("", response_model=list[CustomerResponse])
async def list_customers(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all customers for the current tenant."""
    _ensure_user_tenant(user, tenant)
    result = await db.execute(
        select(Customer).where(Customer.tenant_id == tenant.id).order_by(Customer.customer_code)
    )
    customers = result.scalars().all()
    return [_customer_to_response(c) for c in customers]


@router.get("/paginated", response_model=CustomerListPageResponse)
async def list_customers_paginated(
    *,
    q: str | None = Query(default=None, description="Search by name/code/contact"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
    country: str | None = Query(default=None, description="Filter by billing country/country"),
    customer_type: str | None = Query(default=None, description="Filter by customer type"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)

    filtered_stmt = _apply_customer_filters(
        select(Customer),
        tenant_id=tenant.id,
        q=q,
        status_filter=status_filter,
        country=country,
        customer_type=customer_type,
    )

    total_result = await db.execute(select(func.count()).select_from(filtered_stmt.subquery()))
    total = int(total_result.scalar() or 0)
    total_pages = max((total + page_size - 1) // page_size, 1)
    safe_page = min(page, total_pages)
    offset = (safe_page - 1) * page_size

    rows_result = await db.execute(
        filtered_stmt.order_by(Customer.created_at.desc(), Customer.id.desc()).limit(page_size).offset(offset)
    )
    rows = rows_result.scalars().all()

    active_result = await db.execute(
        select(func.count()).select_from(
            _apply_customer_filters(
                select(Customer),
                tenant_id=tenant.id,
                q=q,
                status_filter=None,
                country=country,
                customer_type=customer_type,
            ).where(func.lower(Customer.status) == "active").subquery()
        )
    )
    active_count = int(active_result.scalar() or 0)

    inactive_result = await db.execute(
        select(func.count()).select_from(
            _apply_customer_filters(
                select(Customer),
                tenant_id=tenant.id,
                q=q,
                status_filter=None,
                country=country,
                customer_type=customer_type,
            ).where(func.lower(Customer.status) == "inactive").subquery()
        )
    )
    inactive_count = int(inactive_result.scalar() or 0)

    recent_threshold = datetime.utcnow() - timedelta(days=30)
    recent_result = await db.execute(
        select(func.count()).select_from(
            _apply_customer_filters(
                select(Customer),
                tenant_id=tenant.id,
                q=q,
                status_filter=None,
                country=country,
                customer_type=customer_type,
            ).where(Customer.created_at >= recent_threshold).subquery()
        )
    )
    recent_count = int(recent_result.scalar() or 0)

    return CustomerListPageResponse(
        items=[_customer_to_response(row) for row in rows],
        total=total,
        page=safe_page,
        page_size=page_size,
        total_pages=total_pages,
        active_count=active_count,
        inactive_count=inactive_count,
        recent_count=recent_count,
    )


@router.post("/upload-logo", response_model=CustomerLogoUploadResponse)
async def upload_customer_logo(
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    _ensure_user_tenant(user, tenant)
    content_type = (file.content_type or "").lower()
    extension = ALLOWED_LOGO_CONTENT_TYPES.get(content_type)
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Allowed: PNG, JPG, GIF, WEBP.",
        )

    data = await file.read()
    size_bytes = len(data)
    if size_bytes == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")
    if size_bytes > LOGO_MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Logo file exceeds 2MB limit.")

    CUSTOMER_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    safe_filename = f"tenant_{tenant.id}_{uuid4().hex}{extension}"
    target_path = CUSTOMER_LOGO_DIR / safe_filename
    target_path.write_bytes(data)

    return CustomerLogoUploadResponse(
        logo_url=f"/media/customer_logos/{safe_filename}",
        filename=safe_filename,
        size_bytes=size_bytes,
    )


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a customer by ID."""
    _ensure_user_tenant(user, tenant)
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == tenant.id,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return _customer_to_response(customer)


async def _next_customer_code(db: AsyncSession, tenant_id: int) -> str:
    """Generate next customer code for tenant (CUST-001, CUST-002, ...)."""
    return await next_tenant_code(
        db,
        model=Customer,
        tenant_id=tenant_id,
        prefix="CUST-",
        width=3,
    )


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new customer."""
    _ensure_user_tenant(user, tenant)
    code = await _next_customer_code(db, tenant.id)

    name = body.name.strip()
    billing_address_line1 = _clean_optional(body.billing_address_line1)
    billing_city = _clean_optional(body.billing_city)
    billing_postal_code = _clean_optional(body.billing_postal_code)
    billing_country = _clean_optional(body.billing_country)
    same_as_billing = body.same_as_billing

    shipping_address_line1 = _clean_optional(body.shipping_address_line1)
    shipping_city = _clean_optional(body.shipping_city)
    shipping_postal_code = _clean_optional(body.shipping_postal_code)
    shipping_country = _clean_optional(body.shipping_country)
    if same_as_billing:
        shipping_address_line1 = billing_address_line1
        shipping_city = billing_city
        shipping_postal_code = billing_postal_code
        shipping_country = billing_country

    customer = Customer(
        tenant_id=tenant.id,
        customer_code=code,
        name=name,
        address=_clean_optional(body.address),
        country=_clean_optional(body.country) or billing_country,
        email=_clean_optional(body.email),
        phone=_clean_optional(body.phone),
        website=_clean_optional(body.website),
        legal_entity_name=_clean_optional(body.legal_entity_name) or name,
        trade_name=_clean_optional(body.trade_name),
        tax_id_vat_number=_clean_optional(body.tax_id_vat_number),
        customer_type=_clean_optional(body.customer_type),
        status=_clean_optional(body.status) or "active",
        primary_contact_name=_clean_optional(body.primary_contact_name),
        designation=_clean_optional(body.designation),
        contact_email=_clean_optional(body.contact_email) or _clean_optional(body.email),
        contact_phone=_clean_optional(body.contact_phone) or _clean_optional(body.phone),
        phone_country_code=_clean_optional(body.phone_country_code),
        subscribe_newsletter=body.subscribe_newsletter,
        company_logo_url=_clean_optional(body.company_logo_url),
        billing_address_line1=billing_address_line1,
        billing_city=billing_city,
        billing_postal_code=billing_postal_code,
        billing_country=billing_country,
        shipping_address_line1=shipping_address_line1,
        shipping_city=shipping_city,
        shipping_postal_code=shipping_postal_code,
        shipping_country=shipping_country,
        same_as_billing=same_as_billing,
    )
    db.add(customer)
    await db.flush()
    await db.refresh(customer)
    return _customer_to_response(customer)


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: int,
    body: CustomerUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a customer."""
    _ensure_user_tenant(user, tenant)
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == tenant.id,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    if body.name is not None:
        customer.name = body.name.strip()
    if body.address is not None:
        customer.address = _clean_optional(body.address)
    if body.country is not None:
        customer.country = _clean_optional(body.country)
    if body.email is not None:
        customer.email = _clean_optional(body.email)
    if body.phone is not None:
        customer.phone = _clean_optional(body.phone)
    if body.website is not None:
        customer.website = _clean_optional(body.website)
    if body.legal_entity_name is not None:
        customer.legal_entity_name = _clean_optional(body.legal_entity_name)
    if body.trade_name is not None:
        customer.trade_name = _clean_optional(body.trade_name)
    if body.tax_id_vat_number is not None:
        customer.tax_id_vat_number = _clean_optional(body.tax_id_vat_number)
    if body.customer_type is not None:
        customer.customer_type = _clean_optional(body.customer_type)
    if body.status is not None:
        customer.status = _clean_optional(body.status) or "active"
    if body.primary_contact_name is not None:
        customer.primary_contact_name = _clean_optional(body.primary_contact_name)
    if body.designation is not None:
        customer.designation = _clean_optional(body.designation)
    if body.contact_email is not None:
        customer.contact_email = _clean_optional(body.contact_email)
    if body.contact_phone is not None:
        customer.contact_phone = _clean_optional(body.contact_phone)
    if body.phone_country_code is not None:
        customer.phone_country_code = _clean_optional(body.phone_country_code)
    if body.subscribe_newsletter is not None:
        customer.subscribe_newsletter = body.subscribe_newsletter
    if body.company_logo_url is not None:
        customer.company_logo_url = _clean_optional(body.company_logo_url)
    if body.billing_address_line1 is not None:
        customer.billing_address_line1 = _clean_optional(body.billing_address_line1)
    if body.billing_city is not None:
        customer.billing_city = _clean_optional(body.billing_city)
    if body.billing_postal_code is not None:
        customer.billing_postal_code = _clean_optional(body.billing_postal_code)
    if body.billing_country is not None:
        customer.billing_country = _clean_optional(body.billing_country)
    if body.shipping_address_line1 is not None:
        customer.shipping_address_line1 = _clean_optional(body.shipping_address_line1)
    if body.shipping_city is not None:
        customer.shipping_city = _clean_optional(body.shipping_city)
    if body.shipping_postal_code is not None:
        customer.shipping_postal_code = _clean_optional(body.shipping_postal_code)
    if body.shipping_country is not None:
        customer.shipping_country = _clean_optional(body.shipping_country)
    if body.same_as_billing is not None:
        customer.same_as_billing = body.same_as_billing
        if body.same_as_billing:
            customer.shipping_address_line1 = customer.billing_address_line1
            customer.shipping_city = customer.billing_city
            customer.shipping_postal_code = customer.billing_postal_code
            customer.shipping_country = customer.billing_country

    if customer.legal_entity_name is None and customer.name:
        customer.legal_entity_name = customer.name
    if customer.country is None:
        customer.country = customer.billing_country
    if customer.contact_email is None:
        customer.contact_email = customer.email
    if customer.contact_phone is None:
        customer.contact_phone = customer.phone

    await db.flush()
    await db.refresh(customer)
    return _customer_to_response(customer)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a customer."""
    _ensure_user_tenant(user, tenant)
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == tenant.id,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    await db.delete(customer)
    await db.flush()

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.storage import FileStorageService
from app.database import get_db
from app.models import Customer, Tenant, User
from app.common.tenant import require_tenant
from app.modules.customers import customer_ai_router
from app.modules.customers import service as customer_service
from app.modules.customers import customer_360_service
from app.modules.customers.schemas import (
    Customer360Response,
    CustomerContactCreate,
    CustomerContactResponse,
    CustomerContactUpdate,
    CustomerCreate,
    CustomerFacetsResponse,
    CustomerHealthResponse,
    CustomerListPageResponse,
    CustomerLogoUploadResponse,
    CustomerRelatedResponse,
    CustomerResponse,
    CustomerTimelineResponse,
    CustomerUpdate,
    DuplicateCheckResponse,
)

router = APIRouter(prefix="/customers", tags=["customers"])

router.include_router(customer_ai_router.router, prefix="/ai", tags=["customers-ai"])


@router.get("/facets", response_model=CustomerFacetsResponse)
async def customer_facets(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    return await customer_service.get_facets(db, tenant.id)


@router.get("", response_model=list[CustomerResponse])
async def list_customers(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(
        default=customer_service.max_page_size(),
        ge=1,
        le=customer_service.max_page_size(),
        description="Max rows (Finding #3); use /paginated for full paging",
    ),
    offset: int = Query(default=0, ge=0),
):
    """List customers for the current tenant (capped). Prefer GET /customers/paginated for UI lists."""
    customer_service.ensure_user_tenant(user, tenant)
    result = await db.execute(
        select(Customer)
        .where(Customer.tenant_id == tenant.id)
        .order_by(Customer.customer_code)
        .limit(limit)
        .offset(offset)
    )
    customers = result.scalars().all()
    return [customer_service.customer_to_response(c) for c in customers]


@router.get("/paginated", response_model=CustomerListPageResponse)
async def list_customers_paginated(
    *,
    q: str | None = Query(default=None, description="Search by name/code/contact"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
    country: str | None = Query(default=None, description="Filter by billing country/country"),
    customer_type: str | None = Query(default=None, description="Filter by customer type"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=10,
        ge=1,
        le=customer_service.max_page_size(),
        description="Max rows per page (Finding #3)",
    ),
    include_ai_fields: bool = Query(
        default=False,
        description="Include profile_completeness, last_activity_at, duplicate_risk_score for list rows",
    ),
    stale_only: bool = Query(
        default=False,
        description="Only customers with no related activity in the last stale_days (orders/inquiries/quotations)",
    ),
    incomplete_only: bool = Query(default=False, description="Only customers with profile completeness under 70%"),
    high_duplicate_risk_only: bool = Query(
        default=False,
        description="Only customers with duplicate email or phone match in tenant",
    ),
    stale_days: int = Query(default=90, ge=1, le=365, description="Window for stale_only filter"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    return await customer_service.list_customers_paginated(
        db,
        tenant_id=tenant.id,
        q=q,
        status_filter=status_filter,
        country=country,
        customer_type=customer_type,
        page=page,
        page_size=page_size,
        include_ai_fields=include_ai_fields,
        stale_only=stale_only,
        incomplete_only=incomplete_only,
        high_duplicate_risk_only=high_duplicate_risk_only,
        stale_days=stale_days,
    )


@router.post("/upload-logo", response_model=CustomerLogoUploadResponse)
async def upload_customer_logo(
    *,
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    customer_service.ensure_user_tenant(user, tenant)
    safe_filename, logo_url, _disk = await FileStorageService.save_file(file, tenant.id, "customer_logos")
    p = Path(_disk)
    size_bytes = p.stat().st_size if p.exists() else 0

    return CustomerLogoUploadResponse(
        logo_url=logo_url,
        filename=safe_filename,
        size_bytes=size_bytes,
    )


@router.get("/duplicate-check", response_model=DuplicateCheckResponse)
async def customer_duplicate_check(
    name: str | None = Query(default=None),
    email: str | None = Query(default=None),
    exclude_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft duplicate hint on blur (read-only; no AI / audit writes)."""
    customer_service.ensure_user_tenant(user, tenant)
    return await customer_service.duplicate_check(
        db,
        tenant_id=tenant.id,
        name=name,
        email=email,
        exclude_id=exclude_id,
    )


@router.get("/{customer_id}/related", response_model=CustomerRelatedResponse)
async def customer_related(
    customer_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    r = await db.execute(
        select(Customer.id).where(Customer.id == customer_id, Customer.tenant_id == tenant.id)
    )
    if r.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return await customer_service.get_related(db, tenant_id=tenant.id, customer_id=customer_id, limit=limit)


@router.get("/{customer_id}/360", response_model=Customer360Response)
async def customer_360(
    customer_id: int,
    sections: str | None = Query(
        default="summary",
        description="Comma-separated: summary|merch|commercial|operations|finance|partners|portal|contacts",
    ),
    limit: int = Query(default=25, ge=1, le=100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    section_list = [s.strip() for s in (sections or "summary").split(",") if s.strip()]
    payload = await customer_360_service.get_customer_360(
        db,
        tenant=tenant,
        user=user,
        customer_id=customer_id,
        sections=section_list,
        limit=limit,
    )
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return payload


@router.get("/{customer_id}/timeline", response_model=CustomerTimelineResponse)
async def customer_timeline(
    customer_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    payload = await customer_360_service.get_customer_timeline(
        db,
        tenant=tenant,
        user=user,
        customer_id=customer_id,
        limit=limit,
        offset=offset,
    )
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return payload


@router.get("/{customer_id}/health", response_model=CustomerHealthResponse)
async def customer_health(
    customer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    from app.modules.customers.customer_360_authz import evaluate_customer_360_gates

    gates = await evaluate_customer_360_gates(db, user=user, tenant=tenant)
    health = await customer_service.get_health(
        db,
        tenant_id=tenant.id,
        customer_id=customer_id,
        include_receivables=gates.finance,
    )
    if not health:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return health


@router.get("/{customer_id}/contacts", response_model=list[CustomerContactResponse])
async def list_customer_contacts(
    customer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    return await customer_service.list_contacts(db, tenant_id=tenant.id, customer_id=customer_id)


@router.post(
    "/{customer_id}/contacts",
    response_model=CustomerContactResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_customer_contact(
    customer_id: int,
    body: CustomerContactCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    return await customer_service.create_contact(
        db, tenant_id=tenant.id, customer_id=customer_id, body=body
    )


@router.patch("/{customer_id}/contacts/{contact_id}", response_model=CustomerContactResponse)
async def update_customer_contact(
    customer_id: int,
    contact_id: int,
    body: CustomerContactUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    updated = await customer_service.update_contact(
        db,
        tenant_id=tenant.id,
        customer_id=customer_id,
        contact_id=contact_id,
        body=body,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer contact not found")
    return updated


@router.delete("/{customer_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer_contact(
    customer_id: int,
    contact_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    ok = await customer_service.delete_contact(
        db, tenant_id=tenant.id, customer_id=customer_id, contact_id=contact_id
    )
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer contact not found")


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a customer by ID."""
    customer_service.ensure_user_tenant(user, tenant)
    result = await db.execute(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.tenant_id == tenant.id,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer_service.customer_to_response(customer)


@router.get("/{customer_id}/pdf")
async def customer_pdf(
    customer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Server PDF for phone Save PDF / Share (tenant-scoped)."""
    from fastapi.responses import Response
    from app.modules.merch.doc_pdf import render_simple_doc_pdf

    customer_service.ensure_user_tenant(user, tenant)
    customer = await db.get(Customer, customer_id)
    if not customer or customer.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    content = render_simple_doc_pdf(
        tenant=tenant,
        title="Customer",
        lines=[
            ("Code", customer.customer_code),
            ("Name", customer.name),
            ("Status", customer.status),
            ("Country", customer.country or customer.billing_country),
            ("Email", customer.email),
            ("Phone", customer.phone),
            ("Contact", customer.primary_contact_name),
            ("Currency", customer.preferred_currency),
            ("Address", (customer.address or "")[:90]),
        ],
    )
    filename = f"{customer.customer_code or f'customer-{customer.id}'}.pdf".replace("/", "-")
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CustomerCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new customer."""
    customer_service.ensure_user_tenant(user, tenant)
    return await customer_service.create_customer(db, tenant, body, user_id=user.id)


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: int,
    body: CustomerUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a customer."""
    customer_service.ensure_user_tenant(user, tenant)
    updated = await customer_service.update_customer(db, tenant, customer_id, body, user_id=user.id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return updated


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a customer."""
    customer_service.ensure_user_tenant(user, tenant)
    ok = await customer_service.delete_customer(db, tenant, customer_id, user_id=user.id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

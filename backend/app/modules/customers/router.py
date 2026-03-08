from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Customer, Tenant, User
from app.modules.customers.schemas import CustomerCreate, CustomerResponse, CustomerUpdate

router = APIRouter(prefix="/customers", tags=["customers"])


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


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
    return [
        CustomerResponse(
            id=c.id,
            tenant_id=c.tenant_id,
            customer_code=c.customer_code,
            name=c.name,
            address=c.address,
            country=c.country,
            email=c.email,
            phone=c.phone,
            website=c.website,
            created_at=c.created_at.isoformat(),
            updated_at=c.updated_at.isoformat(),
        )
        for c in customers
    ]


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
        created_at=customer.created_at.isoformat(),
        updated_at=customer.updated_at.isoformat(),
    )


async def _next_customer_code(db: AsyncSession, tenant_id: int) -> str:
    """Generate next customer code for tenant (CUST-001, CUST-002, ...)."""
    result = await db.execute(
        select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id)
    )
    count = result.scalar() or 0
    return f"CUST-{count + 1:03d}"


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
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=code,
        name=body.name.strip(),
        address=body.address.strip() if body.address else None,
        country=body.country.strip() if body.country else None,
        email=body.email.strip() if body.email else None,
        phone=body.phone.strip() if body.phone else None,
        website=body.website.strip() if body.website else None,
    )
    db.add(customer)
    await db.flush()
    await db.refresh(customer)
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
        created_at=customer.created_at.isoformat(),
        updated_at=customer.updated_at.isoformat(),
    )


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
        customer.address = body.address.strip() or None
    if body.country is not None:
        customer.country = body.country.strip() or None
    if body.email is not None:
        customer.email = body.email.strip() or None
    if body.phone is not None:
        customer.phone = body.phone.strip() or None
    if body.website is not None:
        customer.website = body.website.strip() or None
    await db.flush()
    await db.refresh(customer)
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
        created_at=customer.created_at.isoformat(),
        updated_at=customer.updated_at.isoformat(),
    )


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

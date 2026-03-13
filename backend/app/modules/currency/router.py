"""
Currency module (PrimeX parity): exchange rates CRUD and live rates.
Pair-based rates: from_currency → to_currency, effective_date, tenant-scoped.
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import CurrencyExchangeRate, Tenant, User

router = APIRouter(prefix="/currency", tags=["currency"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


# ----- Schemas -----
class ExchangeRateResponse(BaseModel):
    id: int
    tenant_id: int
    from_currency: str
    to_currency: str
    exchange_rate: str
    effective_date: date
    source: str
    is_active: bool
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class ExchangeRateCreate(BaseModel):
    from_currency: str
    to_currency: str
    exchange_rate: str
    effective_date: date
    source: str = "manual"


class ExchangeRateUpdate(BaseModel):
    exchange_rate: str | None = None
    effective_date: date | None = None
    source: str | None = None
    is_active: bool | None = None


# ----- List exchange rates -----
@router.get("/exchange-rates", response_model=list[ExchangeRateResponse])
async def list_exchange_rates(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    active_only: bool = Query(True, description="Only active rates"),
):
    """List all exchange rates for the current tenant (newest first per pair)."""
    _ensure_tenant(user, tenant)
    stmt = (
        select(CurrencyExchangeRate)
        .where(CurrencyExchangeRate.tenant_id == tenant.id)
        .order_by(desc(CurrencyExchangeRate.effective_date))
    )
    if active_only:
        stmt = stmt.where(CurrencyExchangeRate.is_active.is_(True))
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        ExchangeRateResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            from_currency=r.from_currency,
            to_currency=r.to_currency,
            exchange_rate=r.exchange_rate,
            effective_date=r.effective_date,
            source=r.source,
            is_active=r.is_active,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )
        for r in rows
    ]


# ----- Get rate for pair -----
@router.get("/exchange-rates/{from_code}/{to_code}", response_model=ExchangeRateResponse)
async def get_exchange_rate_pair(
    from_code: str,
    to_code: str,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the latest active exchange rate for a currency pair."""
    _ensure_tenant(user, tenant)
    from_code = from_code.upper()
    to_code = to_code.upper()
    result = await db.execute(
        select(CurrencyExchangeRate)
        .where(
            and_(
                CurrencyExchangeRate.tenant_id == tenant.id,
                CurrencyExchangeRate.from_currency == from_code,
                CurrencyExchangeRate.to_currency == to_code,
                CurrencyExchangeRate.is_active.is_(True),
            )
        )
        .order_by(desc(CurrencyExchangeRate.effective_date))
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Exchange rate not found")
    return ExchangeRateResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        from_currency=row.from_currency,
        to_currency=row.to_currency,
        exchange_rate=row.exchange_rate,
        effective_date=row.effective_date,
        source=row.source,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


# ----- Create exchange rate -----
@router.post("/exchange-rates", response_model=ExchangeRateResponse, status_code=201)
async def create_exchange_rate(
    body: ExchangeRateCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new exchange rate. Same pair+date can be updated by creating again (upsert not enforced)."""
    _ensure_tenant(user, tenant)
    if body.from_currency.upper() == body.to_currency.upper():
        raise HTTPException(status_code=400, detail="From and to currency cannot be the same")
    rate = CurrencyExchangeRate(
        tenant_id=tenant.id,
        from_currency=body.from_currency.upper(),
        to_currency=body.to_currency.upper(),
        exchange_rate=body.exchange_rate,
        effective_date=body.effective_date,
        source=body.source or "manual",
        is_active=True,
    )
    db.add(rate)
    await db.commit()
    await db.refresh(rate)
    return ExchangeRateResponse(
        id=rate.id,
        tenant_id=rate.tenant_id,
        from_currency=rate.from_currency,
        to_currency=rate.to_currency,
        exchange_rate=rate.exchange_rate,
        effective_date=rate.effective_date,
        source=rate.source,
        is_active=rate.is_active,
        created_at=rate.created_at.isoformat(),
        updated_at=rate.updated_at.isoformat(),
    )


# ----- Update exchange rate -----
@router.put("/exchange-rates/{rate_id}", response_model=ExchangeRateResponse)
async def update_exchange_rate(
    rate_id: int,
    body: ExchangeRateUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an exchange rate by ID."""
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(CurrencyExchangeRate).where(
            and_(
                CurrencyExchangeRate.id == rate_id,
                CurrencyExchangeRate.tenant_id == tenant.id,
            )
        )
    )
    rate = result.scalar_one_or_none()
    if not rate:
        raise HTTPException(status_code=404, detail="Exchange rate not found")
    if body.exchange_rate is not None:
        rate.exchange_rate = body.exchange_rate
    if body.effective_date is not None:
        rate.effective_date = body.effective_date
    if body.source is not None:
        rate.source = body.source
    if body.is_active is not None:
        rate.is_active = body.is_active
    await db.commit()
    await db.refresh(rate)
    return ExchangeRateResponse(
        id=rate.id,
        tenant_id=rate.tenant_id,
        from_currency=rate.from_currency,
        to_currency=rate.to_currency,
        exchange_rate=rate.exchange_rate,
        effective_date=rate.effective_date,
        source=rate.source,
        is_active=rate.is_active,
        created_at=rate.created_at.isoformat(),
        updated_at=rate.updated_at.isoformat(),
    )


# ----- Delete exchange rate -----
@router.delete("/exchange-rates/{rate_id}", status_code=204)
async def delete_exchange_rate(
    rate_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an exchange rate by ID."""
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(CurrencyExchangeRate).where(
            and_(
                CurrencyExchangeRate.id == rate_id,
                CurrencyExchangeRate.tenant_id == tenant.id,
            )
        )
    )
    rate = result.scalar_one_or_none()
    if not rate:
        raise HTTPException(status_code=404, detail="Exchange rate not found")
    await db.delete(rate)
    await db.commit()


# ----- Live rates (fallback like PrimeX) -----
FALLBACK_RATES: dict[str, float] = {
    "BDT": 110.5,
    "EUR": 0.92,
    "GBP": 0.79,
    "JPY": 149.5,
    "CNY": 7.24,
    "INR": 83.1,
    "AUD": 1.53,
    "CAD": 1.36,
    "CHF": 0.9,
    "SGD": 1.34,
    "HKD": 7.82,
    "MYR": 4.72,
    "THB": 35.5,
    "VND": 24500.0,
    "KRW": 1325.0,
    "TRY": 32.1,
    "SAR": 3.75,
    "AED": 3.67,
    "PKR": 278.0,
    "LKR": 325.0,
}


def _fetch_live_rates_sync(base: str) -> dict:
    """Synchronous fetch for use in thread."""
    import json
    import urllib.request
    url = f"https://open.er-api.com/v6/latest/{base}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode())
    if data.get("result") != "success":
        raise ValueError("API returned non-success")
    return {
        "rates": data.get("rates", {}),
        "base": data.get("base_code", base),
        "source": "open.er-api.com",
        "fetched_at": data.get("time_last_update_utc", ""),
        "live": True,
    }


@router.get("/live-rates")
async def get_live_rates(
    base: str = Query("USD", description="Base currency code"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    """Fetch live rates from open.er-api.com (no key). On failure return fallback rates (PrimeX parity)."""
    import asyncio
    _ensure_tenant(user, tenant)
    base = base.upper()
    try:
        data = await asyncio.to_thread(_fetch_live_rates_sync, base)
        return data
    except Exception as e:
        all_rates = {"USD": 1.0, **FALLBACK_RATES}
        return {
            "rates": all_rates,
            "base": "USD",
            "source": "fallback",
            "fetched_at": "",
            "live": False,
            "error": str(e),
        }

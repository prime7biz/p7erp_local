"""Phase 5: principal factory material claims + settlement events (payable stub)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_material_physical_v1_enabled
from app.database import safe_async_session_rollback
from app.models.customer import Customer
from app.models.job_work import JobWorkContract
from app.models.material_control_alloc import PrincipalMaterialClaim, PrincipalMaterialClaimSettlement
from app.models.tenant import Tenant


def require_physical_flag(tenant: Tenant) -> None:
    if not is_material_physical_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def _find_claim_by_request(
    db: AsyncSession, *, tenant_id: int, request_id: str
) -> PrincipalMaterialClaim | None:
    return (
        await db.execute(
            select(PrincipalMaterialClaim)
            .where(
                PrincipalMaterialClaim.tenant_id == tenant_id,
                PrincipalMaterialClaim.request_id == request_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()


async def open_claim(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int,
    customer_id: int,
    amount: Decimal | float | str | int,
    contract_id: int | None = None,
    currency: str = "BDT",
    notes: str | None = None,
    request_id: str | None = None,
) -> PrincipalMaterialClaim:
    require_physical_flag(tenant)
    amt = Decimal(str(amount))
    if amt < 0:
        raise HTTPException(status_code=400, detail="amount cannot be negative")

    if request_id:
        existing = await _find_claim_by_request(db, tenant_id=tenant.id, request_id=request_id)
        if existing is not None:
            return existing

    try:
        await ensure_owned(db, Customer, customer_id, tenant.id, "Customer", status_code=404)
        await ensure_owned(db, JobWorkContract, contract_id, tenant.id, "Job work contract", status_code=404)

        claim_no = await next_tenant_code(
            db, model=PrincipalMaterialClaim, tenant_id=tenant.id, prefix="PMC-", width=4
        )
        row = PrincipalMaterialClaim(
            tenant_id=tenant.id,
            claim_no=claim_no,
            customer_id=customer_id,
            contract_id=contract_id,
            status="OPEN",
            amount=str(amt),
            currency=(currency or "BDT")[:10],
            notes=notes,
            request_id=request_id,
            created_by_user_id=user_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(row)
        try:
            await db.flush()
        except IntegrityError:
            await safe_async_session_rollback(db)
            if request_id:
                existing = await _find_claim_by_request(db, tenant_id=tenant.id, request_id=request_id)
                if existing is not None:
                    return existing
            raise
        return row
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


async def settle_claim(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int,
    claim_id: int,
    amount: Decimal | float | str | int,
    notes: str | None = None,
) -> PrincipalMaterialClaimSettlement:
    require_physical_flag(tenant)
    amt = Decimal(str(amount))
    if amt <= 0:
        raise HTTPException(status_code=400, detail="settlement amount must be positive")

    try:
        claim = (
            await db.execute(
                select(PrincipalMaterialClaim)
                .where(
                    PrincipalMaterialClaim.id == claim_id,
                    PrincipalMaterialClaim.tenant_id == tenant.id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if claim is None:
            raise HTTPException(status_code=404, detail="Claim not found")
        if claim.status in {"CLOSED", "SETTLED"}:
            raise HTTPException(status_code=409, detail="Claim already settled or closed")

        event = PrincipalMaterialClaimSettlement(
            tenant_id=tenant.id,
            claim_id=claim.id,
            event_kind="SETTLE",
            amount=str(amt),
            notes=notes,
            created_by_user_id=user_id,
            created_at=datetime.utcnow(),
        )
        db.add(event)
        claim.status = "SETTLED"
        claim.updated_at = datetime.utcnow()
        await db.flush()
        return event
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


def claim_to_dict(row: PrincipalMaterialClaim) -> dict:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "claim_no": row.claim_no,
        "customer_id": row.customer_id,
        "contract_id": row.contract_id,
        "status": row.status,
        "amount": row.amount,
        "currency": row.currency,
        "request_id": row.request_id,
    }

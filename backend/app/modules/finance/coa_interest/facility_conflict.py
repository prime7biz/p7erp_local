"""Block COA interest on ledgers used by Facility (and the reverse)."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.models.facility import Facility
from app.models.finance import ChartOfAccount
from app.modules.facility.account_resolver import resolve_facility_accounts


async def facility_uses_liability_account(
    db: AsyncSession,
    tenant_id: int,
    account_id: int,
) -> bool:
    """True when any non-closed Facility resolves its liability GL to this account."""
    rows = list(
        (
            await db.execute(
                select(Facility).where(
                    Facility.tenant_id == tenant_id,
                    Facility.status.notin_(("closed", "cancelled")),
                )
            )
        ).scalars().all()
    )
    for fac in rows:
        if fac.gl_liability_account_id == account_id:
            return True
        resolved = await resolve_facility_accounts(db, tenant_id, fac)
        if resolved.get("liability") == account_id:
            return True
    return False


async def assert_coa_interest_allowed_for_account(
    db: AsyncSession,
    tenant_id: int,
    account_id: int,
) -> None:
    """Refuse enabling COA interest when Facility already accrues on this liability GL."""
    if await facility_uses_liability_account(db, tenant_id, account_id):
        raise HTTPException(
            status_code=409,
            detail=(
                "This ledger is used by a Facility loan. Use Facility monthly interest accrual "
                "instead of chart-of-accounts interest (to avoid charging interest twice)."
            ),
        )


async def assert_facility_liability_not_coa_interest(
    db: AsyncSession,
    tenant_id: int,
    liability_account_id: int | None,
) -> None:
    """Refuse Facility create/update when the liability GL already has COA interest on."""
    if liability_account_id is None:
        return
    row = (
        await db.execute(
            select(ChartOfAccount)
            .options(
                load_only(
                    ChartOfAccount.id,
                    ChartOfAccount.tenant_id,
                    ChartOfAccount.interest_enabled,
                )
            )
            .where(
                ChartOfAccount.id == liability_account_id,
                ChartOfAccount.tenant_id == tenant_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        return
    if bool(row.interest_enabled):
        raise HTTPException(
            status_code=409,
            detail=(
                "This liability ledger has chart-of-accounts interest enabled. "
                "Turn that off before linking it to a Facility (to avoid charging interest twice)."
            ),
        )


async def any_coa_interest_on_system_fallback(
    db: AsyncSession,
    tenant_id: int,
    facility: Facility,
) -> None:
    """When Facility leaves liability GL blank, block if the resolved system ledger has COA interest."""
    if facility.gl_liability_account_id is not None:
        await assert_facility_liability_not_coa_interest(db, tenant_id, facility.gl_liability_account_id)
        return
    resolved = await resolve_facility_accounts(db, tenant_id, facility)
    lid = resolved.get("liability")
    if lid:
        await assert_facility_liability_not_coa_interest(db, tenant_id, lid)

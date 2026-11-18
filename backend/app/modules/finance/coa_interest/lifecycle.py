"""Voucher post / cancel / delete hooks for COA interest accruals."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import CoaInterestAccrual, Voucher
from app.modules.finance.coa_interest import SOURCE_MODULE

logger = logging.getLogger(__name__)


async def _lock_by_voucher(
    db: AsyncSession, tenant_id: int, voucher_id: int
) -> CoaInterestAccrual | None:
    return (
        await db.execute(
            select(CoaInterestAccrual)
            .where(
                CoaInterestAccrual.tenant_id == tenant_id,
                CoaInterestAccrual.journal_voucher_id == voucher_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()


async def on_coa_interest_voucher_posted(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
) -> None:
    if (voucher.source_module or "") != SOURCE_MODULE:
        return
    row = await _lock_by_voucher(db, tenant_id, voucher.id)
    if row is None:
        return
    if row.status == "posted":
        return
    if row.status not in {"draft", "cancelled"}:
        logger.warning(
            "coa_interest unexpected status on post accrual=%s status=%s",
            row.id,
            row.status,
        )
        return
    row.status = "posted"
    await db.flush()


async def on_coa_interest_voucher_cancelled(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
) -> None:
    if (voucher.source_module or "") != SOURCE_MODULE:
        return
    row = await _lock_by_voucher(db, tenant_id, voucher.id)
    if row is None:
        return
    if row.status == "posted":
        # Posted vouchers go through reverse flow, not cancel.
        return
    if row.status == "reversed":
        return
    row.status = "cancelled"
    await db.flush()


async def on_coa_interest_voucher_deleted(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
) -> None:
    """Called before the voucher row is deleted. Marks accrual cancelled (FK will SET NULL)."""
    if (voucher.source_module or "") != SOURCE_MODULE:
        return
    row = await _lock_by_voucher(db, tenant_id, voucher.id)
    if row is None:
        return
    if row.status in {"posted", "reversed"}:
        return
    row.status = "cancelled"
    row.journal_voucher_id = None
    await db.flush()


async def on_coa_interest_voucher_reversed(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
) -> None:
    if (voucher.source_module or "") != SOURCE_MODULE:
        return
    row = await _lock_by_voucher(db, tenant_id, voucher.id)
    if row is None:
        return
    if row.status == "reversed":
        return
    row.status = "reversed"
    await db.flush()

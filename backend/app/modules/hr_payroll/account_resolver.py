"""Resolve payroll GL accounts: request override > PayrollAccountingConfig > system COA."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr_payroll import PayrollAccountingConfig
from app.modules.finance.system_coa_seeding_service import resolve_system_ledger

logger = logging.getLogger(__name__)

_DEFAULT_EXPENSE_CODE = "DIRECT_SALARY_EXPENSE"
_DEFAULT_PAYABLE_CODE = "DIRECT_SALARY_PAYABLE"


async def _resolve_safe(db: AsyncSession, tenant_id: int, mapping_key: str) -> int | None:
    try:
        return await resolve_system_ledger(db, tenant_id, mapping_key)
    except ValueError as exc:
        logger.warning("resolve_payroll_accounts: %s", exc)
        return None


async def resolve_payroll_accounts(
    db: AsyncSession,
    tenant_id: int,
    *,
    expense_override: int | None = None,
    payable_override: int | None = None,
) -> dict[str, int | None]:
    """Explicit IDs from API body win, then tenant config, then seeded system ledgers."""
    cfg = (
        await db.execute(select(PayrollAccountingConfig).where(PayrollAccountingConfig.tenant_id == tenant_id).limit(1))
    ).scalar_one_or_none()

    expense = expense_override
    if expense is None and cfg is not None:
        expense = cfg.salary_expense_account_id
    if expense is None:
        expense = await _resolve_safe(db, tenant_id, _DEFAULT_EXPENSE_CODE)

    payable = payable_override
    if payable is None and cfg is not None:
        payable = cfg.salary_payable_account_id
    if payable is None:
        payable = await _resolve_safe(db, tenant_id, _DEFAULT_PAYABLE_CODE)

    return {"expense": expense, "payable": payable}

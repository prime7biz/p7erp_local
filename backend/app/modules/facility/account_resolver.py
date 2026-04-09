"""Resolve facility GL accounts: Facility FK overrides > system COA mapping (type-aware)."""

from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.facility import Facility
from app.modules.finance.system_coa_seeding_service import resolve_system_ledger

logger = logging.getLogger(__name__)


def _liability_system_code(facility_type: str | None) -> str:
    t = (facility_type or "").strip().lower()
    if t == "working_capital":
        return "WORKING_CAPITAL_LOAN"
    if t == "overdraft":
        return "OD_LOAN_BALANCE"
    return "TERM_LOAN_PRINCIPAL"


def _interest_expense_system_code(facility_type: str | None) -> str:
    t = (facility_type or "").strip().lower()
    if t == "term_loan":
        return "TERM_LOAN_INTEREST_EXPENSE"
    return "INTEREST_ON_LOAN_EXPENSE"


async def _resolve_cached(
    db: AsyncSession,
    tenant_id: int,
    mapping_key: str,
    cache: dict[str, int | None],
) -> int | None:
    if mapping_key in cache:
        return cache[mapping_key]
    try:
        lid = await resolve_system_ledger(db, tenant_id, mapping_key)
    except ValueError as exc:
        logger.warning("resolve_facility_accounts: %s", exc)
        lid = None
    cache[mapping_key] = lid
    return lid


async def resolve_facility_accounts(
    db: AsyncSession,
    tenant_id: int,
    facility: Facility,
) -> dict[str, int | None]:
    """Per-facility FK overrides, then system COA.

    Keys: ``liability``, ``interest_expense``, ``interest_payable``, ``penalty_expense``.
    Bank/cash GL is not resolved here (must be explicit on facility / bank master).
    """
    cache: dict[str, int | None] = {}
    ftype = facility.facility_type

    liability = facility.gl_liability_account_id
    if liability is None:
        liability = await _resolve_cached(db, tenant_id, _liability_system_code(ftype), cache)

    interest_expense = facility.gl_interest_expense_account_id
    if interest_expense is None:
        interest_expense = await _resolve_cached(db, tenant_id, _interest_expense_system_code(ftype), cache)

    interest_payable = facility.gl_interest_payable_account_id
    if interest_payable is None:
        interest_payable = await _resolve_cached(db, tenant_id, "ACCRUED_LOAN_INTEREST_PAYABLE", cache)

    penalty_expense = facility.gl_penalty_expense_account_id
    if penalty_expense is None:
        penalty_expense = await _resolve_cached(db, tenant_id, "PENAL_INTEREST_EXPENSE", cache)

    return {
        "liability": liability,
        "interest_expense": interest_expense,
        "interest_payable": interest_payable,
        "penalty_expense": penalty_expense,
    }

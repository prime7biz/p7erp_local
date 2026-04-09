"""Idempotent system COA seeding per tenant (INSERT-if-missing only)."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.finance import AccountGroup, AccountingSystemMapping, ChartOfAccount
from app.modules.finance.system_coa_templates import SYSTEM_ACCOUNT_GROUPS, SYSTEM_LEDGERS

logger = logging.getLogger(__name__)


def _next_sys_seq(session: Session, tenant_id: int) -> int:
    rows = session.execute(
        select(ChartOfAccount.account_number).where(
            ChartOfAccount.tenant_id == tenant_id,
            ChartOfAccount.account_number.like("SYS-%"),
        )
    ).all()
    max_n = 0
    for (an,) in rows:
        if not an or not str(an).startswith("SYS-"):
            continue
        suffix = str(an)[4:]
        if suffix.isdigit():
            max_n = max(max_n, int(suffix))
    return max_n + 1


def seed_tenant_system_coa_sync_session(session: Session, tenant_id: int) -> dict[str, Any]:
    """Seed system groups, ledgers, and mappings for one tenant. Sync Session (Alembic or run_sync)."""
    groups_map: dict[str, int] = {}
    created_groups = 0
    created_ledgers = 0
    created_mappings = 0

    for g in sorted(SYSTEM_ACCOUNT_GROUPS, key=lambda x: x["sort_order"]):
        sc = g["system_code"]
        existing = session.scalars(
            select(AccountGroup).where(AccountGroup.tenant_id == tenant_id, AccountGroup.system_code == sc)
        ).first()
        if existing:
            groups_map[sc] = existing.id
            continue
        row = AccountGroup(
            tenant_id=tenant_id,
            name=g["name"],
            code=g["code"],
            parent_group_id=None,
            nature=g["nature"],
            affects_gross_profit=g.get("affects_gross_profit", False),
            is_bank_group=g.get("is_bank_group", False),
            sort_order=g["sort_order"],
            is_active=True,
            description=g.get("description"),
            reporting_code=None,
            default_normal_balance=g["default_normal_balance"],
            allow_posting=g.get("allow_posting", True),
            is_summary_group=g.get("is_summary_group", False),
            last_reviewed_at=None,
            system_code=sc,
            is_system=True,
            is_protected=True,
        )
        session.add(row)
        session.flush()
        groups_map[sc] = row.id
        created_groups += 1

    seq = _next_sys_seq(session, tenant_id)
    for led in SYSTEM_LEDGERS:
        sc = led["system_code"]
        existing_ledger = session.scalars(
            select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.system_code == sc)
        ).first()
        if existing_ledger:
            ledger_id = existing_ledger.id
        else:
            gid = groups_map.get(led["group_system_code"])
            if not gid:
                logger.warning("Skipping ledger %s: missing group %s", sc, led["group_system_code"])
                continue
            nb = led["normal_balance"]
            acct_num = f"SYS-{seq:05d}"
            seq += 1
            coa = ChartOfAccount(
                tenant_id=tenant_id,
                account_number=acct_num,
                name=led["name"],
                group_id=gid,
                normal_balance=nb,
                opening_balance="0",
                balance="0",
                account_currency=None,
                maintain_fc_balance=False,
                description=None,
                is_active=True,
                is_bank_account=False,
                account_type="posting",
                reporting_code=None,
                display_order=0,
                statistical_unit=None,
                statistical_formula=None,
                parent_account_id=None,
                last_reviewed_at=None,
                enable_bill_wise=False,
                system_code=sc,
                is_system=True,
                is_protected=True,
                usage_purpose=led.get("usage_purpose"),
                linked_module=led.get("module"),
            )
            session.add(coa)
            session.flush()
            ledger_id = coa.id
            created_ledgers += 1

        existing_map = session.scalars(
            select(AccountingSystemMapping).where(
                AccountingSystemMapping.tenant_id == tenant_id,
                AccountingSystemMapping.mapping_key == sc,
            )
        ).first()
        if not existing_map:
            session.add(
                AccountingSystemMapping(
                    tenant_id=tenant_id,
                    mapping_key=sc,
                    ledger_id=ledger_id,
                    group_id=None,
                    module=led.get("module"),
                    is_locked=True,
                )
            )
            created_mappings += 1

    return {
        "tenant_id": tenant_id,
        "created_groups": created_groups,
        "created_ledgers": created_ledgers,
        "created_mappings": created_mappings,
    }


def seed_all_tenants_system_coa_sync_session(session: Session) -> list[dict[str, Any]]:
    from app.models.tenant import Tenant

    out: list[dict[str, Any]] = []
    tenant_ids = session.execute(select(Tenant.id)).scalars().all()
    for tid in tenant_ids:
        out.append(seed_tenant_system_coa_sync_session(session, int(tid)))
    return out


async def seed_tenant_system_coa(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    """Async: seed one tenant using run_sync."""

    def _go(sess: Session) -> dict[str, Any]:
        return seed_tenant_system_coa_sync_session(sess, tenant_id)

    return await db.run_sync(_go)


async def seed_all_tenants_system_coa(db: AsyncSession) -> list[dict[str, Any]]:
    def _go(sess: Session) -> list[dict[str, Any]]:
        return seed_all_tenants_system_coa_sync_session(sess)

    return await db.run_sync(_go)


async def resolve_system_ledger(db: AsyncSession, tenant_id: int, mapping_key: str) -> int:
    """Return chart_of_accounts.id for mapping_key; raise if missing."""
    r = await db.execute(
        select(AccountingSystemMapping).where(
            AccountingSystemMapping.tenant_id == tenant_id,
            AccountingSystemMapping.mapping_key == mapping_key,
        )
    )
    m = r.scalars().first()
    if not m or not m.ledger_id:
        raise ValueError(
            f"System ledger mapping '{mapping_key}' not found for tenant {tenant_id}. Run system COA seed."
        )
    return int(m.ledger_id)

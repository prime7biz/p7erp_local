"""WIP → GL auto-posting helpers (material issue / FG completion).

Fail-closed: missing accounts, unbalanced amounts, or exceptions are logged and skipped
so inventory posting paths are never blocked by GL wiring issues.
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import is_auto_post_wip_journal_enabled
from app.models import ProductionMaterialIssue, StockMovement, Tenant, Voucher
from app.modules.finance.auto_posting_service import AutoPostingLine, create_system_voucher
from app.services.inventory_account_resolver import resolve_inventory_accounts
from app.services.inventory_gl_service import (
    post_idt_issue_gl,
    post_idt_receive_gl,
    post_process_order_issue_gl,
    post_process_order_receive_gl,
)

logger = logging.getLogger(__name__)


def _f(s: str | None) -> float:
    try:
        return float(s or "0")
    except (TypeError, ValueError):
        return 0.0


async def maybe_post_process_order_issue_wip(
    db: AsyncSession,
    tenant: Tenant,
    user_id: int | None,
    process_order_id: int,
    input_item_id: int,
    output_item_id: int,
    notes: str,
) -> None:
    """Gate existing process-order WIP issue GL behind ``auto_post_wip_journal`` (default on)."""
    if not is_auto_post_wip_journal_enabled(tenant.feature_flags):
        return
    await post_process_order_issue_gl(
        db,
        tenant.id,
        user_id,
        process_order_id,
        input_item_id,
        output_item_id,
        notes,
    )


async def maybe_post_process_order_receive_wip(
    db: AsyncSession,
    tenant: Tenant,
    user_id: int | None,
    process_order_id: int,
    output_item_id: int,
    notes: str,
) -> None:
    """Gate existing process-order FG receive GL behind ``auto_post_wip_journal`` (default on)."""
    if not is_auto_post_wip_journal_enabled(tenant.feature_flags):
        return
    await post_process_order_receive_gl(
        db,
        tenant.id,
        user_id,
        process_order_id,
        output_item_id,
        notes,
    )


async def maybe_post_production_material_issue_wip(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int | None,
    issue: ProductionMaterialIssue,
    auto_post: bool = True,
) -> int | None:
    """MVP: post aggregated Inv→WIP journal for a posted production material issue.

    Uses ``create_system_voucher`` (draft or auto-post). Fail-closed on errors via savepoint.
    Returns voucher id when created, else None.
    """
    if not is_auto_post_wip_journal_enabled(tenant.feature_flags):
        return None
    ref = f"pmi_wip:{issue.id}"
    try:
        prior = (
            await db.execute(
                select(Voucher.id).where(
                    Voucher.tenant_id == tenant.id,
                    Voucher.source_module == "WIP_GL",
                    Voucher.source_module_ref == ref,
                ).limit(1)
            )
        ).scalar_one_or_none()
        if prior is not None:
            return int(prior)

        mvs = list(
            (
                await db.execute(
                    select(StockMovement).where(
                        StockMovement.tenant_id == tenant.id,
                        StockMovement.production_material_issue_id == issue.id,
                        StockMovement.movement_type == "OUT",
                    )
                )
            )
            .scalars()
            .all()
        )
        buckets: dict[tuple[int, int], float] = {}
        for mv in mvs:
            val = _f(mv.movement_value)
            if val <= 0:
                continue
            acc = await resolve_inventory_accounts(db, tenant.id, mv.item_id)
            inv_id = acc.get("inventory")
            wip_id = acc.get("wip")
            if not inv_id or not wip_id or inv_id == wip_id:
                continue
            key = (int(wip_id), int(inv_id))
            buckets[key] = buckets.get(key, 0.0) + val

        if not buckets:
            logger.info(
                "wip_gl pmi skip reason=no_accounts_or_value tenant_id=%s issue_id=%s",
                tenant.id,
                issue.id,
            )
            return None

        lines: list[AutoPostingLine] = []
        for (wip_id, inv_id), total in buckets.items():
            amt = Decimal(str(round(total, 4)))
            if amt <= 0:
                continue
            notes = f"PMI {issue.issue_code} → WIP"
            lines.append(
                AutoPostingLine(
                    entry_type="DEBIT",
                    amount=amt,
                    account_id=wip_id,
                    notes=notes,
                )
            )
            lines.append(
                AutoPostingLine(
                    entry_type="CREDIT",
                    amount=amt,
                    account_id=inv_id,
                    notes=notes,
                )
            )
        if not lines:
            return None

        v_date = issue.issue_date or date.today()
        async with db.begin_nested():
            voucher = await create_system_voucher(
                db,
                tenant_id=tenant.id,
                user_id=user_id,
                voucher_type="JOURNAL",
                voucher_date=v_date,
                lines=lines,
                description=f"WIP material issue {issue.issue_code}",
                reference=f"PMI-WIP-{issue.id}"[:64],
                source_module="WIP_GL",
                source_module_ref=ref,
                auto_post=auto_post,
            )
            return int(voucher.id)
    except Exception:
        logger.exception(
            "wip_gl production_material_issue failed tenant_id=%s issue_id=%s",
            tenant.id,
            issue.id,
        )
        return None


async def maybe_post_idt_issue_wip(
    db: AsyncSession,
    tenant: Tenant,
    user_id: int | None,
    idt: Any,
    notes: str,
) -> int | None:
    """Fail-soft WIP GL for IDT issue. Returns None (voucher id not tracked)."""
    if not is_auto_post_wip_journal_enabled(tenant.feature_flags):
        return None
    try:
        await post_idt_issue_gl(
            db,
            tenant.id,
            user_id,
            idt.id,
            idt.source_item_id,
            idt.target_item_id,
            notes,
        )
    except Exception:
        logger.exception("wip_gl IDT issue failed tenant_id=%s idt_id=%s", tenant.id, idt.id)
    return None


async def maybe_post_idt_receive_wip(
    db: AsyncSession,
    tenant: Tenant,
    user_id: int | None,
    idt: Any,
    notes: str,
    *,
    movement_id: int | None = None,
) -> int | None:
    """Fail-soft WIP GL for one IDT receipt (``movement_id`` = that receipt's IN movement)."""
    if not is_auto_post_wip_journal_enabled(tenant.feature_flags):
        return None
    try:
        # Savepoint: a failed posting is undone without losing the stock receipt.
        async with db.begin_nested():
            await post_idt_receive_gl(
                db,
                tenant.id,
                user_id,
                idt.id,
                idt.source_item_id,
                idt.target_item_id,
                notes,
                movement_id=movement_id,
            )
    except Exception:
        logger.exception("wip_gl IDT receive failed tenant_id=%s idt_id=%s", tenant.id, idt.id)
    return None

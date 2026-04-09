"""BOM workflow transitions for order-driven BOMs."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.workflow import BOM_TRANSITIONS, validate_transition
from app.models import Bom, BomItem
from app.modules.merch.bom_line_sync import apply_calculations_to_line


async def submit_bom(db: AsyncSession, bom: Bom, user_id: int) -> None:
    bom.status = validate_transition(
        BOM_TRANSITIONS,
        bom.status,
        "SUBMITTED",
        fallback="DRAFT",
        entity_label="bom",
    )
    bom.submitted_at = datetime.utcnow()
    bom.submitted_by = user_id


async def approve_bom(db: AsyncSession, bom: Bom, user_id: int) -> None:
    bom.status = validate_transition(
        BOM_TRANSITIONS,
        bom.status,
        "APPROVED",
        fallback="DRAFT",
        entity_label="bom",
    )
    bom.approved_at = datetime.utcnow()
    bom.approved_by = user_id
    if bom.order_qty_snapshot is not None:
        bom.order_qty_at_approval = bom.order_qty_snapshot
    # Recalc lines at approval qty snapshot
    oq = bom.order_qty_at_approval or bom.order_qty_snapshot or 0
    if oq:
        res = await db.execute(select(BomItem).where(BomItem.bom_id == bom.id, BomItem.tenant_id == bom.tenant_id))
        for line in res.scalars().all():
            apply_calculations_to_line(line, int(oq))


async def reject_bom(db: AsyncSession, bom: Bom, user_id: int, comment: str) -> None:
    bom.status = validate_transition(
        BOM_TRANSITIONS,
        bom.status,
        "REJECTED",
        fallback="DRAFT",
        entity_label="bom",
    )
    bom.rejected_at = datetime.utcnow()
    bom.rejected_by = user_id
    bom.rejection_comment = (comment or "").strip() or None
    bom.submitted_at = None
    bom.submitted_by = None
    # Immediately return to DRAFT for editing (per product spec)
    bom.status = validate_transition(
        BOM_TRANSITIONS,
        "REJECTED",
        "DRAFT",
        fallback="DRAFT",
        entity_label="bom",
    )


async def freeze_bom(db: AsyncSession, bom: Bom, user_id: int) -> None:
    bom.status = validate_transition(
        BOM_TRANSITIONS,
        bom.status,
        "FROZEN",
        fallback="APPROVED",
        entity_label="bom",
    )
    bom.frozen_at = datetime.utcnow()
    bom.frozen_by = user_id

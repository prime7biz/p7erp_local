"""Guards for order execution handoffs (PO gates, CAPA block, shop-floor order_id)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import (
    is_capa_blocks_challan,
    is_sample_approval_gates_for_po,
)
from app.models import Tenant
from app.models.manufacturing import ManufacturingCapa
from app.models.merch import FollowupActionTemplate, OrderFollowupAction
from app.modules.merch.constants import TNA_PO_GATE_MILESTONES

_DONE = frozenset({"completed", "approved", "cancelled"})
_CAPA_OPEN = frozenset({"open", "in_progress"})


async def pending_po_gate_milestones(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
) -> list[str]:
    """Return titles/codes of incomplete approval milestones that gate fabric PO."""
    stmt = select(OrderFollowupAction).where(
        OrderFollowupAction.tenant_id == tenant_id,
        OrderFollowupAction.order_id == order_id,
        OrderFollowupAction.is_active.is_(True),
    )
    rows = (await db.execute(stmt)).scalars().all()
    if not rows:
        return []
    template_ids = {r.template_id for r in rows if r.template_id and not r.milestone_type}
    tmpl_code: dict[int, str] = {}
    if template_ids:
        tres = await db.execute(
            select(FollowupActionTemplate.id, FollowupActionTemplate.code).where(
                FollowupActionTemplate.tenant_id == tenant_id,
                FollowupActionTemplate.id.in_(template_ids),
            )
        )
        tmpl_code = {int(i): str(c) for i, c in tres.all()}
    gate = {c.lower() for c in TNA_PO_GATE_MILESTONES}
    pending: list[str] = []
    for row in rows:
        st = (row.status or "").lower()
        if st in _DONE:
            continue
        mt = (row.milestone_type or "").strip().lower()
        if not mt and row.template_id:
            mt = (tmpl_code.get(row.template_id) or "").strip().lower()
        if mt in gate:
            pending.append(row.title or mt)
    return pending


async def assert_sample_approvals_for_po(
    db: AsyncSession,
    *,
    tenant: Tenant,
    order_id: int | None,
) -> None:
    """Raise ValueError if sample_approval_gates_for_po is on and approvals pending."""
    if not order_id or not is_sample_approval_gates_for_po(tenant.feature_flags):
        return
    pending = await pending_po_gate_milestones(db, tenant_id=tenant.id, order_id=int(order_id))
    if pending:
        raise ValueError(
            "Sample / approval gates incomplete before PO: " + "; ".join(pending[:5])
        )


async def open_capa_count_for_order(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(ManufacturingCapa)
            .where(
                ManufacturingCapa.tenant_id == tenant_id,
                ManufacturingCapa.order_id == order_id,
                func.lower(ManufacturingCapa.status).in_(tuple(_CAPA_OPEN)),
            )
        )
        or 0
    )


async def assert_no_blocking_capa_for_orders(
    db: AsyncSession,
    *,
    tenant: Tenant,
    order_ids: list[int],
) -> None:
    """Raise HTTP-friendly ValueError when capa_blocks_challan and open CAPA exists."""
    if not order_ids or not is_capa_blocks_challan(tenant.feature_flags):
        return
    for oid in order_ids:
        n = await open_capa_count_for_order(db, tenant_id=tenant.id, order_id=int(oid))
        if n > 0:
            raise ValueError(
                f"Cannot post delivery challan: order {oid} has {n} open CAPA(s). "
                "Close CAPA or disable capa_blocks_challan."
            )

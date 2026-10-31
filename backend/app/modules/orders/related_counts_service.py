"""Order related-document counts for Order Detail navigation chips (Phase 5)."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import safe_async_session_rollback

logger = logging.getLogger(__name__)


async def build_order_related_counts(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
) -> dict[str, Any]:
    """
    Tenant-scoped counts of documents linked to an order.
    Fail-closed: returns zeros on error so GET order still succeeds.

    Uses a single round-trip of scalar subqueries where possible to cut
    sequential COUNT fan-out on order detail.
    """
    empty: dict[str, Any] = {
        "bom_exists": False,
        "po_count": 0,
        "production_plan_exists": False,
        "delivery_challan_count": 0,
        "invoice_count": 0,
        "packing_list_count": 0,
        "tna_actions_count": 0,
        "export_case_count": 0,
        "export_case_id": None,
    }
    try:
        from app.models import (
            Bom,
            CommercialInvoiceLine,
            DeliveryChallanOrder,
            ExportCase,
            ManufacturingProductionPlan,
            ManufacturingProductionPlanLine,
            OrderFollowupAction,
            PackingList,
            PurchaseOrder,
        )

        bom_exists_sq = (
            select(Bom.id)
            .where(Bom.tenant_id == tenant_id, Bom.order_id == order_id)
            .limit(1)
            .correlate(None)
            .scalar_subquery()
        )
        po_count_sq = (
            select(func.count())
            .select_from(PurchaseOrder)
            .where(
                PurchaseOrder.tenant_id == tenant_id,
                PurchaseOrder.source_order_id == order_id,
            )
            .correlate(None)
            .scalar_subquery()
        )
        plan_head_sq = (
            select(ManufacturingProductionPlan.id)
            .where(
                ManufacturingProductionPlan.tenant_id == tenant_id,
                ManufacturingProductionPlan.order_id == order_id,
            )
            .limit(1)
            .correlate(None)
            .scalar_subquery()
        )
        plan_line_sq = (
            select(ManufacturingProductionPlanLine.plan_id)
            .where(
                ManufacturingProductionPlanLine.tenant_id == tenant_id,
                ManufacturingProductionPlanLine.order_id == order_id,
            )
            .limit(1)
            .correlate(None)
            .scalar_subquery()
        )
        challan_sq = (
            select(func.count())
            .select_from(DeliveryChallanOrder)
            .where(
                DeliveryChallanOrder.tenant_id == tenant_id,
                DeliveryChallanOrder.order_id == order_id,
            )
            .correlate(None)
            .scalar_subquery()
        )
        invoice_sq = (
            select(func.count(func.distinct(CommercialInvoiceLine.commercial_invoice_id)))
            .where(
                CommercialInvoiceLine.tenant_id == tenant_id,
                CommercialInvoiceLine.order_id == order_id,
            )
            .correlate(None)
            .scalar_subquery()
        )
        packing_sq = (
            select(func.count())
            .select_from(PackingList)
            .where(
                PackingList.tenant_id == tenant_id,
                PackingList.order_id == order_id,
            )
            .correlate(None)
            .scalar_subquery()
        )
        tna_sq = (
            select(func.count())
            .select_from(OrderFollowupAction)
            .where(
                OrderFollowupAction.tenant_id == tenant_id,
                OrderFollowupAction.order_id == order_id,
            )
            .correlate(None)
            .scalar_subquery()
        )
        export_count_sq = (
            select(func.count())
            .select_from(ExportCase)
            .where(
                ExportCase.tenant_id == tenant_id,
                ExportCase.order_id == order_id,
            )
            .correlate(None)
            .scalar_subquery()
        )
        export_id_sq = (
            select(ExportCase.id)
            .where(
                ExportCase.tenant_id == tenant_id,
                ExportCase.order_id == order_id,
            )
            .order_by(ExportCase.id.desc())
            .limit(1)
            .correlate(None)
            .scalar_subquery()
        )

        row = (
            await db.execute(
                select(
                    bom_exists_sq.label("bom_id"),
                    po_count_sq.label("po_count"),
                    plan_head_sq.label("plan_head"),
                    plan_line_sq.label("plan_line"),
                    challan_sq.label("challan_count"),
                    invoice_sq.label("invoice_count"),
                    packing_sq.label("packing_count"),
                    tna_sq.label("tna_count"),
                    export_count_sq.label("export_case_count"),
                    export_id_sq.label("export_case_id"),
                )
            )
        ).one()

        return {
            "bom_exists": row.bom_id is not None,
            "po_count": int(row.po_count or 0),
            "production_plan_exists": row.plan_head is not None or row.plan_line is not None,
            "delivery_challan_count": int(row.challan_count or 0),
            "invoice_count": int(row.invoice_count or 0),
            "packing_list_count": int(row.packing_count or 0),
            "tna_actions_count": int(row.tna_count or 0),
            "export_case_count": int(row.export_case_count or 0),
            "export_case_id": int(row.export_case_id) if row.export_case_id is not None else None,
        }
    except Exception as exc:
        logger.warning("order_related_counts_failed tenant=%s order=%s err=%s", tenant_id, order_id, exc)
        await safe_async_session_rollback(db)
        return empty

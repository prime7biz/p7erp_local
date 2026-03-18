"""
DB-level verification for merchandising workflow rollout.

Run inside backend container:
  python scripts/verify_merch_workflow_db.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import and_, func, select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.common.workflow import BOM_TRANSITIONS, INQUIRY_TRANSITIONS, ORDER_TRANSITIONS, QUOTATION_TRANSITIONS
from app.database import AsyncSessionLocal
from app.models import (
    AlertInstance,
    Bom,
    ConsumptionPlan,
    GarmentStyle,
    Inquiry,
    ManufacturingTnaPlanTask,
    Order,
    OrderFollowupAction,
    Quotation,
    Tenant,
)

TENANT_CODE = os.getenv("UAT_TENANT_CODE", "LAKHSMA4821")
GOVERNED_BOM_STATUSES = {"APPROVED", "FROZEN"}
KNOWN_ALERT_SEVERITY = {"critical", "high", "medium", "low", "informational"}
OPEN_MERCH_ACTION_STATUS = {"pending", "in_progress", "open", "reopened"}
OPEN_MFG_ACTION_STATUS = {"not_started", "in_progress", "blocked"}


@dataclass
class CheckRow:
    check_id: str
    status: str
    note: str


def _row(check_id: str, ok: bool, note: str) -> CheckRow:
    return CheckRow(check_id, "Pass" if ok else "Fail", note)


async def _count_invalid_statuses(db, model, tenant_id: int, allowed: set[str]) -> int:
    rows = (
        await db.execute(select(model.status).where(model.tenant_id == tenant_id))
    ).scalars().all()
    return sum(1 for value in rows if (value or "").upper() not in allowed)


async def main() -> None:
    results: list[CheckRow] = []

    async with AsyncSessionLocal() as db:
        tenant = (
            await db.execute(select(Tenant).where(Tenant.company_code == TENANT_CODE))
        ).scalar_one_or_none()
        if not tenant:
            raise RuntimeError(f"Tenant not found for company_code={TENANT_CODE}")

        inquiry_statuses = set(INQUIRY_TRANSITIONS.keys())
        quotation_statuses = set(QUOTATION_TRANSITIONS.keys())
        order_statuses = set(ORDER_TRANSITIONS.keys())
        bom_statuses = set(BOM_TRANSITIONS.keys())

        invalid_inquiry = await _count_invalid_statuses(db, Inquiry, tenant.id, inquiry_statuses)
        invalid_quotation = await _count_invalid_statuses(db, Quotation, tenant.id, quotation_statuses)
        invalid_order = await _count_invalid_statuses(db, Order, tenant.id, order_statuses)
        invalid_bom = await _count_invalid_statuses(db, Bom, tenant.id, bom_statuses)
        results.append(_row("MWDB-001", invalid_inquiry == 0, f"invalid inquiry status rows={invalid_inquiry}"))
        results.append(_row("MWDB-002", invalid_quotation == 0, f"invalid quotation status rows={invalid_quotation}"))
        results.append(_row("MWDB-003", invalid_order == 0, f"invalid order status rows={invalid_order}"))
        results.append(_row("MWDB-004", invalid_bom == 0, f"invalid BOM status rows={invalid_bom}"))

        converted_quotes_missing_inquiry = (
            await db.execute(
                select(func.count())
                .select_from(Quotation)
                .where(
                    Quotation.tenant_id == tenant.id,
                    Quotation.status == "CONVERTED",
                    Quotation.inquiry_id.is_(None),
                )
            )
        ).scalar() or 0
        results.append(
            _row(
                "MWDB-005",
                converted_quotes_missing_inquiry == 0,
                f"converted quotations without inquiry link={converted_quotes_missing_inquiry}",
            )
        )

        linked_orders_missing_quote = (
            await db.execute(
                select(func.count())
                .select_from(Order)
                .where(
                    Order.tenant_id == tenant.id,
                    Order.quotation_id.is_(None),
                    Order.status.in_(["NEW", "IN_PROGRESS", "COMPLETED"]),
                )
            )
        ).scalar() or 0
        results.append(
            _row(
                "MWDB-006",
                linked_orders_missing_quote == 0,
                f"committed orders without quotation link={linked_orders_missing_quote}",
            )
        )

        committed_orders = (
            await db.execute(
                select(Order.id).where(
                    Order.tenant_id == tenant.id,
                    Order.status.in_(["NEW", "IN_PROGRESS"]),
                )
            )
        ).scalars().all()
        if committed_orders:
            followup_counts = (
                await db.execute(
                    select(
                        OrderFollowupAction.order_id,
                        func.count(OrderFollowupAction.id),
                    )
                    .where(
                        OrderFollowupAction.tenant_id == tenant.id,
                        OrderFollowupAction.order_id.in_(committed_orders),
                    )
                    .group_by(OrderFollowupAction.order_id)
                )
            ).all()
            count_map = {order_id: count for order_id, count in followup_counts}
            missing = [oid for oid in committed_orders if count_map.get(oid, 0) == 0]
            results.append(_row("MWDB-007", len(missing) == 0, f"committed orders missing followups={len(missing)}"))
        else:
            results.append(CheckRow("MWDB-007", "Skip", "No NEW/IN_PROGRESS orders found"))

        plans = (
            await db.execute(
                select(ConsumptionPlan.id, ConsumptionPlan.order_id)
                .where(ConsumptionPlan.tenant_id == tenant.id)
            )
        ).all()
        plan_without_governed_bom = 0
        for _, order_id in plans:
            order = await db.get(Order, order_id)
            if not order or order.tenant_id != tenant.id or not order.quotation_id:
                plan_without_governed_bom += 1
                continue
            quotation = await db.get(Quotation, order.quotation_id)
            if not quotation or quotation.tenant_id != tenant.id or not quotation.style_id:
                plan_without_governed_bom += 1
                continue
            governed_count = (
                await db.execute(
                    select(func.count())
                    .select_from(Bom)
                    .where(
                        Bom.tenant_id == tenant.id,
                        Bom.style_id == quotation.style_id,
                        Bom.status.in_(GOVERNED_BOM_STATUSES),
                    )
                )
            ).scalar() or 0
            if governed_count <= 0:
                plan_without_governed_bom += 1
        results.append(
            _row(
                "MWDB-008",
                plan_without_governed_bom == 0,
                f"consumption plans without governed BOM support={plan_without_governed_bom}",
            )
        )

        unknown_alert_severity = (
            await db.execute(
                select(func.count())
                .select_from(AlertInstance)
                .where(
                    AlertInstance.tenant_id == tenant.id,
                    and_(
                        AlertInstance.severity.is_not(None),
                        func.lower(AlertInstance.severity).not_in(KNOWN_ALERT_SEVERITY),
                    ),
                )
            )
        ).scalar() or 0
        results.append(_row("MWDB-009", unknown_alert_severity == 0, f"alerts with unknown severity={unknown_alert_severity}"))

        open_merch = (
            await db.execute(
                select(func.count())
                .select_from(OrderFollowupAction)
                .where(
                    OrderFollowupAction.tenant_id == tenant.id,
                    func.lower(OrderFollowupAction.status).in_(OPEN_MERCH_ACTION_STATUS),
                )
            )
        ).scalar() or 0
        open_mfg = (
            await db.execute(
                select(func.count())
                .select_from(ManufacturingTnaPlanTask)
                .where(
                    ManufacturingTnaPlanTask.tenant_id == tenant.id,
                    func.lower(ManufacturingTnaPlanTask.status).in_(OPEN_MFG_ACTION_STATUS),
                )
            )
        ).scalar() or 0
        results.append(
            CheckRow(
                "MWDB-010",
                "Pass",
                f"open unified-TNA readiness: merch_open={open_merch}, manufacturing_open={open_mfg}",
            )
        )

        style_count = (
            await db.execute(
                select(func.count())
                .select_from(GarmentStyle)
                .where(GarmentStyle.tenant_id == tenant.id)
            )
        ).scalar() or 0
        governed_bom_count = (
            await db.execute(
                select(func.count())
                .select_from(Bom)
                .where(
                    Bom.tenant_id == tenant.id,
                    Bom.status.in_(GOVERNED_BOM_STATUSES),
                )
            )
        ).scalar() or 0
        results.append(
            CheckRow(
                "MWDB-011",
                "Pass",
                f"coverage: styles={style_count}, governed_boms={governed_bom_count}",
            )
        )

        print("Merch workflow DB verification")
        print(f"Tenant: {tenant.id} ({tenant.company_code})")
        for row in results:
            print(f"- {row.check_id}: {row.status} | {row.note}")


if __name__ == "__main__":
    asyncio.run(main())

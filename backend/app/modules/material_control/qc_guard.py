"""Phase 3: QC hold blocks material issue + draft debit-note stub from GRN reject.

Call sites (parent / inventory PMI should wire when ready — do not edit inventory/router.py here):

- Before PMI issue line stock OUT: ``await assert_item_not_on_qc_hold(db, tenant_id, item_id, warehouse_id)``
- After GRN QC FAIL/PARTIAL with rejected qty: ``await draft_dn_from_grn_reject(...)`` when
  ``material_inbound_v2`` or ``material_control_hub_v1`` is on.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import (
    is_material_control_hub_v1_enabled,
    is_material_inbound_v2_enabled,
)
from app.database import safe_async_session_rollback
from app.models.costing import Item
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, GrnQualityInspection, Warehouse
from app.models.tenant import Tenant


async def assert_item_not_on_qc_hold(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    warehouse_id: int | None,
) -> None:
    """Raise 409 when warehouse is quarantine/rejected or item has open QC HOLD/PENDING.

    Inventory PMI / issue paths should call this before creating OUT movements.
    """
    await ensure_owned(db, Item, item_id, tenant_id, "Item", status_code=404)
    if warehouse_id is not None:
        wh = await ensure_owned(db, Warehouse, warehouse_id, tenant_id, "Warehouse", status_code=404)
        assert wh is not None
        if bool(getattr(wh, "is_quarantine", False)) or bool(getattr(wh, "is_rejected", False)):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot issue from quarantine or rejected warehouse (QC hold)",
            )

    from app.models.inventory import GoodsReceivingItem

    linked = (
        await db.execute(
            select(GrnQualityInspection.id)
            .join(GoodsReceivingItem, GoodsReceivingItem.id == GrnQualityInspection.grn_item_id)
            .where(
                GrnQualityInspection.tenant_id == tenant_id,
                GoodsReceivingItem.tenant_id == tenant_id,
                GoodsReceivingItem.item_id == item_id,
                GrnQualityInspection.status == "PENDING",
                (GrnQualityInspection.hold_qty > 0) | (GrnQualityInspection.result == "HOLD"),
            )
            .limit(1)
        )
    ).first()
    if linked is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Item is on QC hold; issue blocked until inspection clears",
        )


def _phase3_flag_on(tenant: Tenant) -> bool:
    flags = tenant.feature_flags
    return is_material_inbound_v2_enabled(flags) or is_material_control_hub_v1_enabled(flags)


async def draft_dn_from_grn_reject(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int | None,
    grn_id: int,
    grn_item_id: int | None = None,
    rejected_qty: Decimal | float | str | int | None = None,
    amount: Decimal | float | str | int | None = None,
    party_ledger_id: int | None = None,
    original_bill_id: int | None = None,
    revenue_or_purchase_account_id: int | None = None,
    voucher_date: date | None = None,
    user: Any | None = None,
) -> dict[str, Any]:
    """Build a draft debit-note stub; optionally create a DN via ``create_note_voucher``.

    When party/bill/account ids are missing, returns a payload stub only (no voucher).
    Creating a real DN requires finance.access + debit-note gates (MC-SEC-01).
    Behind ``material_inbound_v2`` or ``material_control_hub_v1``.
    """
    if not _phase3_flag_on(tenant):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    # Client-supplied GRN ids must belong to this tenant, and the GRN line must belong to that GRN.
    await ensure_owned(db, GoodsReceiving, grn_id, tenant.id, "GRN", status_code=404)
    if grn_item_id is not None:
        grn_line = await ensure_owned(db, GoodsReceivingItem, grn_item_id, tenant.id, "GRN line", status_code=404)
        if grn_line is not None and grn_line.goods_receiving_id != grn_id:
            raise HTTPException(status_code=400, detail="GRN line does not belong to this GRN")

    qty = Decimal(str(rejected_qty or 0))
    amt = Decimal(str(amount or 0))
    stub: dict[str, Any] = {
        "kind": "DEBIT_NOTE",
        "status": "DRAFT_STUB",
        "grn_id": grn_id,
        "grn_item_id": grn_item_id,
        "rejected_qty": str(qty),
        "amount": str(amt),
        "voucher_id": None,
        "note": "Draft debit note from GRN reject (QC). Complete party/bill accounts to post.",
    }

    if not all([party_ledger_id, original_bill_id, revenue_or_purchase_account_id]) or amt <= 0:
        return stub

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires finance.access to create debit notes",
        )

    try:
        from app.modules.finance.advanced_voucher_service import create_note_voucher
        from app.modules.material_control.debit_note_gate import assert_can_create_debit_note

        await assert_can_create_debit_note(db, user, tenant)
        voucher = await create_note_voucher(
            db,
            tenant.id,
            note_kind="DEBIT_NOTE",
            voucher_date=voucher_date or date.today(),
            description=f"Draft DN from GRN {grn_id} reject",
            party_ledger_id=int(party_ledger_id),
            original_bill_id=int(original_bill_id),
            amount=amt,
            revenue_or_purchase_account_id=int(revenue_or_purchase_account_id),
            created_by=user_id,
        )
        stub["status"] = "DRAFT"
        stub["voucher_id"] = voucher.id
        stub["voucher_number"] = getattr(voucher, "voucher_number", None)
        await db.flush()
        return stub
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise

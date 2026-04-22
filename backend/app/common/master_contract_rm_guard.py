"""Enforce master contract on RM-linked procurement when tenant flag is on."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import REQUIRE_MASTER_CONTRACT_FOR_RM
from app.models import BtbLc, Order, Tenant


def require_master_contract_for_rm_enabled(tenant: Tenant) -> bool:
    raw = tenant.feature_flags
    if not isinstance(raw, dict):
        return False
    return bool(raw.get(REQUIRE_MASTER_CONTRACT_FOR_RM))


async def assert_orders_have_master_contract(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_ids: set[int],
) -> None:
    """Raise 409 if any order in set lacks master_contract_id."""
    if not order_ids:
        return
    r = await db.execute(
        select(Order.id, Order.order_code, Order.master_contract_id).where(
            Order.tenant_id == tenant_id,
            Order.id.in_(order_ids),
        )
    )
    for oid, code, mc_id in r.all():
        if mc_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "ORDER_REQUIRES_MASTER_CONTRACT",
                    "message": "Link this order to a master contract before raw-material procurement.",
                    "order_id": oid,
                    "order_code": code,
                },
            )


async def assert_btb_has_master_if_flag(
    db: AsyncSession,
    *,
    tenant: Tenant,
    btb_lc_id: int | None,
) -> None:
    """When flag is on, BTB LC used for procurement must reference a master contract."""
    if not btb_lc_id or not require_master_contract_for_rm_enabled(tenant):
        return
    b = await db.get(BtbLc, int(btb_lc_id))
    if not b or b.tenant_id != tenant.id:
        return
    if b.master_contract_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "BTB_REQUIRES_MASTER_CONTRACT",
                "message": "Link this back-to-back LC to a master export contract before procurement.",
                "btb_lc_id": b.id,
            },
        )

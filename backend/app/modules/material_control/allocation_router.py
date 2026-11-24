"""Material Control phases 2B–6 write APIs (flag-gated per endpoint)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import require_internal_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.material_control_alloc import (
    JobWorkBondTransfer,
    MaterialLandedCostDoc,
    MaterialLayerAllocation,
    MaterialLeftoverReturn,
    MaterialRoll,
    MaterialRtvDocument,
    PrincipalMaterialClaim,
)
from app.modules.material_control import allocation_service, bond_transfer_service
from app.modules.material_control import leftover_return_service, principal_claim_service
from app.modules.material_control import landed_cost_service, roll_service
from app.modules.material_control import qc_guard, rtv_service, ud_event_service

router = APIRouter(
    prefix="/material-control",
    tags=["material-control-ops"],
    dependencies=[Depends(require_internal_permission("inventory.access"))],
)


def _ensure_tenant_user(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


# ----- schemas -----


class AllocateBody(BaseModel):
    cost_layer_id: int
    qty: str
    order_id: int | None = None
    style_id: int | None = None
    colorway_id: int | None = None
    request_id: str | None = Field(default=None, max_length=64)


class UdEventBody(BaseModel):
    source_document_type: str
    source_document_id: int
    event_kind: str
    qty_normalized: str
    source_line_id: int | None = None
    source_stage_key: str = ""
    ud_entitlement_id: int | None = None
    master_contract_id: int | None = None
    btb_lc_id: int | None = None
    purchase_order_id: int | None = None
    style_id: int | None = None
    colorway_id: int | None = None
    order_id: int | None = None
    factor_snapshot: str | None = None
    reversal_of_event_id: int | None = None


class LeftoverBody(BaseModel):
    item_id: int
    warehouse_id: int
    qty: str
    order_id: int | None = None
    style_id: int | None = None
    cost_layer_id: int | None = None
    unit_cost: str | None = None
    request_id: str | None = Field(default=None, max_length=64)
    notes: str | None = None


class DraftDnBody(BaseModel):
    grn_id: int
    grn_item_id: int | None = None
    rejected_qty: str | None = None
    amount: str | None = None
    party_ledger_id: int | None = None
    original_bill_id: int | None = None
    revenue_or_purchase_account_id: int | None = None


class BondLineBody(BaseModel):
    material_id: int
    qty: str
    notes: str | None = None


class BondTransferBody(BaseModel):
    contract_id: int
    lines: list[BondLineBody]
    request_id: str | None = Field(default=None, max_length=64)
    notes: str | None = None


class ClaimBody(BaseModel):
    customer_id: int
    amount: str
    contract_id: int | None = None
    currency: str = "BDT"
    notes: str | None = None
    request_id: str | None = Field(default=None, max_length=64)


class ClaimSettleBody(BaseModel):
    amount: str
    notes: str | None = None


class RtvLineBody(BaseModel):
    item_id: int
    qty: str
    unit_cost: str | None = "0"
    notes: str | None = None


class RtvBody(BaseModel):
    vendor_id: int
    warehouse_id: int
    lines: list[RtvLineBody]
    request_id: str | None = Field(default=None, max_length=64)
    notes: str | None = None
    party_ledger_id: int | None = None
    original_bill_id: int | None = None
    revenue_or_purchase_account_id: int | None = None
    note_amount: str | None = None


class QcHoldCheckBody(BaseModel):
    item_id: int
    warehouse_id: int | None = None


class RollCreateBody(BaseModel):
    item_id: int
    warehouse_id: int
    qty: str
    shade_band: str | None = None
    width_cm: str | None = None
    lot_number: str | None = None
    grn_item_id: int | None = None
    cost_layer_id: int | None = None
    style_id: int | None = None
    colorway_id: int | None = None
    notes: str | None = None
    request_id: str | None = Field(default=None, max_length=64)


class ShadeAssertBody(BaseModel):
    item_id: int
    warehouse_id: int
    required_shade_band: str
    qty_needed: str | None = None


class LandedCostLineBody(BaseModel):
    cost_kind: str = "FREIGHT"
    amount: str
    notes: str | None = None


class LandedCostAllocateBody(BaseModel):
    """Ledger credited for the freight/duty (e.g. freight payable / accrued expenses)."""

    credit_account_id: int


class LandedCostCreateBody(BaseModel):
    goods_receiving_id: int
    lines: list[LandedCostLineBody]
    currency: str = "BDT"
    notes: str | None = None
    request_id: str | None = Field(default=None, max_length=64)


# ----- Phase 2B -----


@router.post("/allocations")
async def post_allocation(
    body: AllocateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    row = await allocation_service.allocate_layer(
        db,
        tenant=tenant,
        user_id=user.id,
        cost_layer_id=body.cost_layer_id,
        qty=body.qty,
        order_id=body.order_id,
        style_id=body.style_id,
        colorway_id=body.colorway_id,
        request_id=body.request_id,
    )
    await db.commit()
    return allocation_service.allocation_to_dict(row)


@router.post("/allocations/{allocation_id}/release")
async def post_release_allocation(
    allocation_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    row = await allocation_service.release_allocation(db, tenant=tenant, allocation_id=allocation_id)
    await db.commit()
    return allocation_service.allocation_to_dict(row)


@router.get("/allocations/{allocation_id}")
async def get_allocation(
    allocation_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    allocation_service.require_alloc_ud_flag(tenant)
    row = (
        await db.execute(
            select(MaterialLayerAllocation).where(
                MaterialLayerAllocation.id == allocation_id,
                MaterialLayerAllocation.tenant_id == tenant.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Allocation not found")
    return allocation_service.allocation_to_dict(row)


@router.post("/ud-events")
async def post_ud_event(
    body: UdEventBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    row = await ud_event_service.record_event(
        db,
        tenant=tenant,
        user_id=user.id,
        **body.model_dump(),
    )
    await db.commit()
    return ud_event_service.event_to_dict(row)


# ----- Phase 3 -----


@router.post("/qc-hold-check")
async def post_qc_hold_check(
    body: QcHoldCheckBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Thin wrapper so tests can exercise ``assert_item_not_on_qc_hold`` without inventory/router edits."""
    _ensure_tenant_user(user, tenant)
    from app.common.tenant_feature_keys import (
        is_material_control_hub_v1_enabled,
        is_material_inbound_v2_enabled,
    )

    if not (
        is_material_inbound_v2_enabled(tenant.feature_flags)
        or is_material_control_hub_v1_enabled(tenant.feature_flags)
    ):
        raise HTTPException(status_code=404, detail="Not found")
    await qc_guard.assert_item_not_on_qc_hold(db, tenant.id, body.item_id, body.warehouse_id)
    return {"ok": True}


@router.post("/draft-dn-from-grn-reject")
async def post_draft_dn(
    body: DraftDnBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    result = await qc_guard.draft_dn_from_grn_reject(
        db,
        tenant=tenant,
        user_id=user.id,
        user=user,
        **body.model_dump(),
    )
    await db.commit()
    return result


# ----- Phase 4 -----


@router.post("/leftover-returns")
async def post_leftover_return(
    body: LeftoverBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    row = await leftover_return_service.return_leftover_to_store(
        db,
        tenant=tenant,
        user_id=user.id,
        **body.model_dump(),
    )
    await db.commit()
    return leftover_return_service.leftover_to_dict(row)


@router.get("/leftover-returns/{return_id}")
async def get_leftover_return(
    return_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    leftover_return_service.require_conversion_flag(tenant)
    row = (
        await db.execute(
            select(MaterialLeftoverReturn).where(
                MaterialLeftoverReturn.id == return_id,
                MaterialLeftoverReturn.tenant_id == tenant.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Leftover return not found")
    return leftover_return_service.leftover_to_dict(row)


# ----- Phase 5 -----


@router.post("/bond-transfers")
async def post_bond_transfer(
    body: BondTransferBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    row = await bond_transfer_service.create_bond_transfer(
        db,
        tenant=tenant,
        user_id=user.id,
        contract_id=body.contract_id,
        lines=[ln.model_dump() for ln in body.lines],
        request_id=body.request_id,
        notes=body.notes,
    )
    await db.commit()
    return bond_transfer_service.bond_to_dict(row)


@router.get("/bond-transfers/{transfer_id}")
async def get_bond_transfer(
    transfer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    bond_transfer_service.require_bond_flags(tenant)
    row = (
        await db.execute(
            select(JobWorkBondTransfer).where(
                JobWorkBondTransfer.id == transfer_id,
                JobWorkBondTransfer.tenant_id == tenant.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Bond transfer not found")
    return bond_transfer_service.bond_to_dict(row)


@router.post("/principal-claims")
async def post_principal_claim(
    body: ClaimBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    row = await principal_claim_service.open_claim(
        db,
        tenant=tenant,
        user_id=user.id,
        **body.model_dump(),
    )
    await db.commit()
    return principal_claim_service.claim_to_dict(row)


@router.post("/principal-claims/{claim_id}/settle")
async def post_settle_claim(
    claim_id: int,
    body: ClaimSettleBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    event = await principal_claim_service.settle_claim(
        db,
        tenant=tenant,
        user_id=user.id,
        claim_id=claim_id,
        amount=body.amount,
        notes=body.notes,
    )
    await db.commit()
    return {"id": event.id, "claim_id": event.claim_id, "amount": event.amount, "event_kind": event.event_kind}


@router.get("/principal-claims/{claim_id}")
async def get_principal_claim(
    claim_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    principal_claim_service.require_physical_flag(tenant)
    row = (
        await db.execute(
            select(PrincipalMaterialClaim).where(
                PrincipalMaterialClaim.id == claim_id,
                PrincipalMaterialClaim.tenant_id == tenant.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    return principal_claim_service.claim_to_dict(row)


# ----- Phase 6 -----


@router.post("/rtv")
async def post_rtv(
    body: RtvBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    data: dict[str, Any] = body.model_dump()
    lines = data.pop("lines")
    row = await rtv_service.create_and_post_rtv(
        db,
        tenant=tenant,
        user=user,
        lines=lines,
        **data,
    )
    await db.commit()
    return rtv_service.rtv_to_dict(row)


@router.get("/rtv/{rtv_id}")
async def get_rtv(
    rtv_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    rtv_service.require_returns_flag(tenant)
    row = (
        await db.execute(
            select(MaterialRtvDocument).where(
                MaterialRtvDocument.id == rtv_id,
                MaterialRtvDocument.tenant_id == tenant.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="RTV not found")
    return rtv_service.rtv_to_dict(row)


# ----- Phase 7 lite: rolls / shade + landed cost -----


@router.post("/rolls")
async def post_roll(
    body: RollCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    row = await roll_service.create_roll(
        db,
        tenant=tenant,
        user_id=user.id,
        **body.model_dump(),
    )
    await db.commit()
    return roll_service.roll_to_dict(row)


@router.get("/rolls")
async def get_rolls(
    item_id: int | None = None,
    warehouse_id: int | None = None,
    shade_band: str | None = None,
    available_only: bool = True,
    limit: int = 100,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    rows = await roll_service.list_rolls(
        db,
        tenant=tenant,
        item_id=item_id,
        warehouse_id=warehouse_id,
        shade_band=shade_band,
        available_only=available_only,
        limit=limit,
    )
    return {"items": [roll_service.roll_to_dict(r) for r in rows]}


@router.get("/rolls/{roll_id}")
async def get_roll(
    roll_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    roll_service.require_budget_plan_flag(tenant)
    row = (
        await db.execute(
            select(MaterialRoll).where(MaterialRoll.id == roll_id, MaterialRoll.tenant_id == tenant.id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Roll not found")
    return roll_service.roll_to_dict(row)


@router.post("/rolls/assert-shade")
async def post_assert_shade(
    body: ShadeAssertBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    await roll_service.assert_shade_compatible(
        db,
        tenant=tenant,
        item_id=body.item_id,
        warehouse_id=body.warehouse_id,
        required_shade_band=body.required_shade_band,
        qty_needed=body.qty_needed,
    )
    return {"ok": True}


@router.post("/landed-costs")
async def post_landed_cost(
    body: LandedCostCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    data = body.model_dump()
    lines = data.pop("lines")
    row = await landed_cost_service.create_landed_cost_doc(
        db,
        tenant=tenant,
        user_id=user.id,
        lines=lines,
        **data,
    )
    await db.commit()
    return landed_cost_service.landed_doc_to_dict(row)


@router.post("/landed-costs/{doc_id}/allocate")
async def post_allocate_landed_cost(
    doc_id: int,
    body: LandedCostAllocateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    row = await landed_cost_service.allocate_landed_cost(
        db,
        tenant=tenant,
        doc_id=doc_id,
        user=user,
        credit_account_id=body.credit_account_id,
    )
    await db.commit()
    return landed_cost_service.landed_doc_to_dict(row)


@router.get("/landed-costs/{doc_id}")
async def get_landed_cost(
    doc_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    landed_cost_service.require_landed_cost_flag(tenant)
    row = (
        await db.execute(
            select(MaterialLandedCostDoc).where(
                MaterialLandedCostDoc.id == doc_id,
                MaterialLandedCostDoc.tenant_id == tenant.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Landed cost doc not found")
    return landed_cost_service.landed_doc_to_dict(row)

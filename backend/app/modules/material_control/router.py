"""Material Control Phase 1 API: GET only, tenant scoped, behind ``material_control_hub_v1``."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.permissions import require_internal_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.material_control.action_queue_service import build_action_queue
from app.modules.material_control.flags import require_material_control_hub
from app.modules.material_control.genealogy_service import build_genealogy
from app.modules.material_control import schemas
from app.modules.material_control.style_control_service import (
    build_style_control_sheet,
    list_styles_with_orders,
)

router = APIRouter(
    prefix="/material-control",
    tags=["material-control"],
    dependencies=[Depends(require_internal_permission("inventory.access"))],
)


def _ensure_tenant_user(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/actions", response_model=schemas.ActionQueueResponse)
async def get_action_queue(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_material_control_hub(tenant)
    return await build_action_queue(db, tenant_id=tenant.id, as_of=today_local(tenant))


@router.get("/styles", response_model=schemas.StyleListResponse)
async def list_control_styles(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_material_control_hub(tenant)
    return await list_styles_with_orders(db, tenant_id=tenant.id, limit=limit, offset=offset)


@router.get("/styles/{style_id}/control-sheet", response_model=schemas.StyleControlSheetResponse)
async def get_style_control_sheet(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_material_control_hub(tenant)
    sheet = await build_style_control_sheet(db, tenant_id=tenant.id, style_id=style_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail="Style not found")
    return sheet


@router.get("/genealogy", response_model=schemas.GenealogyResponse)
async def get_genealogy(
    lot_number: str = Query(..., min_length=1, max_length=64),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_material_control_hub(tenant)
    return await build_genealogy(db, tenant_id=tenant.id, lot_number=lot_number)


@router.post("/buy-preview")
async def buy_preview(
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 2A: Reuse-Before-Buy matches + BTB soft warnings (no writes)."""
    from app.common.tenant_feature_keys import is_material_inbound_v2_enabled
    from app.modules.material_control.buy_warn_service import build_btb_warn, build_reuse_before_buy

    _ensure_tenant_user(user, tenant)
    if not is_material_inbound_v2_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    item_ids = [int(x) for x in (body.get("item_ids") or []) if x is not None]
    reuse = await build_reuse_before_buy(db, tenant_id=tenant.id, item_ids=item_ids)
    warns = await build_btb_warn(
        db,
        tenant=tenant,
        btb_lc_id=body.get("btb_lc_id"),
        source_order_id=body.get("source_order_id"),
    )
    return {"reuse_before_buy": reuse, "warnings": warns}


@router.get("/watchlist")
async def get_leak_watchlist(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 7: five-leak cost-saving watchlist (flag ``material_budget_plan_v1``)."""
    from app.common.tenant_feature_keys import is_material_budget_plan_v1_enabled
    from app.modules.material_control.budget_watchlist_service import build_leak_watchlist

    _ensure_tenant_user(user, tenant)
    if not is_material_budget_plan_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return await build_leak_watchlist(db, tenant_id=tenant.id, as_of=today_local(tenant))


@router.get("/supplier-scorecard")
async def get_supplier_scorecard(
    limit: int = Query(50, ge=1, le=100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 3 lite: vendor QC pass/reject rates (hub or inbound flag)."""
    from app.common.tenant_feature_keys import (
        is_material_control_hub_v1_enabled,
        is_material_inbound_v2_enabled,
    )
    from app.modules.material_control.supplier_scorecard_service import build_supplier_scorecard

    _ensure_tenant_user(user, tenant)
    if not (
        is_material_control_hub_v1_enabled(tenant.feature_flags)
        or is_material_inbound_v2_enabled(tenant.feature_flags)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return await build_supplier_scorecard(db, tenant_id=tenant.id, limit=limit)


@router.get("/three-way-match")
async def get_three_way_match_exceptions(
    limit: int = Query(50, ge=1, le=100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft PO↔GRN↔VendorBill exceptions (warn-only). Hub or inbound flag."""
    from app.common.tenant_feature_keys import (
        is_material_control_hub_v1_enabled,
        is_material_inbound_v2_enabled,
    )
    from app.modules.material_control.three_way_match_service import list_three_way_exceptions

    _ensure_tenant_user(user, tenant)
    if not (
        is_material_control_hub_v1_enabled(tenant.feature_flags)
        or is_material_inbound_v2_enabled(tenant.feature_flags)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return await list_three_way_exceptions(db, tenant_id=tenant.id, limit=limit)


@router.get("/three-way-match/{grn_id}")
async def get_three_way_match_for_grn(
    grn_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft 3-way detail for one GRN (warn-only; never blocks)."""
    from app.common.tenant_feature_keys import (
        is_material_control_hub_v1_enabled,
        is_material_inbound_v2_enabled,
    )
    from app.modules.material_control.three_way_match_service import build_three_way_for_grn

    _ensure_tenant_user(user, tenant)
    if not (
        is_material_control_hub_v1_enabled(tenant.feature_flags)
        or is_material_inbound_v2_enabled(tenant.feature_flags)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return await build_three_way_for_grn(db, tenant_id=tenant.id, grn_id=grn_id)

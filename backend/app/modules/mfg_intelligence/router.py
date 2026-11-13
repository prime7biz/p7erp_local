"""Manufacturing Intelligence Phase 1 API: GET only, read-only, tenant scoped, behind a strict tenant flag.

Every endpoint:
1. needs the permission `production.planning.read` (router-level dependency)
2. needs the signed-in user to belong to the resolved tenant (403 "Tenant mismatch")
3. returns 404 "Not found" unless the tenant flag `manufacturing_intelligence_v1` is exactly true
4. never writes to the database
"""
from __future__ import annotations

import logging
import time
from typing import Any
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.permissions import (
    get_user_role_for_tenant,
    internal_permission_granted,
    require_internal_permission,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import RBAC_MODE_ENFORCE, get_tenant_rbac_mode
from app.database import get_db
from app.models import Order, Tenant, User
from app.modules.mfg_intelligence import schemas
from app.modules.mfg_intelligence.calendar_helpers import MAX_WINDOW_DAYS
from app.modules.mfg_intelligence.capacity_service import capacity_payload, compute_capacity
from app.modules.mfg_intelligence.delivery_service import predict_deliveries
from app.modules.mfg_intelligence.flags import (
    allocation_v1_on,
    integrated_planning_on,
    order_bom_readiness_v2_on,
    planning_math_v2_on,
    require_mfg_intelligence_enabled,
)
from app.modules.mfg_intelligence.line_loading_service import line_loading_payload
from app.modules.mfg_intelligence.readiness_service import build_order_readiness
from app.modules.mfg_intelligence.summary_service import build_summary

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/mfg-intelligence",
    tags=["mfg-intelligence"],
    dependencies=[Depends(require_internal_permission("production.planning.read"))],
)


def _ensure_tenant_user(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _validate_window(date_from: date, date_to: date) -> None:
    if date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to must be on or after date_from")
    if (date_to - date_from).days + 1 > MAX_WINDOW_DAYS:
        raise HTTPException(status_code=422, detail=f"Date range must not exceed {MAX_WINDOW_DAYS} days")


def _log(endpoint: str, tenant_id: int, started: float, **counts: int) -> None:
    logger.info(
        "mfg_intelligence endpoint=%s tenant_id=%s duration_ms=%d %s",
        endpoint,
        tenant_id,
        int((time.perf_counter() - started) * 1000),
        " ".join(f"{k}={v}" for k, v in counts.items()),
    )


_INVENTORY_READ_KEYS = ("inventory.access", "inventory.items.read")


async def _may_see_material_detail(db: AsyncSession, user: User, tenant: Tenant) -> bool:
    """Per-item stock levels need inventory read access when RBAC is enforced."""
    if get_tenant_rbac_mode(tenant.feature_flags) != RBAC_MODE_ENFORCE:
        return True
    role = await get_user_role_for_tenant(db, user, tenant.id)
    return any(internal_permission_granted(role=role, permission_key=k) for k in _INVENTORY_READ_KEYS)


def _legacy_material_block(legacy: Any) -> dict | None:
    chain = legacy.get("chain") if isinstance(legacy, dict) else None
    block = chain.get("material_readiness") if isinstance(chain, dict) else None
    return block if isinstance(block, dict) else None


def _legacy_has_material_detail(legacy: Any) -> bool:
    block = _legacy_material_block(legacy)
    has_chain_items = bool(block and isinstance(block.get("items"), list) and block["items"])
    has_lines = isinstance(legacy, dict) and isinstance(legacy.get("lines"), list) and bool(legacy["lines"])
    return has_chain_items or has_lines


def _blank_legacy_material_detail(legacy: Any) -> None:
    """Legacy mode carries the same per-item stock rows in `chain.material_readiness.items` and `lines`."""
    block = _legacy_material_block(legacy)
    if block is not None and isinstance(block.get("items"), list):
        block["items"] = []
    if isinstance(legacy, dict) and isinstance(legacy.get("lines"), list):
        legacy["lines"] = []


async def _get_order(db: AsyncSession, tenant_id: int, order_id: int) -> Order:
    order = (
        await db.execute(select(Order).where(Order.tenant_id == tenant_id, Order.id == order_id))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.get("/summary", response_model=schemas.SummaryOut)
async def mfg_summary(
    date_from: date = Query(..., description="Inclusive window start"),
    date_to: date = Query(..., description="Inclusive window end (max 180 days)"),
    factory_unit: str | None = Query(None, max_length=64),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_mfg_intelligence_enabled(tenant)
    _validate_window(date_from, date_to)
    started = time.perf_counter()
    payload = await build_summary(
        db,
        tenant.id,
        window_start=date_from,
        window_end=date_to,
        factory_unit=factory_unit,
        today=today_local(tenant),
        planning_math_v2=planning_math_v2_on(tenant),
        order_bom_v2=order_bom_readiness_v2_on(tenant),
        include_tentative=integrated_planning_on(tenant),
        integrated_planning=integrated_planning_on(tenant),
    )
    _log("summary", tenant.id, started, lines=payload["capacity"]["line_count"], orders=payload["orders"]["evaluated"])
    return payload


@router.get("/capacity", response_model=schemas.CapacityOut)
async def mfg_capacity(
    date_from: date = Query(...),
    date_to: date = Query(...),
    factory_unit: str | None = Query(None, max_length=64),
    line_id: int | None = Query(None, ge=1),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_mfg_intelligence_enabled(tenant)
    _validate_window(date_from, date_to)
    started = time.perf_counter()
    result = await compute_capacity(
        db,
        tenant.id,
        window_start=date_from,
        window_end=date_to,
        factory_unit=factory_unit,
        line_id=line_id,
        include_tentative=integrated_planning_on(tenant),
        integrated_planning=integrated_planning_on(tenant),
        today=today_local(tenant),
    )
    payload = capacity_payload(result, include_corrected=planning_math_v2_on(tenant))
    _log("capacity", tenant.id, started, lines=len(payload["lines"]), days=(date_to - date_from).days + 1)
    return payload


@router.get("/line-loading", response_model=schemas.LineLoadingOut)
async def mfg_line_loading(
    date_from: date = Query(...),
    date_to: date = Query(...),
    factory_unit: str | None = Query(None, max_length=64),
    line_id: int | None = Query(None, ge=1),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_mfg_intelligence_enabled(tenant)
    _validate_window(date_from, date_to)
    started = time.perf_counter()
    payload = await line_loading_payload(
        db,
        tenant.id,
        window_start=date_from,
        window_end=date_to,
        factory_unit=factory_unit,
        line_id=line_id,
        include_tentative=integrated_planning_on(tenant),
        style_standard_smv=integrated_planning_on(tenant),
    )
    _log("line-loading", tenant.id, started, rows=len(payload["rows"]), days=(date_to - date_from).days + 1)
    return payload


@router.get("/orders/{order_id}/readiness", response_model=schemas.ReadinessOut)
async def mfg_order_readiness(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_mfg_intelligence_enabled(tenant)
    started = time.perf_counter()
    order = await _get_order(db, tenant.id, order_id)
    payload = await build_order_readiness(
        db,
        tenant.id,
        order,
        today=today_local(tenant),
        order_bom_v2=order_bom_readiness_v2_on(tenant),
        allocation_v1=allocation_v1_on(tenant),
    )
    has_detail = bool(payload["material_lines"]) or _legacy_has_material_detail(payload.get("legacy"))
    if has_detail and not await _may_see_material_detail(db, user, tenant):
        payload["material_lines"] = []
        payload["material_lines_truncated"] = False
        _blank_legacy_material_detail(payload.get("legacy"))
        payload["info"].append(
            {
                "dimension": "materials_ready",
                "reason": "MATERIAL_DETAIL_HIDDEN_NO_INVENTORY_ACCESS",
                "detail": "Per-item stock levels need inventory read access",
            }
        )
    _log("readiness", tenant.id, started, material_lines=len(payload["material_lines"]))
    return payload


@router.get("/orders/{order_id}/delivery-prediction", response_model=schemas.DeliveryPredictionOut)
async def mfg_order_delivery_prediction(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_mfg_intelligence_enabled(tenant)
    started = time.perf_counter()
    order = await _get_order(db, tenant.id, order_id)
    results = await predict_deliveries(
        db,
        tenant.id,
        [order],
        today=today_local(tenant),
        planning_math_v2=planning_math_v2_on(tenant),
        order_bom_v2=order_bom_readiness_v2_on(tenant),
        include_details=True,
        allocation_v1=allocation_v1_on(tenant),
        integrated_planning=integrated_planning_on(tenant),
    )
    _log("delivery-prediction", tenant.id, started, lines=len(results[0]["lines"]))
    return results[0]

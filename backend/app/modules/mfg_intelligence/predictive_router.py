"""Manufacturing Intelligence Phase 4 API (predictive): GET only, read-only, tenant scoped, no money.

Every endpoint:
1. needs the permission `production.planning.read` (router-level dependency)
2. needs the signed-in user to belong to the resolved tenant (403 "Tenant mismatch")
3. returns 404 "Not found" unless `manufacturing_intelligence_v1` AND `mfg_predictive_intelligence_v1` are exactly true
4. never writes to the database
Supplier lateness and PO-level material detail need inventory read access when RBAC is enforced.
"""
from __future__ import annotations

import logging
import time
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.ownership import ensure_owned
from app.common.permissions import require_internal_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import SewingLine, Tenant, User
from app.models.costing import ItemCategory
from app.models.inventory import Vendor
from app.models.mfg_predictive import FINDING_KINDS
from app.modules.mfg_intelligence import predictive_schemas as schemas
from app.modules.mfg_intelligence.anomaly_service import MAX_WINDOW_DAYS as ANOMALY_MAX_DAYS
from app.modules.mfg_intelligence.anomaly_service import anomalies_payload
from app.modules.mfg_intelligence.delivery_forecast_service import forecast_deliveries
from app.modules.mfg_intelligence.empirical_efficiency_service import line_efficiency_payload, load_efficiency_history
from app.modules.mfg_intelligence.flags import integrated_planning_on, require_predictive_enabled
from app.modules.mfg_intelligence.predictive_read_service import (
    MAX_RECOMMENDATIONS,
    STATUS_FILTERS,
    calibration_payload,
    recommendations_payload,
)
from app.modules.mfg_intelligence.router import _ensure_tenant_user, _get_order, _may_see_material_detail
from app.modules.mfg_intelligence.supplier_lateness_service import supplier_lateness_payload

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/mfg-intelligence",
    tags=["mfg-intelligence"],
    dependencies=[Depends(require_internal_permission("production.planning.read"))],
)

# Kinds whose evidence comes from another module's data: (kind, needs inventory read when RBAC is enforced).
_INVENTORY_KINDS = ("LATE_MATERIAL",)


def _log(endpoint: str, tenant_id: int, started: float, **counts: int) -> None:
    logger.info(
        "mfg_predictive endpoint=%s tenant_id=%s duration_ms=%d %s",
        endpoint,
        tenant_id,
        int((time.perf_counter() - started) * 1000),
        " ".join(f"{k}={v}" for k, v in counts.items()),
    )


@router.get("/predictive/orders/{order_id}/delivery-forecast", response_model=schemas.DeliveryForecastOut)
async def mfg_predictive_delivery_forecast(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_predictive_enabled(tenant)
    started = time.perf_counter()
    order = await _get_order(db, tenant.id, order_id)
    result = (await forecast_deliveries(db, tenant, [order], today=today_local(tenant), include_details=True))[0]
    material = result.get("material")
    if material and material.get("po_lines") and not await _may_see_material_detail(db, user, tenant):
        material["po_lines"] = []
        result["reason_codes"] = result["reason_codes"] + ["PO_DETAIL_HIDDEN_NO_INVENTORY_ACCESS"]
    _log("delivery-forecast", tenant.id, started, lines=len(result["lines"]))
    return result


@router.get("/predictive/line-efficiency", response_model=schemas.LineEfficiencyOut)
async def mfg_predictive_line_efficiency(
    date_to: date | None = Query(None, description="Last day of the 90-day history window (default yesterday)"),
    factory_unit: str | None = Query(None, max_length=64),
    line_id: int | None = Query(None, ge=1),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_predictive_enabled(tenant)
    today = today_local(tenant)
    end = date_to or (today - timedelta(days=1))
    if end > today:
        raise HTTPException(status_code=422, detail="date_to must not be in the future")
    await ensure_owned(db, SewingLine, line_id, tenant.id, "Sewing line", status_code=404)
    started = time.perf_counter()
    history = await load_efficiency_history(
        db, tenant.id, date_to=end, factory_unit=factory_unit, line_id=line_id,
        integrated_planning=integrated_planning_on(tenant),
    )
    payload = line_efficiency_payload(history)
    _log("line-efficiency", tenant.id, started, lines=len(payload["lines"]))
    return payload


@router.get("/predictive/supplier-lateness", response_model=schemas.SupplierLatenessOut)
async def mfg_predictive_supplier_lateness(
    vendor_id: int | None = Query(None, ge=1),
    category_id: int | None = Query(None, ge=1),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_predictive_enabled(tenant)
    if not await _may_see_material_detail(db, user, tenant):
        raise HTTPException(status_code=403, detail="Supplier lateness needs inventory read access")
    if vendor_id is not None:
        await ensure_owned(db, Vendor, vendor_id, tenant.id, "Vendor", status_code=404)
    if category_id is not None:
        await ensure_owned(db, ItemCategory, category_id, tenant.id, "Item category", status_code=404)
    started = time.perf_counter()
    payload = await supplier_lateness_payload(
        db, tenant.id, today=today_local(tenant), vendor_id=vendor_id, category_id=category_id
    )
    _log("supplier-lateness", tenant.id, started, n=payload["tenant"]["n"])
    return payload


@router.get("/predictive/anomalies", response_model=schemas.AnomaliesOut)
async def mfg_predictive_anomalies(
    date_from: date = Query(...),
    date_to: date = Query(..., description=f"Inclusive; window at most {ANOMALY_MAX_DAYS} days"),
    factory_unit: str | None = Query(None, max_length=64),
    line_id: int | None = Query(None, ge=1),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_predictive_enabled(tenant)
    if date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to must be on or after date_from")
    if (date_to - date_from).days + 1 > ANOMALY_MAX_DAYS:
        raise HTTPException(status_code=422, detail=f"Date range must not exceed {ANOMALY_MAX_DAYS} days")
    await ensure_owned(db, SewingLine, line_id, tenant.id, "Sewing line", status_code=404)
    started = time.perf_counter()
    payload = await anomalies_payload(
        db, tenant.id, date_from=date_from, date_to=date_to, line_id=line_id, factory_unit=factory_unit,
        integrated_planning=integrated_planning_on(tenant),
    )
    _log("anomalies", tenant.id, started, anomalies=len(payload["anomalies"]))
    return payload


@router.get("/predictive/calibration", response_model=schemas.CalibrationOut)
async def mfg_predictive_calibration(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_predictive_enabled(tenant)
    started = time.perf_counter()
    payload = await calibration_payload(db, tenant.id, today=today_local(tenant))
    _log("calibration", tenant.id, started, n=payload["n"])
    return payload


@router.get("/recommendations", response_model=schemas.RecommendationsOut)
async def mfg_recommendations(
    status_filter: str = Query("OPEN", alias="status", max_length=12),
    kind: str | None = Query(None, max_length=24),
    limit: int = Query(50, ge=1, le=MAX_RECOMMENDATIONS),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_predictive_enabled(tenant)
    status_value = status_filter.strip().upper()
    if status_value not in STATUS_FILTERS:
        raise HTTPException(status_code=422, detail=f"status must be one of {', '.join(STATUS_FILTERS)}")
    kind_value = kind.strip().upper() if kind else None
    if kind_value is not None and kind_value not in FINDING_KINDS:
        raise HTTPException(status_code=422, detail=f"kind must be one of {', '.join(FINDING_KINDS)}")
    hidden: tuple[str, ...] = ()
    if not await _may_see_material_detail(db, user, tenant):
        hidden = _INVENTORY_KINDS
    started = time.perf_counter()
    payload = await recommendations_payload(
        db, tenant.id, status=status_value, kind=kind_value, limit=limit, hidden_kinds=hidden
    )
    _log("recommendations", tenant.id, started, items=len(payload["items"]))
    return payload

"""Sprint I3: ABC analysis, EOQ, stock aging, cycle count APIs."""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.permissions import (
    PERMISSION_INVENTORY_ABC_ANALYSIS_RUN,
    PERMISSION_INVENTORY_ABC_ANALYSIS_VIEW,
    PERMISSION_INVENTORY_CYCLE_COUNT_PERFORM,
    PERMISSION_INVENTORY_CYCLE_COUNT_VIEW,
    PERMISSION_INVENTORY_EOQ_VIEW,
    PERMISSION_INVENTORY_STOCK_AGING_VIEW,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_abc_analysis_enabled,
    is_cycle_counting_enabled,
    is_eoq_calculation_enabled,
    is_stock_aging_enabled,
)
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.modules.inventory import (
    abc_analysis_service,
    cycle_count_service,
    eoq_service,
    stock_aging_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/inventory", tags=["inventory-abc-eoq-aging"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


def _require_abc(tenant: Tenant) -> None:
    if not is_abc_analysis_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="ABC analysis is disabled")


def _require_eoq(tenant: Tenant) -> None:
    if not is_eoq_calculation_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="EOQ calculation is disabled")


def _require_aging(tenant: Tenant) -> None:
    if not is_stock_aging_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Stock aging is disabled")


def _require_cycle(tenant: Tenant) -> None:
    if not is_cycle_counting_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="Cycle counting is disabled. Enable cycle_counting_enabled.",
        )


class AbcRunBody(BaseModel):
    period_months: int = Field(default=12, ge=1, le=60)


class CycleScheduleBody(BaseModel):
    frequency: str | None = "ALL"
    for_date: date | None = None
    force_all_due: bool = False


class CycleSubmitBody(BaseModel):
    counted_qty: Decimal
    notes: str | None = None
    create_adjustment: bool = False


@router.post("/abc-analysis/run")
async def run_abc_analysis(
    body: AbcRunBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_abc(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_ABC_ANALYSIS_RUN
    )
    months = (body.period_months if body else 12) or 12
    try:
        result = await abc_analysis_service.run_abc_analysis(
            db, tenant.id, period_months=months, update_items=True
        )
        await db.commit()
        return result
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        logger.exception("ABC analysis run failed tenant_id=%s", tenant.id)
        raise HTTPException(
            status_code=500, detail="Could not run ABC analysis. Please try again or contact support."
        ) from exc


@router.get("/abc-analysis/report")
async def abc_analysis_report(
    abc_class: str | None = None,
    category_id: int | None = None,
    export: str | None = Query(default=None, description="csv for Excel-friendly export"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_abc(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_ABC_ANALYSIS_VIEW
    )
    report = await abc_analysis_service.get_abc_report(
        db, tenant.id, abc_class=abc_class, category_id=category_id
    )
    if (export or "").lower() == "csv":
        import csv
        import io

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            ["item_id", "item_code", "item_name", "abc_class", "consumption_value", "pct_of_total"]
        )
        for row in report.get("items") or []:
            writer.writerow(
                [
                    row.get("item_id"),
                    row.get("item_code"),
                    row.get("item_name"),
                    row.get("abc_class"),
                    row.get("consumption_value"),
                    row.get("pct_of_total"),
                ]
            )
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=abc_analysis.csv"},
        )
    return report


@router.get("/items/{item_id}/eoq")
async def item_eoq(
    item_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_eoq(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_EOQ_VIEW
    )
    return await eoq_service.calculate_eoq(db, tenant, item_id)


@router.get("/eoq/report")
async def eoq_report(
    limit: int = Query(default=200, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_eoq(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_EOQ_VIEW
    )
    return await eoq_service.list_eoq_for_tenant(db, tenant, limit=limit)


@router.get("/reports/stock-aging")
async def stock_aging_report(
    item_id: int | None = None,
    warehouse_id: int | None = None,
    bucket: str | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_aging(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_STOCK_AGING_VIEW
    )
    return await stock_aging_service.get_stock_aging(
        db,
        tenant.id,
        item_id=item_id,
        warehouse_id=warehouse_id,
        bucket=bucket,
    )


@router.get("/cycle-count/schedule")
async def cycle_count_schedule(
    for_date: date | None = None,
    status: str | None = None,
    history_days: int | None = Query(default=None, ge=1, le=365),
    generate: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_cycle(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_CYCLE_COUNT_VIEW
    )
    try:
        if generate:
            await cycle_count_service.generate_cycle_count_schedule(
                db, tenant, for_date=for_date or today_local(tenant)
            )
            await db.commit()
        tasks = await cycle_count_service.list_cycle_count_tasks(
            db,
            tenant.id,
            for_date=for_date if history_days is None else None,
            status=status,
            history_days=history_days,
        )
        if for_date is None and history_days is None:
            tasks = await cycle_count_service.list_cycle_count_tasks(
                db, tenant.id, for_date=today_local(tenant), status=status
            )
        return [await cycle_count_service.task_to_dict(db, t) for t in tasks]
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        logger.exception("Cycle count schedule load failed tenant_id=%s", tenant.id)
        raise HTTPException(
            status_code=500, detail="Could not load cycle count schedule. Please try again or contact support."
        ) from exc


@router.post("/cycle-count/generate")
async def cycle_count_generate(
    body: CycleScheduleBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_cycle(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_CYCLE_COUNT_PERFORM
    )
    body = body or CycleScheduleBody()
    try:
        created = await cycle_count_service.generate_cycle_count_schedule(
            db,
            tenant,
            frequency=body.frequency,
            for_date=body.for_date,
            force_all_due=body.force_all_due,
        )
        await db.commit()
        return {
            "created": len(created),
            "tasks": [await cycle_count_service.task_to_dict(db, t) for t in created],
        }
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        logger.exception("Cycle count generate failed tenant_id=%s", tenant.id)
        raise HTTPException(
            status_code=500, detail="Could not generate cycle count tasks. Please try again or contact support."
        ) from exc


@router.post("/cycle-count/{task_id}/submit")
async def cycle_count_submit(
    task_id: int,
    body: CycleSubmitBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_cycle(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_CYCLE_COUNT_PERFORM
    )
    try:
        task = await cycle_count_service.submit_cycle_count(
            db,
            tenant,
            task_id,
            counted_qty=body.counted_qty,
            counted_by=user.id,
            notes=body.notes,
            create_adjustment=body.create_adjustment,
        )
        await db.commit()
        return await cycle_count_service.task_to_dict(db, task)
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception as exc:
        await safe_async_session_rollback(db)
        logger.exception("Cycle count submit failed tenant_id=%s task_id=%s", tenant.id, task_id)
        raise HTTPException(
            status_code=500, detail="Could not submit cycle count. Please try again or contact support."
        ) from exc

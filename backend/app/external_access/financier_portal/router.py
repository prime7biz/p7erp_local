"""Financier portal HTTP API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ExternalPrincipal, Order, Tenant

from app.external_access.constants import (
    SCOPE_FINANCIAL_SUMMARY,
    SCOPE_FULL_FINANCIER_PORTAL,
    SCOPE_ORDERS_AND_PIPELINE,
    SCOPE_TENANT_SUMMARY,
)
from app.external_access.deps import require_financier_external, require_financier_scope
from app.external_access.feature_flags import is_financier_financial_summary_enabled, is_financier_projection_enabled
from app.external_access.financier_portal import selectors as sel
from app.external_access.financier_portal.schemas import (
    FinancierAlertItem,
    FinancierAlertsResponse,
    FinancierDashboardResponse,
    FinancierFinancialSummary,
    FinancierGoodsMovementSummary,
    FinancierOrderBookResponse,
    FinancierOrderBookRow,
    FinancierOrderDetail,
    FinancierPipelineSummary,
    FinancierProjectionMonth,
    FinancierProjectionsResponse,
)
from app.external_access.permissions import get_role_codes, require_financier_portal_roles

router = APIRouter(prefix="/financier", tags=["external-financier"])


async def _roles_ok(db: AsyncSession, principal: ExternalPrincipal) -> None:
    codes = await get_role_codes(db, principal)
    await require_financier_portal_roles(codes)


@router.get("/dashboard", response_model=FinancierDashboardResponse)
async def financier_dashboard(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_TENANT_SUMMARY))],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    tid = principal.tenant_id
    iq = await sel.count_inquiries_by_status(db, tid)
    qt = await sel.count_quotations_by_status(db, tid)
    goods = await sel.stock_movement_summary(db, tid)
    alerts = await sel.build_alerts(db, tid)
    active_orders = int(
        (await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tid))).scalar() or 0
    )
    confirmed = int(
        (
            await db.execute(
                select(func.count())
                .select_from(Order)
                .where(Order.tenant_id == tid, Order.status.not_in(("DRAFT", "CANCELLED")))
            )
        ).scalar()
        or 0
    )
    proj = await sel.projected_units_by_month(db, tid, months=3)
    proj_units = sum(u for _, u in proj) if proj else None
    return FinancierDashboardResponse(
        active_order_lines=active_orders,
        confirmed_style_orders=confirmed,
        pipeline=FinancierPipelineSummary(
            inquiries_open=sum(v for k, v in iq.items() if k.upper() in ("DRAFT", "OPEN")),
            inquiries_submitted=int(iq.get("SUBMITTED", 0)),
            quotations_open=sum(v for k, v in qt.items() if k.upper() in ("DRAFT", "OPEN")),
            quotations_sent=int(qt.get("SENT", 0)) + int(qt.get("SUBMITTED", 0)),
        ),
        goods=FinancierGoodsMovementSummary(
            movements_in_count=goods["IN"],
            movements_out_count=goods["OUT"],
            movements_adjust_count=goods["ADJUST"],
            last_30_days_total=goods["last_30"],
        ),
        shipments_due_this_month=await sel.shipments_due_this_month(db, tid),
        alerts_count=len(alerts),
        projection_next_90_units=proj_units,
    )


@router.get("/order-book", response_model=FinancierOrderBookResponse)
async def financier_order_book(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_ORDERS_AND_PIPELINE))],
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    await _roles_ok(db, principal)
    rows, total = await sel.order_book(db, principal.tenant_id, limit, offset)
    items = [
        FinancierOrderBookRow(
            id=o.id,
            order_code=o.order_code,
            buyer_name=name,
            status=o.status,
            quantity=o.quantity,
            planned_shipment=None,
            expected_delivery=o.delivery_date,
            execution_status=o.status,
        )
        for o, name in rows
    ]
    return FinancierOrderBookResponse(items=items, total=total)


@router.get("/pipeline", response_model=FinancierPipelineSummary)
async def financier_pipeline(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_ORDERS_AND_PIPELINE))],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    tid = principal.tenant_id
    iq = await sel.count_inquiries_by_status(db, tid)
    qt = await sel.count_quotations_by_status(db, tid)
    return FinancierPipelineSummary(
        inquiries_open=sum(v for k, v in iq.items() if k.upper() in ("DRAFT", "OPEN")),
        inquiries_submitted=int(iq.get("SUBMITTED", 0)),
        quotations_open=sum(v for k, v in qt.items() if k.upper() in ("DRAFT", "OPEN")),
        quotations_sent=int(qt.get("SENT", 0)) + int(qt.get("SUBMITTED", 0)),
    )


@router.get("/goods-movement", response_model=FinancierGoodsMovementSummary)
async def financier_goods_movement(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_ORDERS_AND_PIPELINE))],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    g = await sel.stock_movement_summary(db, principal.tenant_id)
    return FinancierGoodsMovementSummary(
        movements_in_count=g["IN"],
        movements_out_count=g["OUT"],
        movements_adjust_count=g["ADJUST"],
        last_30_days_total=g["last_30"],
    )


@router.get("/financial-summary", response_model=FinancierFinancialSummary)
async def financier_financial_summary(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_FINANCIAL_SUMMARY))],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    tr = await db.execute(select(Tenant).where(Tenant.id == principal.tenant_id))
    tenant = tr.scalar_one_or_none()
    if not tenant or not is_financier_financial_summary_enabled(tenant):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Financial summary not enabled")
    fc = await sel.financial_counts(db, principal.tenant_id)
    return FinancierFinancialSummary(
        voucher_count_90d=fc["voucher_count_90d"],
        receivable_bills_open=fc["receivable_open"],
        payables_open=fc["payable_open"],
        note="High-level counts only; no line-level GL drill-down.",
    )


@router.get("/projections", response_model=FinancierProjectionsResponse)
async def financier_projections(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_ORDERS_AND_PIPELINE))],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    tr = await db.execute(select(Tenant).where(Tenant.id == principal.tenant_id))
    tenant = tr.scalar_one_or_none()
    if not tenant or not is_financier_projection_enabled(tenant):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Projections not enabled")
    rows = await sel.projected_units_by_month(db, principal.tenant_id, months=12)
    return FinancierProjectionsResponse(
        items=[FinancierProjectionMonth(month=m, projected_units=u) for m, u in rows],
        meta={"basis": "order_delivery_date_quantity"},
    )


@router.get("/alerts", response_model=FinancierAlertsResponse)
async def financier_alerts(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_TENANT_SUMMARY))],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    raw = await sel.build_alerts(db, principal.tenant_id)
    return FinancierAlertsResponse(
        items=[FinancierAlertItem(**x) for x in raw],
    )


@router.get("/orders/{order_id}", response_model=FinancierOrderDetail)
async def financier_order_detail(
    order_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_ORDERS_AND_PIPELINE))],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    row = await sel.get_order_with_buyer(db, principal.tenant_id, order_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    o, name = row
    return FinancierOrderDetail(
        id=o.id,
        order_code=o.order_code,
        buyer_name=name,
        status=o.status,
        quantity=o.quantity,
        order_date=o.order_date,
        delivery_date=o.delivery_date,
        updated_at=o.updated_at,
    )


@router.get("/reports/{report_key}")
async def financier_report_export(
    report_key: str,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_FULL_FINANCIER_PORTAL))],
    db: AsyncSession = Depends(get_db),
):
    """Placeholder for controlled exports (analyst role + full scope)."""
    await _roles_ok(db, principal)
    from app.external_access.permissions import financier_can_export_reports

    codes = await get_role_codes(db, principal)
    if not financier_can_export_reports(codes):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Export not permitted")
    return {"report_key": report_key, "status": "not_implemented", "message": "Use portal lists for now."}

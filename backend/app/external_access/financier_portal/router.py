"""Financier portal HTTP API."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import BtbLc, BtbMaturityTranche, ExternalPrincipal, MasterContract, Order, Tenant
from app.models.inventory import PurchaseOrder, PurchaseOrderItem, Warehouse
from app.models.costing import Item

from app.config import get_settings

from app.external_access.constants import (
    SCOPE_CREDIT_MONITORING,
    SCOPE_FINANCIAL_SUMMARY,
    SCOPE_FULL_FINANCIER_PORTAL,
    SCOPE_ORDERS_AND_PIPELINE,
    SCOPE_TENANT_SUMMARY,
)
from app.external_access.deps import financier_max_scope, require_financier_external, require_financier_scope
from app.external_access.feature_flags import is_financier_financial_summary_enabled, is_financier_projection_enabled
from app.external_access.financier_portal import selectors as sel
from app.external_access.financier_portal import facility_selectors as fsel
from app.external_access.financier_portal.dashboard_insights_service import build_financier_dashboard_party_insights
from app.external_access.financier_portal.schemas import (
    FinancierAlertItem,
    FinancierAlertsResponse,
    FinancierContractWhatIfBody,
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
from app.external_access.permissions import financier_scope_satisfies, get_role_codes, require_financier_portal_roles

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
    tenant_row = await db.get(Tenant, tid)
    maturities_90: int | None = None
    if tenant_row and is_financier_financial_summary_enabled(tenant_row):
        today = date.today()
        end = today + timedelta(days=90)
        maturities_90 = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(BtbMaturityTranche)
                    .where(
                        BtbMaturityTranche.tenant_id == tid,
                        BtbMaturityTranche.maturity_date >= today,
                        BtbMaturityTranche.maturity_date <= end,
                        BtbMaturityTranche.status.in_(("UPCOMING", "DUE")),
                    )
                )
            ).scalar()
            or 0
        )
    party_insights = None
    max_scope = await financier_max_scope(db, principal)
    if max_scope and financier_scope_satisfies(SCOPE_CREDIT_MONITORING, max_scope):
        party_id = await fsel.financier_party_id_for_principal(db, principal)
        if party_id:
            party_insights = await build_financier_dashboard_party_insights(db, tid, party_id)
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
        btb_maturities_upcoming_90d=maturities_90,
        party_insights=party_insights,
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
    if get_settings().financier_advanced_portal_enabled:
        from app.external_access.financier_portal.alert_engine import facility_alerts_for_party

        party_id = await fsel.financier_party_id_for_principal(db, principal)
        if party_id:
            raw = list(raw) + await facility_alerts_for_party(db, tenant_id=principal.tenant_id, party_id=party_id)
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


def _require_advanced_portal() -> None:
    if not get_settings().financier_advanced_portal_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Advanced financier portal disabled")


@router.get("/credit-lines")
async def financier_credit_lines(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": [], "note": "Link financier_party_id on your financier access to see facilities."}
    facs = await fsel.list_facilities_for_financier(db, principal.tenant_id, party_id)
    items = []
    for f in facs:
        san = float(f.sanctioned_amount or 0)
        util = float(f.utilized_amount or 0)
        btb_ref = None
        mc_ref = None
        if f.linked_btb_lc_id:
            b = await db.get(BtbLc, int(f.linked_btb_lc_id))
            if b and b.tenant_id == principal.tenant_id:
                btb_ref = b.reference
        if f.linked_master_contract_id:
            mc = await db.get(MasterContract, int(f.linked_master_contract_id))
            if mc and mc.tenant_id == principal.tenant_id:
                mc_ref = mc.reference
        items.append(
            {
                "id": f.id,
                "facility_code": f.facility_code,
                "facility_type": f.facility_type,
                "sanctioned_amount": san,
                "utilized_amount": util,
                "available_amount": round(max(san - util, 0), 2),
                "currency": f.currency,
                "status": f.status,
                "linked_btb_lc_id": f.linked_btb_lc_id,
                "linked_master_contract_id": f.linked_master_contract_id,
                "btb_lc_reference": btb_ref,
                "master_contract_reference": mc_ref,
                "facility_expiry_date": f.expiry_date.isoformat() if f.expiry_date else None,
                "interest_rate": float(f.interest_rate) if f.interest_rate is not None else None,
            }
        )
    return {"items": items}


@router.get("/procurement-tracker")
async def financier_procurement_tracker(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {
            "items": [],
            "note": "Set financier_party_id on this financier’s external access (Settings → External access → Financiers), or run the Lakhsma financier full demo seed.",
        }
    btb_ids = await fsel.linked_btb_lc_ids_for_party(db, principal.tenant_id, party_id)
    if not btb_ids:
        return {
            "items": [],
            "note": "No BTB LCs are linked on facilities or utilizations for your financier party. Link linked_btb_lc_id on a facility/utilization, or run seed_financier_full_demo for tenant LAKH806201.",
        }
    pos = await fsel.purchase_orders_for_btb_ids(db, principal.tenant_id, btb_ids)
    from app.models.inventory import GoodsReceiving

    items: list[dict] = []
    for po in pos:
        grn_rows = list(
            (
                await db.execute(
                    select(GoodsReceiving).where(
                        GoodsReceiving.tenant_id == principal.tenant_id,
                        GoodsReceiving.purchase_order_id == po.id,
                    )
                )
            ).scalars().all()
        )
        posted = sum(1 for g in grn_rows if (g.status or "").upper() in {"POSTED", "APPROVED", "RECEIVED", "CLOSED"})
        items.append(
            {
                "purchase_order_id": po.id,
                "po_code": po.po_code,
                "supplier_name": po.supplier_name,
                "status": po.status,
                "currency": po.currency,
                "base_total_amount": float(po.base_total_amount or 0),
                "grn_count": len(grn_rows),
                "grn_posted_count": posted,
            }
        )
    if not items:
        return {
            "items": [],
            "note": "No purchase orders use the BTB LCs linked to your facilities. Create POs against those BTBs or re-run the financier full demo seed.",
        }
    return {"items": items}


@router.get("/stock-collateral")
async def financier_stock_collateral(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": [], "note": "No party link or no BTB-linked POs."}
    btb_ids = await fsel.linked_btb_lc_ids_for_party(db, principal.tenant_id, party_id)
    if not btb_ids:
        return {"items": [], "note": "Link BTB LCs on facilities or utilizations to see collateral lines."}
    from app.models.inventory import GoodsReceiving, GoodsReceivingItem

    pos = await fsel.purchase_orders_for_btb_ids(db, principal.tenant_id, btb_ids)
    po_ids = [p.id for p in pos]
    if not po_ids:
        return {"items": []}
    poi_rows = list(
        (
            await db.execute(
                select(PurchaseOrderItem, PurchaseOrder)
                .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
                .where(PurchaseOrderItem.purchase_order_id.in_(po_ids))
            )
        ).all()
    )
    out: list[dict] = []
    for poi, po in poi_rows[:500]:
        po_code = po.po_code
        item = await db.get(Item, poi.item_id)
        btb = await db.get(BtbLc, po.btb_lc_id) if po.btb_lc_id else None
        wh = await db.get(Warehouse, poi.warehouse_id) if poi.warehouse_id else None
        received = 0.0
        grns = list(
            (
                await db.execute(
                    select(GoodsReceiving.id).where(
                        GoodsReceiving.tenant_id == principal.tenant_id,
                        GoodsReceiving.purchase_order_id == poi.purchase_order_id,
                    )
                )
            ).scalars().all()
        )
        for gid in grns:
            for gri in (
                await db.execute(
                    select(GoodsReceivingItem).where(
                        GoodsReceivingItem.goods_receiving_id == gid,
                        GoodsReceivingItem.item_id == poi.item_id,
                    )
                )
            ).scalars().all():
                try:
                    received += float(gri.quantity or 0)
                except (TypeError, ValueError):
                    pass
        try:
            ordered = float(poi.quantity or 0)
        except (TypeError, ValueError):
            ordered = 0.0
        try:
            unit = float(poi.unit_price or 0)
        except (TypeError, ValueError):
            unit = 0.0
        out.append(
            {
                "purchase_order_code": po_code,
                "btb_lc_id": po.btb_lc_id,
                "btb_lc_reference": btb.reference if btb else None,
                "warehouse_name": wh.name if wh else None,
                "unit_price": round(unit, 4),
                "item_code": item.item_code if item else None,
                "item_name": item.name if item else str(poi.item_id),
                "ordered_qty": ordered,
                "received_qty": received,
                "open_qty": max(ordered - received, 0),
                "estimated_value_open": round(max(ordered - received, 0) * unit, 2),
            }
        )
    return {"items": out}


@router.get("/loan-portfolio")
async def financier_loan_portfolio(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": []}
    utils = await fsel.list_utilizations_for_financier(db, principal.tenant_id, party_id)
    items = []
    for u in utils:
        items.append(
            {
                "id": u.id,
                "utilization_code": u.utilization_code,
                "principal": float(u.principal_amount or 0),
                "outstanding_principal": float(u.outstanding_principal or 0),
                "status": u.status,
                "currency": u.currency,
            }
        )
    return {"items": items}


@router.get("/loan-portfolio/{utilization_id}")
async def financier_loan_portfolio_detail(
    utilization_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        raise HTTPException(status_code=404, detail="Not found")
    u = await fsel.get_utilization_for_financier(db, principal.tenant_id, party_id, utilization_id)
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    sched = await fsel.schedule_for_utilization(db, principal.tenant_id, utilization_id)
    return {
        "utilization": {
            "id": u.id,
            "code": u.utilization_code,
            "principal": float(u.principal_amount or 0),
            "outstanding_principal": float(u.outstanding_principal or 0),
            "status": u.status,
        },
        "schedule": [
            {
                "installment": s.installment_number,
                "due_date": str(s.due_date),
                "emi": float(s.emi_amount or 0),
                "status": s.status,
            }
            for s in sched
        ],
    }


@router.get("/traceability/{utilization_id}")
async def financier_traceability_detail(
    utilization_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        raise HTTPException(status_code=404, detail="Not found")
    u = await fsel.get_utilization_for_financier(db, principal.tenant_id, party_id, utilization_id)
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    from app.modules.facility.traceability_service import build_traceability_for_utilization

    return await build_traceability_for_utilization(db, tenant_id=principal.tenant_id, utilization_id=utilization_id)


@router.get("/traceability")
async def financier_traceability_list(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": []}
    from app.modules.facility.traceability_service import build_traceability_for_utilization

    utils = await fsel.list_utilizations_for_financier(db, principal.tenant_id, party_id)
    items = []
    for u in utils:
        chain = await build_traceability_for_utilization(db, tenant_id=principal.tenant_id, utilization_id=u.id)
        items.append({"utilization_id": u.id, "summary": chain.get("repayment"), "has_btb": bool(chain.get("btb_lc"))})
    return {"items": items}


@router.get("/order-finance")
async def financier_order_finance(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    """Per-order FOB and linked facility utilization (financier party scope)."""
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.visibility_service import build_order_finance_rows

    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": [], "note": "Link financier_party_id on your financier access to see order finance."}
    items, note = await build_order_finance_rows(db, tenant_id=principal.tenant_id, party_id=party_id)
    return {"items": items, "note": note}


@router.get("/raw-material-tracker")
async def financier_raw_material_tracker(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.visibility_service import build_raw_material_rows

    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": [], "note": "Link financier_party_id to see raw material lines."}
    items, note = await build_raw_material_rows(db, tenant_id=principal.tenant_id, party_id=party_id)
    return {"items": items, "note": note}


@router.get("/production-tracker")
async def financier_production_tracker(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.visibility_service import build_production_tracker_rows

    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": [], "note": "Link financier_party_id to see production signals."}
    items, note = await build_production_tracker_rows(db, tenant_id=principal.tenant_id, party_id=party_id)
    return {"items": items, "note": note}


@router.get("/financial-visibility")
async def financier_financial_visibility(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.visibility_service import build_financial_visibility_rows

    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": [], "note": "Link financier_party_id to see financial visibility."}
    items, note = await build_financial_visibility_rows(db, tenant_id=principal.tenant_id, party_id=party_id)
    return {"items": items, "note": note}


@router.get("/btb-liabilities")
async def financier_btb_liabilities(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.visibility_service import build_btb_liabilities_rows

    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": [], "note": "Link financier_party_id to see BTB liabilities."}
    items, note = await build_btb_liabilities_rows(db, tenant_id=principal.tenant_id, party_id=party_id)
    return {"items": items, "note": note}


@router.get("/inventory-overview")
async def financier_inventory_overview(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
    as_of_date: date | None = Query(default=None),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.financier_inventory_service import build_financier_inventory_overview

    return await build_financier_inventory_overview(db, tenant_id=principal.tenant_id, as_of_date=as_of_date)


@router.get("/inventory-by-group")
async def financier_inventory_by_group(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
    as_of_date: date | None = Query(default=None),
    btb_scope: bool = Query(default=False),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.financier_inventory_service import build_financier_inventory_by_group

    party_id = await fsel.financier_party_id_for_principal(db, principal) if btb_scope else None
    return await build_financier_inventory_by_group(
        db,
        tenant_id=principal.tenant_id,
        party_id=party_id,
        as_of_date=as_of_date,
        btb_scope=btb_scope,
    )


@router.get("/inventory-ledger")
async def financier_inventory_ledger(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
    item_id: int | None = Query(default=None),
    warehouse_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    include_gl: bool = Query(default=True),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.financier_inventory_service import build_financier_inventory_ledger

    return await build_financier_inventory_ledger(
        db,
        tenant_id=principal.tenant_id,
        item_id=item_id,
        warehouse_id=warehouse_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
        include_gl=include_gl,
    )


@router.get("/inventory-reconciliation")
async def financier_inventory_reconciliation(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.financier_inventory_service import build_financier_inventory_reconciliation

    return await build_financier_inventory_reconciliation(db, tenant_id=principal.tenant_id)


@router.get("/inventory-balance-sheet")
async def financier_inventory_balance_sheet(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.financier_inventory_service import build_financier_balance_sheet_inventory

    return await build_financier_balance_sheet_inventory(db, tenant_id=principal.tenant_id)


@router.get("/business-health")
async def financier_business_health(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.modules.finance.health_score_service import build_health_score

    hs = await build_health_score(db, tenant_id=principal.tenant_id)
    hs["scope_note"] = "Tenant-wide composite; compare with your linked facilities in Credit lines."
    return hs


@router.get("/ai/confidence-narrative")
async def financier_ai_confidence(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.external_access.financier_portal.ai_confidence_service import build_financier_ai_confidence_bundle

    return await build_financier_ai_confidence_bundle(db, principal=principal)


@router.get("/snapshots")
async def financier_snapshots_list(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_FULL_FINANCIER_PORTAL))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.models.facility import FacilitySnapshot

    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": []}
    facs = await fsel.list_facilities_for_financier(db, principal.tenant_id, party_id)
    fac_ids = [f.id for f in facs]
    if not fac_ids:
        return {"items": []}
    r = await db.execute(
        select(FacilitySnapshot).where(
            FacilitySnapshot.tenant_id == principal.tenant_id,
            FacilitySnapshot.facility_id.in_(fac_ids),
        ).order_by(FacilitySnapshot.id.desc()).limit(100)
    )
    rows = list(r.scalars().all())
    return {
        "items": [
            {
                "id": s.id,
                "snapshot_type": s.snapshot_type,
                "snapshot_month": s.snapshot_month,
                "facility_id": s.facility_id,
            }
            for s in rows
        ]
    }


@router.get("/snapshots/{snapshot_id}")
async def financier_snapshot_get(
    snapshot_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_FULL_FINANCIER_PORTAL))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    from app.models.facility import FacilitySnapshot

    s = await db.get(FacilitySnapshot, snapshot_id)
    if not s or s.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=404, detail="Not found")
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        raise HTTPException(status_code=403, detail="Snapshot not in your facility scope")
    facs = await fsel.list_facilities_for_financier(db, principal.tenant_id, party_id)
    allowed = {f.id for f in facs}
    if s.facility_id not in allowed:
        raise HTTPException(status_code=403, detail="Snapshot not in your facility scope")
    return {"id": s.id, "snapshot_type": s.snapshot_type, "data": s.data_json}


@router.get("/contracts")
async def financier_contracts_list(
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": [], "note": "Link financier_party_id on your financier access to see contracts."}
    from app.external_access.financier_portal.contract_command import service as cc_svc

    items = await cc_svc.list_contracts_summary(db, tenant_id=principal.tenant_id, party_id=party_id)
    return {"items": items}


@router.get("/contracts/{contract_id}")
async def financier_contract_detail(
    contract_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
    as_of_date: str | None = Query(default=None),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        raise HTTPException(status_code=403, detail="Financier party not linked")
    from app.external_access.financier_portal.contract_command import service as cc_svc

    payload = await cc_svc.build_contract_detail(
        db,
        tenant_id=principal.tenant_id,
        party_id=party_id,
        contract_id=contract_id,
        as_of=as_of_date,
    )
    if not payload:
        raise HTTPException(status_code=404, detail="Contract not found")
    return payload


@router.get("/contracts/{contract_id}/timeline")
async def financier_contract_timeline(
    contract_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        raise HTTPException(status_code=403, detail="Financier party not linked")
    from app.external_access.financier_portal.contract_command import service as cc_svc

    d = await cc_svc.build_contract_detail(db, tenant_id=principal.tenant_id, party_id=party_id, contract_id=contract_id)
    if not d:
        raise HTTPException(status_code=404, detail="Contract not found")
    return {"timeline": d.get("timeline"), "master_contract": d.get("master_contract")}


@router.get("/contracts/{contract_id}/orders")
async def financier_contract_orders(
    contract_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        raise HTTPException(status_code=403, detail="Financier party not linked")
    from app.external_access.financier_portal.contract_command import service as cc_svc

    d = await cc_svc.build_contract_detail(db, tenant_id=principal.tenant_id, party_id=party_id, contract_id=contract_id)
    if not d:
        raise HTTPException(status_code=404, detail="Contract not found")
    return {"orders_risk": d.get("orders_risk"), "rollup": d.get("rollup")}


@router.get("/contracts/{contract_id}/raw-materials")
async def financier_contract_raw_materials(
    contract_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": [], "note": "Link financier_party_id on your financier access."}
    from app.external_access.financier_portal.contract_command import service as cc_svc

    items, note = await cc_svc.raw_materials_for_contract(
        db, tenant_id=principal.tenant_id, party_id=party_id, contract_id=contract_id
    )
    return {"items": items, "note": note}


@router.get("/contracts/{contract_id}/production")
async def financier_contract_production(
    contract_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        return {"items": [], "note": "Link financier_party_id on your financier access."}
    from app.external_access.financier_portal.contract_command import service as cc_svc

    items, note = await cc_svc.production_for_contract(
        db, tenant_id=principal.tenant_id, party_id=party_id, contract_id=contract_id
    )
    return {"items": items, "note": note}


@router.get("/contracts/{contract_id}/cash-ladder")
async def financier_contract_cash_ladder(
    contract_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        raise HTTPException(status_code=403, detail="Financier party not linked")
    from app.external_access.financier_portal.contract_command import service as cc_svc

    d = await cc_svc.build_contract_detail(db, tenant_id=principal.tenant_id, party_id=party_id, contract_id=contract_id)
    if not d:
        raise HTTPException(status_code=404, detail="Contract not found")
    return {"cash_ladder": d.get("cash_ladder")}


@router.get("/contracts/{contract_id}/risk")
async def financier_contract_risk(
    contract_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        raise HTTPException(status_code=403, detail="Financier party not linked")
    from app.external_access.financier_portal.contract_command import service as cc_svc

    d = await cc_svc.build_contract_detail(db, tenant_id=principal.tenant_id, party_id=party_id, contract_id=contract_id)
    if not d:
        raise HTTPException(status_code=404, detail="Contract not found")
    return {"risk": d.get("risk")}


@router.get("/contracts/{contract_id}/narrative")
async def financier_contract_narrative(
    contract_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        raise HTTPException(status_code=403, detail="Financier party not linked")
    from app.external_access.financier_portal.contract_command import service as cc_svc
    from app.external_access.financier_portal.contract_command import narrative as cc_narr

    d = await cc_svc.build_contract_detail(db, tenant_id=principal.tenant_id, party_id=party_id, contract_id=contract_id)
    if not d:
        raise HTTPException(status_code=404, detail="Contract not found")
    return await cc_narr.build_contract_narrative(db, principal=principal, contract_payload=d)


@router.post("/contracts/{contract_id}/what-if")
async def financier_contract_what_if(
    contract_id: int,
    body: FinancierContractWhatIfBody,
    principal: Annotated[ExternalPrincipal, Depends(require_financier_scope(SCOPE_CREDIT_MONITORING))],
    db: AsyncSession = Depends(get_db),
):
    _require_advanced_portal()
    await _roles_ok(db, principal)
    party_id = await fsel.financier_party_id_for_principal(db, principal)
    if not party_id:
        raise HTTPException(status_code=403, detail="Financier party not linked")
    from app.external_access.financier_portal.contract_command import service as cc_svc
    from app.external_access.financier_portal.contract_command import what_if as cc_what

    d = await cc_svc.build_contract_detail(db, tenant_id=principal.tenant_id, party_id=party_id, contract_id=contract_id)
    if not d:
        raise HTTPException(status_code=404, detail="Contract not found")
    return cc_what.apply_what_if(
        d,
        etd_shift_days=body.etd_shift_days,
        rm_accel_pct=body.rm_accel_pct,
    )

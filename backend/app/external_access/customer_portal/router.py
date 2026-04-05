"""Customer portal HTTP API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ExternalNote, ExternalPrincipal, Tenant

from app.external_access.audit import log_external_action
from app.external_access.constants import NOTE_VISIBILITY_EXTERNAL_ONLY, PRINCIPAL_CUSTOMER
from app.external_access.customer_portal import selectors as sel
from app.external_access.customer_portal.schemas import (
    CustomerApprovalStep,
    CustomerApprovalWithOrder,
    CustomerDashboardResponse,
    CustomerDocumentsResponse,
    CustomerNoteCreate,
    CustomerNoteItem,
    CustomerNoteListResponse,
    CustomerOrderDetail,
    CustomerOrderListItem,
    CustomerOrderListResponse,
    CustomerProductionSummary,
    CustomerShipmentRow,
)
from app.external_access.deps import require_customer_external
from app.external_access.feature_flags import is_customer_notes_enabled, is_external_document_download_enabled
from app.external_access.permissions import (
    customer_can_add_notes,
    get_role_codes,
    require_customer_portal_roles,
)

router = APIRouter(prefix="/customer", tags=["external-customer"])


async def _roles_ok(db: AsyncSession, principal: ExternalPrincipal) -> None:
    codes = await get_role_codes(db, principal)
    await require_customer_portal_roles(codes)


def _hint_status(wo: int, done: int, total: int) -> str | None:
    if wo <= 0:
        return None
    if total <= 0:
        return f"{wo} work order(s) in progress"
    if done >= total:
        return "Production steps complete"
    return f"Production in progress ({done}/{total} steps)"


@router.get("/dashboard", response_model=CustomerDashboardResponse)
async def customer_dashboard(
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    m = await sel.dashboard_metrics(db, principal)
    recent_orders, _ = await sel.list_orders(db, principal, limit=5, offset=0, search=None)
    items: list[CustomerOrderListItem] = []
    for o in recent_orders:
        pend = await sel.pending_approvals_for_order(db, principal.tenant_id, o.id)
        wo, done, tot = await sel.production_summary_for_order(db, principal.tenant_id, o.id)
        items.append(
            CustomerOrderListItem(
                id=o.id,
                order_code=o.order_code,
                style_ref=o.style_ref,
                status=o.status,
                quantity=o.quantity,
                order_date=o.order_date,
                delivery_date=o.delivery_date,
                updated_at=o.updated_at,
                pending_approval_steps=pend,
                production_summary=_hint_status(wo, done, tot),
            )
        )
    return CustomerDashboardResponse(
        active_orders=m["active_orders"],
        pending_approval_steps=m["pending_approval_steps"],
        in_production_hint=m["in_production_hint"],
        ready_to_ship=m["ready_to_ship"],
        delayed_items=m["delayed_items"],
        next_shipment_eta=m["next_shipment_eta"],
        next_delivery_expected=m["next_delivery_expected"],
        recent_orders=items,
    )


@router.get("/approvals", response_model=list[CustomerApprovalWithOrder])
async def customer_approvals_all(
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    rows = await sel.list_pending_approvals_all(db, principal)
    return [
        CustomerApprovalWithOrder(
            order_id=oid,
            order_code=ocode,
            id=a.id,
            title=a.title,
            phase=a.phase,
            status=a.status,
            approval_status=a.approval_status,
            planned_date=a.planned_date,
            milestone_type=a.milestone_type,
        )
        for a, ocode, oid in rows
    ]


@router.get("/orders", response_model=CustomerOrderListResponse)
async def customer_orders(
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None),
):
    await _roles_ok(db, principal)
    rows, total = await sel.list_orders(db, principal, limit=limit, offset=offset, search=search)
    items: list[CustomerOrderListItem] = []
    for o in rows:
        pend = await sel.pending_approvals_for_order(db, principal.tenant_id, o.id)
        wo, done, tot = await sel.production_summary_for_order(db, principal.tenant_id, o.id)
        items.append(
            CustomerOrderListItem(
                id=o.id,
                order_code=o.order_code,
                style_ref=o.style_ref,
                status=o.status,
                quantity=o.quantity,
                order_date=o.order_date,
                delivery_date=o.delivery_date,
                updated_at=o.updated_at,
                pending_approval_steps=pend,
                production_summary=_hint_status(wo, done, tot),
            )
        )
    return CustomerOrderListResponse(items=items, total=total)


@router.get("/orders/{order_id}", response_model=CustomerOrderDetail)
async def customer_order_detail(
    order_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    o = await sel.get_order_if_allowed(db, principal, order_id)
    if not o:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return CustomerOrderDetail(
        id=o.id,
        order_code=o.order_code,
        style_ref=o.style_ref,
        status=o.status,
        quantity=o.quantity,
        order_date=o.order_date,
        delivery_date=o.delivery_date,
        shipping_term=o.shipping_term,
        updated_at=o.updated_at,
    )


@router.get("/orders/{order_id}/approvals", response_model=list[CustomerApprovalStep])
async def customer_order_approvals(
    order_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    o = await sel.get_order_if_allowed(db, principal, order_id)
    if not o:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    actions = await sel.list_followup_actions(db, principal.tenant_id, order_id)
    return [
        CustomerApprovalStep(
            id=a.id,
            title=a.title,
            phase=a.phase,
            status=a.status,
            approval_status=a.approval_status,
            planned_date=a.planned_date,
            milestone_type=a.milestone_type,
        )
        for a in actions
    ]


@router.get("/orders/{order_id}/production", response_model=CustomerProductionSummary)
async def customer_order_production(
    order_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    o = await sel.get_order_if_allowed(db, principal, order_id)
    if not o:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    wo, done, tot = await sel.production_summary_for_order(db, principal.tenant_id, order_id)
    hint = _hint_status(wo, done, tot) or "No manufacturing work orders linked yet"
    return CustomerProductionSummary(
        work_orders_tracked=wo,
        operations_completed=done,
        operations_total=tot,
        status_hint=hint,
    )


@router.get("/orders/{order_id}/shipments", response_model=list[CustomerShipmentRow])
async def customer_order_shipments(
    order_id: int,
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    o = await sel.get_order_if_allowed(db, principal, order_id)
    if not o:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    all_ship = await sel.list_shipments_for_customer(db, principal)
    out: list[CustomerShipmentRow] = []
    for sh, tc, ord_row in all_ship:
        oid = ord_row.id if ord_row else None
        if oid != order_id and (tc is None or tc.order_id != order_id):
            continue
        out.append(
            CustomerShipmentRow(
                id=sh.id,
                order_id=tc.order_id if tc else oid,
                order_code=ord_row.order_code if ord_row else None,
                trade_reference=tc.reference if tc else None,
                shipment_reference=sh.reference,
                status=sh.status,
                carrier=sh.carrier,
                etd=sh.etd,
                eta=sh.eta,
            )
        )
    return out


@router.get("/shipments", response_model=list[CustomerShipmentRow])
async def customer_shipments_all(
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    all_ship = await sel.list_shipments_for_customer(db, principal)
    out: list[CustomerShipmentRow] = []
    for sh, tc, ord_row in all_ship:
        out.append(
            CustomerShipmentRow(
                id=sh.id,
                order_id=tc.order_id if tc else (ord_row.id if ord_row else None),
                order_code=ord_row.order_code if ord_row else None,
                trade_reference=tc.reference if tc else None,
                shipment_reference=sh.reference,
                status=sh.status,
                carrier=sh.carrier,
                etd=sh.etd,
                eta=sh.eta,
            )
        )
    return out


@router.get("/notes", response_model=CustomerNoteListResponse)
async def customer_list_notes(
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
    entity_type: str | None = Query(None),
    entity_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    await _roles_ok(db, principal)
    stmt = (
        select(ExternalNote)
        .where(
            ExternalNote.tenant_id == principal.tenant_id,
            ExternalNote.external_principal_id == principal.id,
            ExternalNote.visibility.in_(("external_only", "internal_and_external")),
        )
        .order_by(ExternalNote.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if entity_type:
        stmt = stmt.where(ExternalNote.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(ExternalNote.entity_id == entity_id)
    rows = (await db.execute(stmt)).scalars().all()
    base_where = [
        ExternalNote.tenant_id == principal.tenant_id,
        ExternalNote.external_principal_id == principal.id,
        ExternalNote.visibility.in_(("external_only", "internal_and_external")),
    ]
    if entity_type:
        base_where.append(ExternalNote.entity_type == entity_type)
    if entity_id is not None:
        base_where.append(ExternalNote.entity_id == entity_id)
    total = int(
        (await db.execute(select(func.count()).select_from(ExternalNote).where(*base_where))).scalar() or 0
    )
    items = [
        CustomerNoteItem(
            id=n.id,
            entity_type=n.entity_type,
            entity_id=n.entity_id,
            body=n.body,
            visibility=n.visibility,
            created_at=n.created_at,
            from_party="internal" if n.created_by_internal_user_id else "customer",
        )
        for n in rows
    ]
    return CustomerNoteListResponse(items=items, total=total)


@router.post("/notes", response_model=CustomerNoteItem)
async def customer_create_note(
    body: CustomerNoteCreate,
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    tr = await db.execute(select(Tenant).where(Tenant.id == principal.tenant_id))
    tenant = tr.scalar_one_or_none()
    if not tenant or not is_customer_notes_enabled(tenant):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Notes are disabled")
    codes = await get_role_codes(db, principal)
    if not customer_can_add_notes(codes):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to add notes")

    if body.entity_type == "order":
        o = await sel.get_order_if_allowed(db, principal, body.entity_id)
        if not o:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported entity_type")

    note = ExternalNote(
        tenant_id=principal.tenant_id,
        principal_type=PRINCIPAL_CUSTOMER,
        external_principal_id=principal.id,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        body=body.body.strip(),
        visibility=NOTE_VISIBILITY_EXTERNAL_ONLY,
        created_by_internal_user_id=None,
    )
    db.add(note)
    await db.flush()
    await log_external_action(
        db,
        tenant_id=principal.tenant_id,
        action="EXTERNAL_NOTE_CREATED",
        resource_type="external_note",
        resource_id=note.id,
        external_principal_id=principal.id,
        details={"entity_type": body.entity_type, "entity_id": body.entity_id},
    )
    return CustomerNoteItem(
        id=note.id,
        entity_type=note.entity_type,
        entity_id=note.entity_id,
        body=note.body,
        visibility=note.visibility,
        created_at=note.created_at,
        from_party="customer",
    )


@router.get("/documents", response_model=CustomerDocumentsResponse)
async def customer_documents(
    principal: Annotated[ExternalPrincipal, Depends(require_customer_external)],
    db: AsyncSession = Depends(get_db),
):
    await _roles_ok(db, principal)
    tr = await db.execute(select(Tenant).where(Tenant.id == principal.tenant_id))
    tenant = tr.scalar_one_or_none()
    if not tenant or not is_external_document_download_enabled(tenant):
        return CustomerDocumentsResponse(items=[], total=0)
    # Safe extension: list only non-download metadata when enabled; file URLs require separate signed flow.
    return CustomerDocumentsResponse(items=[], total=0)

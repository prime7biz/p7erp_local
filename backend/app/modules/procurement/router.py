"""Procurement API (roadmap item 8): requisition -> supplier quotations -> comparative statement -> PO.

All endpoints need tenant flag `procurement_cs_enabled` (default off) and return 404 otherwise.

Workflow (status of the requisition):
    DRAFT -> SUBMITTED -> APPROVED -> CS_SELECTED -> PO_CREATED
    SUBMITTED -> REJECTED -> DRAFT ;  any open status -> CANCELLED
Approve / reject / select supplier need an admin or manager role.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.codegen import next_tenant_code
from app.common.document_history import list_doc_events, record_doc_event
from app.common.ownership import ensure_owned
from app.common.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_procurement_cs_enabled
from app.database import get_db
from app.models import Tenant, User
from app.models.costing import Item
from app.models.inventory import Vendor, Warehouse
from app.models.procurement import (
    PurchaseRequisition,
    PurchaseRequisitionLine,
    SupplierQuotation,
    SupplierQuotationLine,
)
from app.modules.procurement.service import build_comparative_statement, load_lines, load_quotations, quote_prices

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/procurement", tags=["procurement"])

DOC = "purchase_requisition"
PR_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"SUBMITTED", "CANCELLED"},
    "SUBMITTED": {"APPROVED", "REJECTED", "DRAFT", "CANCELLED"},
    "REJECTED": {"DRAFT", "CANCELLED"},
    "APPROVED": {"CANCELLED"},
    "CS_SELECTED": {"CANCELLED"},
    "PO_CREATED": set(),
    "CANCELLED": set(),
}
MANAGER_STATUSES = {"APPROVED", "REJECTED"}
REASON_STATUSES = {"REJECTED", "CANCELLED"}


# ----------------------------------------------------------------- helpers


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    if not is_procurement_cs_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="Procurement comparative statement is disabled. Set tenant feature flag procurement_cs_enabled to true.",
        )


async def _require_manager(db: AsyncSession, user: User, tenant_id: int) -> None:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    if (role.name if role else "").strip().lower() not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Only an admin or manager can do this")


async def _get_pr(db: AsyncSession, tenant_id: int, pr_id: int, *, lock: bool = False) -> PurchaseRequisition:
    stmt = select(PurchaseRequisition).where(PurchaseRequisition.id == pr_id, PurchaseRequisition.tenant_id == tenant_id)
    if lock:
        stmt = stmt.with_for_update()
    pr = (await db.execute(stmt)).scalar_one_or_none()
    if pr is None:
        raise HTTPException(status_code=404, detail="Requisition not found")
    return pr


def _dec(v: str | float | int | None, field: str, *, positive: bool = False) -> Decimal | None:
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        d = Decimal(str(v).strip())
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail=f"{field} must be a number") from None
    if d < 0 or (positive and d == 0):
        raise HTTPException(status_code=400, detail=f"{field} must be {'greater than' if positive else 'at least'} 0")
    return d


def _f(v: Decimal | None) -> float | None:
    return float(v) if v is not None else None


async def _pr_out(db: AsyncSession, tenant_id: int, pr: PurchaseRequisition, *, detail: bool = True) -> dict:
    out = {
        "id": pr.id,
        "pr_code": pr.pr_code,
        "department": pr.department,
        "purpose": pr.purpose,
        "required_date": pr.required_date.isoformat() if pr.required_date else None,
        "status": pr.status,
        "requested_by": pr.requested_by,
        "approved_by": pr.approved_by,
        "approved_at": pr.approved_at.isoformat() if pr.approved_at else None,
        "selected_quotation_id": pr.selected_quotation_id,
        "selection_reason": pr.selection_reason,
        "selected_at": pr.selected_at.isoformat() if pr.selected_at else None,
        "purchase_order_id": pr.purchase_order_id,
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
    }
    if not detail:
        return out
    lines = await load_lines(db, tenant_id, pr.id)
    quotes = await load_quotations(db, tenant_id, pr.id)
    prices = await quote_prices(db, [q.id for q in quotes])
    vendor_names = {
        v.id: v.name
        for v in (
            await db.execute(select(Vendor).where(Vendor.tenant_id == tenant_id, Vendor.id.in_({q.vendor_id for q in quotes})))
        ).scalars()
    } if quotes else {}
    out["lines"] = [
        {
            "id": ln.id,
            "item_id": ln.item_id,
            "warehouse_id": ln.warehouse_id,
            "quantity": _f(ln.quantity),
            "estimated_unit_price": _f(ln.estimated_unit_price),
            "notes": ln.notes,
        }
        for ln in lines
    ]
    out["quotations"] = [
        {
            "id": q.id,
            "vendor_id": q.vendor_id,
            "vendor_name": vendor_names.get(q.vendor_id),
            "quote_ref": q.quote_ref,
            "quote_date": q.quote_date.isoformat() if q.quote_date else None,
            "valid_until": q.valid_until.isoformat() if q.valid_until else None,
            "currency": q.currency,
            "delivery_days": q.delivery_days,
            "payment_terms": q.payment_terms,
            "notes": q.notes,
            "prices": [{"requisition_line_id": lid, "unit_price": p} for lid, p in prices.get(q.id, {}).items()],
        }
        for q in quotes
    ]
    out["history"] = await list_doc_events(db, tenant_id=tenant_id, doc_type=DOC, doc_id=pr.id)
    return out


# ----------------------------------------------------------------- schemas


class PrLineIn(BaseModel):
    item_id: int
    warehouse_id: int | None = None
    quantity: str
    estimated_unit_price: str | None = None
    notes: str | None = None

    @field_validator("quantity", "estimated_unit_price", mode="before")
    @classmethod
    def _as_text(cls, v: object) -> object:
        return None if v is None else str(v)


class PrIn(BaseModel):
    department: str | None = Field(default=None, max_length=128)
    purpose: str | None = None
    required_date: date | None = None
    lines: list[PrLineIn] = Field(min_length=1)


class PrStatusIn(BaseModel):
    status: str
    reason: str | None = Field(default=None, max_length=1000)


class QuoteLineIn(BaseModel):
    requisition_line_id: int
    unit_price: str
    notes: str | None = None

    @field_validator("unit_price", mode="before")
    @classmethod
    def _as_text(cls, v: object) -> str:
        return str(v)


class QuotationIn(BaseModel):
    vendor_id: int
    quote_ref: str | None = Field(default=None, max_length=64)
    quote_date: date | None = None
    valid_until: date | None = None
    currency: str | None = Field(default=None, max_length=10)
    delivery_days: int | None = Field(default=None, ge=0, le=3650)
    payment_terms: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    lines: list[QuoteLineIn] = Field(min_length=1)


class SelectIn(BaseModel):
    quotation_id: int
    reason: str = Field(min_length=3, max_length=2000)


class CreatePoIn(BaseModel):
    expected_date: date | None = None
    exchange_rate_to_base: float | None = Field(default=None, gt=0)


# ----------------------------------------------------------------- requisitions


async def _write_lines(db: AsyncSession, tenant_id: int, pr_id: int, lines: list[PrLineIn]) -> None:
    for ln in lines:
        await ensure_owned(db, Item, ln.item_id, tenant_id, "Item")
        await ensure_owned(db, Warehouse, ln.warehouse_id, tenant_id, "Warehouse")
        db.add(
            PurchaseRequisitionLine(
                tenant_id=tenant_id,
                requisition_id=pr_id,
                item_id=ln.item_id,
                warehouse_id=ln.warehouse_id,
                quantity=_dec(ln.quantity, "quantity", positive=True),
                estimated_unit_price=_dec(ln.estimated_unit_price, "estimated_unit_price"),
                notes=(ln.notes or None),
            )
        )


@router.get("/requisitions")
async def list_requisitions(
    status: str | None = Query(default=None),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    base = select(PurchaseRequisition).where(PurchaseRequisition.tenant_id == tenant.id)
    if status:
        base = base.where(PurchaseRequisition.status == status.strip().upper())
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.order_by(PurchaseRequisition.id.desc()).limit(limit).offset(offset))).scalars().all()
    return {"rows": [await _pr_out(db, tenant.id, r, detail=False) for r in rows], "total": int(total)}


@router.post("/requisitions", status_code=201)
async def create_requisition(
    body: PrIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    code = await next_tenant_code(db, model=PurchaseRequisition, tenant_id=tenant.id, prefix="PR-", width=4)
    pr = PurchaseRequisition(
        tenant_id=tenant.id,
        pr_code=code,
        department=(body.department or "").strip() or None,
        purpose=body.purpose,
        required_date=body.required_date,
        status="DRAFT",
        requested_by=user.id,
    )
    db.add(pr)
    await db.flush()
    await _write_lines(db, tenant.id, pr.id, body.lines)
    await record_doc_event(
        db, tenant_id=tenant.id, user_id=user.id, doc_type=DOC, doc_id=pr.id, event="created",
        summary=f"Created {code} with {len(body.lines)} line(s)", to_status="DRAFT",
    )
    await db.commit()
    await db.refresh(pr)
    return await _pr_out(db, tenant.id, pr)


@router.get("/requisitions/{pr_id}")
async def get_requisition(
    pr_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    return await _pr_out(db, tenant.id, await _get_pr(db, tenant.id, pr_id))


@router.put("/requisitions/{pr_id}")
async def update_requisition(
    pr_id: int,
    body: PrIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    pr = await _get_pr(db, tenant.id, pr_id, lock=True)
    if pr.status not in {"DRAFT", "REJECTED"}:
        raise HTTPException(status_code=400, detail="Only DRAFT or REJECTED requisitions can be edited")
    pr.department = (body.department or "").strip() or None
    pr.purpose = body.purpose
    pr.required_date = body.required_date
    for old in await load_lines(db, tenant.id, pr.id):
        await db.delete(old)
    await db.flush()
    await _write_lines(db, tenant.id, pr.id, body.lines)
    await record_doc_event(
        db, tenant_id=tenant.id, user_id=user.id, doc_type=DOC, doc_id=pr.id, event="updated",
        summary=f"Edited ({len(body.lines)} line(s))",
    )
    await db.commit()
    await db.refresh(pr)
    return await _pr_out(db, tenant.id, pr)


@router.post("/requisitions/{pr_id}/status")
async def change_requisition_status(
    pr_id: int,
    body: PrStatusIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    pr = await _get_pr(db, tenant.id, pr_id, lock=True)
    nxt = body.status.strip().upper()
    if nxt not in PR_TRANSITIONS.get(pr.status, set()):
        raise HTTPException(status_code=400, detail=f"Cannot move requisition from {pr.status} to {nxt}")
    if nxt in MANAGER_STATUSES:
        await _require_manager(db, user, tenant.id)
    reason = (body.reason or "").strip()
    if nxt in REASON_STATUSES and not reason:
        raise HTTPException(status_code=400, detail="A reason is required")
    prev = pr.status
    pr.status = nxt
    if nxt == "APPROVED":
        pr.approved_by = user.id
        pr.approved_at = datetime.utcnow()
    await record_doc_event(
        db, tenant_id=tenant.id, user_id=user.id, doc_type=DOC, doc_id=pr.id, event="status",
        summary=f"{prev} → {nxt}", from_status=prev, to_status=nxt, reason=reason or None,
    )
    await db.commit()
    await db.refresh(pr)
    return await _pr_out(db, tenant.id, pr)


# ----------------------------------------------------------------- quotations


@router.post("/requisitions/{pr_id}/quotations", status_code=201)
async def add_quotation(
    pr_id: int,
    body: QuotationIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    pr = await _get_pr(db, tenant.id, pr_id, lock=True)
    if pr.status != "APPROVED":
        raise HTTPException(status_code=400, detail="Quotations can be added only to an APPROVED requisition")
    await ensure_owned(db, Vendor, body.vendor_id, tenant.id, "Vendor")
    valid_line_ids = {ln.id for ln in await load_lines(db, tenant.id, pr.id)}
    seen: set[int] = set()
    for ql in body.lines:
        if ql.requisition_line_id not in valid_line_ids:
            raise HTTPException(status_code=400, detail=f"Line {ql.requisition_line_id} is not on this requisition")
        if ql.requisition_line_id in seen:
            raise HTTPException(status_code=400, detail=f"Line {ql.requisition_line_id} is priced twice")
        seen.add(ql.requisition_line_id)
    q = SupplierQuotation(
        tenant_id=tenant.id,
        requisition_id=pr.id,
        vendor_id=body.vendor_id,
        quote_ref=(body.quote_ref or "").strip() or None,
        quote_date=body.quote_date,
        valid_until=body.valid_until,
        currency=(body.currency or "").strip().upper() or None,
        delivery_days=body.delivery_days,
        payment_terms=(body.payment_terms or "").strip() or None,
        notes=body.notes,
        created_by=user.id,
    )
    db.add(q)
    await db.flush()
    for ql in body.lines:
        db.add(
            SupplierQuotationLine(
                tenant_id=tenant.id,
                quotation_id=q.id,
                requisition_line_id=ql.requisition_line_id,
                unit_price=_dec(ql.unit_price, "unit_price") or Decimal("0"),
                notes=ql.notes,
            )
        )
    vendor = await db.get(Vendor, body.vendor_id)
    await record_doc_event(
        db, tenant_id=tenant.id, user_id=user.id, doc_type=DOC, doc_id=pr.id, event="quotation_added",
        summary=f"Quotation from {vendor.name if vendor else body.vendor_id} ({len(body.lines)} line(s))",
    )
    await db.commit()
    await db.refresh(pr)
    return await _pr_out(db, tenant.id, pr)


@router.delete("/quotations/{quotation_id}")
async def delete_quotation(
    quotation_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    q = await db.get(SupplierQuotation, quotation_id)
    if q is None or q.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Quotation not found")
    pr = await _get_pr(db, tenant.id, q.requisition_id, lock=True)
    if pr.status != "APPROVED":
        raise HTTPException(status_code=400, detail="Quotations can be removed only before a supplier is selected")
    await db.delete(q)
    await record_doc_event(
        db, tenant_id=tenant.id, user_id=user.id, doc_type=DOC, doc_id=pr.id, event="quotation_removed",
        summary=f"Removed quotation #{quotation_id}",
    )
    await db.commit()
    return {"ok": True}


# ----------------------------------------------------------------- comparative statement


@router.get("/requisitions/{pr_id}/comparative-statement")
async def comparative_statement(
    pr_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    return await build_comparative_statement(db, tenant.id, await _get_pr(db, tenant.id, pr_id))


@router.post("/requisitions/{pr_id}/select")
async def select_quotation(
    pr_id: int,
    body: SelectIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve the comparative statement: pick a supplier and record why."""
    _ensure(user, tenant)
    await _require_manager(db, user, tenant.id)
    pr = await _get_pr(db, tenant.id, pr_id, lock=True)
    if pr.status not in {"APPROVED", "CS_SELECTED"}:
        raise HTTPException(status_code=400, detail="Select a supplier only on an APPROVED requisition")
    cs = await build_comparative_statement(db, tenant.id, pr)
    col = next((c for c in cs["quotations"] if c["quotation_id"] == body.quotation_id), None)
    if col is None:
        raise HTTPException(status_code=404, detail="Quotation not found on this requisition")
    if not col["is_complete"]:
        raise HTTPException(status_code=400, detail="This quotation does not price every line")
    prev = pr.status
    pr.selected_quotation_id = body.quotation_id
    pr.selection_reason = body.reason.strip()
    pr.selected_by = user.id
    pr.selected_at = datetime.utcnow()
    pr.status = "CS_SELECTED"
    not_lowest = cs["lowest_quotation_id"] is not None and cs["lowest_quotation_id"] != body.quotation_id
    await record_doc_event(
        db, tenant_id=tenant.id, user_id=user.id, doc_type=DOC, doc_id=pr.id, event="supplier_selected",
        summary=f"Selected {col['vendor_name']} ({col['total']:,.2f}{' — not the lowest' if not_lowest else ''})",
        from_status=prev, to_status="CS_SELECTED", reason=pr.selection_reason,
        extra={"quotation_id": body.quotation_id, "total": col["total"], "lowest_quotation_id": cs["lowest_quotation_id"]},
    )
    await db.commit()
    await db.refresh(pr)
    return await build_comparative_statement(db, tenant.id, pr)


@router.post("/requisitions/{pr_id}/create-po")
async def create_po_from_selection(
    pr_id: int,
    body: CreatePoIn | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a DRAFT purchase order from the selected quotation (prices and quantities copied)."""
    from app.modules.inventory.router import PurchaseOrderBody, PurchaseOrderItemBody, create_purchase_order

    _ensure(user, tenant)
    body = body or CreatePoIn()
    pr = await _get_pr(db, tenant.id, pr_id, lock=True)
    if pr.purchase_order_id:
        raise HTTPException(status_code=409, detail="A purchase order was already created for this requisition")
    if pr.status != "CS_SELECTED" or not pr.selected_quotation_id:
        raise HTTPException(status_code=400, detail="Select a supplier on the comparative statement first")
    q = await db.get(SupplierQuotation, pr.selected_quotation_id)
    if q is None or q.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Selected quotation not found")
    lines = await load_lines(db, tenant.id, pr.id)
    prices = (await quote_prices(db, [q.id])).get(q.id, {})
    po_body = PurchaseOrderBody(
        vendor_id=q.vendor_id,
        currency=q.currency,
        exchange_rate_to_base=body.exchange_rate_to_base,
        order_date=date.today(),
        expected_date=body.expected_date or pr.required_date,
        notes=f"From requisition {pr.pr_code} (comparative statement). Reason: {pr.selection_reason}"[:2000],
        status="DRAFT",
        items=[
            PurchaseOrderItemBody(
                item_id=ln.item_id,
                warehouse_id=ln.warehouse_id,
                quantity=str(ln.quantity),
                unit_price=str(prices.get(ln.id, 0)),
            )
            for ln in lines
        ],
    )
    po = await create_purchase_order(body=po_body, tenant=tenant, user=user, db=db)
    pr = await _get_pr(db, tenant.id, pr_id, lock=True)
    pr.purchase_order_id = po.id
    pr.status = "PO_CREATED"
    await record_doc_event(
        db, tenant_id=tenant.id, user_id=user.id, doc_type=DOC, doc_id=pr.id, event="po_created",
        summary=f"Created {po.po_code}", from_status="CS_SELECTED", to_status="PO_CREATED",
        extra={"purchase_order_id": po.id},
    )
    await db.commit()
    return {"requisition_id": pr.id, "purchase_order_id": po.id, "po_code": po.po_code}

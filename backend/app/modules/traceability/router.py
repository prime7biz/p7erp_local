"""Traceability API (flag `traceability_enabled`, default off): certificates, cut-ticket fabric lots, order report."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_traceability_enabled
from app.database import get_db
from app.models import Customer, Order, Tenant, User, Vendor
from app.models.costing import Item
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, StockBatch
from app.models.logistics_packing import PackingList
from app.models.production import CutTicket, CuttingBundle
from app.models.traceability import CutTicketFabricLot, MaterialCertificate

router = APIRouter(prefix="/traceability", tags=["traceability"])

EXPIRING_DAYS = 30
CertType = Literal["GOTS", "OCS", "GRS", "RCS", "OEKO_TEX_100", "BCI", "FSC", "OTHER"]


def _guard(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    if not is_traceability_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FEATURE_DISABLED", "message": "Traceability is not enabled for this company."},
        )


async def _owned(db: AsyncSession, model, obj_id: int | None, tenant_id: int, label: str):
    if obj_id is None:
        return None
    row = await db.get(model, obj_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail=f"{label} {obj_id} not found")
    return row


def validity(cert: MaterialCertificate, on: date) -> str:
    """valid | expiring (≤30 days left) | expired | not_yet_valid, evaluated on a given date."""
    if cert.valid_from and on < cert.valid_from:
        return "not_yet_valid"
    if cert.valid_until and on > cert.valid_until:
        return "expired"
    if cert.valid_until and cert.valid_until - on <= timedelta(days=EXPIRING_DAYS):
        return "expiring"
    return "valid"


# ---------------------------------------------------------------- certificates


class CertificateBody(BaseModel):
    cert_type: CertType
    certificate_number: str = Field(..., min_length=1, max_length=100)
    issuer: str | None = Field(default=None, max_length=160)
    vendor_id: int | None = None
    item_id: int | None = None
    valid_from: date | None = None
    valid_until: date | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("certificate_number")
    @classmethod
    def _num(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("certificate number is required")
        return v


class CertificateOut(BaseModel):
    id: int
    cert_type: str
    certificate_number: str
    issuer: str | None
    vendor_id: int | None
    vendor_name: str | None
    item_id: int | None
    item_name: str | None
    valid_from: date | None
    valid_until: date | None
    status: str
    notes: str | None


async def _certs_out(db: AsyncSession, rows: list[MaterialCertificate]) -> list[CertificateOut]:
    vendor_ids = {r.vendor_id for r in rows if r.vendor_id}
    item_ids = {r.item_id for r in rows if r.item_id}
    vendors = dict((await db.execute(select(Vendor.id, Vendor.name).where(Vendor.id.in_(vendor_ids)))).all()) if vendor_ids else {}
    items = dict((await db.execute(select(Item.id, Item.name).where(Item.id.in_(item_ids)))).all()) if item_ids else {}
    today = date.today()
    return [
        CertificateOut(
            id=r.id,
            cert_type=r.cert_type,
            certificate_number=r.certificate_number,
            issuer=r.issuer,
            vendor_id=r.vendor_id,
            vendor_name=vendors.get(r.vendor_id),
            item_id=r.item_id,
            item_name=items.get(r.item_id),
            valid_from=r.valid_from,
            valid_until=r.valid_until,
            status=validity(r, today),
            notes=r.notes,
        )
        for r in rows
    ]


async def _validate_cert(db: AsyncSession, tenant_id: int, body: CertificateBody) -> None:
    if body.vendor_id is None and body.item_id is None:
        raise HTTPException(status_code=400, detail="Choose the supplier holding the certificate, the material it covers, or both")
    if body.valid_from and body.valid_until and body.valid_until < body.valid_from:
        raise HTTPException(status_code=400, detail="Valid until must be on or after valid from")
    await _owned(db, Vendor, body.vendor_id, tenant_id, "Supplier")
    await _owned(db, Item, body.item_id, tenant_id, "Material")


@router.get("/certificates", response_model=list[CertificateOut])
async def list_certificates(
    vendor_id: int | None = None,
    item_id: int | None = None,
    status_filter: Literal["valid", "expiring", "expired"] | None = Query(default=None, alias="status"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    stmt = select(MaterialCertificate).where(MaterialCertificate.tenant_id == tenant.id)
    if vendor_id:
        stmt = stmt.where(MaterialCertificate.vendor_id == vendor_id)
    if item_id:
        stmt = stmt.where(MaterialCertificate.item_id == item_id)
    rows = list((await db.execute(stmt.order_by(MaterialCertificate.valid_until.asc().nulls_last(), MaterialCertificate.id))).scalars())
    out = await _certs_out(db, rows)
    return [c for c in out if not status_filter or c.status == status_filter]


@router.post("/certificates", response_model=CertificateOut, status_code=201)
async def create_certificate(
    body: CertificateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    await _validate_cert(db, tenant.id, body)
    row = MaterialCertificate(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return (await _certs_out(db, [row]))[0]


@router.put("/certificates/{cert_id}", response_model=CertificateOut)
async def update_certificate(
    cert_id: int,
    body: CertificateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    row = await db.get(MaterialCertificate, cert_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Certificate not found")
    await _validate_cert(db, tenant.id, body)
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return (await _certs_out(db, [row]))[0]


@router.delete("/certificates/{cert_id}", status_code=204)
async def delete_certificate(
    cert_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    row = await db.get(MaterialCertificate, cert_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Certificate not found")
    await db.delete(row)
    await db.commit()


# ---------------------------------------------------------------- cut ticket fabric lots


class LotLinkBody(BaseModel):
    stock_batch_id: int
    qty_used: Decimal | None = Field(default=None, ge=0, le=Decimal("1e12"))
    roll_numbers: str | None = Field(default=None, max_length=500)


class LotLinkOut(BaseModel):
    id: int
    cut_ticket_id: int
    stock_batch_id: int
    batch_number: str
    item_code: str | None
    item_name: str | None
    qty_used: Decimal | None
    roll_numbers: str | None
    grn_code: str | None
    received_date: date | None
    supplier_name: str | None


class BatchOptionOut(BaseModel):
    id: int
    batch_number: str
    item_name: str | None
    current_qty: Decimal
    grn_code: str | None


async def _batch_meta(db: AsyncSession, batch_ids: set[int]) -> dict[int, dict]:
    if not batch_ids:
        return {}
    rows = (
        await db.execute(
            select(
                StockBatch.id,
                StockBatch.batch_number,
                StockBatch.stock_item_id,
                Item.item_code,
                Item.name,
                GoodsReceiving.grn_code,
                GoodsReceiving.received_date,
                GoodsReceiving.vendor_id,
                Vendor.name,
            )
            .join(Item, Item.id == StockBatch.stock_item_id)
            .outerjoin(GoodsReceivingItem, GoodsReceivingItem.id == StockBatch.goods_receiving_item_id)
            .outerjoin(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
            .outerjoin(Vendor, Vendor.id == GoodsReceiving.vendor_id)
            .where(StockBatch.id.in_(batch_ids))
        )
    ).all()
    return {
        r[0]: {
            "batch_number": r[1],
            "item_id": r[2],
            "item_code": r[3],
            "item_name": r[4],
            "grn_code": r[5],
            "received_date": r[6],
            "vendor_id": r[7],
            "supplier_name": r[8],
        }
        for r in rows
    }


async def _links_out(db: AsyncSession, rows: list[CutTicketFabricLot]) -> list[LotLinkOut]:
    meta = await _batch_meta(db, {r.stock_batch_id for r in rows})
    out = []
    for r in rows:
        m = meta.get(r.stock_batch_id, {})
        out.append(
            LotLinkOut(
                id=r.id,
                cut_ticket_id=r.cut_ticket_id,
                stock_batch_id=r.stock_batch_id,
                batch_number=m.get("batch_number", "?"),
                item_code=m.get("item_code"),
                item_name=m.get("item_name"),
                qty_used=r.qty_used,
                roll_numbers=r.roll_numbers,
                grn_code=m.get("grn_code"),
                received_date=m.get("received_date"),
                supplier_name=m.get("supplier_name"),
            )
        )
    return out


async def _cut_ticket(db: AsyncSession, tenant_id: int, cut_ticket_id: int) -> CutTicket:
    ct = await db.get(CutTicket, cut_ticket_id)
    if not ct or ct.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Cut ticket not found")
    return ct


@router.get("/fabric-lots", response_model=list[BatchOptionOut])
async def list_fabric_lot_options(
    q: str | None = Query(default=None, max_length=64),
    limit: int = Query(50, ge=1, le=200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Received lots to pick from when recording what a cut ticket used."""
    _guard(user, tenant)
    stmt = (
        select(StockBatch.id, StockBatch.batch_number, Item.name, StockBatch.current_qty, GoodsReceiving.grn_code)
        .join(Item, Item.id == StockBatch.stock_item_id)
        .outerjoin(GoodsReceivingItem, GoodsReceivingItem.id == StockBatch.goods_receiving_item_id)
        .outerjoin(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
        .where(StockBatch.tenant_id == tenant.id)
    )
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(StockBatch.batch_number.ilike(like) | Item.name.ilike(like))
    rows = (await db.execute(stmt.order_by(StockBatch.id.desc()).limit(limit))).all()
    return [BatchOptionOut(id=r[0], batch_number=r[1], item_name=r[2], current_qty=r[3], grn_code=r[4]) for r in rows]


@router.get("/cut-tickets/{cut_ticket_id}/fabric-lots", response_model=list[LotLinkOut])
async def list_cut_ticket_lots(
    cut_ticket_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    await _cut_ticket(db, tenant.id, cut_ticket_id)
    rows = list(
        (await db.execute(select(CutTicketFabricLot).where(CutTicketFabricLot.cut_ticket_id == cut_ticket_id).order_by(CutTicketFabricLot.id))).scalars()
    )
    return await _links_out(db, rows)


@router.post("/cut-tickets/{cut_ticket_id}/fabric-lots", response_model=LotLinkOut, status_code=201)
async def add_cut_ticket_lot(
    cut_ticket_id: int,
    body: LotLinkBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    await _cut_ticket(db, tenant.id, cut_ticket_id)
    await _owned(db, StockBatch, body.stock_batch_id, tenant.id, "Fabric lot")
    exists = await db.scalar(
        select(CutTicketFabricLot.id).where(
            CutTicketFabricLot.cut_ticket_id == cut_ticket_id, CutTicketFabricLot.stock_batch_id == body.stock_batch_id
        )
    )
    if exists:
        raise HTTPException(status_code=409, detail="This lot is already recorded on the cut ticket")
    row = CutTicketFabricLot(tenant_id=tenant.id, cut_ticket_id=cut_ticket_id, created_by=user.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return (await _links_out(db, [row]))[0]


@router.delete("/cut-tickets/{cut_ticket_id}/fabric-lots/{link_id}", status_code=204)
async def remove_cut_ticket_lot(
    cut_ticket_id: int,
    link_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    row = await db.get(CutTicketFabricLot, link_id)
    if not row or row.tenant_id != tenant.id or row.cut_ticket_id != cut_ticket_id:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.delete(row)
    await db.commit()


# ---------------------------------------------------------------- order report


class ReportCert(BaseModel):
    cert_type: str
    certificate_number: str
    issuer: str | None
    valid_until: date | None
    status_on_receipt: str


class ReportLot(LotLinkOut):
    cut_ticket_code: str
    certificates: list[ReportCert]


class ReportCutTicket(BaseModel):
    id: int
    ticket_code: str
    cut_date: date | None
    total_pcs_cut: int | None
    bundle_count: int
    bundle_pcs: int


class ReportPacking(BaseModel):
    packing_list_number: str
    packing_date: date | None
    total_cartons: int
    status: str


class TraceabilityReport(BaseModel):
    order_id: int
    order_code: str
    customer_name: str | None
    style_ref: str | None
    cut_tickets: list[ReportCutTicket]
    fabric_lots: list[ReportLot]
    packing_lists: list[ReportPacking]
    gaps: list[str]


@router.get("/orders/{order_id}", response_model=TraceabilityReport)
async def order_traceability(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    customer_name = await db.scalar(select(Customer.name).where(Customer.id == order.customer_id))

    tickets = list(
        (await db.execute(select(CutTicket).where(CutTicket.tenant_id == tenant.id, CutTicket.order_id == order.id).order_by(CutTicket.id))).scalars()
    )
    ticket_ids = [t.id for t in tickets]
    bundle_stats = (
        dict(
            (r[0], (r[1], r[2]))
            for r in (
                await db.execute(
                    select(CuttingBundle.cut_ticket_id, func.count(), func.coalesce(func.sum(CuttingBundle.qty_in_bundle), 0))
                    .where(CuttingBundle.cut_ticket_id.in_(ticket_ids))
                    .group_by(CuttingBundle.cut_ticket_id)
                )
            ).all()
        )
        if ticket_ids
        else {}
    )
    links = (
        list((await db.execute(select(CutTicketFabricLot).where(CutTicketFabricLot.cut_ticket_id.in_(ticket_ids)).order_by(CutTicketFabricLot.id))).scalars())
        if ticket_ids
        else []
    )
    meta = await _batch_meta(db, {l.stock_batch_id for l in links})
    vendor_ids = {m["vendor_id"] for m in meta.values() if m.get("vendor_id")}
    item_ids = {m["item_id"] for m in meta.values() if m.get("item_id")}
    certs = list(
        (
            await db.execute(
                select(MaterialCertificate).where(
                    MaterialCertificate.tenant_id == tenant.id,
                    (MaterialCertificate.vendor_id.in_(vendor_ids or {-1})) | (MaterialCertificate.item_id.in_(item_ids or {-1})),
                )
            )
        ).scalars()
    )
    ticket_code = {t.id: t.ticket_code for t in tickets}
    gaps: list[str] = []
    lots: list[ReportLot] = []
    for link, base in zip(links, await _links_out(db, links)):
        m = meta.get(link.stock_batch_id, {})
        on = m.get("received_date") or date.today()
        matched = [
            c
            for c in certs
            if (c.vendor_id is None or c.vendor_id == m.get("vendor_id")) and (c.item_id is None or c.item_id == m.get("item_id"))
        ]
        report_certs = [
            ReportCert(
                cert_type=c.cert_type,
                certificate_number=c.certificate_number,
                issuer=c.issuer,
                valid_until=c.valid_until,
                status_on_receipt="valid" if validity(c, on) in ("valid", "expiring") else validity(c, on),
            )
            for c in matched
        ]
        if not report_certs:
            gaps.append(f"Lot {base.batch_number} ({base.supplier_name or 'unknown supplier'}) has no certificate on record.")
        elif not any(c.status_on_receipt == "valid" for c in report_certs):
            gaps.append(f"Lot {base.batch_number}: no certificate was valid on the receipt date {on.isoformat()}.")
        if not base.grn_code:
            gaps.append(f"Lot {base.batch_number} is not linked to a goods receipt, so its supplier cannot be shown.")
        lots.append(ReportLot(**base.model_dump(), cut_ticket_code=ticket_code.get(link.cut_ticket_id, "?"), certificates=report_certs))

    linked_tickets = {l.cut_ticket_id for l in links}
    for t in tickets:
        if t.id not in linked_tickets:
            gaps.append(f"Cut ticket {t.ticket_code} has no fabric lot recorded.")
    if not tickets:
        gaps.append("No cut tickets are recorded for this order yet.")

    packing = list(
        (await db.execute(select(PackingList).where(PackingList.tenant_id == tenant.id, PackingList.order_id == order.id).order_by(PackingList.id))).scalars()
    )
    return TraceabilityReport(
        order_id=order.id,
        order_code=order.order_code,
        customer_name=customer_name,
        style_ref=order.style_ref,
        cut_tickets=[
            ReportCutTicket(
                id=t.id,
                ticket_code=t.ticket_code,
                cut_date=t.cut_date,
                total_pcs_cut=t.total_pcs_cut,
                bundle_count=int(bundle_stats.get(t.id, (0, 0))[0]),
                bundle_pcs=int(bundle_stats.get(t.id, (0, 0))[1]),
            )
            for t in tickets
        ],
        fabric_lots=lots,
        packing_lists=[
            ReportPacking(packing_list_number=p.packing_list_number, packing_date=p.packing_date, total_cartons=p.total_cartons, status=p.status)
            for p in packing
        ],
        gaps=gaps,
    )


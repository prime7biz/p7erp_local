"""Cutting: marker, lay, cut ticket, bundles, barcode PDF."""
from __future__ import annotations

import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import CuttingBundle, CutTicket, LayPlan, MarkerPlan, Tenant, User
from app.modules.production.schemas import (
    BundleIssueRequest,
    CutTicketCreate,
    GenerateBundlesRequest,
    LayPlanCreate,
    MarkerPlanCreate,
)

router = APIRouter(prefix="/production/cutting", tags=["production-cutting"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.post("/marker-plans")
async def create_marker(
    body: MarkerPlanCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = MarkerPlan(
        tenant_id=tenant.id,
        order_id=body.order_id,
        style_id=body.style_id,
        marker_code=body.marker_code,
        cad_reference=body.cad_reference,
        marker_length=body.marker_length,
        marker_width=body.marker_width,
        marker_efficiency_pct=body.marker_efficiency_pct,
        fabric_consumption_per_pcs=body.fabric_consumption_per_pcs,
        sizes_included=body.sizes_included,
        size_ratio=body.size_ratio,
        pcs_per_marker=body.pcs_per_marker,
        notes=body.notes,
        status="draft",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}


@router.get("/marker-plans")
async def list_markers(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(select(MarkerPlan).where(MarkerPlan.tenant_id == tenant.id).order_by(MarkerPlan.id.desc()))
    rows = list(r.scalars().all())
    return {"items": [{"id": x.id, "marker_code": x.marker_code, "status": x.status} for x in rows]}


@router.post("/cut-tickets/{ticket_id}/generate-bundles")
async def generate_bundles(
    ticket_id: int,
    body: GenerateBundlesRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate bundles from JSON lines: [{size, color, qty_in_bundle, bundle_count?}] or default one bundle."""
    _ensure(user, tenant)
    t = await db.get(CutTicket, ticket_id)
    if not t or t.tenant_id != tenant.id:
        raise HTTPException(404, "Cut ticket not found")
    lay = await db.get(LayPlan, t.lay_plan_id)
    if not lay:
        raise HTTPException(400, "Lay plan missing")
    marker = await db.get(MarkerPlan, lay.marker_plan_id)
    order_id = marker.order_id if marker else None
    style_id = marker.style_id if marker else None

    bundle_specs = body.lines
    if not bundle_specs:
        bundle_specs = [{"size": "M", "color": None, "qty_in_bundle": 10, "bundle_count": 1}]

    created = []
    n = 0
    for spec in bundle_specs:
        count = int(spec.get("bundle_count") or 1)
        for _ in range(count):
            n += 1
            bcode = f"{tenant.id}-{ticket_id}-{n:04d}"
            bundle = CuttingBundle(
                tenant_id=tenant.id,
                cut_ticket_id=ticket_id,
                order_id=order_id,
                style_id=style_id,
                bundle_no=f"B-{n:04d}",
                barcode=bcode,
                size=spec.get("size"),
                color=spec.get("color"),
                qty_in_bundle=int(spec.get("qty_in_bundle") or 0),
                status="cut",
            )
            db.add(bundle)
            created.append(bcode)
    await db.commit()
    return {"barcodes": created}


@router.get("/bundles/lookup/{barcode}")
async def lookup_bundle(
    barcode: str,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(select(CuttingBundle).where(CuttingBundle.tenant_id == tenant.id, CuttingBundle.barcode == barcode))
    b = r.scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Not found")
    return {
        "id": b.id,
        "bundle_no": b.bundle_no,
        "barcode": b.barcode,
        "size": b.size,
        "qty_in_bundle": b.qty_in_bundle,
        "status": b.status,
    }


@router.post("/bundles/issue")
async def issue_bundles(
    body: BundleIssueRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    from datetime import datetime

    for bid in body.bundle_ids:
        b = await db.get(CuttingBundle, bid)
        if not b or b.tenant_id != tenant.id:
            continue
        b.issued_to_line_id = body.issued_to_line_id
        b.status = "issued_to_sewing"
        b.issued_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


@router.get("/bundles/barcode-pdf/{cut_ticket_id}")
async def bundles_pdf(
    cut_ticket_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    r = await db.execute(select(CuttingBundle).where(CuttingBundle.tenant_id == tenant.id, CuttingBundle.cut_ticket_id == cut_ticket_id))
    bundles = list(r.scalars().all())
    if not bundles:
        raise HTTPException(404, "No bundles")

    try:
        from barcode import Code128
        from barcode.writer import ImageWriter
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas
    except ImportError as e:
        raise HTTPException(500, f"Barcode/PDF deps missing: {e}") from e

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    w, h = A4
    y = h - 40
    for b in bundles:
        c.setFont("Helvetica-Bold", 12)
        c.drawString(40, y, f"Bundle {b.bundle_no}  Qty {b.qty_in_bundle}")
        y -= 18
        c.setFont("Helvetica", 10)
        c.drawString(40, y, f"Barcode: {b.barcode}")
        y -= 28
        img_buf = io.BytesIO()
        Code128(b.barcode, writer=ImageWriter()).write(img_buf, options={"write_text": False})
        img_buf.seek(0)
        c.drawImage(ImageReader(img_buf), 40, y - 60, width=200, height=60)
        y -= 100
        if y < 120:
            c.showPage()
            y = h - 40
    c.save()
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="bundles-{cut_ticket_id}.pdf"'},
    )


@router.post("/lay-plans")
async def create_lay(
    body: LayPlanCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = LayPlan(
        tenant_id=tenant.id,
        marker_plan_id=body.marker_plan_id,
        lay_code=body.lay_code,
        fabric_item_id=body.fabric_item_id,
        status="planned",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}


@router.post("/cut-tickets")
async def create_cut_ticket(
    body: CutTicketCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = CutTicket(
        tenant_id=tenant.id,
        lay_plan_id=body.lay_plan_id,
        ticket_code=body.ticket_code,
        cut_date=date.today(),
        status="pending",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}
